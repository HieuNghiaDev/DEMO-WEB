import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createPreviewItems, emptyFilters, matchesFilters, isOverdue } from '../src/features/document-collection-mockup/mockData.ts'
import { officialCandidates } from '../src/features/document-collection-mockup/officialCandidates.ts'

test('all 103 preview rules faithfully reflect the audited master without runtime backend imports', () => {
  const master = JSON.parse(readFileSync(new URL('../../backend/database/seeders/data/case_type_document_rule_master_v1.json', import.meta.url)))
  const documents = JSON.parse(readFileSync(new URL('../../backend/database/seeders/data/document_type_master_v1.json', import.meta.url)))
  assert.equal(officialCandidates.length, 103)
  for (const rule of master.rules) {
    const preview = officialCandidates.find(item => item.code === rule.document_code && item.caseType === rule.case_type)
    assert.deepEqual(preview, { caseType: rule.case_type, code: rule.document_code, title: documents.documents.find(doc => doc.code === rule.document_code).name_ja, purposes: rule.purposes, condition: rule.applicability_condition, source: rule.standard_source, target: rule.standard_target_person, scope: rule.standard_period_rule, version: rule.version, preservation: rule.preservation_priority })
  }
})
test('explicit fresh preview creates 55/48 undecided candidates with no inferred dates or purposes duplicated', () => {
  for (const [kind, count] of [['労災', 55], ['交通事故', 48]]) {
    const rows = createPreviewItems(kind, false)
    assert.equal(rows.length, count)
    assert.equal(new Set(rows.map(row => row.code)).size, count)
    assert.ok(rows.every(row => row.necessity === '未判定' && row.collection === '未着手' && row.sufficiency === '未判定' && row.review === '未確認' && row.periodStart === '' && row.periodEnd === '' && row.files.length === 0))
  }
})
test('all 13 required review scenarios exist with independent status axes', () => {
  const rows = createPreviewItems('労災')
  assert.equal(rows.length, 56) // 55 candidates + another hospital, not 56 official rules.
  const get = code => rows.find(row => row.code === code)
  assert.equal(get('C-003').collection, '未着手')
  assert.equal(get('W-101').necessity, '必要')
  assert.equal(get('W-101').collection, '依頼済み')
  assert.equal(get('D-001').collection, '一部受領')
  assert.equal(get('D-001').sufficiency, '不足あり')
  assert.equal(get('D-002').collection, '受領済み')
  assert.equal(get('D-002').review, '未確認')
  assert.equal(get('C-001').review, '確認済み')
  assert.equal(get('D-011').necessity, '不要')
  assert.equal(get('W-202').exception, '不存在')
  assert.equal(get('W-202').necessity, '必要')
  assert.equal(get('W-201').exception, '一部不開示')
  assert.equal(get('W-106').collection, '取得困難')
  assert.equal(get('W-210').priority, '保全優先')
  assert.equal(get('D-004').approval, '承認待ち')
  assert.equal(rows.filter(row => row.code === 'D-003').length, 2)
  assert.deepEqual(rows.filter(row => row.code === 'D-003').map(row => [row.source, row.periodStart, row.periodEnd]), [['大阪病院', '2026-01-01', '2026-03-31'], ['京都病院', '2026-04-01', '2026-06-30']])
  assert.deepEqual([...get('D-001').files[0].purposes].sort(), ['W1', 'W3'])
  assert.equal(get('D-001').files.length, 1)
})
test('traffic work/commuting cross-domain candidates stay conditional and shared documents are unique', () => {
  const rows = createPreviewItems('交通事故', false)
  for (const code of ['W-301', 'W-302', 'W-303', 'W-304']) {
    const item = rows.find(row => row.code === code)
    assert.ok(item.condition)
    assert.equal(item.necessity, '未判定')
  }
  assert.equal(rows.filter(row => row.code === 'D-001').length, 1)
})
test('filters distinguish necessity undecided from sufficiency undecided; combine purpose/source/deadline/owner', () => {
  const rows = createPreviewItems('労災')
  const get = code => rows.find(row => row.code === code)
  assert.equal(matchesFilters(get('D-002'), { ...emptyFilters, status: 'necessity:未判定' }), false)
  assert.equal(matchesFilters(get('D-002'), { ...emptyFilters, status: 'sufficiency:未判定' }), true)
  assert.equal(matchesFilters(get('D-001'), { ...emptyFilters, query: 'd001', purpose: 'W3', source: '依頼者', assignee: 'LE HIEU NGHIA', deadline: 'overdue' }), true)
  assert.equal(matchesFilters(get('W-210'), { ...emptyFilters, quick: '保全優先' }), true)
  assert.equal(isOverdue({ ...get('D-001'), necessity: '不要' }), false)
  assert.equal(isOverdue({ ...get('D-001'), collection: '終了' }), false)
})
test('editing a preview never mutates master fixtures or another scenario', () => {
  const before = JSON.stringify(officialCandidates)
  const first = createPreviewItems('労災')
  first[0].purposes.push('CUSTOM')
  first[0].condition = 'edited in review'
  first[0].files[0].name = 'changed'
  assert.equal(JSON.stringify(officialCandidates), before)
  assert.ok(!createPreviewItems('労災')[0].purposes.includes('CUSTOM'))
})
