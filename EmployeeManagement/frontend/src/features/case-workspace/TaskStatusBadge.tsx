import { StatusBadge } from '../../components/ui/StatusBadge'
import { taskStatuses } from './taskPresentation'
import type { CaseTask } from './types'

export default function TaskStatusBadge({ status }: { status: CaseTask['status'] }) {
  const config = taskStatuses[status]
  return <StatusBadge variant={config.variant} dot size="sm" className={`cm-task-status is-${status}`}>{config.label}</StatusBadge>
}
