import { CalendarDays, Check, ClipboardList, ClipboardPenLine, FileText, History, Info, Pencil, Play, Plus, RotateCcw, Upload, UserRound, WandSparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { UserAvatar } from '../../components/ui/UserAvatar'
import InspectorShell from '../document-collection/components/InspectorShell'
import EditSideDrawer from '../document-collection/components/EditSideDrawer'
import { useDrawerDismiss } from '../document-collection/components/useDrawerDismiss'
import DocumentPreviewViewer from '../document-collection/components/DocumentPreviewViewer'
import DocumentFileCard from '../document-collection/components/DocumentFileCard'
import { resolveSubmissionPreviewTarget, type DocumentPreviewTarget } from '../document-collection/documentPreview'
import { formatDate, fromLocalDateTime, toLocalDateTime } from '../document-collection/utils'
import { caseWorkspaceApi } from './api'
import { canGenerateTaskDocument, currentPendingTaskSubmission, taskDocumentName, taskHistory } from './taskPresentation'
import TaskStatusBadge from './TaskStatusBadge'
import LegalApprovalNotice from '../document-creation/components/LegalApprovalNotice'
import { canReviewAction, legalApprovalPendingMessage } from '../document-creation/legalApproval'
import { assertTaskUploadFile, taskFileRequiredMessage, taskUploadErrorMessage } from './taskUpload'
import type { CaseActivity, CaseTask, CaseTaskEmployeeOption, CaseTaskSubmission } from './types'

export type TaskActionHandlers = {
  onUpdate: (task: CaseTask, payload: Record<string, unknown>) => Promise<boolean>
  onAccept: (task: CaseTask) => Promise<boolean>
  onSubmit: (task: CaseTask, file: File) => Promise<boolean>
  onGenerate: (task: CaseTask) => void
  onApprove: (task: CaseTask) => Promise<boolean>
  onReject: (task: CaseTask, reason: string) => Promise<boolean>
  onCancel: (task: CaseTask) => Promise<boolean>
}
type EditAction = 'assignee' | 'deadline' | 'edit' | 'approve' | 'reject' | 'cancel'

export default function TaskDetailDrawer({ task, caseId, activities, canManage, canReview, working, error, onClose, onRefresh, ...handlers }: TaskActionHandlers & {
  task: CaseTask; caseId: number; activities: CaseActivity[]; canManage: boolean; canReview: boolean; working: boolean; error?: string | null; onClose: () => void; onRefresh?: () => void
}) {
  const [tab, setTab] = useState<'details' | 'files' | 'history'>('details')
  const [action, setAction] = useState<EditAction | null>(null)
  const [preview, setPreview] = useState<DocumentPreviewTarget | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState('')
  const [uploading, setUploading] = useState(false)
  const uploadInFlight = useRef(false)
  const mounted = useRef(true)
  const picker = useRef<HTMLInputElement>(null)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    const input = picker.current
    const cancelled = () => { if (!selectedFile) setUploadError(taskFileRequiredMessage) }
    input?.addEventListener('cancel', cancelled)
    return () => input?.removeEventListener('cancel', cancelled)
  }, [selectedFile])
  const dismiss = useDrawerDismiss(onClose)
  const code = task.case_document?.document_type?.code ?? `TASK-${task.id}`
  const submissions = [...task.submissions]
  if (task.latest_submission && !submissions.some(file => file.id === task.latest_submission?.id)) submissions.push(task.latest_submission)
  submissions.sort((a, b) => b.version - a.version)
  const latest = task.latest_submission
  const pending = currentPendingTaskSubmission(task)
  const legalPending = task.allowed_actions.legal_approval_pending === true
  const canApprove = canReview && canReviewAction(task.allowed_actions, 'approve') && pending !== null
  const canReject = canReview && canReviewAction(task.allowed_actions, 'reject') && pending !== null
  const canEdit = canManage && (task.allowed_actions.can_reassign || task.allowed_actions.can_change_deadline)
  const canStart = task.status === 'unaccepted' && task.allowed_actions.can_accept
  const openPreview = (file: CaseTaskSubmission) => setPreview(resolveSubmissionPreviewTarget(caseId, task.case_document_id, file, task.case_document?.document_type?.code))
  const description = task.description || (task.case_document?.document_type?.handling_type === 'office_generated' ? '自社作成' : null)
  const history = taskHistory(task, activities)
  const submitFile = async (file: File | null) => {
    if (uploadInFlight.current || working || !task.allowed_actions.can_submit) return
    try { assertTaskUploadFile(file) } catch { setUploadError(taskFileRequiredMessage); return }
    setSelectedFile(file)
    setUploadError('')
    setUploading(true)
    uploadInFlight.current = true
    try {
      const success = await handlers.onSubmit(task, file)
      if (!mounted.current) return
      if (success) setSelectedFile(null)
      else setUploadError('ファイルのアップロードに失敗しました。もう一度お試しください。')
    } catch (requestError) {
      if (mounted.current) setUploadError(taskUploadErrorMessage(requestError))
    } finally {
      uploadInFlight.current = false
      if (mounted.current) setUploading(false)
    }
  }
  const files = (limit?: number) => <section className="cm-task-detail-card is-files">
    <header><h3><FileText size={17} aria-hidden="true"/>ファイル <small>({submissions.length})</small></h3>{task.allowed_actions.can_submit && <Button size="sm" icon={<Plus size={15}/>} variant="primary" disabled={working || uploading} onClick={() => picker.current?.click()}>ファイルを追加</Button>}</header>
    {submissions.length ? <div className="cm-task-file-list">{(limit ? submissions.slice(0, limit) : submissions).map(file => <DocumentFileCard key={file.id} name={file.filename} version={file.version} author={file.submitted_by?.name} uploadedAt={file.submitted_at} reviewStatus={file.review_status} isCurrent={file.id === latest?.id} onOpen={() => openPreview(file)}>
      <Button size="sm" variant="outline" className="cm-task-file-preview" icon={<FileText size={13} aria-hidden="true"/>} onClick={() => openPreview(file)}>プレビュー</Button>
    </DocumentFileCard>)}</div> : <p className="cm-task-empty-file"><FileText size={20} aria-hidden="true"/>まだファイルが提出されていません。</p>}
    {limit && submissions.length > 0 && <button type="button" className="cm-task-all-files" onClick={() => setTab('files')}><History size={14} aria-hidden="true"/>バージョン履歴を見る（{submissions.length}件）<span aria-hidden="true">›</span></button>}
  </section>

  return <>
    <InspectorShell forceOverlay className={`cm-task-detail-drawer ${dismiss.closing ? 'is-closing' : ''}`} backdropClassName={`cm-task-detail-backdrop ${dismiss.closing ? 'is-closing' : ''}`} title={taskDocumentName(task)} code={code} subtitle={description ?? undefined} onClose={() => { if (!working && !uploading) dismiss.close() }}>
      <nav className="cm-task-detail-tabs" aria-label="タスク詳細の表示">
        {([['details', 'タスク詳細'], ['files', 'ファイル'], ['history', '履歴']] as const).map(([value, label]) => <button key={value} type="button" className={tab === value ? 'is-active' : ''} aria-current={tab === value ? 'page' : undefined} onClick={() => setTab(value)}>{label}{value === 'files' && <span>{submissions.length}</span>}</button>)}
      </nav>
      <div className="cm-task-detail-stack">
        {error && <p className="cm-task-feedback is-error" role="alert">{error}</p>}
        {legalPending && <LegalApprovalNotice/>}
        {(selectedFile || uploadError || uploading) && <div className={`cm-task-feedback ${uploadError ? 'is-error' : ''}`} role={uploadError ? 'alert' : 'status'} aria-busy={uploading}>
          {selectedFile && <span>{selectedFile.name}</span>}
          <span>{uploading ? 'アップロード中…' : uploadError}</span>
          {uploadError && task.allowed_actions.can_submit && <>
            {selectedFile && <Button size="sm" disabled={working || uploading} onClick={() => void submitFile(selectedFile)}>再試行</Button>}
            <Button size="sm" variant="outline" disabled={working || uploading} onClick={() => picker.current?.click()}>ファイルを選択</Button>
          </>}
        </div>}
        {tab === 'details' && <>
          <section className="cm-task-detail-card">
            <header><h3><ClipboardList size={17} aria-hidden="true"/>基本情報</h3>{canEdit && <Button size="sm" variant="outline" icon={<Pencil size={14}/>} disabled={working} onClick={() => setAction('edit')}>編集</Button>}</header>
            <dl className="cm-task-info-grid">
              <dt>資料コード</dt><dd>{task.case_document?.document_type?.code ?? '—'}</dd>
              <dt>資料名</dt><dd>{taskDocumentName(task)}</dd>
              <dt>タスク名</dt><dd>{task.title}</dd>
              {task.description && <><dt>説明</dt><dd className="is-description">{task.description}</dd></>}
              <dt>ステータス</dt><dd><TaskStatusBadge status={task.status}/></dd>
              <dt>担当者</dt><dd className="has-action"><span className="cm-task-assignee"><UserAvatar name={task.assigned_employee?.full_name} imageSrc={task.assigned_employee?.avatar_path} stableKey={task.assigned_employee?.id ?? task.id} size="xs" shape="circle"/>{task.assigned_employee?.full_name ?? '未割当'}</span>{canManage && task.allowed_actions.can_reassign && <Button size="sm" variant="outline" disabled={working} onClick={() => setAction('assignee')}>担当者を変更</Button>}</dd>
              <dt>期限</dt><dd className={`has-action ${task.is_overdue ? 'is-overdue' : ''}`}><span>{formatDate(task.due_at)}{task.is_overdue && <small>期限超過</small>}</span>{canManage && task.allowed_actions.can_change_deadline && <Button size="sm" variant="outline" disabled={working} icon={<CalendarDays size={13}/>} onClick={() => setAction('deadline')}>期限を変更</Button>}</dd>
              <dt>作成日時</dt><dd>{formatDate(task.created_at ?? null, true)}</dd>
              <dt>最終更新</dt><dd>{formatDate(task.updated_at ?? null, true)}</dd>
            </dl>
          </section>
          {files(2)}
          <section className="cm-task-detail-card is-actions">
            <div className={`cm-task-handling-head ${canStart ? 'can-start' : ''}`}>
              <span className="cm-task-handling-icon"><ClipboardPenLine size={23} aria-hidden="true"/></span>
              <div><h3>対応</h3>{canStart && <p>この資料の対応を開始し、担当者として処理を行います。</p>}</div>
              {canStart && <Button variant="primary" className="cm-task-start-button" icon={<Play size={16} aria-hidden="true"/>} loading={working} aria-busy={working} aria-describedby={`task-start-help-${task.id}`} onClick={() => void handlers.onAccept(task)}>対応を開始</Button>}
            </div>
            {canStart ? <p className="cm-task-start-help" id={`task-start-help-${task.id}`}><Info size={16} aria-hidden="true"/><span>対応を開始すると、ステータスが「対応中」に変更され、開始日時が履歴に記録されます。</span></p> : <div className="cm-task-handling-state" aria-live="polite">
              <TaskStatusBadge status={task.status}/>
              <dl>{task.accepted_at && <><dt>対応開始日時</dt><dd>{formatDate(task.accepted_at, true)}</dd></>}<dt>担当者</dt><dd>{task.assigned_employee?.full_name ?? '未割当'}</dd></dl>
            </div>}
            {task.status === 'changes_requested' && <div className="cm-task-feedback is-error"><strong>差し戻し理由</strong><p>{latest?.review_note ?? '理由は記録されていません。'}</p></div>}
            {task.status === 'pending_review' && !pending && <div className="cm-task-feedback is-error" role="alert">確認対象の提出ファイルを取得できませんでした。再読み込みしてください。{onRefresh && <Button size="sm" onClick={onRefresh}>再試行</Button>}</div>}
            {pending && !legalPending && !canApprove && !canReject && <p className="cm-task-work-message">提出したファイルは管理者の確認待ちです。</p>}
            {task.status === 'completed' && <p className="cm-task-work-message is-success"><Check size={16}/>完了</p>}
            {task.status === 'cancelled' && <p className="cm-task-work-message">キャンセル</p>}
            <div className="cm-task-action-grid">
              {latest && <Button icon={<FileText size={16}/>} disabled={working} onClick={() => openPreview(latest)}>ファイルを確認</Button>}
              {canEdit && <Button icon={<UserRound size={16}/>} disabled={working} onClick={() => setAction('edit')}>担当・期限を変更</Button>}
              {task.allowed_actions.can_submit && <Button variant="primary" icon={<Upload size={16}/>} loading={uploading} disabled={working || uploading} onClick={() => picker.current?.click()}>{uploading ? 'アップロード中…' : 'ファイルをアップロード'}</Button>}
              {canGenerateTaskDocument(task) && <Button icon={<WandSparkles size={16}/>} disabled={working} onClick={() => handlers.onGenerate(task)}>自動作成</Button>}
              {canApprove && <Button variant="primary" icon={<Check size={16}/>} disabled={working} onClick={() => setAction('approve')}>承認する</Button>}
              {canReject && <Button variant="outline" className="cm-task-reject-button" icon={<RotateCcw size={16}/>} disabled={working} onClick={() => setAction('reject')}>差し戻す</Button>}
              {canManage && task.allowed_actions.can_cancel && <Button variant="ghost" className="cm-task-cancel-button" disabled={working} onClick={() => setAction('cancel')}>タスクをキャンセル</Button>}
            </div>
          </section>
        </>}
        {tab === 'files' && files()}
        {tab === 'history' && <section className="cm-task-detail-card"><header><h3><History size={17} aria-hidden="true"/>履歴</h3></header>{history.length ? <ol className="cm-task-history">{history.map(item => <li key={item.id}><strong>{item.title}</strong>{item.content && <p>{item.content}</p>}<span>{item.created_by_employee?.full_name ?? 'システム'} · {formatDate(item.occurred_at, true)}</span></li>)}</ol> : <p className="cm-task-empty-file">このタスクの履歴はまだありません。</p>}</section>}
      </div>
      <input ref={picker} type="file" className="sr-only" aria-label="提出するファイル" disabled={working || uploading || !task.allowed_actions.can_submit} onChange={event => { const file = event.target.files?.[0] ?? null; event.currentTarget.value = ''; void submitFile(file) }}/>
    </InspectorShell>
    {action && <TaskActionDrawer key={`${task.id}:${action}`} action={action} task={task} caseId={caseId} working={working} canManage={canManage} canReview={canReview} handlers={handlers} onClose={() => setAction(null)}/>}
    <DocumentPreviewViewer target={preview} onClose={() => setPreview(null)}/>
  </>
}

