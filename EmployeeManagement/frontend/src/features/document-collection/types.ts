export type NecessityStatus = 'undetermined' | 'required' | 'not_required'
export type CollectionStatus = 'not_started' | 'preparing' | 'requested' | 'partially_received' | 'received' | 'difficult' | 'closed'
export type FulfillmentStatus = 'undetermined' | 'insufficient' | 'satisfied' | 'satisfied_by_alternative'
export type ReviewStatus = 'unreviewed' | 'reviewing' | 'reviewed' | 'returned'
export type CollectionResult = 'not_exist' | 'not_disclosed' | 'partially_disclosed' | 'custodian_unknown' | 'other'
export type CollectionPriority = 'low' | 'normal' | 'high' | 'critical'
export type EmployeeOption = { id: number; display_name: string }
export type Purpose = { id: number; code: string; name_ja: string }
export type DocumentHandlingType = 'office_generated' | 'collected' | 'official_form' | 'reference_only'
export type DocumentType = {
  id: number
  code: string
  name_ja: string
  description?: string | null
  handling_type?: DocumentHandlingType | null
  creation_supported: boolean
  capabilities?: {
    generation_supported: boolean
    collection_only: boolean
    official_form: boolean
    reference_only: boolean
    source_available: boolean
  }
}
export type ActiveCaseTask = {
  id: number
  status: 'unaccepted' | 'in_progress' | 'pending_review' | 'changes_requested' | 'completed' | 'cancelled'
  status_label: string
  priority: CollectionPriority
  due_at: string | null
  is_overdue: boolean
  allowed_actions: {
    can_accept: boolean
    can_submit: boolean
    can_reassign: boolean
    can_change_deadline: boolean
    can_approve: boolean
    can_reject: boolean
    can_cancel: boolean
  }
  assigned_employee: EmployeeOption | null
}
export type TaskSubmission = {
  received_document_id?: number | null
  storage_provider?: string
  review_reason?: string | null
  review_detail?: string | null
  id: number
  version: number
  source_type: 'manual_upload' | 'auto_generated'
  review_status: 'pending_review' | 'approved' | 'rejected'
  filename: string
  mime_type: string
  url: string | null
  submitted_at: string | null
  submitted_by: { id: number; name: string } | null
  reviewed_at: string | null
  reviewed_by: { id: number; name: string } | null
  review_note: string | null
}
export type RequiredDocumentWorkflowState = {
  code: 'selected' | 'unaccepted' | 'in_progress' | 'pending_review' | 'changes_requested' | 'completed'
  label: string
}
export type DocumentActionCapabilities = {
  legal_approval_pending?: boolean
  can_upload: boolean; can_change_assignee: boolean; can_change_deadline: boolean
  can_review: boolean; can_return: boolean; can_edit: boolean
}
export type FileReview = {
  task_id?: number | null; filename?: string; mime_type?: string | null; uploaded_at?: string | null
  source: 'received' | 'task_submission'; id: number; version: number
  status: 'pending_review' | 'approved' | 'rejected' | null
  reason: string | null; detail: string | null
  reviewed_by: { id: number; name: string } | null; reviewed_at: string | null
  returned_by: { id: number; name: string } | null; returned_at: string | null; confirmed_at: string | null
}
export type GeneratedDocumentVersion = {
  id: number
  version: number
  workflow_status: string
  created_at: string | null
  updated_at: string | null
  created_by: { id: number; name: string } | null
  approved_by: { id: number; name: string } | null
  artifacts: Array<{
    id: number
    artifact_type: string
    filename: string
    mime_type: string | null
    url: string | null
    uploaded_at: string | null
    uploaded_by: { id: number; name: string } | null
  }>
}
export type C001WorkflowStatus = 'missing' | 'draft' | 'pending_approval' | 'complete' | 'rejected'
export type C001Artifact = {
  external_file_id: string
  url: string
  filename: string
  generated_at: string | null
  last_synced_at: string | null
  generated_by: string | null
}
export type C001FileArtifact = Pick<C001Artifact, 'external_file_id' | 'url' | 'filename'>
export type C001State = {
  status: C001WorkflowStatus
  client_name?: string | null
  client_address?: string | null
  success_fee_percentage: string
  master_template_name?: string | null
  master_read_only?: boolean
  mapped_fields?: string[]
  latest_version?: number | null
  next_version?: number | null
  working_version?: number | null
  artifact: C001Artifact | null
  pdf_artifact?: C001FileArtifact | null
  workbook_artifact?: C001FileArtifact | null
  approved_at?: string | null
  approved_by?: { id: number; name: string } | null
  rejection_reason?: string | null
  rejected_at?: string | null
  rejected_by?: { id: number; name: string } | null
  can_approve?: boolean
  draft_updated_at?: string | null
  draft_updated_by?: { id: number; name: string } | null
}

