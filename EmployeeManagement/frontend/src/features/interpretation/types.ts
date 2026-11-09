export type InterpretationStatus = 'pending' | 'arranging' | 'confirmed' | 'completed' | 'cancelled'
export type InterpretationCapabilities = { can_create: boolean; can_update: boolean; can_assign: boolean; can_transition: boolean; can_cancel: boolean; can_view_costs: boolean }
export type Interpreter = { id: number; name: string; kind: 'employee' | 'external'; is_active: boolean }
export type InterpretationItem = {
  id: number; case_file_id: number; language: string; work_type: string; mode: string; content: string
  starts_at: string; ends_at: string; location: string | null; notes: string | null
  status: InterpretationStatus; cancellation_reason: string | null; revision: number
  interpreter: Interpreter | null; updated_at: string | null
}
export type InterpretationResponse = {
  items: InterpretationItem[]; statistics: Record<InterpretationStatus, number>
  capabilities: InterpretationCapabilities; pagination: { page: number; last_page: number; total: number }
}
export type InterpretationOptions = { interpreters: Interpreter[]; employees: { id: number; name: string }[] }
export type InterpretationPayload = {
  language: string; work_type: string; mode: string; content: string; starts_at: string; ends_at: string
  location: string | null; notes: string | null; request_key?: string; revision?: number; interpreter_id?: number | null
}
export type InterpretationEvent = { id: number; title: string; occurred_at: string; actor_user_id: number | null; actor_name?: string | null; before: Record<string, unknown>; after: Record<string, unknown> }
export type InterpretationHistory = { events: InterpretationEvent[]; pagination: { page: number; last_page: number } }
