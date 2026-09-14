import { ArrowLeft, CheckCircle2, FilePenLine, Save } from 'lucide-react'
import { isAxiosError } from 'axios'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { caseWorkspaceApi } from '../case-workspace/api'
import type { CaseWorkspace } from '../case-workspace/types'
import { documentCollectionApi } from '../document-collection/api'
import type { CollectionDetail } from '../document-collection/types'
import '../document-collection/documentCollection.css'
import './c001DocumentEditor.css'
import { documentDisplayData, documentDraftStore } from './documentDraftStore'
import type { DocumentCreationState, DocumentDraftRecord, DocumentDriveState, DocumentVersionSummary } from './documentDraftStore'
import type { DocumentDraft, DocumentTemplateDefinition } from './documentTemplates'
import DocumentReviewRenderer from './components/DocumentReviewRenderer'
import DocumentWorkflowBadge from './components/DocumentWorkflowBadge'
import DocumentPdfDownloadButton from './components/DocumentPdfDownloadButton'
import DocumentDriveButton from './components/DocumentDriveButton'
import { LoadingState } from '../../components/ui'

type LoadedContext = { caseFile: CaseWorkspace; document: CollectionDetail; template: DocumentTemplateDefinition }
type FieldErrors = Record<string, string | undefined>

const C001_DEMO_VISIBLE_FIELDS = new Set(['contract_date', 'engagement_scope'])
const C001_DEMO_DEFAULTS: Record<string, string> = {
  client_name: 'デモ依頼者',
  responsible_person: 'デモ担当者',
  case_title: 'デモ案件',
  fee_type: 'デモ用',
  fee_amount: 'デモ用',
  fee_calculation_method: 'デモ用の仮入力',
  fee_payment_timing: 'デモ用の仮入力',
  termination_notes: 'デモ用の仮入力',
  early_termination_settlement: 'デモ用の仮入力',
}

function prepareDocumentDraft(template: DocumentTemplateDefinition, draft: DocumentDraft): DocumentDraft {
  if (template.documentCode !== 'C-001') return draft

  const prepared = { ...draft }
  for (const field of template.fields) {
    if (!field.required || C001_DEMO_VISIBLE_FIELDS.has(field.key) || prepared[field.key]?.trim()) continue
    prepared[field.key] = C001_DEMO_DEFAULTS[field.key] ?? 'デモ用の仮入力'
  }
  prepared.client_signature_name ||= prepared.client_name || C001_DEMO_DEFAULTS.client_name
  prepared.lawyer_signature_name ||= prepared.responsible_person || C001_DEMO_DEFAULTS.responsible_person
  return prepared
}

function requestMessage(error: unknown): string {
  if (isAxiosError<{ message?: string }>(error) && error.response?.data?.message) return error.response.data.message
  return error instanceof Error ? error.message : '文書を保存できませんでした。'
}

function requestFieldErrors(error: unknown): FieldErrors {
  if (!isAxiosError<{ errors?: Record<string, string[]> }>(error)) return {}
  return Object.fromEntries(Object.entries(error.response?.data?.errors ?? {}).map(([key, messages]) => [
    key.replace(/^draft_data\./, ''), messages[0],
  ]))
}