export interface CollectionItem {
  capabilities?: DocumentActionCapabilities
  file_review?: FileReview | null
  id: number
  title: string
  document_type: DocumentType | null
  purposes: Purpose[]
  target_person: string | null
  collection_source: string | null
  collection_method: string | null
  target_period_from: string | null
  target_period_to: string | null
  target_scope: string | null
  necessity_status: NecessityStatus
  collection_status: CollectionStatus
  collection_result: CollectionResult | null
  fulfillment_status: FulfillmentStatus
  review_status: ReviewStatus
  assigned_employee: EmployeeOption | null
  active_task: ActiveCaseTask | null
  workflow_state: RequiredDocumentWorkflowState
  latest_task_submission: TaskSubmission | null
  requested_at: string | null
  response_deadline: string | null
  collection_priority: CollectionPriority
  preservation_priority: boolean
  preservation_reason: string | null
  applicability_condition_snapshot: string | null
  is_template_generated: boolean
  received_document_count: number
  generated_versions: GeneratedDocumentVersion[]
  c001: C001State | null
  created_at: string | null
  updated_at: string | null
}
export interface ReceivedDocument {
  review_status?: 'pending_review' | 'approved' | 'rejected' | null
  review_reason?: string | null
  review_detail?: string | null
  reviewed_at?: string | null
  id: number
  title: string
  original_filename: string | null
  storage_type: 'upload' | 'google_drive' | 'external_link'
  external_url: string | null
  version: number
  received_at: string | null
  original_or_copy: 'original' | 'copy' | null
  return_required: boolean
  returned_at: string | null
  registered_by_employee: EmployeeOption | null
  notes: string | null
  relationship_type: string
}
export interface CollectionDetail {
  capabilities?: DocumentActionCapabilities
  file_review?: FileReview | null
  task_submissions?: TaskSubmission[]
  id: number
  title: string
  document_type: (DocumentType & { description: string | null }) | null
  purposes: Purpose[]
  rule: { version_snapshot: number | null; source_snapshot: string | null; applicability_condition_snapshot: string | null }
  necessity: { status: NecessityStatus; reason: string | null; decided_by: EmployeeOption | null; decided_at: string | null }
  collection: {
    target_person: string | null; source: string | null; method: string | null
    target_period_from: string | null; target_period_to: string | null; target_scope: string | null
    status: CollectionStatus; result: CollectionResult | null
    requested_at: string | null; response_deadline: string | null
    priority: CollectionPriority; preservation_priority: boolean; preservation_reason: string | null
  }
  fulfillment_status: FulfillmentStatus
  review_status: ReviewStatus
  assigned_employee: EmployeeOption | null
  active_task: ActiveCaseTask | null
  workflow_state: RequiredDocumentWorkflowState
  latest_task_submission: TaskSubmission | null
  is_template_generated: boolean
  received_document_count: number
  received_documents: ReceivedDocument[]
  generated_versions: GeneratedDocumentVersion[]
  c001: C001State | null
  created_at: string | null
  updated_at: string | null
}
export interface CollectionDraft {
  target_person: string | null; collection_source: string | null; collection_method: string | null
  target_period_from: string | null; target_period_to: string | null; target_scope: string | null
  assigned_employee_id: number | null; requested_at: string | null; response_deadline: string | null
  collection_priority: CollectionPriority; preservation_priority: boolean; preservation_reason: string | null
  necessity_status: NecessityStatus; necessity_reason: string | null; collection_status: CollectionStatus
  collection_result: CollectionResult | null; fulfillment_status: FulfillmentStatus; review_status: ReviewStatus
}
export type CollectionPatch = Partial<CollectionDraft>
export type BulkNecessityPayload = {
  case_document_ids: number[]
  necessity_status: NecessityStatus
  necessity_reason?: string | null
}
export type BulkNecessityResponse = {
  updated_count: number
  selected_count: number
  necessity_status: NecessityStatus
}
export interface CollectionQuery {
  search?: string; purpose?: string; source?: string; assignee_id?: number
  necessity_status?: NecessityStatus; collection_status?: CollectionStatus; collection_result?: CollectionResult | ''
  fulfillment_status?: FulfillmentStatus; review_status?: ReviewStatus
  overdue?: boolean; preservation_priority?: boolean; priority?: CollectionPriority
  deadline_from?: string; deadline_to?: string
  sort?: 'document_code' | 'document_name' | 'deadline' | 'assignee' | 'priority' | 'updated_at'
  direction?: 'asc' | 'desc'; page?: number; per_page?: number
}
export interface CollectionListResponse {
  documents: CollectionItem[]
  pagination: { current_page: number; per_page: number; last_page: number; total: number; from: number | null; to: number | null }
  summary: { total: number; necessity: Record<NecessityStatus, number>; overdue: number; preservation_priority: number; collection_result_count: number; filtered_count: number }
}
export interface InitializationPreview {
  case: { id: number; case_type: { id: number; name: string } | null }
  initialization: {
    available: boolean; candidate_count: number; existing_generated_count: number; missing_candidate_count: number
    skipped_candidate_count: number; manual_item_count: number; total_existing_collection_items: number
    legacy_item_count: number; soft_deleted_generated_count: number
  }
  purposes: Array<{ code: string; name_ja: string; candidate_count: number }>
  warnings: Array<{ code: string; message: string }>
}
export interface InitializationResponse {
  initialization: { created_count: number; skipped_count: number; candidate_count: number; created_case_document_ids: number[]; total_collection_items: number }
}
