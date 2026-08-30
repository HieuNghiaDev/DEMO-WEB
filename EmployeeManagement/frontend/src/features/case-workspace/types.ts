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
  title: string
  description: string | null
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  priority: 'low' | 'normal' | 'high' | 'critical'
  due_at: string | null
  completed_at: string | null
  assigned_employee: { id: number; full_name: string } | null
}

export type CaseActivity = {
  id: number
  activity_type: 'communication' | 'event' | 'note' | 'submission' | 'medical' | 'incident'
  channel: 'meeting' | 'phone' | 'email' | 'line' | 'internal' | 'other' | null
  title: string
  content: string | null
  occurred_at: string
  created_by_employee: { full_name: string } | null
}

export type CaseWorkspace = Omit<CaseDetail, 'documents'> & {
  reference_number?: string | null
  priority?: 'low' | 'normal' | 'high' | 'critical'
  summary?: string | null
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

export type WorkspaceResponse = { case_file: CaseWorkspace; summary: WorkspaceSummary }
export type WorkspaceTab = 'overview' | 'documents' | 'tasks' | 'deadlines' | 'parties' | 'timeline'
