import { CalendarDays, ChevronRight, FileText, ListTodo, UserRound } from 'lucide-react'
import { UserAvatar } from '../../../components/ui/UserAvatar'
import { useState } from 'react'
import type { CaseTask } from '../../case-workspace/types'
import type { CollectionDetail } from '../types'
import { formatDate } from '../utils'
import RequiredWorkflowBadge from './RequiredWorkflowBadge'

export default function RequiredDocumentRelatedTask({ task, taskDetails, onOpen }: {
  task: CollectionDetail['active_task']; taskDetails?: CaseTask
  onOpen?: () => void
}) {
  const extra = taskDetails?.id === task?.id ? taskDetails : undefined
  const [referenceTime] = useState(Date.now)
  if (!task) return null
  const remaining = task?.due_at ? new Date(task.due_at).getTime() - referenceTime : null
  const dueTone = task?.is_overdue ? 'is-overdue' : task?.status === 'completed' || task?.status === 'cancelled' || remaining === null || remaining < 0 ? '' : remaining < 7 * 86400000 ? 'is-soon' : ''
  return <section className="dc-required-drawer-card is-task">
    <header><div className="dc-required-section-title"><span><ListTodo size={17}/></span><h3>関連タスク <small>(1)</small></h3></div>{onOpen && <button type="button" className="dc-required-outline-action" onClick={onOpen}>タスクを開く<ChevronRight size={14}/></button>}</header>
    <button type="button" className="dc-required-related-task" onClick={onOpen} disabled={!onOpen} aria-label={`関連タスク T-${task.id} を開く`}>
      <span className="dc-required-task-tile"><FileText size={21}/></span>
      <span className="dc-required-task-main"><span className="dc-required-task-code">T-{task.id}</span>{extra?.title && <strong title={extra.title}>{extra.title}</strong>}<span className="dc-required-person">{task.assigned_employee ? <UserAvatar name={task.assigned_employee.display_name} stableKey={task.assigned_employee.id} imageSrc={extra?.assigned_employee?.id === task.assigned_employee.id ? extra.assigned_employee.avatar_path : undefined} size="sm" shape="circle"/> : <UserRound size={18}/>}<span>{task.assigned_employee?.display_name ?? '未割当'}</span></span></span>
      <span className={`dc-required-task-due ${dueTone}`}><CalendarDays size={14}/>{formatDate(task.due_at)}</span>
      <RequiredWorkflowBadge status={task.status} className="dc-required-task-status"/><ChevronRight size={18}/>
    </button>
  </section>
}
