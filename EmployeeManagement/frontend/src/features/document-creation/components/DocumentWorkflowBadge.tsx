import type { DocumentWorkflowStatus } from '../documentTemplates'

const workflowLabels: Record<DocumentWorkflowStatus, string> = {
  not_created: '未作成',
  draft: '編集中',
  review: '確認待ち',
  approved: '承認済み',
}

export default function DocumentWorkflowBadge({ status }: { status: DocumentWorkflowStatus }) {
  return <span className={`c001-workflow-badge is-${status}`}>{workflowLabels[status]}</span>
}