export default function DocumentEditorPage({ caseId, documentId, canUpdate }: { caseId: number; documentId: number; canUpdate: boolean }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [context, setContext] = useState<LoadedContext | null>(null)
  const [record, setRecord] = useState<DocumentDraftRecord | null>(null)
  const [drive, setDrive] = useState<DocumentDriveState>({ available: false, artifact: null })
  const [versions, setVersions] = useState<DocumentVersionSummary[]>([])
  const [currentVersion, setCurrentVersion] = useState<number | null>(null)
  const [draft, setDraft] = useState<DocumentDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadedVersion, setLoadedVersion] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)
  const actionInFlight = useRef(false)
  const versionParam = searchParams.get('version')
  const requestedVersion = versionParam && /^[1-9]\d*$/.test(versionParam) ? Number(versionParam) : undefined

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      caseWorkspaceApi.show(caseId),
      documentCollectionApi.detail(caseId, documentId, controller.signal),
      documentDraftStore.load({ caseId, documentId, version: requestedVersion }, controller.signal),
    ])
      .then(([workspace, document, creation]) => {
        if (controller.signal.aborted) return
        if (!creation.supported || !creation.template || !creation.record) throw new Error('この資料は文書作成に対応していません。')
        if (creation.record.status === 'not_created' && !canUpdate) throw new Error('文書作成を開始する権限がありません。')
        setError(''); setNotice(''); setActionError(''); setLoadedVersion(requestedVersion ?? 0)
        setContext({ caseFile: workspace.case_file, document, template: creation.template })
        setRecord(creation.record); setDraft(documentDisplayData(creation.record))
        setDrive(creation.drive); setVersions(creation.versions); setCurrentVersion(creation.currentVersion)
      })
      .catch(requestError => { if (!controller.signal.aborted) { setLoadedVersion(requestedVersion ?? 0); setError(requestMessage(requestError)) } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [caseId, documentId, canUpdate, requestedVersion])

  const status = record?.status ?? 'draft'
  const loadingVersion = loading || loadedVersion !== (requestedVersion ?? 0)
  const isHistorical = !!record && !record.isCurrent
  const viewOnly = status !== 'not_created' && (searchParams.get('mode') === 'view' || !canUpdate || status === 'approved' || isHistorical)
  const editPath = `/quests/${caseId}/documents/${documentId}/edit`
  const dirty = useMemo(() => !!draft && !!record && JSON.stringify(draft) !== JSON.stringify(record.draft), [draft, record])
  const returnToCollection = () => {
    if (actionInFlight.current) return
    if ((status === 'not_created' || status === 'draft') && dirty && !window.confirm('保存していない変更を破棄して資料収集へ戻りますか？')) return
    navigate(`/quests/${caseId}`, { state: { workspaceTab: 'collection', collectionItemId: documentId } })
  }
  const update = (field: string, value: string) => {
    setDraft(current => current ? { ...current, [field]: value } : current)
    setErrors(current => ({ ...current, [field]: undefined })); setNotice(''); setActionError('')
  }
  const applyState = (next: DocumentCreationState) => {
    if (!next.record) throw new Error('文書の保存結果を取得できませんでした。')
    const values = documentDisplayData(next.record)
    setRecord(next.record); setDraft(values); setDrive(next.drive)
    setVersions(next.versions); setCurrentVersion(next.currentVersion)
  }
  const perform = async (action: () => Promise<DocumentCreationState>) => {
    if (actionInFlight.current) return false
    actionInFlight.current = true
    setSaving(true); setActionError(''); setNotice(''); setErrors({})
    try { const next = await action(); applyState(next); return true }
    catch (requestError) { setErrors(requestFieldErrors(requestError)); setActionError(requestMessage(requestError)); return false }
    finally { actionInFlight.current = false; setSaving(false) }
  }
  const saveDraft = async () => {
    if (!draft || !context || !canUpdate) return
    const prepared = prepareDocumentDraft(context.template, draft)
    if (await perform(() => documentDraftStore.saveDraft({ caseId, documentId }, prepared))) setNotice('下書きを保存しました。')
  }
  const review = async () => {
    if (!draft || !context || !canUpdate) return
    setNotice(''); setActionError('')
    const prepared = prepareDocumentDraft(context.template, draft)
    const fieldsToValidate = context.template.documentCode === 'C-001'
      ? context.template.fields.filter(field => C001_DEMO_VISIBLE_FIELDS.has(field.key))
      : context.template.fields
    const next = Object.fromEntries(fieldsToValidate
      .filter(field => field.required && !prepared[field.key]?.trim())
      .map(field => [field.key, `${field.label}を入力してください。`]))
    setErrors(next)
    if (Object.keys(next).length) return
    if (await perform(() => documentDraftStore.moveToReview({ caseId, documentId }, prepared))) {
      setNotice(''); window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }
  const editAgain = async () => {
    if (!draft || !canUpdate) return
    if (await perform(() => documentDraftStore.saveDraft({ caseId, documentId }, draft))) {
      setNotice(''); window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }
  const approve = async () => {
    if (!canUpdate) return
    if (await perform(() => documentDraftStore.approve({ caseId, documentId }))) {
      setNotice(''); window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }
  const createRevision = async () => {
    if (!canUpdate || status !== 'approved' || isHistorical) return
    if (await perform(() => documentDraftStore.createRevision({ caseId, documentId }))) {
      navigate(editPath, { replace: true }); window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  if (loadingVersion) return <main className="dc-preview c001-page"><LoadingState message="文書作成画面を読み込み中…" variant="page" /></main>
  if (error || !context || !draft) return <main className="dc-preview c001-page"><button type="button" className="c001-back" onClick={returnToCollection}><ArrowLeft size={16}/>資料収集へ戻る</button><p className="c001-page-state is-error" role="alert">{error || '文書情報がありません。'}</p></main>

  const approvedSource = (source: string) => {
    const field = context.template.fields.find(item => item.source === source)
    return field ? draft[field.key] || '—' : '—'
  }

  return <main className="dc-preview c001-page">
    <button type="button" className="c001-back" onClick={returnToCollection}><ArrowLeft size={16}/>資料収集へ戻る</button>
    <header className="c001-page-header">
      <div><span className="dc-code">{context.template.documentCode}</span><h1>{context.template.name}</h1><p>{viewOnly ? '保存されている文書内容を表示しています。' : '案件情報をもとに文書内容を準備します。'}</p></div>
      <div className="c001-page-header-actions">
        {record && versions.length > 0 && <label className="c001-version-picker">版
          <select value={record.version} onChange={event => navigate(`${editPath}?mode=view&version=${event.target.value}`, { replace: true })}>
            {versions.map(version => <option key={version.version} value={version.version}>v{version.version}{version.isCurrent ? '（最新）' : ''}</option>)}
          </select>
        </label>}
        <DocumentWorkflowBadge status={status}/>
        {viewOnly && canUpdate && status !== 'approved' && !isHistorical && <button type="button" className="dc-button dc-primary" onClick={() => navigate(editPath, { replace: true })}><FilePenLine size={14}/>文書を編集</button>}
        {status === 'approved' && canUpdate && !isHistorical && <button type="button" className="dc-button dc-primary" disabled={saving} onClick={() => void createRevision()}><FilePenLine size={14}/>{saving ? '作成中…' : '改訂版を作成'}</button>}
      </div>
    </header>
    <dl className="c001-context" aria-label={status === 'approved' ? '承認時の情報' : '現在の案件情報'}>
      <div><dt>案件</dt><dd>{status === 'approved' ? approvedSource('case_file.title') : context.caseFile.reference_number || context.caseFile.title}</dd></div>
      <div><dt>依頼者</dt><dd>{status === 'approved' ? approvedSource('client.name') : context.caseFile.client.name || '—'}</dd></div>
      <div><dt>担当者</dt><dd>{status === 'approved' ? approvedSource('case_document.assigned_employee.full_name') : context.document.assigned_employee?.display_name ?? context.caseFile.assigned_employee?.full_name ?? '—'}</dd></div>
    </dl>
    {isHistorical
      ? <p className="c001-permission-note">履歴版 v{record?.version} を表示しています。この版は変更・上書きされません。</p>
      : status === 'approved'
      ? <p className="c001-permission-note">承認済みスナップショットです。変更する場合は「改訂版を作成」から v{(currentVersion ?? record?.version ?? 1) + 1} を作成します。</p>
      : !canUpdate
        ? <p className="c001-permission-note">この画面は閲覧のみです。編集・承認には案件更新権限が必要です。</p>
        : viewOnly && <p className="c001-permission-note">閲覧モードです。「文書を編集」から保存済みの下書きを編集できます。</p>}
    {notice && <p className="c001-notice" role="status">{notice}</p>}
    {actionError && <p className="c001-page-state is-error" role="alert">{actionError}</p>}

    {(status === 'not_created' || status === 'draft') && (viewOnly
      ? <ReviewView template={context.template} draft={draft} documentVersion={record?.version} approved={false} readOnly disabled busy={false} onEdit={() => undefined} onApprove={() => undefined}/>
      : <EditorForm template={context.template} draft={draft} errors={errors} disabled={!canUpdate || saving} busy={saving} onChange={update} onCancel={returnToCollection} onSave={() => void saveDraft()} onReview={() => void review()}/>)}
    {status === 'review' && <ReviewView template={context.template} draft={draft} documentVersion={record?.version} approved={false} readOnly={viewOnly} disabled={!canUpdate || saving} busy={saving} onEdit={() => void editAgain()} onApprove={() => void approve()}/>}
    {status === 'approved' && <ReviewView template={context.template} draft={draft} documentVersion={record?.version} approved readOnly disabled busy={saving} onEdit={() => undefined} onApprove={() => undefined} pdfAction={<DocumentPdfDownloadButton caseId={caseId} documentId={documentId} version={record?.version}/>} driveAction={<DocumentDriveButton caseId={caseId} documentId={documentId} version={record?.version} drive={drive} onSaved={setDrive}/>}/>}
  </main>
}

function EditorForm({ template, draft, errors, disabled, busy, onChange, onCancel, onSave, onReview }: { template: DocumentTemplateDefinition; draft: DocumentDraft; errors: FieldErrors; disabled: boolean; busy: boolean; onChange: (field: string, value: string) => void; onCancel: () => void; onSave: () => void; onReview: () => void }) {
  const isCompactDemo = template.documentCode === 'C-001'
  const primaryFields = isCompactDemo ? template.fields.filter(field => C001_DEMO_VISIBLE_FIELDS.has(field.key)) : template.fields

  const fieldControl = (field: DocumentTemplateDefinition['fields'][number]) => <label key={field.key} className={field.wide ? 'is-wide' : undefined}>
    {field.label}{field.required ? ' *' : ''}
    {field.type === 'textarea'
      ? <textarea value={draft[field.key] ?? ''} disabled={disabled} rows={field.rows ?? 5} aria-invalid={!!errors[field.key]} onChange={event => onChange(field.key, event.target.value)}/>
      : <input value={draft[field.key] ?? ''} disabled={disabled} type={field.type} aria-invalid={!!errors[field.key]} onChange={event => onChange(field.key, event.target.value)}/>}
    {errors[field.key] && <small role="alert">{errors[field.key]}</small>}
  </label>

  return <section className="c001-editor" aria-labelledby="document-editor-title">
    <div className="c001-section-heading"><div><span>文書作成</span><h2 id="document-editor-title">{isCompactDemo ? 'デモ用入力' : '基本情報を入力'}</h2><p>{isCompactDemo ? '契約日と委任範囲だけ入力してください。その他の項目はデモ値で自動補完されます。' : '文書に反映する情報を入力してください。'}</p></div><span>{isCompactDemo ? '必須 2項目' : '事務所作成書類'}</span></div>
    <div className={`c001-form-grid ${isCompactDemo ? 'is-compact' : ''}`}>
      {primaryFields.map(fieldControl)}
    </div>
    <div className="c001-bottom-actions">
      <p>{isCompactDemo ? 'まず下書き保存、内容が整ったら確認へ進みます。' : '保存すると変更内容がサーバーに反映されます。'}</p>
      <div><button type="button" className="dc-button" disabled={busy} onClick={onCancel}>キャンセル</button><button type="button" className="dc-button" disabled={disabled} onClick={onSave}><Save size={15}/>{busy ? '保存中…' : '下書き保存'}</button><button type="button" className="dc-button dc-primary" disabled={disabled} onClick={onReview}>{busy ? '保存中…' : '確認へ'}</button></div>
    </div>
  </section>
}

function ReviewView({ template, draft, documentVersion, approved, readOnly = false, disabled, busy, onEdit, onApprove, pdfAction, driveAction }: { template: DocumentTemplateDefinition; draft: DocumentDraft; documentVersion?: number; approved: boolean; readOnly?: boolean; disabled: boolean; busy: boolean; onEdit: () => void; onApprove: () => void; pdfAction?: ReactNode; driveAction?: ReactNode }) {
  return <section className="c001-review" aria-labelledby="document-review-title">
    <div className="c001-review-heading"><div><span>{approved ? '承認済み文書' : '確認プレビュー'}</span><h2 id="document-review-title">{template.name}</h2></div>{approved && <CheckCircle2 size={24}/>}</div>
    <DocumentReviewRenderer template={template} draft={draft} documentVersion={documentVersion}/>
    <div className="c001-bottom-actions">
      {approved
        ? <><p>承認時点の内容を表示しています。</p><div>{pdfAction}{driveAction}</div></>
        : readOnly
          ? <p>保存済みの内容を閲覧しています。</p>
          : <><p>内容を確認してから承認してください。</p><div><button type="button" className="dc-button" disabled={disabled} onClick={onEdit}>編集に戻る</button><button type="button" className="dc-button dc-primary" disabled={disabled} onClick={onApprove}><CheckCircle2 size={15}/>{busy ? '承認中…' : '承認する'}</button></div></>}
    </div>
  </section>
}
