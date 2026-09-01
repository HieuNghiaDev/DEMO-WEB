import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { caseDraft, casePayload, caseTypeOptions, dateValue, filterCases, generatedCaseTitle, newClientDraft, newDraft, validateCase, validateClient } from '../src/features/case-management/helpers.ts'
import { mapCaseFile } from '../src/pages/business-quest/helpers.ts'

const types = [{ id: 5, name: '労災', children: [{ id: 51, name: '障害（補償）給付', parent_id: 5 }] }, { id: 9, name: 'その他' }]
const valid = () => ({ ...newDraft(), client_id: '7', title: '相談案件', case_type_id: '51' })
test('case type selector uses real parent/child paths and preserves canonical parent selection', () => {
  const options = caseTypeOptions([...types, types[0].children[0]])
  assert.equal(options.length, 3)
  assert.equal(options.find(item => item.id === 51).label, '労災 / 障害（補償）給付')
  assert.equal(options.find(item => item.id === 5).label, '労災')
})
test('existing client payload references only client_id and creates no nested client copy', () => {
  const payload = casePayload(valid(), true)
  assert.equal(payload.client_id, 7)
  assert.equal(payload.case_type_id, 51)
  assert.equal(payload.title, '相談案件')
  assert.equal('client' in payload, false)
  assert.deepEqual(Object.keys(payload).sort(), ['client_id','title','case_type_id','case_type_other','status','priority','summary','opened_at','target_completion_at','department_id','assigned_employee_id'].sort())
})
test('new client draft uses only Controller-supported optional fields and keeps kana manual', () => {
  const client = { ...newClientDraft(), name: 'Le Hieu Nghia', name_kana: 'レ・ヒエウ・ギア', phone: '090-0000-0000', email: 'test@example.test', address: '東京都', nationality: 'VN', notes: '通訳が必要' }
  assert.deepEqual(validateClient(client), {})
  assert.equal(newClientDraft().name_kana, '')
  assert.deepEqual(Object.keys(validateClient(newClientDraft())), ['name'])
  assert.ok(validateClient({ ...client, email: 'bad', phone: '0'.repeat(31) }).email)
  assert.ok(validateClient({ ...client, phone: '0'.repeat(31) }).phone)
})
test('only case identity plus generated title required; parent types and empty optional fields are valid', () => {
  assert.deepEqual(Object.keys(validateCase(newDraft(), types)).sort(), ['case_type_id','client_id','title'])
  const draft = valid(); draft.case_type_id = '9'
  assert.ok(validateCase(draft, types).case_type_other)
  draft.case_type_other = '相談'; assert.deepEqual(validateCase(draft, types), {})
  draft.case_type_id = '5'; draft.case_type_other = ''; assert.deepEqual(validateCase(draft, types), {})
})

