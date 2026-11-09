import type { CaseActivity, CaseTask, CaseTaskSubmission } from './types'

export type TaskFilter = 'all' | CaseTask['status'] | 'overdue'
export type TaskSort = 'updated_desc' | 'updated_asc' | 'deadline_asc' | 'deadline_desc'
export const taskStatuses = {
  unaccepted: { label: '未受領', variant: 'neutral' },
  in_progress: { label: '対応中', variant: 'info' },
  pending_review: { label: '確認待ち', variant: 'warning' },
  changes_requested: { label: '差戻し', variant: 'danger' },
  completed: { label: '完了', variant: 'success' },
  cancelled: { label: 'キャンセル', variant: 'neutral' },
} as const

export const taskFilters: Array<{ value: TaskFilter; label: string }> = [
  { value: 'all', label: 'すべて' }, { value: 'unaccepted', label: '未受領' },
  { value: 'in_progress', label: '対応中' }, { value: 'pending_review', label: '確認待ち' },
  { value: 'changes_requested', label: '差戻し' }, { value: 'completed', label: '完了' },
  { value: 'overdue', label: '期限超過' },
]

export function taskDocumentName(task: CaseTask): string {
  return task.case_document?.document_type?.name_ja ?? task.case_document?.title ?? task.title
}

export function taskFilterCounts(tasks: CaseTask[]): Record<TaskFilter, number> {
  const counts: Record<TaskFilter, number> = { all: tasks.length, unaccepted: 0, in_progress: 0, pending_review: 0, changes_requested: 0, completed: 0, cancelled: 0, overdue: 0 }
  for (const task of tasks) { counts[task.status] += 1; if (task.is_overdue) counts.overdue += 1 }
  return counts
}

export function visibleTaskRows(tasks: CaseTask[], search: string, filter: TaskFilter, assigneeId: string, sort: TaskSort): CaseTask[] {
  const needle = search.trim().normalize('NFKC').toLocaleLowerCase('ja-JP')
  return tasks.filter(task => {
    if (filter === 'overdue' ? !task.is_overdue : filter !== 'all' && task.status !== filter) return false
    if (assigneeId && String(task.assigned_employee?.id ?? '') !== assigneeId) return false
    return !needle || [task.title, taskDocumentName(task), task.case_document?.document_type?.code ?? ''].some(value => value.normalize('NFKC').toLocaleLowerCase('ja-JP').includes(needle))
  }).sort((a, b) => {
    const field = sort.startsWith('deadline') ? 'due_at' : 'updated_at'
    const left = a[field] ? Date.parse(a[field]!) : NaN
    const right = b[field] ? Date.parse(b[field]!) : NaN
    if (Number.isNaN(left) || Number.isNaN(right)) return Number.isNaN(left) === Number.isNaN(right) ? b.id - a.id : Number.isNaN(left) ? 1 : -1
    return (sort.endsWith('asc') ? left - right : right - left) || b.id - a.id
  })
}

export function taskPage(tasks: CaseTask[], requestedPage: number, perPage: number) {
  const pages = Math.max(1, Math.ceil(tasks.length / perPage))
  const page = Math.max(1, Math.min(requestedPage, pages))
  const start = (page - 1) * perPage
  return { page, pages, rows: tasks.slice(start, start + perPage), from: tasks.length ? start + 1 : 0, to: Math.min(start + perPage, tasks.length), total: tasks.length }
}

export function taskHistory(task: CaseTask, activities: CaseActivity[]): CaseActivity[] {
  return activities.filter(activity => activity.metadata?.task_id === task.id || activity.metadata?.case_task_id === task.id)
    .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))
}

export function canGenerateTaskDocument(task: CaseTask): boolean {
  // The current task workflow auto-submission endpoint supports official C-001.
  // A general office-generated handling type alone does not prove this support.
  return task.allowed_actions.can_submit && task.case_document?.document_type?.code === 'C-001'
}

export function currentPendingTaskSubmission(task: CaseTask): CaseTaskSubmission | null {
  const submission = task.latest_submission
  if (task.status !== 'pending_review' || submission?.review_status !== 'pending_review') return null
  if (submission.case_task_id !== undefined && submission.case_task_id !== task.id) return null
  if (submission.case_document_id !== undefined && submission.case_document_id !== task.case_document_id) return null
  return submission
}
