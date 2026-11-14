import { communicationLabels, type HistoryEntry } from './historyTypes.ts'
import { collectionLabels, fulfillmentLabels, necessityLabels, priorityLabels, resultLabels, reviewLabels } from '../document-collection/labels.ts'

export function historyTypeLabel(entry: HistoryEntry) {
  if (entry.kind === 'system') return '操作履歴'
  const label = communicationLabels[entry.type as keyof typeof communicationLabels] ?? 'その他'
  const direction = entry.communication?.direction
  return label + (direction ? `・${direction === 'inbound' ? '受信' : entry.type === 'phone' ? '発信' : '送信'}` : '')
}
export function durationLabel(minutes?: number | null) {
  if (minutes == null) return ''
  return minutes >= 60 ? `${Math.floor(minutes / 60)}時間${minutes % 60 ? `${minutes % 60}分` : ''}` : `${minutes}分`
}
export function historyDate(value: string, time = false, seconds = false) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit',
    ...(time ? { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) } : {}) }).format(date)
}
export function historyTime(value: string, seconds = false) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) }).format(date)
}
export const HISTORY_PAGE_SIZES = [15, 30, 50] as const
export const initialHistoryFilters = { kind: '', type: '', actor_id: '', from: '', to: '', search: '', page: 1, per_page: 15 }
export type HistoryFilters = typeof initialHistoryFilters
export function changeHistoryFilter<K extends Exclude<keyof HistoryFilters, 'page'>>(current: HistoryFilters, field: K, value: HistoryFilters[K]): HistoryFilters {
  return { ...current, [field]: value, page: 1 }
}
export function historyPageNumbers(current: number, last: number): Array<number | 'ellipsis'> {
  const pages = new Set([1, last, current - 1, current, current + 1])
  if (current <= 3) [2, 3, 4].forEach(p => pages.add(p))
  if (current >= last - 2) [last - 3, last - 2, last - 1].forEach(p => pages.add(p))
  const ordered = [...pages].filter(p => p >= 1 && p <= last).sort((a, b) => a - b)
  return ordered.flatMap((page, index): Array<number | 'ellipsis'> => index > 0 && page - ordered[index - 1] > 1 ? ['ellipsis', page] : [page])
}
export function historyRange(page: { total: number; from: number | null; to: number | null }) {
  return page.total ? `${page.total}件中 ${page.from ?? 0}–${page.to ?? 0}件を表示` : '0件中 0件を表示'
}
export function groupHistoryDays(entries: HistoryEntry[]) {
  const groups: Array<{ date: string; entries: HistoryEntry[] }> = []
  for (const entry of entries) {
    const date = historyDate(entry.occurred_at)
    const last = groups.at(-1)
    if (last?.date === date) last.entries.push(entry)
    else groups.push({ date, entries: [entry] })
  }
  return groups
}
export function historyOperationIcon(entry: HistoryEntry) {
  const label = `${entry.action_type ?? ''} ${entry.title}`
  if (/reject|returned|差し戻|差戻/.test(label)) return 'return'
  if (/approv|confirm|確認済|承認/.test(label)) return 'confirmed'
  if (/upload|submitted|アップロード|提出/.test(label)) return 'upload'
  if (/deadline|期限/.test(label)) return 'deadline'
  if (/assign|担当/.test(label)) return 'person'
  if (/party\.|関係者/.test(label)) return 'person'
  if (/task\.|タスク/.test(label)) return 'task'
  if (/document|資料|文書|PDF/.test(label)) return 'document'
  if (/case\.created|案件を作成/.test(label)) return 'case'
  return 'edit'
}
/** A presentation label only; the server remains authoritative for event kind. */
export function historyCategory(entry: HistoryEntry): string | null {
  if (entry.kind === 'communication') return '連絡・面談'
  const label = `${entry.action_type ?? ''} ${entry.title}`
  if (/資料|文書|ファイル|C-\d{3}/.test(entry.title)) return '資料'
  if (/task\.|タスク/.test(label)) return 'タスク'
  if (/party\.|関係者/.test(label)) return '関係者'
  if (/document|資料|文書|ファイル|C-\d{3}/.test(label)) return '資料'
  if (/deadline|期限/.test(label)) return '期限'
  if (/case\.|案件/.test(label)) return '案件'
  return null
}
export function compactHistoryChange(entry: HistoryEntry) {
  const changed = Object.entries(entry.changes).filter(([field]) => !/^(created_at|updated_at|.*_by|.*_by_employee_id)$/.test(field))
  const change = changed.find(([field]) => ['review_status', 'status', 'necessity_status', 'assigned_employee_id', 'response_deadline', 'due_at'].includes(field)) ?? changed[0]
  if (!change) return null
  const [field, values] = change
  return { field: changeLabel(field), before: historyValue(values.before), after: historyValue(values.after), more: Object.keys(entry.changes).length - 1 }
}
export function localDateInput(value?: string | null) {
  if (value === '') return ''
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const fieldLabels: Record<string, string> = {
  subject: '件名', summary: '概要', details: '詳細', outcome: '対応結果', next_action: '次回対応',
  next_action_due_at: '次回対応期限', started_at: '開始日時', ended_at: '終了日時', duration_minutes: '所要時間',
  communication_type: '種類', direction: '方向', counterparties: '相手', participants: '参加者',
  attachment_count: '添付ファイル件数',
  assigned_employee_id: '担当者', response_deadline: '回答期限', due_at: '期限', priority: '優先度',
  description: '説明', necessity_status: '必要性', collection_status: '取得状況', review_status: '確認状況',
  fulfillment_status: '充足状況', status: '状態', version: 'バージョン',
}
const values: Record<string, string> = { ...communicationLabels, ...collectionLabels, ...fulfillmentLabels, ...necessityLabels, ...priorityLabels, ...resultLabels, ...reviewLabels,
  pending_review: '確認待ち', approved: '確認済み', rejected: '差し戻し', reviewed: '確認済み', returned: '差し戻し',
  unaccepted: '未受領', in_progress: '対応中', changes_requested: '差戻し', completed: '完了', cancelled: 'キャンセル', inbound: '受信', outbound: '発信／送信' }
export const changeLabel = (field: string) => fieldLabels[field] ?? field
/** Structured values remain readable; never dump raw audit JSON into the timeline. */
export function historyValue(value: unknown): string {
  if (value == null || value === '') return '未設定'
  if (typeof value === 'boolean') return value ? 'はい' : 'いいえ'
  if (typeof value === 'string') return values[value] ?? value
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(historyValue).join('、') || 'なし'
  if (typeof value === 'object' && 'name' in value && typeof value.name === 'string') return value.name
  return '構造化情報の変更'
}
