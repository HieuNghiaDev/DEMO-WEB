// Isolated transport fixtures. Never imported by src/ or sent to the working database.
import type { CollectionDetail, CollectionItem, InitializationPreview } from '../../src/features/document-collection/types'

export const previewFixture: InitializationPreview = {
  case: { id: 9001, case_type: { id: 10, name: '労災' } },
  initialization: { available: true, candidate_count: 3, existing_generated_count: 3, missing_candidate_count: 0, skipped_candidate_count: 3, manual_item_count: 0, total_existing_collection_items: 3, legacy_item_count: 0, soft_deleted_generated_count: 0 },
  purposes: [{ code: 'W1', name_ja: '事故・業務との関係', candidate_count: 2 }, { code: 'W3', name_ja: '損害の確認', candidate_count: 2 }], warnings: [],
}
export const detailFixture: CollectionDetail = {
  id: 201, title: '診断書 / 大阪病院', document_type: { id: 3, code: 'D-003', name_ja: '診断書', description: null },
  purposes: [{ id: 3, code: 'W3', name_ja: '損害の確認' }, { id: 1, code: 'W1', name_ja: '事故・業務との関係' }],
  rule: { version_snapshot: 1, source_snapshot: 'test-rule-source', applicability_condition_snapshot: '負傷状況を確認する場合。必要性は担当者が判断。' },
  necessity: { status: 'required', reason: '負傷状況の確認', decided_by: { id: 1, display_name: '試験担当者' }, decided_at: '2026-08-31T01:00:00Z' },
  collection: { target_person: '試験対象者', source: '大阪病院', method: '本人から回収', target_period_from: '2026-01-01', target_period_to: '2026-03-31', target_scope: '受診記録', status: 'received', result: null, requested_at: null, response_deadline: '2026-08-01T01:00:00Z', priority: 'high', preservation_priority: false, preservation_reason: null },
  fulfillment_status: 'insufficient', review_status: 'unreviewed', assigned_employee: { id: 1, display_name: '試験担当者' }, is_template_generated: true,
  received_document_count: 1,
  received_documents: [{ id: 1, title: '診断書（試験用）', original_filename: 'fixture.pdf', storage_type: 'external_link', external_url: 'https://example.test/document', version: 2, received_at: '2026-08-30T01:00:00Z', original_or_copy: 'copy', return_required: false, returned_at: null, registered_by_employee: { id: 1, display_name: '試験担当者' }, notes: '試験用メタデータ', relationship_type: 'primary' }],
  created_at: '2026-08-31T01:00:00Z', updated_at: '2026-08-31T01:00:00Z',
}
export function fixtureDetails(): CollectionDetail[] {
  const first = structuredClone(detailFixture)
  const second = structuredClone(detailFixture)
  second.id = 202; second.title = '診断書 / 京都病院'; second.collection.source = '京都病院'; second.collection.status = 'closed'; second.collection.result = 'not_exist'; second.received_documents = []; second.received_document_count = 0
  const third = structuredClone(detailFixture)
  third.id = 203; third.title = '映像記録'; third.document_type = { id: 4, code: 'W-210', name_ja: '映像記録', description: null }; third.necessity = { status: 'undetermined', reason: null, decided_by: null, decided_at: null }; third.collection.status = 'requested'; third.collection.preservation_priority = true; third.collection.preservation_reason = '保存期限の確認'; third.collection.priority = 'normal'; third.received_documents = []; third.received_document_count = 0
  return [first, second, third]
}
export function fixtureListItem(detail: CollectionDetail): CollectionItem {
  return { id: detail.id, title: detail.title, document_type: detail.document_type, purposes: detail.purposes, target_person: detail.collection.target_person, collection_source: detail.collection.source, collection_method: detail.collection.method, target_period_from: detail.collection.target_period_from, target_period_to: detail.collection.target_period_to, target_scope: detail.collection.target_scope, necessity_status: detail.necessity.status, collection_status: detail.collection.status, collection_result: detail.collection.result, fulfillment_status: detail.fulfillment_status, review_status: detail.review_status, assigned_employee: detail.assigned_employee, requested_at: detail.collection.requested_at, response_deadline: detail.collection.response_deadline, collection_priority: detail.collection.priority, preservation_priority: detail.collection.preservation_priority, preservation_reason: detail.collection.preservation_reason, applicability_condition_snapshot: detail.rule.applicability_condition_snapshot, is_template_generated: detail.is_template_generated, received_document_count: detail.received_document_count, created_at: detail.created_at, updated_at: detail.updated_at }
}
