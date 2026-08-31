export type CaseKind = '労災' | '交通事故'
export interface OfficialCandidate {
  caseType: CaseKind; code: string; title: string; purposes: string[]
  condition: string | null; source: string | null; target: string | null
  scope: string | null; version: number; preservation: boolean
}
export const necessities = ['未判定', '必要', '不要'] as const
export const collections = ['未着手', '準備中', '依頼済み', '一部受領', '受領済み', '取得困難', '終了'] as const
export const sufficiencies = ['未判定', '不足あり', '充足', '代替資料で充足'] as const
export const reviews = ['未確認', '確認中', '確認済み', '差戻し'] as const
export const exceptions = ['なし', '不存在', '不開示', '一部不開示', '保管先不明', 'その他'] as const
export const approvals = ['未申請', '承認待ち', '承認済み', '差戻し', '取消し'] as const
export interface ReceivedFile {
  id: string; name: string; version: number; received: string; actor: string
  format: '原本' | '写し'; returnStatus: string; url?: string; purposes: string[]
}
export interface HistoryEntry { id: string; at: string; actor: string; action: string; reason: string }
export interface CollectionItem extends OfficialCandidate {
  id: string; origin: '候補' | '案件で追加'
  necessity: typeof necessities[number]; collection: typeof collections[number]
  sufficiency: typeof sufficiencies[number]; review: typeof reviews[number]
  exception: typeof exceptions[number]; approval: typeof approvals[number]
  assignee: string; deadline: string; requested: string; periodStart: string; periodEnd: string
  method: string; decisionReason: string; decidedBy: string; decidedAt: string
  priority: '通常' | '優先' | '保全優先'; prerequisite: string; authorityStatus: string
  files: ReceivedFile[]; history: HistoryEntry[]
}
export interface CollectionFilters { query: string; purpose: string; source: string; status: string; assignee: string; deadline: string; quick: string }
