import type { CaseTaskDelegation } from './api'

export const caseTaskDelegationPermissions = [
  ['create_tasks', 'タスクを作成'],
  ['review_tasks', 'タスクを確認・承認・差し戻し'],
  ['edit_overview', '依頼者情報・概要を編集'],
] as const

export function selectedCaseDelegations(rows: CaseTaskDelegation[]) {
  return rows.filter(row => caseTaskDelegationPermissions.some(([key]) => row[key]))
}
