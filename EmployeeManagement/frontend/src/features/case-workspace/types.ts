import type { CaseDetail } from '../../pages/business-quest/types'

export type DocumentStatus = 'not_requested' | 'requested' | 'waiting' | 'received' | 'reviewing' | 'deficient' | 'resubmission_requested' | 'confirmed' | 'submitted' | 'not_required' | 'draft'
export type RequirementLevel = 'required' | 'conditional' | 'optional'

export type WorkspaceDocument = CaseDetail['documents'][number] & {
  requirement_level: RequirementLevel
  due_at: string | null
  received_at: string | null
  expires_at: string | null
  is_template_generated: boolean
  status: DocumentStatus
}

export type CaseParty = {
  id: number
  party_type: 'client' | 'family' | 'employer' | 'opponent' | 'insurer' | 'medical' | 'supporter' | 'other'
  name: string
  organization: string | null
  relationship: string | null
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  entity_type?: EntityKind | 'insurance_company' | null
  relation_type?: EntityRelationType | null
  relation_status?: 'current' | 'past' | 'active' | 'inactive' | 'unknown' | null
  contact_person?: string | null
  reference_number?: string | null
  start_date?: string | null
  end_date?: string | null
  is_current?: boolean | null
  metadata?: Record<string, unknown> | null
  sort_order?: number
  updated_at?: string
}

export type CaseDeadline = {
  id: number
  deadline_type: 'residence' | 'submission' | 'additional' | 'limitation' | 'document' | 'internal' | 'other'
  title: string
  due_at: string
  status: 'open' | 'completed' | 'cancelled'
  priority: 'low' | 'normal' | 'high' | 'critical'
  notes: string | null
}

export type CaseTask = {
  id: number
  created_at?: string | null
  updated_at?: string | null
  case_document_id: number | null
  title: string
  description: string | null
  status: 'unaccepted' | 'in_progress' | 'pending_review' | 'changes_requested' | 'completed' | 'cancelled'
  status_label: string
  priority: 'low' | 'normal' | 'high' | 'critical'
  due_at: string | null
  accepted_at: string | null
  completed_at: string | null
  is_overdue: boolean
  allowed_actions: {
    legal_approval_pending?: boolean
    can_accept: boolean
    can_submit: boolean
    can_reassign: boolean
    can_change_deadline: boolean
    can_approve: boolean
    can_reject: boolean
    can_cancel: boolean
  }
  assigned_employee: { id: number; full_name: string; avatar_path?: string | null } | null
  case_document: {
    id: number
    title: string
    document_type: { id: number; code: string; name_ja: string; handling_type?: string | null } | null
  } | null
  latest_submission: CaseTaskSubmission | null
  submissions: CaseTaskSubmission[]
}

export type CaseTaskSubmission = {
  received_document_id?: number | null
  storage_provider?: string
  review_reason?: string | null
  review_detail?: string | null
  id: number
  case_task_id?: number
  case_document_id?: number
  version: number
  source_type: 'manual_upload' | 'auto_generated'
  review_status: 'pending_review' | 'approved' | 'rejected'
  external_url: string
  filename: string
  mime_type: string
  submitted_at: string
  reviewed_at: string | null
  review_note: string | null
  submitted_by: { id: number; name: string | null } | null
  reviewed_by: { id: number; name: string | null } | null
}

export type CaseTaskEmployeeOption = {
  id: number
  full_name: string
  avatar_path: string | null
  office_id: number | null
}

export type CaseTaskRequirementOption = {
  id: number
  has_existing_task: boolean
  title: string
  category: string | null
  document_type: { id: number; code: string; name_ja: string } | null
  case_tasks: Array<Pick<CaseTask, 'id' | 'status' | 'due_at'> & {
    assigned_employee: { id: number; full_name: string } | null
  }>
}

export type CaseTaskOptionsResponse = {
  required_documents: CaseTaskRequirementOption[]
  employees: CaseTaskEmployeeOption[]
}

export type CreateCaseTaskBatchItem = {
  case_document_id: number
  assigned_employee_id: number
  due_date: string
  priority?: CaseTask['priority']
  note?: string | null
}

export type CaseActivity = {
  id: number
  activity_type: 'communication' | 'event' | 'note' | 'submission' | 'medical' | 'incident'
  channel: 'meeting' | 'phone' | 'email' | 'line' | 'internal' | 'other' | null
  title: string
  content: string | null
  occurred_at: string
  created_by_employee: { full_name: string } | null
  metadata?: { event?: string; document_id?: number; task_id?: number; case_task_id?: number; case_document_id?: number; changes?: Record<string, { before: unknown; after: unknown }> } | null
}

export type CaseWorkspace = Omit<CaseDetail, 'documents'> & {
  reference_number?: string | null
  priority?: 'low' | 'normal' | 'high' | 'critical'
  summary?: string | null
  incident_summary?: string | null
  occurred_at?: string | null
  injury_details?: string | null
  incident_location?: string | null
  current_status_memo?: string | null
  opened_at?: string | null
  target_completion_at?: string | null
  documents: WorkspaceDocument[]
  parties: CaseParty[]
  deadlines: CaseDeadline[]
  case_tasks: CaseTask[]
  activities: CaseActivity[]
  case_type_option?: { id: number; name: string; parent?: { id: number; name: string } | null } | null
}

export type WorkspaceSummary = {
  progress_percent: number
  missing_documents: number
  documents_total: number
  next_deadline: string | null
  open_tasks: number
}

export type WorkspaceResponse = { case_file: CaseWorkspace; summary: WorkspaceSummary; can_decide_document_necessity?: boolean }
export type WorkspaceTab = 'overview' | 'collection' | 'documents' | 'tasks' | 'interpretation' | 'deadlines' | 'parties' | 'timeline'

export type EntityKind = 'company' | 'organization' | 'person' | 'insurer' | 'police' | 'other'

export type EntityRelationType =
  | 'current_employer'
  | 'former_employer'
  | 'dispatch_company'
  | 'dispatch_destination'
  | 'training_company'
  | 'supervising_organization'
  | 'sending_organization'
  | 'support_organization'
  | 'accident_opponent'
  | 'opponent_company'
  | 'own_insurer'
  | 'opponent_insurer'
  | 'police'
  | 'family'
  | 'medical'
  | 'supporter'
  | 'other'

export type EntityBadgeTone = 'emerald' | 'slate' | 'blue' | 'violet' | 'cyan' | 'amber' | 'red'

export type RelatedEntity = {
  id: string | number
  kind: EntityKind
  relationType: EntityRelationType
  relationRoleLabel: string
  statusBadgeLabel?: string
  statusBadgeTone?: EntityBadgeTone
  name: string
  organizationName?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  contactPerson?: string | null
  relationshipDetail?: string | null
  insuranceSide?: 'own' | 'opponent' | 'other' | null
  policyNumber?: string | null
  claimNumber?: string | null
  department?: string | null
  referenceNumber?: string | null
  driverName?: string | null
  vehicleInfo?: string | null
  vehicleNumber?: string | null
  accidentRelationship?: string | null
  metadata?: Record<string, unknown> | null
  industry?: string | null
  employeeCount?: string | null
  notes?: string | null
  startDate?: string | null
  endDate?: string | null
  isCurrent?: boolean
  originalEmploymentId?: number
  originalPartyId?: number
  updatedAt?: string | null
}
