import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  FileStack,
  FileText,
  Folder,
  Grid2X2,
  List,
  Search,
  UserRound,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { SectionSkeleton } from '../../../components/loading'
import { IconButton } from '../../../components/ui/IconButton'
import { UserAvatar } from '../../../components/ui/UserAvatar'
import type { CaseActivity, CaseTask } from '../../case-workspace/types'
import { useWorkflowCaseDocuments } from '../hooks/useWorkflowCaseDocuments'
import type { CollectionItem } from '../types'
import { formatDate, isRequiredDocument, itemToRow } from '../utils'
import CollectionFeedback from './CollectionFeedback'
import RequiredDocumentInspector from './RequiredDocumentInspector'
import RequiredWorkflowBadge from './RequiredWorkflowBadge'
import { requiredWorkflowPresentation, type RequiredWorkflowPresentation } from '../requiredWorkflowPresentation'
import { REQUIRED_DOCUMENT_PAGE_SIZES, requiredDocumentPage, requiredDocumentRange } from '../requiredDocumentPagination'
import { fileReviewRefreshWarning } from '../fileReview'

type WorkFilter = 'all' | 'selected' | 'unaccepted' | 'in_progress' | 'pending_review' | 'changes_requested' | 'completed' | 'overdue' | 'mine'
type ViewMode = 'list' | 'card'
type WorkState = RequiredWorkflowPresentation<CollectionItem['workflow_state']['code']>

type Props = {
  caseId: number
  initialSelectedId?: number
  onDocumentClose?: () => void
  canUpdate: boolean
  canManageTasks: boolean
  canReviewDocuments: boolean
  currentEmployeeId?: number
  activities: CaseActivity[]
  tasks?: CaseTask[]
  onCandidates: () => void
  onHistory: () => void
  onChanged: () => void | Promise<boolean>
  onCreateTasks: (documentIds: number[]) => void
  onManageTasks: () => void
  onOpenTask?: (taskId: number) => void
}

