import { Check, ChevronRight, ExternalLink, FileText, History, Pencil } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SectionSkeleton } from '../../../components/loading'
import type { CaseActivity, CaseTask } from '../../case-workspace/types'
import InspectorShell from '../../document-collection/components/InspectorShell'
import DocumentPreviewViewer from '../../document-collection/components/DocumentPreviewViewer'
import DocumentVersionList from '../../document-collection/components/DocumentVersionList'
import DocumentFileCard from '../../document-collection/components/DocumentFileCard'
import DocumentFilesHeader from '../../document-collection/components/DocumentFilesHeader'
import RequiredDocumentBasicInfo from '../../document-collection/components/RequiredDocumentBasicInfo'
import RequiredDocumentRelatedTask from '../../document-collection/components/RequiredDocumentRelatedTask'
import RequiredWorkflowBadge from '../../document-collection/components/RequiredWorkflowBadge'
import { requiredWorkflowPresentation } from '../../document-collection/requiredWorkflowPresentation'
import { useDrawerDismiss } from '../../document-collection/components/useDrawerDismiss'
import ReceivedDocumentRegistration from '../../document-collection/components/ReceivedDocumentRegistration'
import ReceivedDocumentsList from '../../document-collection/components/ReceivedDocumentsList'
import type { CollectionDetail } from '../../document-collection/types'
import { mergePreviewVersions, resolveC001PreviewTarget, type DocumentPreviewTarget } from '../../document-collection/documentPreview'
import { formatDate as formatCollectionDate } from '../../document-collection/utils'
import type { DocumentCreationState } from '../documentDraftStore'
import { documentDraftStore } from '../documentDraftStore'
import C001PdfDownloadButton from './C001PdfDownloadButton'
import C001WorkbookDownloadButton from './C001WorkbookDownloadButton'
import LegalApprovalNotice from './LegalApprovalNotice'
import '../../document-collection/documentCollection.css'
import './c001DocumentReviewDrawer.css'

type Props = {
  caseId: number
  documentId: number
  canUpdate: boolean
  detail?: CollectionDetail
  linkedTask?: CaseTask
  activities?: CaseActivity[]
  onCandidates?: () => void
  onChangeNecessity?: () => void
  notice?: string
  onCreateTask?: () => void
  onManageTask?: () => void
  onOpenTask?: () => void
  onClose: () => void
  onChanged?: (detail?: CollectionDetail) => void
}

const formatDate = (value?: string | null) => value
  ? formatCollectionDate(value, true)
  : '—'

const safeDriveUrl = (value?: string | null) => value && /^https:\/\/(drive|docs)\.google\.com\//i.test(value) ? value : null

