import { AlertCircle, AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, ClipboardCheck, Clock3, FileText, Lightbulb, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '../ui'
import RequiredWorkflowBadge from '../../features/document-collection/components/RequiredWorkflowBadge'
import { taskStatuses, type TaskFilter } from '../../features/case-workspace/taskPresentation'
import { aiTaskContinuation, aiTaskFilterOptions, aiTaskFilterRows, aiTaskNextAction, type AiTask, type AiTaskResult } from '../../features/ai/taskResults'

const guidanceIcons = { unaccepted: AlertCircle, in_progress: ArrowRight, pending_review: Clock3, changes_requested: AlertTriangle, completed: CheckCircle2, cancelled: AlertCircle }

function TaskResultCard({ task, onOpenTask }: { task: AiTask; onOpenTask: (caseId: number, taskId: number) => void }) {
  const GuidanceIcon = guidanceIcons[task.status]
  return <article className="themis-ai-task-card">
    <header className="themis-ai-task-card-header">
      <span className="themis-ai-task-icon" aria-hidden="true"><FileText size={20} /></span>
      <div className="themis-ai-task-identity">
        <span className="themis-ai-task-code">{task.required_document_code ? `${task.required_document_code} · ` : ''}T-{task.task_id}</span>
        <h4>{task.required_document_name || task.title}</h4>
      </div>
      <RequiredWorkflowBadge status={task.status} />
    </header>
    {task.title !== task.required_document_name && <p className="themis-ai-task-title">{task.title}</p>}
    <div className="themis-ai-task-meta">
      <span><CalendarDays size={14} aria-hidden="true" />期限 <time dateTime={task.due_date ?? undefined}>{task.due_date?.replaceAll('-', '/') ?? '未設定'}</time></span>
      <span><UserRound size={14} aria-hidden="true" />担当者 <strong>{task.assignee || '未割当'}</strong></span>
    </div>
    {task.overdue ? <p className="themis-ai-task-overdue"><AlertTriangle size={12} aria-hidden="true" />期限超過</p>
      : task.deadline_approaching && <p className="themis-ai-task-warning">期限が近づいています</p>}
    <div className="themis-ai-task-card-actions">
      <p className="themis-ai-task-next" data-status={task.status}><GuidanceIcon size={15} aria-hidden="true" /><span><strong>次の対応：</strong>{aiTaskNextAction(task)}</span></p>
      <Button variant="outline" size="sm" className="themis-ai-task-open" onClick={() => onOpenTask(task.case_id, task.task_id)}>タスクを開く <ArrowRight size={13} aria-hidden="true" /></Button>
    </div>
  </article>
}

function resultDate(value?: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  // Label the server result date only; due/overdue semantics remain server-owned.
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(date)
}

export default function TaskResultList({ result, onOpenTask, onUsePrompt, showGuidance = false }: {
  result: AiTaskResult
  onOpenTask: (caseId: number, taskId: number) => void
  onUsePrompt: (prompt: string) => void
  showGuidance?: boolean
}) {
  const [view, setView] = useState<{ filter: TaskFilter; visibleCount: number }>({ filter: 'all', visibleCount: 5 })
  const options = useMemo(() => aiTaskFilterOptions(result.tasks), [result.tasks])
  const filtered = useMemo(() => aiTaskFilterRows(result.tasks, view.filter), [result.tasks, view.filter])
  if (result.error) return <div role="alert" className="themis-ai-task-error"><AlertTriangle size={16} aria-hidden="true" /><p>{result.error}</p><Button variant="ghost" size="sm" onClick={() => onUsePrompt('担当タスクをもう一度確認してください。')}>再試行する</Button></div>
  const titles = { my: result.today ? '本日の担当タスク' : '担当タスク', case: 'この案件のタスク', upcoming: '期限が近いタスク', overdue: '期限超過のタスク' }
  const title = typeof result.query.status === 'string' && Object.hasOwn(taskStatuses, result.query.status) ? `${taskStatuses[result.query.status as AiTask['status']].label}のタスク` : titles[result.scope]
  const date = resultDate(result.generatedAt)
  const hiddenOverdue = result.tasks.filter(task => task.overdue && !filtered.slice(0, view.visibleCount).includes(task)).length
  return <section className="themis-ai-task-results" aria-label={title}>
    <header className="themis-ai-task-summary">
      <span className="themis-ai-task-summary-icon" aria-hidden="true"><ClipboardCheck size={23} /></span>
      <div><h3>{title}</h3><p>{result.total ? `${result.total}件のタスクがあります。` : result.scope === 'my' ? '現在、担当タスクはありません。' : '条件に一致するタスクはありません。'}</p></div>
      {date && <time className="themis-ai-task-date" dateTime={result.generatedAt}><CalendarDays size={12} aria-hidden="true" />{date}</time>}
    </header>
    {result.tasks.length > 0 ? <>
      {(result.hasMore || Number(result.query.offset) > 0) && <p className="themis-ai-task-page-note">取得済み {result.tasks.length}件の内訳：</p>}
      <div className="themis-ai-task-filters" role="group" aria-label="タスクの状態で絞り込み">
        {options.map(option => <Button key={option.value} variant="outline" size="sm" data-filter={option.value} aria-pressed={view.filter === option.value} className="themis-ai-task-filter" onClick={() => setView({ filter: option.value, visibleCount: 5 })}>
          {option.value !== 'all' && <i aria-hidden="true" />}{option.label} <span className="themis-ai-task-filter-count">{option.count}</span>
        </Button>)}
      </div>
      <p className="sr-only" role="status" aria-atomic="true">{options.find(option => option.value === view.filter)?.label}：{filtered.length}件</p>
      {filtered.slice(0, view.visibleCount).map(task => <TaskResultCard key={task.task_id} task={task} onOpenTask={onOpenTask} />)}
      {filtered.length === 0 && <p className="themis-ai-task-empty">この状態のタスクはありません。</p>}
      {hiddenOverdue > 0 && <p className="themis-ai-task-overdue">未表示の期限超過タスク：{hiddenOverdue}件{view.filter !== 'all' && view.filter !== 'overdue' && '（期限超過フィルターで確認できます）'}</p>}
      {view.visibleCount < filtered.length && <div className="themis-ai-task-more"><Button variant="ghost" size="sm" onClick={() => setView(current => ({ ...current, visibleCount: current.visibleCount + 5 }))}>残りのタスクを表示（{filtered.length - view.visibleCount}件）</Button></div>}
    </> : <div className="themis-ai-task-empty"><ClipboardCheck size={20} aria-hidden="true" /><span>{result.total > 0 ? 'このページに表示できるタスクはありません。' : '新しい担当タスクが届くと、ここで確認できます。'}</span></div>}
    {result.hasMore && result.nextOffset !== null && <div className="themis-ai-task-more"><p>取得済み {result.tasks.length}件 / 全{result.total}件。続きは同じ条件で確認できます。</p><Button variant="ghost" size="sm" onClick={() => onUsePrompt(aiTaskContinuation(result))}>続きのタスクを確認</Button></div>}
    {showGuidance && result.tasks.length > 0 && <aside className="themis-ai-task-guidance"><Lightbulb size={17} aria-hidden="true" /><div><strong>補足</strong><p>「タスクを開く」から、案件詳細の「タスク」タブと詳細画面を開けます。</p></div></aside>}
  </section>
}