export default function RequiredDocumentsPanel({
  caseId,
  initialSelectedId,
  onDocumentClose,
  canUpdate,
  canManageTasks,
  canReviewDocuments,
  currentEmployeeId,
  activities,
  tasks,
  onCandidates,
  onHistory,
  onChanged,
  onCreateTasks,
  onManageTasks,
  onOpenTask,
}: Props) {
  const collection = useWorkflowCaseDocuments(caseId, true)
  const [selectedId, setSelectedId] = useState<number | null>(initialSelectedId ?? null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<WorkFilter>('all')
  const [methodFilter, setMethodFilter] = useState('all')
  const [view, setView] = useState<ViewMode>(() => window.localStorage.getItem('themis:required-documents:view') === 'card' ? 'card' : 'list')
  const [referenceTime] = useState(Date.now)
  const [pageNumber, setPageNumber] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const required = useMemo(() => collection.items.filter(isRequiredDocument), [collection.items])
  const acquisitionOptions = useMemo(
    () => [...new Set(required.map(acquisitionLabel))].sort((a, b) => a.localeCompare(b, 'ja')),
    [required],
  )
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    return required.filter(item => {
      const state = deriveWorkState(item)
      const overdue = item.active_task?.is_overdue ?? false
      if (term && !`${item.title} ${item.document_type?.code ?? ''} ${item.document_type?.name_ja ?? ''} ${acquisitionLabel(item)}`.toLocaleLowerCase().includes(term)) return false
      if (methodFilter !== 'all' && acquisitionLabel(item) !== methodFilter) return false
      if (filter === 'mine' && item.active_task?.assigned_employee?.id !== currentEmployeeId) return false
      if (filter === 'overdue' && !overdue) return false
      if (filter !== 'all' && filter !== 'mine' && filter !== 'overdue' && state.key !== filter) return false
      return true
    })
  }, [currentEmployeeId, filter, methodFilter, query, required])
  const page = requiredDocumentPage(filtered, pageNumber, pageSize)
  const resultRange = view === 'list' ? page.range : requiredDocumentRange(filtered.length, filtered.length ? 1 : 0, filtered.length)
  const resultsReady = !collection.loading && !collection.error

  const counts = useMemo(() => required.reduce((result, item) => {
    const state = deriveWorkState(item)
    result[state.key] += 1
    if (item.active_task?.is_overdue) result.overdue += 1
    return result
  }, { selected: 0, unaccepted: 0, in_progress: 0, pending_review: 0, changes_requested: 0, completed: 0, overdue: 0 }), [required])

  const refresh = async () => {
    const [listLoaded, workspaceLoaded] = await Promise.all([collection.refresh(), onChanged()])
    return listLoaded && workspaceLoaded !== false
  }
  const refreshAfterReview = async () => {
    if (!await refresh()) throw new Error(fileReviewRefreshWarning)
  }
  const openDocument = (id: number) => {
    setSelectedId(id)
    // The inspector makes a fresh detail request; refresh its background list too.
    void collection.refresh()
  }
  const closeDocument = () => {
    setSelectedId(null)
    onDocumentClose?.()
  }
  const selectedItem = required.find(item => item.id === selectedId)
  const changeView = (next: ViewMode) => { setView(next); window.localStorage.setItem('themis:required-documents:view', next) }
  const filters: Array<{ value: WorkFilter; label: string; count?: number }> = [
    { value: 'all', label: 'すべて', count: required.length },
    ...(['selected', 'unaccepted', 'in_progress', 'pending_review', 'changes_requested', 'completed'] as const).map(value => ({ value, label: requiredWorkflowPresentation(value).label, count: counts[value] })),
    { value: 'overdue', label: '期限超過', count: counts.overdue },
  ]

  return <div className="dc-preview dc-production dc-required" aria-label="必要資料ワークスペース">
    <header className="dc-required-page-head">
      <span className="dc-required-heading-icon" aria-hidden="true"><Folder size={20}/></span>
      <div><h2>必要資料</h2><p>この案件で「必要」と判断された資料を管理します。</p></div>
      {!canUpdate && <span className="dc-meta">閲覧のみ</span>}
    </header>

    <div className="dc-required-metrics" aria-label="必要資料サマリー">
      <SummaryCard icon={<FileStack size={16}/>} label="必要資料" value={required.length} tone="indigo" />
      <SummaryCard icon={<CircleDashed size={16}/>} label="未受領" value={counts.unaccepted} tone="slate" />
      <SummaryCard icon={<CalendarClock size={16}/>} label="対応・確認中" value={counts.in_progress + counts.pending_review + counts.changes_requested} tone="blue" />
      <SummaryCard icon={<CheckCircle2 size={16}/>} label="完了" value={counts.completed} tone="emerald" />
      <SummaryCard icon={<AlertTriangle size={16}/>} label="期限超過" value={counts.overdue} tone="rose" />
    </div>

    <div className="dc-required-controls">
      <label className="dc-workflow-search"><Search className="dc-search-icon" size={16} aria-hidden="true"/><input aria-label="必要資料を検索" value={query} onChange={event => { setQuery(event.target.value); setPageNumber(1) }} placeholder="資料名・コードで検索..."/></label>
      <label className="dc-required-method-filter"><span>取得方法</span><select value={methodFilter} onChange={event => { setMethodFilter(event.target.value); setPageNumber(1) }}><option value="all">すべて</option>{acquisitionOptions.map(method => <option key={method} value={method}>{method}</option>)}</select></label>
      <div className="dc-view-switch" aria-label="表示形式"><button type="button" className={view === 'list' ? 'is-active' : ''} aria-pressed={view === 'list'} onClick={() => changeView('list')}><List size={15}/>リスト</button><button type="button" className={view === 'card' ? 'is-active' : ''} aria-pressed={view === 'card'} onClick={() => changeView('card')}><Grid2X2 size={14}/>カード</button></div>
    </div>

    <div className="dc-required-filters" aria-label="作業状態で絞り込み">
      {filters.map(item => <button key={item.value} type="button" className={filter === item.value ? 'is-active' : ''} aria-pressed={filter === item.value} onClick={() => { setFilter(item.value); setPageNumber(1) }}>{item.label}<span>{item.count}</span></button>)}
      {currentEmployeeId && <button type="button" className={filter === 'mine' ? 'is-active' : ''} aria-pressed={filter === 'mine'} onClick={() => { setFilter('mine'); setPageNumber(1) }}><UserRound size={13}/>自分の担当</button>}
    </div>

    {resultsReady && <div className="dc-required-result-toolbar">
      <div><FileStack size={15} aria-hidden="true"/><strong>資料一覧</strong><span className="dc-required-result-count">{filtered.length}件</span></div>
      <span role="status" aria-live="polite" aria-atomic="true">{resultRange}</span>
    </div>}
    {collection.error ? <CollectionFeedback error={collection.error} onRetry={collection.retry}/>
      : collection.loading ? <SectionSkeleton className="border-0" label="必要資料を読み込み中…" rows={5} showHeader={false}/>
        : filtered.length ? view === 'list'
          ? <RequiredList items={page.rows} selectedId={selectedId} referenceTime={referenceTime} onOpen={openDocument}/>
          : <RequiredCards items={filtered} selectedId={selectedId} referenceTime={referenceTime} onOpen={openDocument}/>
          : required.length ? <div className="dc-empty-results"><Search size={22}/><h3>該当する必要資料がありません</h3><p>検索または絞り込み条件を変更してください。</p></div>
            : <div className="dc-required-empty"><p><strong>必要資料はまだありません。</strong><span>資料収集で「必要」と判断された資料がここに表示されます。</span></p><button type="button" className="dc-button dc-primary" onClick={onCandidates}>資料収集を開く</button></div>}

    {resultsReady && view === 'list' && <footer className="dc-required-pagination">
      <span>{page.range}</span>
      <nav aria-label="必要資料一覧のページ切替">
        <IconButton type="button" variant="secondary" size="md" aria-label="前のページ" disabled={page.page === 1 || !page.total} onClick={() => setPageNumber(page.page - 1)}><ChevronLeft size={16} aria-hidden="true"/></IconButton>
        {page.total > 0 && page.numbers.map((number, index) => <span key={number}>
          {index > 0 && number > page.numbers[index - 1] + 1 && <span className="dc-required-page-ellipsis" aria-hidden="true">…</span>}
          <button type="button" className={page.page === number ? 'is-current' : ''} aria-label={`${number}ページ`} aria-current={page.page === number ? 'page' : undefined} onClick={() => setPageNumber(number)}>{number}</button>
        </span>)}
        <IconButton type="button" variant="secondary" size="md" aria-label="次のページ" disabled={page.page === page.pages || !page.total} onClick={() => setPageNumber(page.page + 1)}><ChevronRight size={16} aria-hidden="true"/></IconButton>
      </nav>
      <label>表示件数<select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPageNumber(1) }}>{REQUIRED_DOCUMENT_PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}</select></label>
    </footer>}

    {selectedId !== null && <RequiredDocumentInspector key={selectedId} caseId={caseId} itemId={selectedId} refreshKey={JSON.stringify([selectedItem?.updated_at, selectedItem?.workflow_state, selectedItem?.file_review, selectedItem?.active_task])} canUpdate={canUpdate} canManageTasks={canManageTasks} canReviewDocuments={canReviewDocuments} activities={activities} tasks={tasks} onCandidates={onCandidates} onHistory={onHistory} onClose={closeDocument} onSaved={() => { void refresh() }} onReviewed={refreshAfterReview} onCreateTask={() => onCreateTasks([selectedId])} onManageTask={onManageTasks} onOpenTask={onOpenTask}/>}
  </div>
}

function SummaryCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return <article className={`dc-required-metric is-${tone}`}><span aria-hidden="true">{icon}</span><div><small>{label}</small><strong>{value}<em>件</em></strong></div></article>
}

function RequiredList({ items, selectedId, referenceTime, onOpen }: { items: CollectionItem[]; selectedId: number | null; referenceTime: number; onOpen: (id: number) => void }) {
  return <div className="dc-required-list dc-required-work-list">
    <div className="dc-required-head"><span>資料</span><span>状態</span><span>担当者</span><span>期限</span><span>ファイル</span><span>更新日時</span><span/></div>
    {items.map(item => <RequiredRow key={item.id} item={item} active={selectedId === item.id} referenceTime={referenceTime} onOpen={() => onOpen(item.id)}/>)}
  </div>
}

function RequiredRow({ item, active, referenceTime, onOpen }: { item: CollectionItem; active: boolean; referenceTime: number; onOpen: () => void }) {
  const row = itemToRow(item)
  const state = deriveWorkState(item)
  const due = taskDeadline(item)
  const file = currentFile(item)
  const deadline = deadlineState(due, state, referenceTime, item.active_task?.is_overdue ?? false)
  return <button type="button" className={`dc-required-row dc-required-work-row ${active ? 'is-selected' : ''}`} onClick={onOpen} aria-label={`${row.code} ${row.title} の詳細`}>
    <span className="dc-required-document"><span className="dc-required-document-icon"><FileText size={17}/></span><span><span className="dc-code">{row.code}</span><strong>{row.title}</strong></span></span>
    <Status state={state}/>
    <Assignee item={item}/>
    <Deadline value={due} tone={deadline}/>
    <span className="dc-file-state">{file ? <><FileText size={14}/><span>v{file.version} · {file.kind}</span></> : '—'}</span>
    <UpdatedAt value={file?.updatedAt ?? item.updated_at}/>
    <ChevronRight size={16} className="dc-required-chevron"/>
  </button>
}

