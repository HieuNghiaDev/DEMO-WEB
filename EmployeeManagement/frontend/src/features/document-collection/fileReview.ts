export const fileReturnReasons = ['内容に不足がある', 'ファイルが不鮮明', '誤った資料', '最新版が必要', 'その他'] as const
export function fileReviewLabel(status: string | null | undefined): string {
  return status === 'pending_review' ? '確認待ち' : status === 'approved' ? '確認済み' : status === 'rejected' ? '差し戻し' : ''
}
export function validFileReturnReason(reason: string): boolean {
  return fileReturnReasons.some(value => value === reason)
}

export const fileReviewRefreshWarning = '保存は完了しましたが、最新情報の再取得に失敗しました。'

// Only a successful server response may update the inspector. Refresh errors
// are separate from save errors and must never cause a second review POST.
export async function saveFileReview<T>(save: () => Promise<T>, onSaved: (updated: T) => void | Promise<void>): Promise<
  { kind: 'saved' } | { kind: 'save_failed'; error: unknown } | { kind: 'refresh_failed'; updated: T }
> {
  let updated: T
  try { updated = await save() } catch (error) { return { kind: 'save_failed', error } }
  try { await onSaved(updated) } catch { return { kind: 'refresh_failed', updated } }
  return { kind: 'saved' }
}
