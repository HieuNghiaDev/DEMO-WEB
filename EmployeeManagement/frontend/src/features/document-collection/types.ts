export type NecessityStatus = 'undetermined' | 'required' | 'not_required'
export type CollectionStatus = 'not_started' | 'preparing' | 'requested' | 'partially_received' | 'received' | 'difficult' | 'closed'
export type FulfillmentStatus = 'undetermined' | 'insufficient' | 'satisfied' | 'satisfied_by_alternative'
export type ReviewStatus = 'unreviewed' | 'reviewing' | 'reviewed' | 'returned'
export type CollectionResult = 'not_exist' | 'not_disclosed' | 'partially_disclosed' | 'custodian_unknown' | 'other'
export type CollectionPriority = 'low' | 'normal' | 'high' | 'critical'
export type EmployeeOption = { id: number; display_name: string }
export type Purpose = { id: number; code: string; name_ja: string }
export type DocumentType = { id: number; code: string; name_ja: string }

export interface CollectionItem {
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
  requested_at: string | null
  response_deadline: string | null
  collection_priority: CollectionPriority
  preservation_priority: boolean
  preservation_reason: string | null
  applicability_condition_snapshot: string | null
  is_template_generated: boolean
  received_document_count: number
  created_at: string | null
  updated_at: string | null
}
export interface ReceivedDocument {
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
  is_template_generated: boolean
  received_document_count: number
  received_documents: ReceivedDocument[]
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