function RequiredCards({ items, selectedId, referenceTime, onOpen }: { items: CollectionItem[]; selectedId: number | null; referenceTime: number; onOpen: (id: number) => void }) {
  return <div className="dc-required-cards">{items.map(item => {
    const row = itemToRow(item)
    const state = deriveWorkState(item)
    const due = taskDeadline(item)
    const file = currentFile(item)
    const deadline = deadlineState(due, state, referenceTime, item.active_task?.is_overdue ?? false)
    return <article key={item.id} className={`dc-required-card ${selectedId === item.id ? 'is-selected' : ''}`}><button type="button" onClick={() => onOpen(item.id)} aria-label={`${row.code} ${row.title} の詳細`}>
      <header><span className="dc-required-document-icon"><FileText size={17}/></span><span className="dc-code">{row.code}</span><Status state={state}/></header>
      <h3>{row.title}</h3><p>{documentDescription(item)}</p><span className="dc-acquisition-pill">{acquisitionLabel(item)}</span>
      <dl><div><dt>担当者</dt><dd><Assignee item={item}/></dd></div><div><dt>期限</dt><dd><Deadline value={due} tone={deadline}/></dd></div><div><dt>ファイル</dt><dd>{file ? `v${file.version} · ${file.kind}` : '—'}</dd></div><div><dt>更新日時</dt><dd><UpdatedAt value={file?.updatedAt ?? item.updated_at}/></dd></div></dl>
    </button></article>
  })}</div>
}

