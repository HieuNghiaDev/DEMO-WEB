import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { AxiosError } from 'axios'
import { detailFixture, previewFixture, fixtureDetails, fixtureListItem } from './fixtures/collectionApiData.ts'
import { changedFields, draftFromDetail, initializationMode, isRequiredDocument, itemToRow, validateDraft, withFilter, toLocalDateTime, fromLocalDateTime, safeExternalUrl } from '../src/features/document-collection/utils.ts'
import { collectionError } from '../src/features/document-collection/errors.ts'
import { statusGroups } from '../src/features/document-collection/labels.ts'

test('preview selects initial, existing/new candidates, no rules, unavailable and deleted/no-op states without generation', () => {
  const preview = structuredClone(previewFixture)
  assert.equal(initializationMode(preview), 'existing')
  preview.initialization.missing_candidate_count = 2
  assert.equal(initializationMode(preview), 'existing')
  preview.initialization.total_existing_collection_items = 0
  assert.equal(initializationMode(preview), 'uninitialized')
  preview.initialization.missing_candidate_count = 0
  assert.equal(initializationMode(preview), 'empty')
  preview.initialization.available = false
  assert.equal(initializationMode(preview), 'unavailable')
})
test('real list adapter preserves each CaseDocument identity, sorted primary purpose, separate source contexts', () => {
  const rows = fixtureDetails().map(item => itemToRow(fixtureListItem(item)))
  assert.deepEqual(rows.map(row => row.id), ['201', '202', '203'])
  assert.equal(rows[0].code, rows[1].code)
  assert.notEqual(rows[0].source, rows[1].source)
  assert.deepEqual(rows[0].purposes.map(p => p.code), ['W1', 'W3'])
  assert.equal(rows.length, 3)
})
test('received, insufficiency, unreviewed, result and necessity stay independent', () => {
  const rows = fixtureDetails().map(item => itemToRow(fixtureListItem(item)))
  assert.equal(rows[0].collection, '受領済み'); assert.equal(rows[0].review, '未確認'); assert.equal(rows[0].fulfillment, '不足あり')
  assert.equal(rows[1].collection, '終了'); assert.equal(rows[1].result, '不存在'); assert.equal(rows[1].necessity, '必要')
  assert.equal(rows[0].preservation, false); assert.equal(rows[2].preservation, true)
})
test('required workspace filters only by necessity and preserves all independent status axes', () => {
  const [received, absent, candidate] = fixtureDetails().map(fixtureListItem)
  const partialDisclosure = { ...received, id: 204, collection_status: 'partially_received', collection_result: 'partially_disclosed', fulfillment_status: 'insufficient', review_status: 'reviewing' }
  const custodianUnknown = { ...received, id: 205, collection_status: 'requested', collection_result: 'custodian_unknown', fulfillment_status: 'undetermined', review_status: 'unreviewed' }
  const difficult = { ...received, id: 206, collection_status: 'difficult', collection_result: null }
  const overdue = { ...received, id: 207, collection_status: 'requested', collection_result: null, response_deadline: '2026-08-25T00:00:00.000Z' }
  const decidedRequired = { ...candidate, id: candidate.id + 10, necessity_status: 'required', collection_status: 'not_started' }
  const decidedNotRequired = { ...candidate, id: candidate.id + 11, necessity_status: 'not_required', collection_status: 'not_started' }
  const all = [received, absent, candidate, partialDisclosure, custodianUnknown, difficult, overdue, decidedRequired, decidedNotRequired]
  const required = all.filter(isRequiredDocument)
  assert.deepEqual(required.map(item => item.id), [received.id, absent.id, partialDisclosure.id, custodianUnknown.id, difficult.id, overdue.id, decidedRequired.id])
  assert.equal(required.filter(item => item.id === received.id).length, 1, 'the same CaseDocument is not duplicated')
  assert.equal(required.find(item => item.id === partialDisclosure.id)?.collection_status, 'partially_received')
  assert.equal(required.find(item => item.id === partialDisclosure.id)?.collection_result, 'partially_disclosed')
  assert.equal(required.find(item => item.id === partialDisclosure.id)?.review_status, 'reviewing')
  assert.equal(required.find(item => item.id === partialDisclosure.id)?.fulfillment_status, 'insufficient')
  assert.equal(required.includes(candidate), false)
  assert.equal(required.some(item => item.id === decidedNotRequired.id), false)
})
test('overdue marker follows server collection semantics including not_required, never mock review date', () => {
  const item = fixtureListItem(detailFixture)
  item.necessity_status = 'not_required'; item.collection_status = 'requested'
  assert.equal(itemToRow(item, Date.parse('2026-09-01')).overdue, true)
  for (const status of ['received', 'closed']) { item.collection_status = status; assert.equal(itemToRow(item).overdue, false) }
  item.response_deadline = null; assert.equal(itemToRow(item).overdue, false)
})
test('nulls are represented honestly', () => {
  const item = fixtureListItem(detailFixture)
  Object.assign(item, { document_type: null, assigned_employee: null, response_deadline: null, target_period_from: null, target_period_to: null, target_scope: null })
  const row = itemToRow(item)
  assert.equal(row.title, item.title); assert.equal(row.code, '—'); assert.equal(row.deadline, '—'); assert.equal(row.period, null)
})
test('PATCH is an explicit allowlist and changes only, never snapshots, actor/time, file or master fields', () => {
  const draft = draftFromDetail(detailFixture)
  assert.deepEqual(changedFields(detailFixture, draft), {})
  draft.collection_source = '別の病院'
  Object.assign(draft, { rule: {}, purposes: [], necessity_decided_at: 'bad', received_documents: [], title: 'bad', case_file_id: 1 })
  assert.deepEqual(changedFields(detailFixture, draft), { collection_source: '別の病院' })
})
test('all 18 writable fields are available independently', () => {
  const draft = draftFromDetail(detailFixture)
  assert.equal(Object.keys(draft).length, 18)
  for (const [field, value] of Object.entries(draft)) {
    const change = typeof value === 'boolean' ? !value : typeof value === 'number' ? value + 1 : value === null ? 'test' : null
    assert.deepEqual(changedFields(detailFixture, { ...draft, [field]: change }), { [field]: change })
  }
})
test('not_required reason validates only necessity edits; required does not invent a reason requirement', () => {
  const draft = draftFromDetail(detailFixture)
  Object.assign(draft, { necessity_status: 'not_required', necessity_reason: '  ' })
  assert.ok(validateDraft(detailFixture, draft).necessity_reason)
  draft.necessity_reason = '対象外'; assert.deepEqual(validateDraft(detailFixture, draft), {})
  draft.necessity_status = 'required'; draft.necessity_reason = null; assert.deepEqual(validateDraft(detailFixture, draft), {})
  const old = structuredClone(detailFixture); old.necessity.status = 'not_required'; old.necessity.reason = null
  assert.deepEqual(validateDraft(old, { ...draftFromDetail(old), collection_method: '郵送' }), {})
})
test('period validates effective stored other endpoint; neither field receives a fake date', () => {
  const draft = draftFromDetail(detailFixture); draft.target_period_to = '2025-12-01'
  assert.ok(validateDraft(detailFixture, draft).target_period_to)
  draft.target_period_from = null; assert.deepEqual(validateDraft(detailFixture, draft), {})
})
test('filters reset page and keep axes distinct, false and empty result query are preserved', () => {
  const params = withFilter({ page: 4, per_page: 25, necessity_status: 'required' }, { collection_status: 'received', review_status: 'unreviewed', preservation_priority: false, collection_result: '' })
  assert.equal(params.page, 1); assert.equal(params.necessity_status, 'required'); assert.equal(params.collection_result, ''); assert.equal(params.preservation_priority, false)
  assert.equal(new Set(statusGroups.map(group => group.field)).size, 5)
})
test('datetime local roundtrip preserves instant, empties do not acquire dates', () => {
  const instant = '2026-08-31T03:42:00.000Z'
  assert.equal(fromLocalDateTime(toLocalDateTime(instant)), instant)
  assert.equal(fromLocalDateTime(''), null); assert.equal(toLocalDateTime(null), '')
})
test('received URLs allow http(s) only and never invent upload paths', () => {
  for (const value of [null, '/storage/file', 'javascript:alert(1)', 'data:text/html,hello', 'https://user:pass@example.test']) assert.equal(safeExternalUrl(value), null)
  assert.equal(safeExternalUrl('https://example.test/document'), 'https://example.test/document')
})
for (const [status, text] of [[401, 'ログイン'], [403, '権限'], [404, '見つかりません'], [422, '入力内容'], [500, '接続']]) {
  test(`HTTP ${status} provides safe actionable feedback, not a raw response`, () => {
    const error = new AxiosError('private stack', undefined, undefined, undefined, { status, data: { message: 'private stack', errors: { collection_source: ['取得先を確認してください。'] } } })
    const result = collectionError(error)
    assert.ok(result.message.includes(text)); assert.ok(!result.message.includes('private stack'))
    if (status === 422) assert.equal(result.fields.collection_source, '取得先を確認してください。')
  })
}
test('network failure is retryable', () => assert.equal(collectionError(new Error('network')).retryable, true))
test('production dependency boundary has no mock business fixtures or API mutations outside collection', () => {
  const root = new URL('../src/features/document-collection/', import.meta.url)
  for (const file of readdirSync(root, { recursive: true }).filter(file => /\.(ts|tsx)$/.test(file))) {
    const code = readFileSync(new URL(file.replaceAll('\\', '/'), root), 'utf8')
    assert.doesNotMatch(code, /from ['"].*(mockData|officialCandidates|document-collection-mockup|tests\/fixtures)/)
    assert.doesNotMatch(code, /api\.(delete|put)\(/)
  }
})