function TaskActionDrawer({ action, task, caseId, working, canManage, canReview, handlers, onClose }: {
  action: EditAction; task: CaseTask; caseId: number; working: boolean; canManage: boolean; canReview: boolean; handlers: TaskActionHandlers; onClose: () => void
}) {
  const [employees, setEmployees] = useState<CaseTaskEmployeeOption[]>([])
  const [employeeId, setEmployeeId] = useState(String(task.assigned_employee?.id ?? ''))
  const [deadline, setDeadline] = useState(toLocalDateTime(task.due_at))
  const [reason, setReason] = useState('')
  const [reviewSubmissionId] = useState(task.latest_submission?.id)
  const [error, setError] = useState('')
  const [optionsLoading, setOptionsLoading] = useState(action === 'assignee' || action === 'edit')
  const [revision, setRevision] = useState(0)
  const editAssignee = (action === 'assignee' || action === 'edit') && canManage && task.allowed_actions.can_reassign
  const editDeadline = (action === 'deadline' || action === 'edit') && canManage && task.allowed_actions.can_change_deadline
  const titles = { assignee: '担当者を変更', deadline: '期限を変更', edit: '担当・期限を変更', approve: '提出物を承認', reject: '提出物を差し戻す', cancel: 'タスクをキャンセル' }
  useEffect(() => {
    if (!editAssignee) return
    const controller = new AbortController()
    void caseWorkspaceApi.taskOptions(caseId, controller.signal).then(response => { if (!controller.signal.aborted) setEmployees(response.employees) })
      .catch(() => { if (!controller.signal.aborted) setError('担当者候補を取得できませんでした。') })
      .finally(() => { if (!controller.signal.aborted) setOptionsLoading(false) })
    return () => controller.abort()
  }, [caseId, editAssignee, revision])
  const save = async () => {
    setError('')
    if ((action === 'approve' || action === 'reject') && (!currentPendingTaskSubmission(task) || task.latest_submission?.id !== reviewSubmissionId)) {
      setError('提出物が更新されました。最新のファイルを確認してから、もう一度操作してください。')
      return false
    }
    if ((action === 'approve' || action === 'reject') && task.allowed_actions.legal_approval_pending) {
      setError(legalApprovalPendingMessage)
      return false
    }
    let ok = false
    if (action === 'reject' && canReview && task.allowed_actions.can_reject && reason.trim()) ok = await handlers.onReject(task, reason.trim())
    else if (action === 'approve' && canReview && task.allowed_actions.can_approve) ok = await handlers.onApprove(task)
    else if (action === 'cancel' && canManage && task.allowed_actions.can_cancel) ok = await handlers.onCancel(task)
    else if (editAssignee || editDeadline) {
      const payload: Record<string, unknown> = {}
      if (editAssignee && employeeId !== String(task.assigned_employee?.id ?? '')) payload.assigned_employee_id = Number(employeeId)
      if (editDeadline && deadline !== toLocalDateTime(task.due_at)) payload.due_at = fromLocalDateTime(deadline)
      if (!Object.keys(payload).length) return true
      ok = await handlers.onUpdate(task, payload)
    }
    if (!ok) setError('保存できませんでした。入力内容と現在の権限を確認して再試行してください。')
    return ok
  }
  return <EditSideDrawer title={titles[action]} subtitle={task.title} className="cm-task-action-drawer" backdropClassName="cm-task-action-backdrop" onClose={onClose} onSave={save} submitLabel={action === 'reject' ? '差し戻す' : action === 'approve' ? '承認する' : action === 'cancel' ? 'キャンセルする' : '変更を保存'} disabled={working || (editAssignee && (optionsLoading || !employeeId)) || (action === 'reject' && !reason.trim())}>
    {editAssignee && <section className="cm-incident-group"><label>担当者<select value={employeeId} onChange={event => setEmployeeId(event.target.value)} disabled={optionsLoading}><option value="">担当者を選択</option>{task.assigned_employee && !employees.some(employee => employee.id === task.assigned_employee?.id) && <option value={task.assigned_employee.id}>{task.assigned_employee.full_name}（現在の担当者）</option>}{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</select></label>{optionsLoading && <p role="status">担当者候補を読み込み中…</p>}{error && <Button size="sm" onClick={() => { setOptionsLoading(true); setError(''); setRevision(value => value + 1) }}>再試行</Button>}</section>}
    {editDeadline && <section className="cm-incident-group"><label>期限<input type="datetime-local" value={deadline} onChange={event => setDeadline(event.target.value)}/></label><p className="cm-task-edit-help">空欄で保存すると期限を解除します。</p></section>}
    {action === 'reject' && <section className="cm-incident-group"><label>差し戻し理由 <span aria-hidden="true">*</span><textarea required rows={5} maxLength={5000} value={reason} onChange={event => setReason(event.target.value)} placeholder="修正が必要な内容を入力してください。"/></label></section>}
    {action === 'approve' && <section className="cm-incident-group"><p>v{task.latest_submission?.version} の提出物を承認して、このタスクを完了します。</p></section>}
    {action === 'cancel' && <section className="cm-incident-group"><p>「{task.title}」をキャンセルしますか？提出済みのファイルと履歴は保持されます。</p></section>}
    {error && <p className="cm-task-feedback is-error" role="alert">{error}</p>}
  </EditSideDrawer>
}