function Status({ state }: { state: WorkState }) { return <RequiredWorkflowBadge status={state.key} className="dc-work-status"/> }
function Assignee({ item }: { item: CollectionItem }) {
  const employee = item.active_task?.assigned_employee ?? item.assigned_employee
  return <span className={`dc-required-assignee ${employee ? '' : 'is-empty'}`}>{employee ? <UserAvatar name={employee.display_name} stableKey={employee.id} size="xs" shape="circle"/> : <UserRound size={16}/>}<span>{employee?.display_name ?? '未割当'}</span></span>
}
function Deadline({ value, tone }: { value: string | null; tone: 'normal' | 'soon' | 'overdue' | 'completed' }) { return <span className={`dc-required-deadline is-${tone}`}><i/>{value ? formatDate(value) : '未設定'}</span> }
function UpdatedAt({ value }: { value: string | null }) {
  if (!value) return <span className="dc-updated">—</span>
  const formatted = formatDate(value, true).split(/\s+/u)
  return <span className="dc-updated"><span>{formatted[0]}</span>{formatted[1] && <small>{formatted[1]}</small>}</span>
}

function deriveWorkState(item: CollectionItem): WorkState {
  const code = item.workflow_state?.code ?? 'selected'
  return requiredWorkflowPresentation(code)
}

function acquisitionLabel(item: CollectionItem) {
  if (item.document_type?.handling_type === 'office_generated' && item.document_type.creation_supported) return '自社作成'
  if (item.document_type?.handling_type === 'official_form') return '外部機関から取得'
  if (item.document_type?.handling_type === 'reference_only') return '参照資料'
  if (item.collection_source || item.collection_method) return [item.collection_source, item.collection_method].filter(Boolean).join(' / ')
  if (item.document_type?.handling_type === 'collected') return '依頼者から回収'
  return '取得方法未設定'
}

function documentDescription(item: CollectionItem) {
  const row = itemToRow(item)
  return [row.source || acquisitionLabel(item), row.target ? `対象：${row.target}` : null].filter(Boolean).join(' / ')
}
function taskDeadline(item: CollectionItem) { return item.active_task ? item.active_task.due_at : item.response_deadline }
function deadlineState(value: string | null, state: WorkState, referenceTime: number, overdue: boolean): 'normal' | 'soon' | 'overdue' | 'completed' {
  if (state.key === 'completed') return 'completed'
  if (!value) return 'normal'
  const difference = new Date(value).getTime() - referenceTime
  if (overdue) return 'overdue'
  if (difference < 0) return 'normal'
  if (difference <= 3 * 24 * 60 * 60 * 1000) return 'soon'
  return 'normal'
}
function currentFile(item: CollectionItem) {
  if (item.file_review?.filename && item.file_review.version >= (item.latest_task_submission?.version ?? 0)
    && item.file_review.version >= (item.generated_versions[0]?.version ?? 0)) return {
    version: item.file_review.version, kind: fileKind(item.file_review.mime_type ?? null, item.file_review.filename),
    updatedAt: item.file_review.uploaded_at ?? item.updated_at,
  }
  if (item.latest_task_submission) return {
    version: item.latest_task_submission.version,
    kind: fileKind(item.latest_task_submission.mime_type, item.latest_task_submission.filename),
    updatedAt: item.latest_task_submission.submitted_at,
  }
  const version = item.generated_versions[0]
  const artifact = version?.artifacts.find(value => value.mime_type === 'application/pdf' || value.artifact_type.includes('pdf')) ?? version?.artifacts[0]
  if (version && artifact) return { version: version.version, kind: fileKind(artifact.mime_type, artifact.filename), updatedAt: artifact.uploaded_at ?? version.updated_at }
  if (item.c001?.artifact) return { version: item.c001.latest_version ?? 1, kind: fileKind(null, item.c001.artifact.filename), updatedAt: item.c001.artifact.last_synced_at }
  return null
}
function fileKind(mimeType: string | null, filename: string) {
  if (mimeType === 'application/pdf' || filename.toLocaleLowerCase().endsWith('.pdf')) return 'PDF'
  const extension = filename.split('.').at(-1)
  return extension ? extension.toLocaleUpperCase() : 'FILE'
}
