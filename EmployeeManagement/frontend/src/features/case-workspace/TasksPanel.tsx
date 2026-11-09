import { ChevronLeft, ChevronRight, FileText, ListFilter, MoreHorizontal, Plus, ArrowDownUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { IconButton } from '../../components/ui/IconButton'
import { SearchInput } from '../../components/ui/SearchInput'
import { UserAvatar } from '../../components/ui/UserAvatar'
import { formatDate } from '../document-collection/utils'
import TaskDetailDrawer, { type TaskActionHandlers } from './TaskDetailDrawer'
import TaskStatusBadge from './TaskStatusBadge'
import { taskDocumentName, taskFilterCounts, taskFilters, taskPage, visibleTaskRows, type TaskFilter, type TaskSort } from './taskPresentation'
import type { CaseActivity, CaseTask } from './types'
import './taskUI.css'
import '../document-collection/documentCollection.css'

type Props = TaskActionHandlers & {
  caseId: number; tasks: CaseTask[]; activities: CaseActivity[]; canManage: boolean; canReview: boolean
  working: boolean; error?: string | null; onAdd: () => void; onRetry: () => void
  initialTaskId?: number | null; onInitialTaskHandled?: () => void
}

export default function TasksPanel({ caseId, tasks, activities, canManage, canReview, working, error, onAdd, onRetry, initialTaskId, onInitialTaskHandled, ...handlers }: Props) {
  const initialIndex = visibleTaskRows(tasks, '', 'all', '', 'updated_desc').findIndex(task => task.id === initialTaskId)
  const [query, setQuery] = useState<{ search: string; filter: TaskFilter; assignee: string; sort: TaskSort; page: number; perPage: number }>({ search: '', filter: 'all', assignee: '', sort: 'updated_desc', page: initialIndex < 0 ? 1 : Math.floor(initialIndex / 10) + 1, perPage: 10 })
  const [selectedId, setSelectedId] = useState<number | null>(initialIndex < 0 ? null : initialTaskId ?? null)
  useEffect(() => { if (initialTaskId !== null && initialTaskId !== undefined) onInitialTaskHandled?.() }, [initialTaskId, onInitialTaskHandled])
  const selectedTask = tasks.find(task => task.id === selectedId)
  const counts = taskFilterCounts(tasks)
  const filtered = visibleTaskRows(tasks, query.search, query.filter, query.assignee, query.sort)
  const page = taskPage(filtered, query.page, query.perPage)
  const assignees = [...new Map(tasks.flatMap(task => task.assigned_employee ? [[task.assigned_employee.id, task.assigned_employee] as const] : [])).values()]
  const changeQuery = (patch: Partial<typeof query>) => setQuery(current => ({ ...current, ...patch, page: 1 }))
  const pageNumbers = Array.from(new Set([1, page.pages, page.page - 1, page.page, page.page + 1].filter(value => value >= 1 && value <= page.pages))).sort((a, b) => a - b)

  return <section className={`cm-task-panel ${selectedTask ? 'has-detail' : ''}`} aria-label="担当タスク">
    <header className="cm-task-toolbar">
      <div><h2>担当タスク</h2><p>この案件に関連するタスクの一覧です。担当・期限・ステータスを確認できます。</p></div>
      <div className="cm-task-toolbar-actions">
        <SearchInput value={query.search} onChangeValue={search => changeQuery({ search })} placeholder="タスク名・資料名で検索..." aria-label="タスク名・資料名・資料コードで検索" containerClassName="cm-task-search"/>
        <details className="cm-task-filter-menu"><summary><ListFilter size={15} aria-hidden="true"/>フィルター{query.assignee && <span>1</span>}</summary><div className="cm-task-filter-popover">
          <label>並び順<select value={query.sort} onChange={event => changeQuery({ sort: event.target.value as TaskSort })}><option value="updated_desc">更新日時（新しい順）</option><option value="updated_asc">更新日時（古い順）</option><option value="deadline_asc">期限（近い順）</option><option value="deadline_desc">期限（遠い順）</option></select></label>
          {canManage && <label>担当者<select value={query.assignee} onChange={event => changeQuery({ assignee: event.target.value })}><option value="">すべて</option>{assignees.map(employee => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</select></label>}
          <Button size="sm" variant="ghost" onClick={() => changeQuery({ search: '', filter: 'all', assignee: '', sort: 'updated_desc' })}>条件をクリア</Button>
        </div></details>
        {canManage && <Button variant="primary" icon={<Plus size={15}/>} disabled={working} onClick={onAdd}>タスクを追加</Button>}
      </div>
    </header>
    <nav className="cm-task-filters" aria-label="タスクのステータス絞り込み">{taskFilters.map(({ value, label }) => <button key={value} type="button" className={query.filter === value ? 'is-active' : ''} aria-pressed={query.filter === value} onClick={() => changeQuery({ filter: value })}>{label}<span>{counts[value]}</span></button>)}</nav>
    {error && <div className="cm-task-feedback is-error" role="alert"><span>タスクを取得・更新できませんでした。{error}</span><Button size="sm" variant="outline" onClick={onRetry}>再試行</Button></div>}
    <div className="cm-task-table-wrap">
      <table className="cm-task-table">
        <colgroup><col className="is-document"/><col className="is-title"/><col className="is-status"/><col className="is-assignee"/><col className="is-deadline"/><col className="is-updated"/><col className="is-action"/></colgroup>
        <thead><tr>
          <th>資料</th><th>タスク名</th><th>ステータス</th><th>担当者</th>
          <th><button type="button" onClick={() => changeQuery({ sort: query.sort === 'deadline_asc' ? 'deadline_desc' : 'deadline_asc' })}>期限<ArrowDownUp size={12}/></button></th>
          <th className="is-updated"><button type="button" onClick={() => changeQuery({ sort: query.sort === 'updated_desc' ? 'updated_asc' : 'updated_desc' })}>更新日<ArrowDownUp size={12}/></button></th>
          <th className="is-action"><span className="sr-only">操作</span></th>
        </tr></thead>
        <tbody>{page.rows.map(task => <tr key={task.id} className={selectedTask?.id === task.id ? 'is-selected' : ''} onClick={() => setSelectedId(task.id)}>
          <td className="is-document"><div className="cm-task-document"><span className="cm-task-document-icon"><FileText size={18} aria-hidden="true"/></span><div><strong title={taskDocumentName(task)}>{taskDocumentName(task)}</strong><small>{task.case_document?.document_type?.code ?? '—'}</small></div></div></td>
          <td className="is-title"><button type="button" className="cm-task-open" onClick={() => setSelectedId(task.id)} aria-label={`${task.title}のタスク詳細を開く`} aria-expanded={selectedTask?.id === task.id}>{task.title}</button>{task.description && <p title={task.description}>{task.description}</p>}</td>
          <td className="is-status"><TaskStatusBadge status={task.status}/></td>
          <td className="is-assignee"><span className="cm-task-assignee"><UserAvatar name={task.assigned_employee?.full_name} imageSrc={task.assigned_employee?.avatar_path} stableKey={task.assigned_employee?.id ?? task.id} size="xs" shape="circle"/><span title={task.assigned_employee?.full_name}>{task.assigned_employee?.full_name ?? '未割当'}</span></span></td>
          <td className={`is-deadline ${task.is_overdue ? 'is-overdue' : ''}`}><time dateTime={task.due_at ?? undefined}>{formatDate(task.due_at)}</time>{task.is_overdue && <small>期限超過</small>}</td>
          <td className="is-updated"><time dateTime={task.updated_at ?? undefined}>{formatDate(task.updated_at ?? null, true)}</time></td>
          <td className="is-action"><IconButton size="sm" aria-label={`${task.title}の詳細・操作`} onClick={() => setSelectedId(task.id)}><MoreHorizontal size={16}/></IconButton></td>
        </tr>)}</tbody>
      </table>
      {!page.rows.length && <div className="cm-task-empty" role="status"><ClipboardEmpty/><strong>{tasks.length ? '条件に一致するタスクはありません。' : canManage ? 'タスクはありません。' : '現在、担当するタスクはありません。'}</strong>{tasks.length > 0 && <Button size="sm" variant="ghost" onClick={() => changeQuery({ search: '', filter: 'all', assignee: '' })}>条件をクリア</Button>}</div>}
    </div>
    <footer className="cm-task-pagination"><span>{page.total}件中{page.from}–{page.to}件を表示</span><nav aria-label="タスク一覧のページ切替">
      <IconButton variant="secondary" size="md" aria-label="前のページ" disabled={page.page === 1} onClick={() => setQuery(current => ({ ...current, page: page.page - 1 }))}><ChevronLeft size={16}/></IconButton>
      {pageNumbers.map((number, index) => <span key={number}>{index > 0 && number > pageNumbers[index - 1] + 1 && <span className="cm-task-page-ellipsis">…</span>}<button type="button" className={page.page === number ? 'is-current' : ''} aria-label={`${number}ページ`} aria-current={page.page === number ? 'page' : undefined} onClick={() => setQuery(current => ({ ...current, page: number }))}>{number}</button></span>)}
      <IconButton variant="secondary" size="md" aria-label="次のページ" disabled={page.page === page.pages} onClick={() => setQuery(current => ({ ...current, page: page.page + 1 }))}><ChevronRight size={16}/></IconButton>
    </nav><label>表示件数<select value={query.perPage} onChange={event => changeQuery({ perPage: Number(event.target.value) })}>{[10, 20, 50].map(size => <option key={size} value={size}>{size}</option>)}</select></label></footer>
    {selectedTask && <TaskDetailDrawer key={selectedTask.id} task={selectedTask} caseId={caseId} activities={activities} canManage={canManage} canReview={canReview} working={working} error={error} onClose={() => setSelectedId(null)} onRefresh={onRetry} {...handlers}/>}
  </section>
}

function ClipboardEmpty() { return <FileText size={22} aria-hidden="true"/> }