test('generated titles use current client and selected subtype or parent with no conclusions', () => {
  assert.equal(generatedCaseTitle(' NGUYEN VAN A ', '障害（補償）給付'), 'NGUYEN VAN A / 障害（補償）給付')
  assert.equal(generatedCaseTitle('山田', '労災'), '山田 / 労災')
  assert.equal(generatedCaseTitle('田中', '交通事故'), '田中 / 交通事故')
  assert.equal(generatedCaseTitle('', '労災'), '')
  const title = generatedCaseTitle('𠮷'.repeat(255), '障害（補償）給付')
  assert.equal(Array.from(title).length, 255)
  assert.ok(title.endsWith(' / 障害（補償）給付'))
  assert.deepEqual(validateCase({ ...valid(), title }, types), {})
})
test('edit loads current values without timezone-shifting dates and retains explicit nulls', () => {
  const draft = caseDraft({ id: 1, client: { id: 7 }, title: '既存案件', case_type_id: 51, status: 'on_hold', summary: '概要', priority: 'high', assigned_employee: { id: 8 }, department_id: 3, opened_at: '2026-08-31T00:00:00.000000Z', target_completion_at: '2026-09-30T00:00:00.000000Z' })
  assert.equal(draft.opened_at, '2026-08-31'); assert.equal(draft.target_completion_at, '2026-09-30')
  assert.equal(draft.assigned_employee_id, '8'); assert.equal(draft.department_id, '3')
  draft.opened_at = '2026-09-01'; draft.target_completion_at = ''
  const payload = casePayload(draft, false)
  assert.equal(payload.opened_at, '2026-09-01'); assert.equal(payload.target_completion_at, null)
  assert.equal(payload.status, 'on_hold'); assert.equal('assigned_employee_id' in payload, false)
  assert.equal(payload.summary, '概要'); assert.equal(payload.priority, 'high')
  assert.equal(dateValue(null), '')
})
test('list search and real existing filters compose without document necessity inference', () => {
  const rows = [{ id: 1, customerName: '山田', customerKana: 'ヤマダ', code: 'CASE-000001', title: '労災相談', caseType: '労災', assignee: '佐藤', status: 'in_progress', documentsTotal: 0, documentsDone: 0 }, { id: 2, customerName: 'NGUYEN', customerKana: '', code: 'CASE-000002', title: '交通相談', caseType: '交通事故', assignee: '田中', status: 'waiting', documentsTotal: 3, documentsDone: 3 }]
  assert.equal(filterCases(rows, 'ヤマダ', 'all', 'all', 'all')[0].id, 1)
  assert.equal(filterCases(rows, '佐藤', 'in_progress', '労災', 'all').length, 1)
  assert.equal(filterCases(rows, 'CASE-000002', 'waiting', '交通事故', 'documents_complete')[0].id, 2)
  assert.equal(filterCases(rows, '', 'all', 'all', 'documents_complete').length, 1)
  assert.equal(filterCases(rows, 'missing', 'all', 'all', 'all').length, 0)
})
test('list shows API hierarchy without losing Other detail or fallback names', () => {
  const item = { id: 1, title: '相談', client: { name: '山田' }, case_type: '障害（補償）給付', status: 'intake', updated_at: '2026-08-31T01:00:00Z' }
  assert.equal(mapCaseFile(item, '労災 / 障害（補償）給付').caseType, '労災 / 障害（補償）給付')
  assert.equal(mapCaseFile(item).caseType, '障害（補償）給付')
  assert.equal(mapCaseFile({ ...item, case_type: 'その他', case_type_other: '契約相談' }, 'その他').caseType, 'その他：契約相談')
  assert.equal(mapCaseFile(item).documentsTotal, 0)
})
test('new-case review code contains no checklist side effect and keeps mutations behind final confirmation', () => {
  for (const file of ['api.ts','NewCaseDialog.tsx']) {
    const source = readFileSync(new URL(`../src/features/case-management/${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /apply-document-template|initialization-preview|document-collection\/initialize|generateForCase/)
    assert.doesNotMatch(source, /from .*fixtures|from .*mockData/)
  }
  const dialog = readFileSync(new URL('../src/features/case-management/NewCaseDialog.tsx', import.meta.url), 'utf8')
  assert.match(dialog, /入力内容を確認/)
  assert.match(dialog, /登録内容の確認/)
  assert.match(dialog, /この内容で案件を作成/)
  assert.match(dialog, /await caseApi\.createClient/)
  assert.match(dialog, /await caseApi\.create\(createPayload/)
  for (const removed of ['案件状態', '優先度', '部署', '開始日', '目標完了日', '案件名', '案件番号', '依頼者備考', '案件の詳細設定', '詳細区分']) assert.doesNotMatch(dialog, new RegExp(removed))
  assert.doesNotMatch(dialog, /status:|priority:|department_id:|opened_at:|target_completion_at:/)
  assert.doesNotMatch(dialog, /stepLabels|setStep|次へ|戻る|toVietnameseFurigana/)
})
