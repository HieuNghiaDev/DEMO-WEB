import type { CaseTask } from '../case-workspace/types'
import { taskFilters, taskStatuses, type TaskFilter } from '../case-workspace/taskPresentation'

export type AiTask = {
  task_id: number
  case_id: number
  title: string
  required_document_code: string | null
  required_document_name: string
  assignee: string | null
  status: CaseTask['status']
  due_date: string | null
  overdue: boolean
  deadline_approaching: boolean
  allowed_actions: CaseTask['allowed_actions']
}
export type AiTaskResult = {
  id: string
  scope: 'my' | 'case' | 'upcoming' | 'overdue'
  tasks: AiTask[]
  total: number
  hasMore: boolean
  nextOffset: number | null
  query: Record<string, string | number>
  error?: string
  today?: boolean
  generatedAt?: string
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const positiveId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const scopes = ['my', 'case', 'upcoming', 'overdue'] as const
const actionKeys = ['can_accept', 'can_submit', 'can_reassign', 'can_change_deadline', 'can_approve', 'can_reject', 'can_cancel'] as const
const task = (value: unknown): AiTask | null => {
  if (!record(value) || !positiveId(value.task_id) || !positiveId(value.case_id)
    || typeof value.status !== 'string' || !Object.hasOwn(taskStatuses, value.status)
    || typeof value.required_document_name !== 'string' || typeof value.overdue !== 'boolean') return null
  const actions = record(value.allowed_actions) ? value.allowed_actions : {}
  return {
    task_id: value.task_id, case_id: value.case_id,
    title: typeof value.title === 'string' ? value.title : value.required_document_name,
    required_document_name: value.required_document_name,
    required_document_code: typeof value.required_document_code === 'string' ? value.required_document_code : null,
    assignee: typeof value.assignee === 'string' ? value.assignee : null,
    status: value.status as AiTask['status'],
    due_date: typeof value.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.due_date) ? value.due_date : null,
    overdue: value.overdue, deadline_approaching: value.deadline_approaching === true,
    allowed_actions: Object.fromEntries(actionKeys.map(key => [key, actions[key] === true])) as AiTask['allowed_actions'],
  }
}

// Only server tool metadata creates cards/targets; model prose and conversation history cannot.
export function aiTaskResults(executions: unknown): AiTaskResult[] {
  if (!Array.isArray(executions)) return []
  return executions.flatMap<AiTaskResult>((execution, index) => {
    if (!record(execution) || execution.name !== 'query_case_tasks') return []
    const empty: AiTaskResult = { id: typeof execution.tool_use_id === 'string' ? execution.tool_use_id : `tasks-${index}`, scope: 'my', tasks: [], total: 0, hasMore: false, nextOffset: null, query: {} }
    const fail = { ...empty, error: 'タスク情報を取得できませんでした。' }
    if (execution.status !== 'success') {
      const safeErrors = ['このタスク情報を閲覧する権限がありません。', '他の社員のタスクを閲覧する権限がありません。']
      return [{ ...fail, error: typeof execution.error_message === 'string' && safeErrors.includes(execution.error_message) ? execution.error_message : fail.error }]
    }
    const output = execution.output
    if (!record(output) || !scopes.includes(output.scope as AiTaskResult['scope']) || !Array.isArray(output.tasks)) return [fail]
    const rows = output.tasks.map(task)
    if (rows.some(row => row === null)) return [fail]
    const tasks = rows as AiTask[]
    const query: AiTaskResult['query'] = { scope: output.scope as string }
    if (record(output.query)) {
      for (const key of ['case_id', 'employee_id', 'days', 'offset', 'case_code', 'status']) {
        const value = output.query[key]
        if (typeof value === 'string' || typeof value === 'number') query[key] = value
      }
    }
    return [{ ...empty, scope: output.scope as AiTaskResult['scope'], tasks, query,
      generatedAt: typeof output.generated_at === 'string' ? output.generated_at : undefined,
      total: typeof output.total_count === 'number' && Number.isSafeInteger(output.total_count) && output.total_count >= tasks.length ? output.total_count : tasks.length,
      hasMore: output.has_more === true, nextOffset: positiveId(output.next_offset) ? output.next_offset : null,
    }]
  })
}

export function aiTaskNextAction(task: AiTask): string {
  switch (task.status) {
    case 'unaccepted': return task.allowed_actions.can_accept ? 'タスクを受領してください。' : '担当者の受領待ちです。'
    case 'in_progress': return task.allowed_actions.can_submit ? '必要な資料を作成・提出してください。' : '担当者が資料を準備しています。'
    case 'pending_review': return task.allowed_actions.can_approve || task.allowed_actions.can_reject ? '提出ファイルを確認し、タスク画面で審査してください。' : '管理者の確認をお待ちください。'
    case 'changes_requested': return task.allowed_actions.can_submit ? '差し戻し理由を確認し、再提出してください。' : '担当者の修正・再提出待ちです。'
    case 'completed': return 'このタスクは完了しています。'
    case 'cancelled': return 'このタスクはキャンセルされています。'
  }
}

export function aiTaskLocation(task: Pick<AiTask, 'case_id' | 'task_id'>) {
  return { pathname: `/quests/${task.case_id}`, state: { workspaceTab: 'tasks', taskId: task.task_id } }
}

export function aiTaskContinuation(result: AiTaskResult): string {
  return `同じ条件で次のタスクを表示してください。query_case_tasks の条件: ${JSON.stringify({ ...result.query, offset: result.nextOffset })}`
}

export function aiTaskIntroduction(question: string, employeeName = '', today = false): string {
  const name = employeeName.trim().replace(/[\\`*_{}[\]<>#]/g, '\\$&')
  if (/[\u3040-\u30ff\u3400-\u9fff]/.test(question) || !/[a-z]/i.test(question)) {
    return `${name ? `**${name} さん**、\n` : ''}${today ? '本日の' : ''}担当タスクを確認しました。`
  }
  if (/[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệịỉĩọỏốồổỗộớờởỡợụủũứừửữựỳỷỹỵ]/i.test(question)) return `${name ? `**${name}**,\n` : ''}Đây là các task trong phạm vi bạn được phép xem.`
  return `${name ? `**${name}**,\n` : ''}Here are the tasks you are authorized to view.`
}

export function aiTaskFilterRows(tasks: AiTask[], filter: TaskFilter): AiTask[] {
  return tasks.filter(task => filter === 'all' || (filter === 'overdue' ? task.overdue : task.status === filter))
}

export function aiTaskFilterOptions(tasks: AiTask[]) {
  const options = [...taskFilters, { value: 'cancelled' as const, label: taskStatuses.cancelled.label }]
  return options.map(option => ({ ...option, count: aiTaskFilterRows(tasks, option.value).length }))
    .filter(option => !['changes_requested', 'completed', 'cancelled'].includes(option.value) || option.count > 0)
}
