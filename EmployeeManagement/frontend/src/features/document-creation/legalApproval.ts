export const legalApprovalPendingMessage = '法的承認は現在ご利用いただけません。'

export type ReviewCapabilities = {
  can_approve?: boolean
  can_reject?: boolean
  legal_approval_pending?: boolean
}

// Presentation only. Each mutation must still be authorized by the backend.
export function canReviewAction(capabilities: ReviewCapabilities | undefined, action: 'approve' | 'reject') {
  return capabilities?.legal_approval_pending !== true && capabilities?.[`can_${action}`] === true
}

export function reviewActionError(error: unknown, fallback: string) {
  const response = (error as { response?: { status?: number; data?: { code?: string } } } | null)?.response
  if (response?.data?.code === 'legal_authority_policy_pending') return legalApprovalPendingMessage
  if (response?.status === 403) return 'この操作を行う権限がありません。最新の権限と承認状態を確認してください。'
  if (response?.status === 409) return '処理対象の状態が変更されています。再読み込みしてください。'
  return fallback
}
