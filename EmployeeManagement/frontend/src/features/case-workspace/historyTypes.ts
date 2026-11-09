export const communicationLabels = {
  phone: '電話', email: 'メール', chat: 'チャット', online_meeting: 'オンライン面談',
  office_meeting: '来所面談', visit: '訪問', postal_mail: '郵送', other: 'その他',
} as const
export type CommunicationType = keyof typeof communicationLabels
export type HistoryPerson = { type: 'client' | 'party' | 'employee' | 'external'; id: number | null; name: string }
export type Communication = {
  communication_type: CommunicationType
  direction: 'inbound' | 'outbound' | null
  started_at: string; ended_at: string | null; duration_minutes?: number | null
  subject: string; summary: string; details: string | null; outcome: string | null
  next_action: string | null; next_action_due_at: string | null
  counterparties: HistoryPerson[]; participants: HistoryPerson[]; has_linked_task?: boolean
}
export type HistoryEntry = {
  id: string; record_id: number; kind: 'system' | 'communication'; occurred_at: string
  title: string; summary: string | null; type: CommunicationType | 'system'
  action_type?: string | null
  actor: { id: number; full_name: string } | null
  communication: Communication | null
  changes: Record<string, { before: unknown; after: unknown }>
  legacy_detail?: Record<string, string | null>; legacy: boolean
  linked_task: { id: number; title: string } | null
  permissions: { can_edit: boolean; can_create_task: boolean }
  created_at?: string; updated_at?: string
}
export type HistoryPermissions = { can_view_history: boolean; can_add_communication: boolean; can_edit_communication: boolean; can_create_task: boolean }
export type HistoryResponse = {
  entries: HistoryEntry[]; permissions: HistoryPermissions
  counts: { all: number; system: number; communication: number }
  pagination: { current_page: number; per_page: number; last_page: number; total: number; from: number | null; to: number | null }
}
export type HistoryOptions = { people: HistoryPerson[]; permissions: HistoryPermissions }
