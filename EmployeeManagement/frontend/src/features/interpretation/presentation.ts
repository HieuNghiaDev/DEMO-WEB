import axios from 'axios'
import type { InterpretationItem, InterpretationPayload, InterpretationStatus } from './types'

export const interpretationLabels: Record<InterpretationStatus, string> = { pending: '手配待ち', arranging: '手配中', confirmed: '確定', completed: '完了', cancelled: 'キャンセル' }
export const interpretationTones: Record<InterpretationStatus, 'warning' | 'info' | 'success' | 'neutral'> = { pending: 'warning', arranging: 'info', confirmed: 'info', completed: 'success', cancelled: 'neutral' }
export const workTypes = { consultation: '法律相談', meeting: '打合せ・面談', court: '裁判・調停', phone: '電話対応', other: 'その他' }
export const interpretationModes = { in_person: '対面', online: 'オンライン', phone: '電話' }
export const nextStatus: Partial<Record<InterpretationStatus, InterpretationStatus>> = { pending: 'arranging', arranging: 'confirmed', confirmed: 'completed' }

// The form explicitly uses Japan office time, independent of the browser's OS timezone.
export function japanInput(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '' : new Date(date.valueOf() + 9 * 3600000).toISOString().slice(0, 16)
}
export function officeDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}
export type InterpretationForm = { language: string; work_type: string; mode: string; content: string; starts_at: string; ends_at: string; location: string; notes: string; interpreter_id: string }
export function initialForm(item?: InterpretationItem): InterpretationForm {
  return { language: item?.language ?? '', work_type: item?.work_type ?? 'consultation', mode: item?.mode ?? 'in_person', content: item?.content ?? '',
    starts_at: item ? japanInput(item.starts_at) : '', ends_at: item ? japanInput(item.ends_at) : '', location: item?.location ?? '', notes: item?.notes ?? '', interpreter_id: item?.interpreter ? String(item.interpreter.id) : '' }
}
export function validateInterpretation(form: InterpretationForm): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!form.language.trim()) errors.language = '対応言語を入力してください。'
  if (!form.content.trim()) errors.content = '通訳内容を入力してください。'
  if (!form.starts_at) errors.starts_at = '開始日時を指定してください。'
  if (!form.ends_at) errors.ends_at = '終了日時を指定してください。'
  const start = new Date(`${form.starts_at}:00+09:00`).valueOf()
  const end = new Date(`${form.ends_at}:00+09:00`).valueOf()
  if (form.starts_at && form.ends_at && (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 86400000)) errors.ends_at = '終了は開始より後、24時間以内にしてください。'
  return errors
}
export function interpretationPayload(form: InterpretationForm, item: InterpretationItem | undefined, key: string, canAssign: boolean): InterpretationPayload {
  const value: InterpretationPayload = { language: form.language.trim(), work_type: form.work_type, mode: form.mode, content: form.content.trim(),
    starts_at: new Date(`${form.starts_at}:00+09:00`).toISOString(), ends_at: new Date(`${form.ends_at}:00+09:00`).toISOString(), location: form.location.trim() || null, notes: form.notes.trim() || null }
  if (item) value.revision = item.revision
  else { value.request_key = key; if (canAssign) value.interpreter_id = form.interpreter_id ? Number(form.interpreter_id) : null }
  return value
}
export function interpretationError(error: unknown): { message: string; fields: Record<string, string> } {
  const fallback = '処理に失敗しました。接続を確認して再試行してください。'
  if (!axios.isAxiosError(error)) return { message: fallback, fields: {} }
  const status = error.response?.status
  const messages: Record<number, string> = { 401: '再ログインしてください。', 403: 'この操作を行う権限がありません。', 404: '依頼が見つからないか、アクセスできません。', 409: '予定の重複または更新の競合があります。内容を再取得して確認してください。', 503: '通訳管理の初期設定が完了していません。管理者に確認してください。' }
  const fields: Record<string, string> = {}
  if (status === 422 && error.response?.data?.errors) for (const [key, values] of Object.entries(error.response.data.errors)) if (Array.isArray(values) && typeof values[0] === 'string') fields[key] = values[0]
  return { message: status === 422 ? '入力内容を確認してください。' : messages[status ?? 0] ?? fallback, fields }
}
