export const requiredWorkflowStatuses = {
  selected: { label: '選定済み', indicator: 'dot' },
  unaccepted: { label: '未受領', indicator: 'dot' },
  in_progress: { label: '対応中', indicator: 'dot' },
  pending_review: { label: '確認待ち', indicator: 'dot' },
  changes_requested: { label: '差戻し', indicator: 'dot' },
  completed: { label: '完了', indicator: 'check' },
  cancelled: { label: 'キャンセル', indicator: 'dot' },
} as const

export type RequiredWorkflowCode = keyof typeof requiredWorkflowStatuses
export type RequiredWorkflowPresentation<T extends RequiredWorkflowCode = RequiredWorkflowCode> = { key: T; label: string }

// Presentation only: the API supplies the workflow code. Never derive this
// from necessity, filenames, collection status or file-review metadata.
export function requiredWorkflowPresentation<T extends RequiredWorkflowCode>(code: T): RequiredWorkflowPresentation<T> {
  return { key: code, label: requiredWorkflowStatuses[code].label }
}
