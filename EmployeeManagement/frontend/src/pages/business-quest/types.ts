export type CaseStatus =
  | 'received'
  | 'reviewing'
  | 'in_progress'
  | 'waiting'
  | 'waiting_payment'
  | 'completed'

export type ApiCaseStatus =
  | 'intake'
  | 'active'
  | 'waiting_documents'
  | 'reviewing'
  | 'waiting_payment'
  | 'on_hold'
  | 'closed'

export type BusinessCase = {
  id: number
  code: string
  title: string
  customerName: string
  customerKana: string
  caseType: string
  assignee: string
  assignedEmployeeId: number | null
  role: string
  status: CaseStatus
  memo: string
  documentsDone: number
  documentsTotal: number
  updatedAt: string
  rawUpdatedAt: string
}

export type CaseDocument = {
  id: number
  title: string
  category: string
  version: string
  status: 'draft' | 'submitted' | 'confirmed' | string
  file_url: string | null
  note?: string | null
  updated_at?: string
  created_by_employee?: { full_name: string } | null
}

export type CasePrecedent = {
  id: number
  title: string
  citation: string | null
  summary: string | null
  relevance: string | null
  source_url?: string | null
  created_at?: string
  updated_at?: string
}

export type InteractionType = 'meeting' | 'phone' | 'email' | 'internal_note'

export type CaseMeetingLog = {
  id: number
  meeting_date: string
  interaction_type?: InteractionType | null
  attendees: string | null
  content: string
  next_action: string | null
  next_action_due_at?: string | null
  status: 'draft' | 'confirmed' | string
  created_at?: string
  updated_at?: string
}

export type CaseCustomSection = {
  id: number
  title: string
  content: string | null
  sort_order: number
  created_at?: string
  updated_at?: string
}

export type ApiCaseFile = {
  id: number
  title: string
  case_type: string | null
  case_type_id?: number | null
  case_type_other?: string | null
  status: ApiCaseStatus
  created_at?: string
  updated_at: string
  documents_count: number
  confirmed_documents_count: number
  client: ClientProfile
  assigned_employee: { id: number; full_name: string; position_title: string | null } | null
  created_by_employee?: { full_name: string } | null
}

export type ClientProfile = {
  id: number
  name: string
  name_kana: string | null
  client_type: 'individual' | 'corporate' | null
  phone: string | null
  email: string | null
  address: string | null
  nationality: string | null
}

export type CaseDetail = ApiCaseFile & {
  documents: CaseDocument[]
  precedents: CasePrecedent[]
  meeting_logs: CaseMeetingLog[]
  custom_sections: CaseCustomSection[]
}

export type CaseQuickFilter = 'all' | 'in_progress' | 'waiting' | 'reviewing' | 'documents_complete'
export type DetailTab = 'documents' | 'precedents' | 'meetings'
