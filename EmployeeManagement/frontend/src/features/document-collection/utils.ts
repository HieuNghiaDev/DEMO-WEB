import type { CollectionDetail, CollectionDraft, CollectionItem, CollectionPatch, CollectionQuery, InitializationPreview } from './types'
import { collectionLabels, fulfillmentLabels, necessityLabels, resultLabels, reviewLabels } from './labels.ts'
import type { CollectionRowView } from './components/CollectionListView'

export function initializationMode(preview: InitializationPreview) {
  const state = preview.initialization
  if (state.total_existing_collection_items > 0) return 'existing'
  if (!state.available) return 'unavailable'
  if (state.missing_candidate_count > 0) return 'uninitialized'
  return 'empty'
}
export function draftFromDetail(item: CollectionDetail): CollectionDraft {
  return {
    target_person: item.collection.target_person, collection_source: item.collection.source, collection_method: item.collection.method,
    target_period_from: item.collection.target_period_from, target_period_to: item.collection.target_period_to, target_scope: item.collection.target_scope,
    assigned_employee_id: item.assigned_employee?.id ?? null, requested_at: item.collection.requested_at, response_deadline: item.collection.response_deadline,
    collection_priority: item.collection.priority, preservation_priority: item.collection.preservation_priority, preservation_reason: item.collection.preservation_reason,
    necessity_status: item.necessity.status, necessity_reason: item.necessity.reason, collection_status: item.collection.status,
    collection_result: item.collection.result, fulfillment_status: item.fulfillment_status, review_status: item.review_status,
  }
}
export function changedFields(item: CollectionDetail, draft: CollectionDraft): CollectionPatch {
  const original = draftFromDetail(item)
  // Iterate the API allowlist, never arbitrary draft keys or the detail resource.
  return Object.fromEntries(Object.entries(original).filter(([key, value]) => draft[key as keyof CollectionDraft] !== value).map(([key]) => [key, draft[key as keyof CollectionDraft]]))
}
export function validateDraft(item: CollectionDetail, draft: CollectionDraft): Record<string, string> {
  const changes = changedFields(item, draft)
  const errors: Record<string, string> = {}
  if (draft.necessity_status === 'not_required' && ('necessity_status' in changes || 'necessity_reason' in changes) && !draft.necessity_reason?.trim()) errors.necessity_reason = '不要と判断した理由を入力してください。'
  if (draft.target_period_from && draft.target_period_to && draft.target_period_to < draft.target_period_from) errors.target_period_to = '終了日は開始日以降にしてください。'
  return errors
}
export function withFilter(query: CollectionQuery, patch: Partial<CollectionQuery>): CollectionQuery {
  return { ...query, ...patch, page: 1 }
}
export function formatDate(value: string | null, time = false): string {
  if (!value) return '—'
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.replaceAll('-', '/')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', ...(time ? { hour: '2-digit', minute: '2-digit' } as const : {}) }).format(date)
}
export function toLocalDateTime(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
export function fromLocalDateTime(value: string): string | null {
  return value ? new Date(value).toISOString() : null
}
export function safeExternalUrl(value: string | null): string | null {
  try { const url = new URL(value ?? ''); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null } catch { return null }
}
export function itemToRow(item: CollectionItem, now = Date.now()): CollectionRowView {
  // Display only: the API owns filtering/counts. This marker follows its documented overdue predicate.
  const overdue = !!item.response_deadline && new Date(item.response_deadline).getTime() < now && !['received', 'closed'].includes(item.collection_status)
  return {
    id: String(item.id), code: item.document_type?.code ?? '—', title: item.document_type?.name_ja ?? item.title,
    purposes: [...item.purposes].sort((a, b) => a.code.localeCompare(b.code)).map(p => ({ code: p.code, label: p.name_ja })),
    source: item.collection_source, target: item.target_person,
    period: item.target_period_from || item.target_period_to ? `${formatDate(item.target_period_from)} — ${formatDate(item.target_period_to)}` : item.target_scope,
    origin: item.is_template_generated ? null : '案件で追加', preservation: item.preservation_priority,
    preservationText: item.preservation_reason, unnecessary: item.necessity_status === 'not_required',
    necessity: necessityLabels[item.necessity_status], collection: collectionLabels[item.collection_status], fulfillment: fulfillmentLabels[item.fulfillment_status], review: reviewLabels[item.review_status],
    result: item.collection_result ? resultLabels[item.collection_result] : null,
    assignee: item.assigned_employee?.display_name ?? '未割当', deadline: formatDate(item.response_deadline), overdue,
  }
}

export function isRequiredDocument(item: Pick<CollectionItem, 'necessity_status'>) {
  return item.necessity_status === 'required'
}
