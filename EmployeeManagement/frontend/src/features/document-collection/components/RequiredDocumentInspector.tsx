import {
  ChevronRight,
  FileText,
  History,
  RotateCcw,
  WandSparkles,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import LegalApprovalNotice from '../../document-creation/components/LegalApprovalNotice'
import { SectionSkeleton } from '../../../components/loading'
import type { CaseActivity, CaseTask } from '../../case-workspace/types'
import C001DocumentReviewDrawer from '../../document-creation/components/C001DocumentReviewDrawer'
import { documentCollectionApi } from '../api'
import { mergePreviewVersions, type DocumentPreviewTarget, type PreviewDocumentVersion } from '../documentPreview'
import { collectionError } from '../errors'
import type { CollectionDetail } from '../types'
import { formatDate } from '../utils'
import CollectionFeedback from './CollectionFeedback'
import DocumentPreviewViewer from './DocumentPreviewViewer'
import VersionList from './DocumentVersionList'
import InspectorShell from './InspectorShell'
import ReceivedDocumentRegistration from './ReceivedDocumentRegistration'
import ReceivedDocumentsList from './ReceivedDocumentsList'
import RequiredDocumentActionDrawer, { type RequiredDocumentAction } from './RequiredDocumentActionDrawer'
import RequiredDocumentBasicInfo from './RequiredDocumentBasicInfo'
import RequiredDocumentRelatedTask from './RequiredDocumentRelatedTask'
import { useDrawerDismiss } from './useDrawerDismiss'
import AutoGenerateButton from './AutoGenerateButton'
import FileReviewActions from './FileReviewActions'
import RequiredWorkflowBadge from './RequiredWorkflowBadge'
import DocumentFilesHeader from './DocumentFilesHeader'
import { requiredWorkflowPresentation, type RequiredWorkflowPresentation } from '../requiredWorkflowPresentation'

type InspectorTab = 'overview' | 'files' | 'history'

export default function RequiredDocumentInspector({ caseId, itemId, refreshKey, canUpdate: pageCanUpdate, canDecideNecessity, canManageTasks: pageCanManageTasks, activities, tasks, onHistory, onClose, onSaved, onReviewed, onOpenTask: openTask }: {
  caseId: number; itemId: number; canUpdate: boolean; canDecideNecessity: boolean; canManageTasks: boolean; canReviewDocuments: boolean; activities: CaseActivity[]
  onCandidates: () => void; onHistory: () => void; onClose: () => void; onSaved: () => void; onCreateTask: () => void; onManageTask: () => void
  onReviewed?: () => Promise<void>
  refreshKey?: string
  tasks?: CaseTask[]
  onOpenTask?: (taskId: number) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<CollectionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ReturnType<typeof collectionError> | null>(null)
  const [notice, setNotice] = useState('')
  const [action, setAction] = useState<RequiredDocumentAction | null>(null)
  const [revision, setRevision] = useState(0)
  const [tab, setTab] = useState<InspectorTab>('overview')
  const [previewTarget, setPreviewTarget] = useState<DocumentPreviewTarget | null>(null)
  const dismiss = useDrawerDismiss(onClose)
  const canUpdate = pageCanUpdate && detail?.capabilities?.can_edit === true
  const canManageTasks = pageCanManageTasks && detail?.capabilities?.can_change_assignee === true

  useEffect(() => {
    const controller = new AbortController()
    void documentCollectionApi.detail(caseId, itemId, controller.signal).then(value => {
      if (!controller.signal.aborted) { setDetail(value); setLoading(false) }
    }).catch(requestError => { if (!controller.signal.aborted) { setError(collectionError(requestError)); setLoading(false) } })
    return () => controller.abort()
  }, [caseId, itemId, revision, refreshKey])

  const changeNecessity = canUpdate && canDecideNecessity ? () => setAction('necessity') : undefined
  const onCandidates = () => setAction('acquisition')
  const onCreateTask = () => { if (canManageTasks) setAction('task') }
  const onManageTask = onCreateTask
  const linkedTask = tasks?.find(task => task.id === detail?.active_task?.id && task.case_document_id === itemId)
  const onOpenTask = linkedTask && openTask ? () => openTask(linkedTask.id) : undefined
  const secondary = action && detail && (action !== 'necessity' || changeNecessity) && <RequiredDocumentActionDrawer key={action} action={action} detail={detail} caseId={caseId} canUpdate={action === 'task' ? canManageTasks : canUpdate} onClose={() => setAction(null)} onSaved={(updated, message) => { setDetail(updated); setNotice(message); onSaved() }}/>
  const fileReviewed = async (updated: CollectionDetail) => {
    setDetail(updated)
    setNotice(updated.file_review?.status === 'approved' ? '資料を確認済みに変更しました。' : '資料を差し戻しました。')
    if (onReviewed) await onReviewed()
    else onSaved()
  }

  if (detail?.c001 && !detail.file_review && ['pending_approval', 'complete', 'rejected'].includes(detail.c001.status)) {
    return <><C001DocumentReviewDrawer caseId={caseId} documentId={itemId} canUpdate={canUpdate} detail={detail} linkedTask={linkedTask} activities={activities} onCandidates={onCandidates} onChangeNecessity={changeNecessity} onCreateTask={canManageTasks ? onCreateTask : undefined} onManageTask={canManageTasks ? onManageTask : undefined} onOpenTask={onOpenTask} onClose={onClose} notice={notice} onChanged={updated => { if (updated) setDetail(updated); else setRevision(value => value + 1); onSaved() }}/>{secondary}</>
  }

  const status = requiredWorkflowPresentation(detail?.workflow_state.code ?? 'selected')
  const taskSubmissions = tasks?.filter(task => task.case_document_id === itemId).flatMap(task => task.submissions) ?? []
  const submissions = (detail?.task_submissions ?? (detail?.latest_task_submission ? [...taskSubmissions, detail.latest_task_submission] : taskSubmissions)).filter(file => !file.received_document_id)
  const fileVersions = mergePreviewVersions(detail?.generated_versions.filter(version => version.artifacts.length > 0) ?? [], submissions)
  const documentHistory = activities.filter(activity => activity.metadata?.document_id === itemId || activity.metadata?.case_document_id === itemId)
  const subtitle = detail ? [acquisitionLabel(detail), detail.collection.source, detail.collection.target_person].filter(Boolean).join(' / ') : undefined

  return <><InspectorShell
    forceOverlay
    breakpoint={1024}
    className={`dc-required-inspector ${dismiss.closing ? 'is-closing' : ''}`}
    backdropClassName={`dc-required-backdrop ${dismiss.closing ? 'is-closing' : ''}`}
    title={detail?.document_type?.name_ja ?? detail?.title ?? '必要資料'}
    code={detail?.document_type?.code ?? '—'}
    subtitle={subtitle}
    headerAside={<RequiredWorkflowBadge status={status.key}/>}
    onClose={dismiss.close}
    footer={<div><span className="dc-meta">{notice || (canUpdate || detail?.capabilities?.can_upload || detail?.capabilities?.can_review ? '許可された操作のみ保存できます。' : '閲覧のみ')}</span><button type="button" className="dc-button" onClick={dismiss.close}>閉じる</button></div>}
  >
    {loading && <SectionSkeleton className="border-0" label="必要資料の詳細を読み込み中…" rows={5} showHeader={false} />}
    {error && <CollectionFeedback error={error} onRetry={() => { setLoading(true); setError(null); setRevision(value => value + 1) }}/>}
    {!loading && detail && <>
      <nav className="dc-required-drawer-tabs" aria-label="必要資料の詳細表示">
        {([['overview', '概要'], ['files', 'ファイル'], ['history', '履歴']] as const).map(([value, label]) => <button key={value} type="button" className={tab === value ? 'is-active' : ''} aria-current={tab === value ? 'page' : undefined} onClick={() => setTab(value)}>{label}{value === 'files' && <span>{fileVersions.length + detail.received_documents.length}</span>}</button>)}
      </nav>
      {notice && <p className="dc-feedback dc-success" role="status">{notice}</p>}
      {detail?.capabilities?.legal_approval_pending && <LegalApprovalNotice/>}

      {tab === 'overview' && <OverviewTab
        detail={detail} status={status} fileVersions={fileVersions} canUpdate={canUpdate} canManageTasks={canManageTasks} caseId={caseId} itemId={itemId}
        linkedTask={linkedTask}
        onOpenTask={onOpenTask}
        onEditAcquisition={canUpdate ? onCandidates : undefined}
        onChangeCollection={() => setAction('collection')}
        onChangeFulfillment={() => setAction('fulfillment')}
        onChangeNecessity={changeNecessity}
        onRegistered={updated => { setDetail(updated); setNotice(updated.file_review?.status === 'approved' ? '資料を確認済みに変更しました。' : updated.file_review?.status === 'rejected' ? '資料を差し戻しました。' : t('documentCollection.receivedDocuments.registered')); onSaved() }}
        onReviewed={fileReviewed}
        onPreview={setPreviewTarget}
        onShowAllFiles={() => setTab('files')} onCreateTask={onCreateTask} onManageTask={onManageTask}
        onAutoGenerate={() => navigate(`/quests/${caseId}/documents/${itemId}/edit`)}
      />}

      {tab === 'files' && <FilesTab
        detail={detail}
        versions={fileVersions}
        caseId={caseId}
        itemId={itemId}
        canUpdate={canUpdate}
        onAutoGenerate={() => navigate(`/quests/${caseId}/documents/${itemId}/edit`)}
        onPreview={setPreviewTarget}
        onRegistered={updated => { setDetail(updated); setNotice(updated.file_review?.status === 'approved' ? '資料を確認済みに変更しました。' : updated.file_review?.status === 'rejected' ? '資料を差し戻しました。' : t('documentCollection.receivedDocuments.registered')); onSaved() }}
        onReviewed={fileReviewed}
      />}

      {tab === 'history' && <HistoryTab activities={documentHistory} onHistory={onHistory}/>}
    </>}
  </InspectorShell>{secondary}<DocumentPreviewViewer target={previewTarget} onClose={() => setPreviewTarget(null)}/></>
}

function OverviewTab({ detail, status, fileVersions, canUpdate, canManageTasks, caseId, itemId, linkedTask, onEditAcquisition, onChangeCollection, onChangeFulfillment, onChangeNecessity, onRegistered, onReviewed, onPreview, onShowAllFiles, onCreateTask, onManageTask, onAutoGenerate, onOpenTask }: {
  detail: CollectionDetail; status: RequiredWorkflowPresentation; fileVersions: PreviewDocumentVersion[]; canUpdate: boolean; canManageTasks: boolean
  caseId: number; itemId: number; onEditAcquisition?: () => void; onChangeCollection: () => void; onChangeFulfillment: () => void; onChangeNecessity?: () => void; onRegistered: (detail: CollectionDetail) => void; onPreview: (target: DocumentPreviewTarget) => void; onShowAllFiles: () => void; onCreateTask: () => void; onManageTask: () => void; onAutoGenerate: () => void
  linkedTask?: CaseTask
  onOpenTask?: () => void
  onReviewed: (detail: CollectionDetail) => Promise<void>
}) {
  const latestVersions = fileVersions.slice(0, 2)
  const hasFiles = latestVersions.length > 0 || detail.received_documents.length > 0
  const creator = latestVersions[0]?.artifacts[0]?.uploaded_by ?? latestVersions[0]?.created_by
  return <div className="dc-required-drawer-stack">
    <RequiredDocumentBasicInfo detail={detail} title={detail.document_type?.name_ja ?? detail.title} code={detail.document_type?.code ?? '—'} method={acquisitionLabel(detail)} status={status} creator={creator} assigneeImage={linkedTask?.assigned_employee?.id === detail.active_task?.assigned_employee?.id ? linkedTask?.assigned_employee?.avatar_path : undefined} onChangeNecessity={canUpdate ? onChangeNecessity : undefined} onEditTask={canManageTasks ? (detail.active_task ? onManageTask : onCreateTask) : undefined} onEditAcquisition={onEditAcquisition} onChangeCollection={canUpdate && !detail.latest_task_submission && !detail.file_review ? onChangeCollection : undefined} onChangeFulfillment={canUpdate && !detail.latest_task_submission && !detail.file_review ? onChangeFulfillment : undefined}/>

    <section className="dc-required-drawer-card is-files dc-compact-files">
      <DocumentFilesHeader count={fileVersions.length + detail.received_documents.length}>{detail?.capabilities?.can_upload && <ReceivedDocumentRegistration caseId={caseId} itemId={itemId} canUpdate={detail?.capabilities?.can_upload === true} documentName={detail.document_type?.name_ja ?? detail.title} triggerLabel="アップロード" triggerClassName="dc-primary" onRegistered={onRegistered}/>}</DocumentFilesHeader>
      {latestVersions.length > 0 ? <VersionList compact caseId={caseId} documentId={itemId} versions={latestVersions} onPreview={onPreview}/> : detail.received_documents.length > 0 ? <ReceivedDocumentsList compact caseId={caseId} itemId={itemId} files={detail.received_documents.slice(0, 2)} hideTitle/> : <div className="dc-required-file-empty"><FileText size={22}/><div><strong>まだファイルが作成されていません。</strong><p>{detail.document_type?.creation_supported ? 'この資料は自社作成に対応しています。' : '基本情報の取得方法を確認して、資料の登録を進めてください。'}</p></div></div>}
      {latestVersions.length > 0 && detail.received_documents.length > 0 && <ReceivedDocumentsList compact caseId={caseId} itemId={itemId} files={detail.received_documents.slice(0, 2)} hideTitle/>}
      <FileReviewActions compact caseId={caseId} detail={detail} onChanged={onReviewed}/>
      <GenerationActions detail={detail} canUpdate={canUpdate} hasFiles={hasFiles} onAutoGenerate={onAutoGenerate}/>
      {(fileVersions.length + detail.received_documents.length) > 0 && <button type="button" className="dc-required-show-all dc-compact-file-history" onClick={onShowAllFiles}><History size={16} aria-hidden="true"/>バージョン履歴を見る ({fileVersions.length + detail.received_documents.length}件)<ChevronRight size={15} aria-hidden="true"/></button>}
    </section>

    <RequiredDocumentRelatedTask task={detail.active_task} taskDetails={linkedTask} onOpen={onOpenTask}/>
  </div>
}

function FilesTab({ detail, versions, caseId, itemId, canUpdate, onAutoGenerate, onPreview, onRegistered, onReviewed }: { detail: CollectionDetail; versions: PreviewDocumentVersion[]; caseId: number; itemId: number; canUpdate: boolean; onAutoGenerate: () => void; onPreview: (target: DocumentPreviewTarget) => void; onRegistered: (detail: CollectionDetail) => void; onReviewed: (detail: CollectionDetail) => Promise<void> }) {
  const hasFiles = versions.length > 0 || detail.received_documents.length > 0
  return <div className="dc-required-drawer-stack"><section className="dc-required-drawer-card is-files dc-compact-files">
    <DocumentFilesHeader count={versions.length + detail.received_documents.length}>{detail?.capabilities?.can_upload && <ReceivedDocumentRegistration caseId={caseId} itemId={itemId} canUpdate={detail?.capabilities?.can_upload === true} documentName={detail.document_type?.name_ja ?? detail.title} triggerLabel="アップロード" triggerClassName="dc-primary" onRegistered={onRegistered}/>}</DocumentFilesHeader>
    {versions.length > 0 && <VersionList compact caseId={caseId} documentId={itemId} versions={versions} onPreview={onPreview}/>}
    {detail.received_documents.length > 0 && <ReceivedDocumentsList compact caseId={caseId} itemId={itemId} files={detail.received_documents} hideTitle/>}
    {!hasFiles && <div className="dc-required-file-empty"><FileText size={22}/><div><strong>まだファイルが作成されていません。</strong><p>{detail.document_type?.creation_supported ? 'この資料は自社作成に対応しています。' : '基本情報の取得方法を確認して、資料の登録を進めてください。'}</p></div></div>}
    <FileReviewActions compact caseId={caseId} detail={detail} onChanged={onReviewed}/>
    <GenerationActions detail={detail} canUpdate={canUpdate} hasFiles={hasFiles} onAutoGenerate={onAutoGenerate}/>
  </section></div>
}

function GenerationActions({ detail, canUpdate, hasFiles, onAutoGenerate }: { detail: CollectionDetail; canUpdate: boolean; hasFiles: boolean; onAutoGenerate: () => void }) {
  if (!canUpdate || !detail.document_type?.creation_supported) return null
  return <div className="dc-required-overview-actions">
    {detail.c001?.status === 'draft' ? <button type="button" className="dc-button dc-primary dc-auto-generate" onClick={onAutoGenerate}><WandSparkles size={16}/>編集を再開</button> : <AutoGenerateButton onClick={onAutoGenerate}/>}
    <button type="button" className="dc-button" disabled={!hasFiles} onClick={onAutoGenerate}><RotateCcw size={16}/>再作成</button>
  </div>
}

function HistoryTab({ activities, onHistory }: { activities: CaseActivity[]; onHistory: () => void }) {
  return <section className="dc-required-drawer-card"><header><div className="dc-required-section-title"><span><History size={17}/></span><h3>履歴</h3></div><button type="button" className="dc-required-outline-action" onClick={onHistory}>案件履歴を開く</button></header>{activities.length > 0 ? <ol className="dc-required-history">{activities.map(activity => <li key={activity.id}><i/><div><strong>{activity.title}</strong>{activity.content && <p>{activity.content}</p>}<span>{activity.created_by_employee?.full_name ?? 'システム'} · {formatDate(activity.occurred_at, true)}</span></div></li>)}</ol> : <p className="dc-required-empty-copy"><History size={18}/>この資料に紐づく履歴はまだありません。</p>}</section>
}

function acquisitionLabel(detail: CollectionDetail) {
  if (detail.document_type?.handling_type === 'office_generated' && detail.document_type.creation_supported) return '自社作成'
  if (detail.document_type?.handling_type === 'official_form') return '外部機関から取得'
  if (detail.document_type?.handling_type === 'reference_only') return '参照資料'
  if (detail.collection.source || detail.collection.method) return [detail.collection.source, detail.collection.method].filter(Boolean).join(' / ')
  if (detail.document_type?.handling_type === 'collected') return '依頼者から回収'
  return '取得方法未設定'
}
