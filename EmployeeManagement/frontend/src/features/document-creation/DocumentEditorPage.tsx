import { ArrowLeft, CheckCircle2, ExternalLink, FilePenLine, FileText, Minus, Plus, RefreshCw, Scan, Save } from 'lucide-react'
import { isAxiosError } from 'axios'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { caseWorkspaceApi } from '../case-workspace/api'
import type { CaseWorkspace } from '../case-workspace/types'
import { documentCollectionApi } from '../document-collection/api'
import type { C001State, CollectionDetail } from '../document-collection/types'
import { isC001DocumentCode } from '../document-collection/utils'
import '../document-collection/documentCollection.css'
import './c001DocumentEditor.css'
import { documentDisplayData, documentDraftStore } from './documentDraftStore'
import type { C001WorkbookPreview, DocumentCreationState, DocumentDraftRecord, DocumentDriveState, DocumentVersionSummary } from './documentDraftStore'
import type { DocumentDraft, DocumentFieldDefinition, DocumentTemplateDefinition } from './documentTemplates'
import DocumentReviewRenderer from './components/DocumentReviewRenderer'
import DocumentWorkflowBadge from './components/DocumentWorkflowBadge'
import DocumentPdfDownloadButton from './components/DocumentPdfDownloadButton'
import DocumentDriveButton from './components/DocumentDriveButton'
import C001WorkbookDownloadButton from './components/C001WorkbookDownloadButton'
import C001PdfDownloadButton from './components/C001PdfDownloadButton'
import { LoadingState } from '../../components/ui'
import { ButtonSpinner } from '../../components/loading'

type LoadedContext = { caseFile: CaseWorkspace; document: CollectionDetail; template: DocumentTemplateDefinition }
type FieldErrors = Record<string, string | undefined>
type C001PdfPreview = C001WorkbookPreview & { url: string }

const feePresets = ['20', '22', '24']

function c001SourceDraft(state: C001State): DocumentDraft {
  return {
    client_name: state.client_name?.trim() ?? '',
    client_address: state.client_address?.trim() ?? '',
  }
}

function requestMessage(error: unknown): string {
  if (isAxiosError<{ message?: string; errors?: Record<string, string[]> }>(error)) {
    return error.response?.data?.message ?? Object.values(error.response?.data?.errors ?? {})[0]?.[0] ?? '文書を保存できませんでした。'
  }
  return error instanceof Error ? error.message : '文書を保存できませんでした。'
}

function requestFieldErrors(error: unknown): FieldErrors {
  if (!isAxiosError<{ errors?: Record<string, string[]> }>(error)) return {}
  return Object.fromEntries(Object.entries(error.response?.data?.errors ?? {}).map(([key, messages]) => [
    key.replace(/^draft_data\./, ''), messages[0],
  ]))
}

function safeDriveUrl(value?: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'drive.google.com' ? url.href : null
  } catch { return null }
}

function displayDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export default function DocumentEditorPage({ caseId, documentId, canUpdate }: { caseId: number; documentId: number; canUpdate: boolean }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [context, setContext] = useState<LoadedContext | null>(null)
  const [record, setRecord] = useState<DocumentDraftRecord | null>(null)
  const [drive, setDrive] = useState<DocumentDriveState>({ available: false, artifact: null })
  const [versions, setVersions] = useState<DocumentVersionSummary[]>([])
  const [canApprove, setCanApprove] = useState(false)
  const [c001, setC001] = useState<C001State | null>(null)
  const [fee, setFee] = useState('20')
  const [savedFee, setSavedFee] = useState('20')
  const [confirmGeneration, setConfirmGeneration] = useState(false)
  const [workbookPreview, setWorkbookPreview] = useState<C001PdfPreview | null>(null)
  const [previewError, setPreviewError] = useState('')
  const [previewRequest, setPreviewRequest] = useState(0)
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
        const nextFee = creation.c001?.success_fee_percentage || '20'
        setError(''); setNotice(''); setActionError(''); setLoadedVersion(requestedVersion ?? 0)
        setContext({ caseFile: workspace.case_file, document, template: creation.template })
        setRecord(creation.record); setDraft(documentDisplayData(creation.record))
        setDrive(creation.drive); setVersions(creation.versions)
        setCanApprove(creation.permissions.canApprove); setC001(creation.c001)
        setFee(nextFee); setSavedFee(nextFee); setConfirmGeneration(false)
        setWorkbookPreview(null); setPreviewError('')
      })
      .catch(requestError => { if (!controller.signal.aborted) { setLoadedVersion(requestedVersion ?? 0); setError(requestMessage(requestError)) } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [caseId, documentId, canUpdate, requestedVersion])

  const status = record?.status ?? 'draft'
  const loadingVersion = loading || loadedVersion !== (requestedVersion ?? 0)
  const isHistorical = !!record && !record.isCurrent
  const isC001 = !!context && isC001DocumentCode(context.template.documentCode) && !!c001
  const c001EditingReview = isC001 && status === 'review' && searchParams.get('mode') === 'edit' && canUpdate && !isHistorical
  const c001WorkingVersion = isC001 && !!record && c001?.working_version === record.version
  const viewOnly = status !== 'not_created' && (searchParams.get('mode') === 'view' || !canUpdate || status === 'approved' || isHistorical)
  const c001PreparingNextVersion = isC001 && (c001EditingReview || c001WorkingVersion)
  const showC001SavedPreview = isC001 && !!c001?.artifact && viewOnly && status !== 'approved'
  const editPath = `/quests/${caseId}/documents/${documentId}/edit`
  const feeValid = /^\d+(?:\.\d{1,2})?$/.test(fee) && Number(fee) > 0 && Number(fee) <= 100
  const dirty = useMemo(() => !!draft && !!record && (isC001 ? fee !== savedFee : JSON.stringify(draft) !== JSON.stringify(record.draft)), [draft, fee, isC001, record, savedFee])
  const previewEligible = isC001 && !!c001 && (status === 'review' || showC001SavedPreview || (status === 'approved' && !!c001.artifact))
  const officialPdfPreview = previewEligible && !!c001?.pdf_artifact
  const previewBusy = previewEligible && !workbookPreview && !previewError

  useEffect(() => {
    if (!previewEligible) return

    const controller = new AbortController()
    let objectUrl = ''
    documentDraftStore.previewC001({ caseId, documentId, version: requestedVersion }, officialPdfPreview, controller.signal)
      .then(previewData => {
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(previewData.blob)
        setWorkbookPreview({ ...previewData, url: objectUrl })
      })
      .catch(requestError => { if (!controller.signal.aborted) { setWorkbookPreview(null); setPreviewError(requestMessage(requestError)) } })

    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [caseId, c001?.artifact?.last_synced_at, c001?.pdf_artifact?.external_file_id, c001?.success_fee_percentage, documentId, officialPdfPreview, previewEligible, previewRequest, record?.updatedAt, requestedVersion, status])
  const returnToCollection = () => {
    if (actionInFlight.current) return
    if ((status === 'not_created' || status === 'draft' || c001EditingReview) && dirty && !window.confirm('保存していない変更を破棄して資料収集へ戻りますか？')) return
    navigate(`/quests/${caseId}`, { state: { workspaceTab: 'collection', collectionItemId: documentId } })
  }
  const update = (field: string, value: string) => {
    setDraft(current => current ? { ...current, [field]: value } : current)
    setErrors(current => ({ ...current, [field]: undefined })); setNotice(''); setActionError('')
  }
  const applyState = (next: DocumentCreationState) => {
    if (!next.record) throw new Error('文書の保存結果を取得できませんでした。')
    const values = documentDisplayData(next.record)
    const nextFee = next.c001?.success_fee_percentage || fee
    setRecord(next.record); setDraft(values); setDrive(next.drive)
    setVersions(next.versions)
    setCanApprove(next.permissions.canApprove); setC001(next.c001)
    setFee(nextFee); setSavedFee(nextFee)
    if (next.c001) { setWorkbookPreview(null); setPreviewError('') }
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
    if (!draft || !context || !canUpdate || (isC001 && !feeValid)) return
    const prepared = isC001 && c001 ? c001SourceDraft(c001) : draft
    if (await perform(() => documentDraftStore.saveDraft({ caseId, documentId }, prepared, isC001 ? fee : undefined))) setNotice('下書きを保存しました。Driveのファイルは変更されていません。')
  }
  const preview = async () => {
    if (!draft || !context || !canUpdate || (isC001 && !feeValid)) return
    if (isC001 && (!c001?.client_name?.trim() || !c001.client_address?.trim())) {
      setActionError('依頼者の氏名または住所が未登録です。案件情報を修正してから再度お試しください。')
      return
    }
    const prepared = isC001 && c001 ? c001SourceDraft(c001) : draft
    const fieldsToValidate = isC001 ? [] : context.template.fields
    const next = Object.fromEntries(fieldsToValidate.filter(field => field.required && !prepared[field.key]?.trim()).map(field => [field.key, `${field.label}を入力してください。`]))
    setErrors(next)
    if (Object.keys(next).length) return
    if (await perform(() => documentDraftStore.moveToReview({ caseId, documentId }, prepared, isC001 ? fee : undefined))) {
      if (c001EditingReview) navigate(`${editPath}?mode=view`, { replace: true })
      setConfirmGeneration(false); window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }
  const editAgain = async () => {
    if (!draft || !canUpdate) return
    const prepared = isC001 && c001 ? c001SourceDraft(c001) : draft
    if (await perform(() => documentDraftStore.saveDraft({ caseId, documentId }, prepared, isC001 ? fee : undefined))) {
      setNotice('編集モードに戻りました。Driveのファイルはまだ変更されていません。'); setConfirmGeneration(false); window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }
  const generateC001 = async () => {
    if (!isC001 || !feeValid || !canUpdate) return
    if (await perform(() => documentDraftStore.syncC001({ caseId, documentId }, fee))) {
      setNotice(`C-001 v${c001?.working_version ?? c001?.next_version ?? 1}をDriveへ保存し、承認待ちにしました。`)
      setConfirmGeneration(false); window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }
  const startC001Edit = () => {
    if (!isC001 || !canUpdate || isHistorical) return
    navigate(`${editPath}?mode=edit`, { replace: true })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const approve = async () => {
    if (!canApprove) return
    if (await perform(() => documentDraftStore.approve({ caseId, documentId }))) setNotice('文書を承認して完了しました。')
  }
  const createRevision = async () => {
    if (!canUpdate || status !== 'approved' || isHistorical) return
    if (await perform(() => documentDraftStore.createRevision({ caseId, documentId }))) {
      navigate(editPath, { replace: true }); window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }
  const retryPreview = () => {
    setWorkbookPreview(null); setPreviewError(''); setPreviewRequest(current => current + 1)
  }

  if (loadingVersion) return <main className="dc-preview c001-page"><LoadingState message="文書作成画面を読み込み中…" variant="page" /></main>
  if (error || !context || !draft) return <main className="dc-preview c001-page"><button type="button" className="c001-back" onClick={returnToCollection}><ArrowLeft size={16}/>資料収集へ戻る</button><p className="c001-page-state is-error" role="alert">{error || '文書情報がありません。'}</p></main>

  const approvedSource = (source: string) => {
    const field = context.template.fields.find(item => item.source === source)
    return field ? draft[field.key] || '—' : '—'
  }

  return <main className="dc-preview c001-page">
    <button type="button" className="c001-back" onClick={returnToCollection}><ArrowLeft size={16}/>資料収集へ戻る</button>
    <header className={`c001-page-header ${isC001 ? 'is-document-card' : ''}`}>
      <div><span className="dc-code">{context.template.documentCode}</span><h1>{context.template.name}</h1><p>{isC001 ? '自動入力された案件情報を確認し、編集・プレビュー後にDriveへ保存します。' : viewOnly ? '保存されている文書内容を表示しています。' : '案件情報をもとに文書内容を準備します。'}</p></div>
      <div className={`c001-page-header-actions ${isC001 ? 'is-document-actions' : ''}`}>
        {isC001 && <div className="c001-header-state-strip" aria-label="文書の現在状態">
          {record && versions.length > 0 && !c001PreparingNextVersion && <label className="c001-version-picker is-document-state"><span>現在の版</span>
            <select value={record.version} onChange={event => navigate(`${editPath}?mode=view&version=${event.target.value}`, { replace: true })}>{versions.map(version => <option key={version.version} value={version.version}>v{version.version}{version.isCurrent ? '（最新）' : ''}</option>)}</select>
          </label>}
          {c001PreparingNextVersion && <div className="c001-next-version is-document-state"><span>作成する版</span><strong>v{c001?.working_version ?? c001?.next_version ?? 1}</strong></div>}
          <div className="c001-workflow-state"><span>ワークフロー</span><DocumentWorkflowBadge status={status}/></div>
        </div>}
        {!isC001 && record && versions.length > 0 && !c001PreparingNextVersion && <label className="c001-version-picker">版
          <select value={record.version} onChange={event => navigate(`${editPath}?mode=view&version=${event.target.value}`, { replace: true })}>{versions.map(version => <option key={version.version} value={version.version}>v{version.version}{version.isCurrent ? '（最新）' : ''}</option>)}</select>
        </label>}
        {!isC001 && c001PreparingNextVersion && <span className="c001-next-version">次の版: v{c001?.working_version ?? c001?.next_version ?? 1}</span>}
        {!isC001 && <DocumentWorkflowBadge status={status}/>}
        {viewOnly && canUpdate && status !== 'approved' && !isHistorical && <button type="button" className="dc-button dc-primary" onClick={() => navigate(isC001 && status === 'review' ? `${editPath}?mode=edit` : editPath, { replace: true })}><FilePenLine size={14}/>文書を編集</button>}
        {status === 'approved' && canUpdate && !isHistorical && !isC001 && <button type="button" className="dc-button dc-primary" disabled={saving} onClick={() => void createRevision()}>{saving ? <ButtonSpinner size={14}/> : <FilePenLine size={14}/>} {saving ? '作成中…' : '改訂版を作成'}</button>}
      </div>
    </header>
    <dl className={`c001-context ${isC001 ? 'is-c001' : ''}`} aria-label={status === 'approved' ? '承認時の情報' : '現在の案件情報'}>
      <div><dt>案件</dt><dd>{status === 'approved' ? approvedSource('case_file.title') : context.caseFile.reference_number || context.caseFile.title}</dd></div>
      <div><dt>依頼者</dt><dd>{status === 'approved' ? approvedSource('client.name') : context.caseFile.client.name || '—'}</dd></div>
      {!isC001 && <div><dt>担当者</dt><dd>{status === 'approved' ? approvedSource('case_document.assigned_employee.full_name') : context.document.assigned_employee?.display_name ?? context.caseFile.assigned_employee?.full_name ?? '—'}</dd></div>}
    </dl>
    {isHistorical ? <p className="c001-permission-note">履歴版 v{record?.version} を表示しています。この版は変更・上書きされません。</p> : status === 'approved' ? <p className="c001-permission-note">{isC001 ? '承認済みのC-001はこのワークフローから変更できません。' : '承認済みスナップショットです。変更する場合は改訂版を作成します。'}</p> : !canUpdate ? <p className="c001-permission-note">この画面は閲覧のみです。</p> : null}
    {notice && <p className="c001-notice" role="status">{notice}</p>}
    {actionError && <p className="c001-page-state is-error" role="alert">{actionError}</p>}

    {(status === 'not_created' || status === 'draft') && !showC001SavedPreview && (isC001 && c001
      ? <C001ConfigurationEditor state={c001} fee={fee} feeValid={feeValid} disabled={viewOnly || !canUpdate || saving} busy={saving} showActions={!viewOnly} onFeeChange={value => { setFee(value); setNotice(''); setActionError('') }} onCancel={returnToCollection} onSave={() => void saveDraft()} onPreview={() => void preview()}/>
      : viewOnly
        ? <ReviewView template={context.template} draft={draft} documentVersion={record?.version} approved={false} readOnly disabled busy={false} onEdit={() => undefined} onApprove={() => undefined}/>
        : <EditorForm template={context.template} draft={draft} errors={errors} disabled={!canUpdate || saving} busy={saving} onChange={update} onCancel={returnToCollection} onSave={() => void saveDraft()} onPreview={() => void preview()}/>) }
    {c001EditingReview && c001 && <C001ConfigurationEditor state={c001} fee={fee} feeValid={feeValid} disabled={saving} busy={saving} showActions onFeeChange={value => { setFee(value); setNotice(''); setActionError('') }} onCancel={() => navigate(`${editPath}?mode=view`, { replace: true })} onSave={() => void saveDraft()} onPreview={() => void preview()}/>}
    {isC001 && c001 && !c001EditingReview && (status === 'review' || showC001SavedPreview) && <C001Preview caseId={caseId} documentId={documentId} version={record?.version ?? c001.latest_version ?? 1} template={context.template} preview={workbookPreview} previewLoading={previewBusy} previewError={previewError} state={c001} busy={saving} canUpdate={canUpdate && !isHistorical} confirming={confirmGeneration} onRetryPreview={retryPreview} onEdit={startC001Edit} onRequestGenerate={() => setConfirmGeneration(true)} onCancelGenerate={() => setConfirmGeneration(false)} onGenerate={() => void generateC001()}/>}
    {status === 'review' && !isC001 && <ReviewView template={context.template} draft={draft} documentVersion={record?.version} approved={false} readOnly={viewOnly || !canApprove} disabled={!canApprove || saving} busy={saving} onEdit={() => void editAgain()} onApprove={() => void approve()}/>}
    {status === 'approved' && isC001 && c001 && <C001Preview caseId={caseId} documentId={documentId} version={record?.version ?? c001.latest_version ?? 1} template={context.template} preview={workbookPreview} previewLoading={previewBusy} previewError={previewError} state={c001} busy={saving} canUpdate={false} confirming={false} approvedView onRetryPreview={() => undefined} onEdit={() => undefined} onRequestGenerate={() => undefined} onCancelGenerate={() => undefined} onGenerate={() => undefined}/>}
    {status === 'approved' && !isC001 && <ReviewView
      template={context.template}
      draft={draft}
      documentVersion={record?.version}
      approved
      readOnly
      disabled
      busy={saving}
      onEdit={() => undefined}
      onApprove={() => undefined}
      pdfAction={<DocumentPdfDownloadButton caseId={caseId} documentId={documentId} version={record?.version}/>}
      driveAction={<DocumentDriveButton caseId={caseId} documentId={documentId} version={record?.version} drive={drive} onSaved={setDrive}/>}
    />}
  </main>
}

function EditorForm({ template, draft, errors, disabled, busy, onChange, onCancel, onSave, onPreview }: { template: DocumentTemplateDefinition; draft: DocumentDraft; errors: FieldErrors; disabled: boolean; busy: boolean; onChange: (field: string, value: string) => void; onCancel: () => void; onSave: () => void; onPreview: () => void }) {
  const fieldControl = (field: DocumentFieldDefinition) => <label key={field.key} className={field.wide ? 'is-wide' : undefined}>{field.label}{field.required ? ' *' : ''}{field.type === 'textarea' ? <textarea value={draft[field.key] ?? ''} disabled={disabled} rows={field.rows ?? 5} aria-invalid={!!errors[field.key]} onChange={event => onChange(field.key, event.target.value)}/> : <input value={draft[field.key] ?? ''} disabled={disabled} type={field.type} aria-invalid={!!errors[field.key]} onChange={event => onChange(field.key, event.target.value)}/>} {errors[field.key] && <small role="alert">{errors[field.key]}</small>}</label>

  return <section className="c001-editor" aria-labelledby="document-editor-title">
    <div className="c001-section-heading"><div><span>文書作成</span><h2 id="document-editor-title">基本情報を入力</h2><p>文書に反映する情報を入力してください。</p></div><span>事務所作成書類</span></div>
    <div className="c001-form-grid">{template.fields.map(fieldControl)}</div>
    <div className="c001-bottom-actions"><p>下書きを保存してから内容を確認できます。</p><div><button type="button" className="dc-button" disabled={busy} onClick={onCancel}>キャンセル</button><button type="button" className="dc-button" disabled={disabled} onClick={onSave}>{busy ? <ButtonSpinner size={15}/> : <Save size={15}/>} {busy ? '保存中…' : '下書き保存'}</button><button type="button" className="dc-button dc-primary" disabled={disabled} onClick={onPreview}>{busy && <ButtonSpinner size={14}/>} {busy ? '保存中…' : '確認へ'}</button></div></div>
  </section>
}

function C001ConfigurationEditor({ state, fee, feeValid, disabled, busy, showActions, onFeeChange, onCancel, onSave, onPreview }: { state: C001State; fee: string; feeValid: boolean; disabled: boolean; busy: boolean; showActions: boolean; onFeeChange: (value: string) => void; onCancel: () => void; onSave: () => void; onPreview: () => void }) {
  const customFee = !feePresets.includes(fee)
  const hasSourceData = !!state.client_name?.trim() && !!state.client_address?.trim()

  return <section className="c001-editor c001-config-editor" aria-labelledby="c001-config-title">
    <div className="c001-section-heading"><div><span>AUTO-FILL → CONFIGURE</span><h2 id="c001-config-title">C-001 文書を準備</h2><p>案件DBの情報と、契約書に適用する報酬金だけを確認します。</p></div><span>専用ワークフロー</span></div>
    <div className="c001-config-body">
      <section className="c001-config-group" aria-labelledby="c001-source-title">
        <div className="c001-config-group-heading"><div><span>01</span><h3 id="c001-source-title">自動入力データ</h3></div><p>案件DBが正本です</p></div>
        <dl className="c001-autofill-source">
          <div><dt>委任者氏名<span>案件DBから自動取得</span></dt><dd>{state.client_name?.trim() || '未登録'}</dd></div>
          <div><dt>委任者住所<span>案件DBから自動取得</span></dt><dd>{state.client_address?.trim() || '未登録'}</dd></div>
        </dl>
        <p className={`c001-source-note ${hasSourceData ? '' : 'is-error'}`}>{hasSourceData ? '氏名・住所を修正する場合は、C-001ではなく案件情報を更新してください。' : '氏名または住所が未登録です。案件情報を更新してからプレビューしてください。'}</p>
      </section>
      <section className="c001-config-group" aria-labelledby="c001-fee-title">
        <div className="c001-config-group-heading"><div><span>02</span><h3 id="c001-fee-title">報酬金</h3></div><p>推奨 20%</p></div>
        <div className="c001-fee-editor"><div className="c001-fee-options">{feePresets.map(value => <button key={value} type="button" className={fee === value ? 'is-selected' : ''} disabled={disabled} onClick={() => onFeeChange(value)}>{value}%</button>)}<label className={customFee ? 'is-selected' : ''}><span>その他</span><input aria-label="任意の報酬金割合" inputMode="decimal" value={customFee ? fee : ''} disabled={disabled} onChange={event => onFeeChange(event.target.value)}/><b>%</b></label></div>{!feeValid && <small role="alert">0より大きく100以下、小数2桁までで入力してください。</small>}</div>
      </section>
      <section className="c001-config-group" aria-labelledby="c001-template-title">
        <div className="c001-config-group-heading"><div><span>03</span><h3 id="c001-template-title">テンプレート</h3></div><p>マスターは変更されません</p></div>
        <div className="c001-template-source"><div><span>MASTER WORKBOOK</span><strong>{state.master_template_name || '委任契約書簡易版完全成功報酬-空欄'}</strong></div><div><span>権限</span><strong>読み取り専用</strong></div></div>
      </section>
    </div>
    <div className="c001-bottom-actions"><p>下書き保存・確認ではGoogle Driveの顧客フォルダを変更しません。</p><div><button type="button" className="dc-button" disabled={busy} onClick={onCancel}>キャンセル</button>{showActions && <><button type="button" className="dc-button" disabled={disabled || !feeValid} onClick={onSave}>{busy ? <ButtonSpinner size={15}/> : <Save size={15}/>} {busy ? '保存中…' : '下書き保存'}</button><button type="button" className="dc-button dc-primary" disabled={disabled || !feeValid || !hasSourceData} onClick={onPreview}>{busy && <ButtonSpinner size={14}/>} {busy ? '準備中…' : '確認'}</button></>}</div></div>
  </section>
}

function C001Preview({ caseId, documentId, version, template, preview, previewLoading, previewError, state, busy, canUpdate, confirming, approvedView = false, onRetryPreview, onEdit, onRequestGenerate, onCancelGenerate, onGenerate }: { caseId: number; documentId: number; version: number; template: DocumentTemplateDefinition; preview: C001PdfPreview | null; previewLoading: boolean; previewError: string; state: C001State; busy: boolean; canUpdate: boolean; confirming: boolean; approvedView?: boolean; onRetryPreview: () => void; onEdit: () => void; onRequestGenerate: () => void; onCancelGenerate: () => void; onGenerate: () => void }) {
  const [previewZoom, setPreviewZoom] = useState<number | 'page-fit'>('page-fit')
  const driveUrl = safeDriveUrl(state.pdf_artifact?.url)
  const readyForApproval = state.status === 'pending_approval'
  const completed = approvedView || state.status === 'complete'
  const finalized = approvedView || (!!state.pdf_artifact && !!state.workbook_artifact)
  const workingVersion = state.working_version ?? state.next_version ?? version
  const zoomValue = previewZoom === 'page-fit' ? 90 : previewZoom
  const previewSrc = preview ? `${preview.url}#toolbar=0&navpanes=0&scrollbar=1&zoom=${previewZoom}` : undefined
  const reviewState = completed ? '承認済み' : readyForApproval ? '承認待ち' : finalized ? '作成済み' : '一時プレビュー'
  const reviewStateClass = completed ? 'is-complete' : readyForApproval ? 'is-pending' : finalized ? 'is-saved' : 'is-temporary'
  return <section className="c001-review c001-document-review" aria-labelledby="document-review-title">
    <div className="c001-review-heading"><div><span>{completed ? `承認済み v${version}` : readyForApproval || finalized ? `作成済み v${version}` : `編集中の版 v${workingVersion}`}</span><h2 id="document-review-title">{template.name}</h2><p>{preview?.source === 'saved_working_copy' ? 'Google Driveに保存済みの文書' : '一時作業コピー（Drive未保存）'}</p></div><div className={`c001-review-state ${reviewStateClass}`}>{(readyForApproval || completed) ? <CheckCircle2 size={15} aria-hidden="true"/> : <FileText size={15} aria-hidden="true"/>}<span>{reviewState}</span></div></div>
    <div className="c001-preview-toolbar" aria-label="PDFプレビュー操作">
      <div className="c001-preview-toolbar-label"><FileText size={16} aria-hidden="true"/><div><strong>PDFプレビュー</strong><span>{preview ? '1ページ · 実際の出力内容' : '出力内容を準備中'}</span></div></div>
      <div className="c001-preview-toolbar-controls" role="group" aria-label="表示倍率">
        <button type="button" aria-label="縮小" title="縮小" disabled={!preview || previewZoom !== 'page-fit' && previewZoom <= 70} onClick={() => setPreviewZoom(Math.max(70, zoomValue - 10))}><Minus size={15}/></button>
        <output aria-live="polite">{previewZoom === 'page-fit' ? '全体' : `${previewZoom}%`}</output>
        <button type="button" aria-label="拡大" title="拡大" disabled={!preview || previewZoom !== 'page-fit' && previewZoom >= 120} onClick={() => setPreviewZoom(Math.min(120, zoomValue + 10))}><Plus size={15}/></button>
        <button type="button" className="c001-preview-fit" aria-label="全体表示" title="全体表示" disabled={!preview || previewZoom === 'page-fit'} onClick={() => setPreviewZoom('page-fit')}><Scan size={14} aria-hidden="true"/><span>全体表示</span></button>
      </div>
    </div>
    <div className="c001-workbook-preview">
      {previewLoading && <div className="c001-workbook-loading" role="status"><ButtonSpinner size={22}/><strong>実際のC-001を生成しています…</strong><span>マスターを一時コピーし、案件情報と報酬金を反映しています。</span></div>}
      {!previewLoading && previewError && <div className="c001-workbook-error" role="alert"><strong>プレビューを表示できませんでした</strong><p>{previewError}</p>{canUpdate && <button type="button" className="dc-button" onClick={onRetryPreview}><RefreshCw size={14}/>再試行</button>}</div>}
      {!previewLoading && preview && <iframe className="c001-workbook-frame" title="C-001 委任契約書PDFプレビュー" src={previewSrc}/>}
    </div>
    {finalized && state.artifact && <div className="c001-artifact"><div><span>GOOGLE DRIVE · PDF / XLSX</span><strong>{state.artifact.filename}</strong></div><dl><div><dt>作成日時</dt><dd>{displayDate(state.artifact.generated_at)}</dd></div><div><dt>最終同期</dt><dd>{displayDate(state.artifact.last_synced_at)}</dd></div><div><dt>作成者</dt><dd>{state.artifact.generated_by || '—'}</dd></div></dl></div>}
    {confirming && <div className="c001-generate-confirm" role="alert"><div><strong>C-001 v{workingVersion}を確定して保存しますか？</strong><p>現在のプレビュー内容と報酬金 {state.success_fee_percentage}% を新しい版としてDriveへ保存します。既存の版とマスターは変更しません。</p></div><div><button type="button" className="dc-button" disabled={busy} onClick={onCancelGenerate}>キャンセル</button><button type="button" className="dc-button dc-primary" disabled={busy} onClick={onGenerate}>{busy ? <ButtonSpinner size={14}/> : <CheckCircle2 size={14}/>}確定・保存</button></div></div>}
    <div className="c001-bottom-actions c001-review-actions"><p>{completed ? '承認時点のPDFと元のExcelを表示しています。' : readyForApproval ? 'PDFとExcelをDriveへ保存済みです。承認・差戻しは承認室で行ってください。' : finalized ? '保存済みの版は変更されません。編集すると次の版を準備します。' : 'このPDFは一時確認用です。Drive保存も版の確定も行われていません。'}</p><div>{finalized && <C001PdfDownloadButton caseId={caseId} documentId={documentId} version={version}/>} {finalized && <C001WorkbookDownloadButton caseId={caseId} documentId={documentId} version={version}/>} {finalized && driveUrl && <a className="dc-button" href={driveUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={14}/>Google Driveで開く</a>}{canUpdate && <button type="button" className="dc-button" disabled={busy} onClick={onEdit}><FilePenLine size={14}/>編集に戻る</button>}{canUpdate && !finalized && !readyForApproval && !completed && !confirming && <button type="button" className="dc-button dc-primary" disabled={busy || !preview} onClick={onRequestGenerate}><CheckCircle2 size={14}/>確定・保存</button>}</div></div>
  </section>
}

function ReviewView({ template, draft, documentVersion, approved, readOnly = false, disabled, busy, onEdit, onApprove, pdfAction, driveAction }: { template: DocumentTemplateDefinition; draft: DocumentDraft; documentVersion?: number; approved: boolean; readOnly?: boolean; disabled: boolean; busy: boolean; onEdit: () => void; onApprove: () => void; pdfAction?: ReactNode; driveAction?: ReactNode }) {
  return <section className="c001-review" aria-labelledby="document-review-title"><div className="c001-review-heading"><div><span>{approved ? '承認済み文書' : '確認プレビュー'}</span><h2 id="document-review-title">{template.name}</h2></div>{approved && <CheckCircle2 size={24}/>}</div><DocumentReviewRenderer template={template} draft={draft} documentVersion={documentVersion}/><div className="c001-bottom-actions">{approved ? <><p>承認時点の内容を表示しています。</p><div>{pdfAction}{driveAction}</div></> : readOnly ? <p>保存済みの内容を閲覧しています。</p> : <><p>内容を確認してから承認してください。</p><div><button type="button" className="dc-button" disabled={disabled} onClick={onEdit}>編集に戻る</button><button type="button" className="dc-button dc-primary" disabled={disabled} onClick={onApprove}><CheckCircle2 size={15}/>{busy ? '承認中…' : '承認する'}</button></div></>}</div></section>
}