export default function C001DocumentReviewDrawer({ caseId, documentId, canUpdate, detail, linkedTask, activities = [], onCandidates, onChangeNecessity, notice, onCreateTask, onManageTask, onOpenTask, onClose: finishClose, onChanged }: Props) {
  const navigate = useNavigate()
  const { closing, close: onClose } = useDrawerDismiss(finishClose)
  const [state, setState] = useState<DocumentCreationState | null>(null)
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [submissionPreviewTarget, setSubmissionPreviewTarget] = useState<DocumentPreviewTarget | null>(null)
  const [tab, setTab] = useState<'overview' | 'files' | 'history'>('overview')

  useEffect(() => {
    const controller = new AbortController()
    void documentDraftStore.load({ caseId, documentId, version: selectedVersion ?? undefined }, controller.signal)
      .then(value => {
        if (controller.signal.aborted) return
        setState(value)
        if (selectedVersion === null) setSelectedVersion(value.currentVersion ?? value.c001?.latest_version ?? value.record?.version ?? 1)
      })
      .catch(() => { if (!controller.signal.aborted) setError('C-001の文書情報を読み込めませんでした。') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [caseId, documentId, selectedVersion])

  const loadedVersion = state?.record?.version

  const c001 = state?.c001
  const versions = state?.versions ?? []
  const receivedDocuments = detail?.received_documents ?? []
  const submissions = detail?.task_submissions ?? (detail?.latest_task_submission ? [...(linkedTask?.submissions ?? []), detail.latest_task_submission] : linkedTask?.submissions ?? [])
  const manualVersions = mergePreviewVersions([], submissions.filter(submission => submission.source_type === 'manual_upload' && !submission.received_document_id))
  const fileCount = versions.length + receivedDocuments.length + manualVersions.length
  const selected = versions.find(item => item.version === selectedVersion)
  const status = c001?.status ?? 'missing'
  const workflow = requiredWorkflowPresentation(detail?.workflow_state.code ?? 'selected')
  const driveUrl = loadedVersion === selectedVersion
    ? safeDriveUrl(c001?.pdf_artifact?.url ?? c001?.artifact?.url)
    : null
  const generatedAt = c001?.artifact?.generated_at ?? selected?.driveArtifact?.uploaded_at
  const generatedBy = c001?.artifact?.generated_by
  const title = state?.template?.name ?? '委任契約書'
  const previewFilename = (loadedVersion === selectedVersion ? c001?.pdf_artifact?.filename : null)
    || selected?.driveArtifact?.filename || `${title}_v${selectedVersion}.pdf`
  const previewTarget = useMemo(() => previewOpen && selectedVersion
    ? resolveC001PreviewTarget(caseId, documentId, selectedVersion, previewFilename, driveUrl)
    : null, [previewOpen, selectedVersion, caseId, documentId, previewFilename, driveUrl])
  const openVersion = (version: number) => {
    setError('')
    setSubmissionPreviewTarget(null)
    setPreviewOpen(true)
    if (version !== selectedVersion) {
      setSelectedVersion(version)
    }
  }

  const footer = c001 && <div className="c001-review-footer">
    {status === 'complete' && <span className="c001-readonly"><Check size={14}/>承認済み・閲覧のみ</span>}
    <button type="button" className="dc-button" onClick={onClose}>閉じる</button>
  </div>

  const documentHistory = activities.filter(activity => activity.metadata?.document_id === documentId)
  const task = detail?.active_task ?? null
  const fileEditAction = ['pending_approval', 'rejected'].includes(status) && canUpdate && <div className="c001-overview-actions"><button type="button" className="dc-button dc-primary dc-auto-generate" onClick={() => navigate(`/quests/${caseId}/documents/${documentId}/edit`)}><Pencil size={16}/>{status === 'rejected' ? '編集を再開' : '文書を編集'}</button></div>
  const rejectionNote = status === 'rejected' && <section className="c001-rejection-note"><strong>差戻し理由</strong><p>{c001?.rejection_reason || '理由は記録されていません。'}</p><small>{c001?.rejected_by?.name || '—'} · {formatDate(c001?.rejected_at)}</small></section>

  return <>
    <InspectorShell forceOverlay breakpoint={1024} className={`c001-review-drawer dc-required-inspector ${closing ? 'is-closing' : ''}`} backdropClassName={`dc-required-backdrop ${closing ? 'is-closing' : ''}`} title={title} code="C-001" subtitle="自社作成 / 依頼者から署名を取得" headerAside={<RequiredWorkflowBadge status={workflow.key}/>} onClose={onClose} footer={footer}>
      {loading && <SectionSkeleton className="border-0" label="C-001を読み込み中…" rows={5} showHeader={false}/>}
      {error && <p className="c001-review-error" role="alert">{error}</p>}
      {notice && <p className="dc-feedback dc-success" role="status">{notice}</p>}
      {state?.permissions.legalApprovalPending && status !== 'complete' && <LegalApprovalNotice/>}
      {!loading && c001 && <>
        <nav className="dc-required-drawer-tabs" aria-label="必要資料の詳細表示">{([['overview', '概要'], ['files', 'ファイル'], ['history', '履歴']] as const).map(([value, label]) => <button key={value} type="button" className={tab === value ? 'is-active' : ''} aria-current={tab === value ? 'page' : undefined} onClick={() => setTab(value)}>{label}{value === 'files' && <span>{fileCount}</span>}</button>)}</nav>

        {tab === 'overview' && <div className="dc-required-drawer-stack">
          <RequiredDocumentBasicInfo detail={detail} title={title} code="C-001" method="事務所で作成" status={workflow} createdAt={generatedAt} creator={generatedBy ? { name: generatedBy } : null} assigneeImage={linkedTask?.assigned_employee?.id === task?.assigned_employee?.id ? linkedTask?.assigned_employee?.avatar_path : undefined} onChangeNecessity={canUpdate ? onChangeNecessity : undefined} onEditTask={canUpdate ? (task ? onManageTask : onCreateTask) : undefined} onEditAcquisition={canUpdate ? onCandidates : undefined}/>
          <section className="dc-required-drawer-card is-files dc-compact-files">
            <DocumentFilesHeader count={fileCount}>{detail?.capabilities?.can_upload && <ReceivedDocumentRegistration caseId={caseId} itemId={documentId} canUpdate={detail?.capabilities?.can_upload === true} documentName={title} triggerLabel="アップロード" triggerClassName="dc-primary" onRegistered={updated => onChanged?.(updated)}/>}</DocumentFilesHeader>
            <div className="dc-compact-file-list">{versions.slice(0, 2).map(version => {
              const name = version.driveArtifact?.filename ?? `${title}_v${version.version}.pdf`
              const versionDetail = detail?.generated_versions.find(item => item.version === version.version)
              const authorName = versionDetail?.artifacts.find(artifact => artifact.filename === name)?.uploaded_by?.name ?? versionDetail?.created_by?.name ?? (version.version === loadedVersion ? generatedBy : null)
              return <DocumentFileCard key={version.version} name={name} version={version.version} author={authorName} uploadedAt={version.driveArtifact?.uploaded_at ?? version.approvedAt ?? generatedAt} isCurrent={version.isCurrent} onOpen={() => openVersion(version.version)}/>
            })}</div>
            {receivedDocuments.length > 0 && <ReceivedDocumentsList compact caseId={caseId} itemId={documentId} files={receivedDocuments.slice(0, Math.max(0, 2 - versions.length))} hideTitle/>}
            {manualVersions.length > 0 && <DocumentVersionList
              compact caseId={caseId} documentId={documentId} versions={manualVersions.slice(0, 2)}
              onPreview={target => { setPreviewOpen(false); setSubmissionPreviewTarget(target) }}/>
            }
            {fileCount === 0 && <div className="dc-required-file-empty"><FileText size={22}/><div><strong>まだファイルが作成されていません。</strong><p>この資料は自社作成に対応しています。</p></div>{(canUpdate || detail?.capabilities?.can_upload) && <div className="dc-required-file-empty-actions"><ReceivedDocumentRegistration caseId={caseId} itemId={documentId} canUpdate={detail?.capabilities?.can_upload === true} documentName={title} triggerLabel="ファイルをアップロード" onRegistered={updated => onChanged?.(updated)}/></div>}</div>}
            {rejectionNote}
            {fileEditAction}
            {fileCount > 0 && <button type="button" className="dc-required-show-all dc-compact-file-history" onClick={() => setTab('files')}><History size={16} aria-hidden="true"/>バージョン履歴を見る ({fileCount}件)<ChevronRight size={15} aria-hidden="true"/></button>}
          </section>
          <RequiredDocumentRelatedTask task={task} taskDetails={linkedTask} onOpen={onOpenTask}/>
        </div>}

        {tab === 'files' && <section className="dc-required-drawer-card is-files c001-files-tab dc-compact-files"><DocumentFilesHeader count={fileCount}><div className="c001-file-head-actions">{detail?.capabilities?.can_upload && <ReceivedDocumentRegistration caseId={caseId} itemId={documentId} canUpdate={detail?.capabilities?.can_upload === true} documentName={title} triggerLabel="アップロード" triggerClassName="dc-primary" onRegistered={updated => onChanged?.(updated)}/>}<label>版<select value={selectedVersion ?? ''} onChange={event => { setLoading(true); setError(''); setSelectedVersion(Number(event.target.value)) }}>{versions.map(version => <option key={version.version} value={version.version}>v{version.version}{version.isCurrent ? '（最新）' : ''}</option>)}</select></label></div></DocumentFilesHeader><DocumentFileCard name={c001.pdf_artifact?.filename || c001.artifact?.filename || `${title}_v${selectedVersion}.pdf`} version={selectedVersion ?? 1} author={generatedBy} uploadedAt={generatedAt} disabled={!selectedVersion} onOpen={() => openVersion(selectedVersion ?? 1)}/><div className="c001-review-files"><C001PdfDownloadButton caseId={caseId} documentId={documentId} version={selectedVersion ?? 1}/><C001WorkbookDownloadButton caseId={caseId} documentId={documentId} version={selectedVersion ?? 1} label="Excelをダウンロード"/>{driveUrl && <a className="dc-button" href={driveUrl} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Driveで開く</a>}</div>{manualVersions.length > 0 && <DocumentVersionList compact caseId={caseId} documentId={documentId} versions={manualVersions} onPreview={target => { setPreviewOpen(false); setSubmissionPreviewTarget(target) }}/>}{receivedDocuments.length > 0 && <ReceivedDocumentsList compact caseId={caseId} itemId={documentId} files={receivedDocuments} hideTitle/>}{rejectionNote}{fileEditAction}</section>}

        {tab === 'history' && <section className="dc-required-drawer-card"><header><div className="dc-required-section-title"><span><History size={17}/></span><h3>履歴</h3></div></header>{documentHistory.length > 0 ? <ol className="dc-required-history">{documentHistory.map(activity => <li key={activity.id}><i/><div><strong>{activity.title}</strong>{activity.content && <p>{activity.content}</p>}<span>{activity.created_by_employee?.full_name ?? 'システム'} · {formatCollectionDate(activity.occurred_at, true)}</span></div></li>)}</ol> : <p className="dc-required-empty-copy"><History size={18}/>この資料に紐づく履歴はまだありません。</p>}</section>}
      </>}
    </InspectorShell>

    <DocumentPreviewViewer target={submissionPreviewTarget ?? previewTarget} onClose={() => { setPreviewOpen(false); setSubmissionPreviewTarget(null) }}/>
  </>
}
