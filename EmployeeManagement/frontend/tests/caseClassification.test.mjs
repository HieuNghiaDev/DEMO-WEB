import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { loadTypeScript, productionArrow } from './helpers/loadTypeScript.mjs'

const directory = new URL('../src/features/case-management/', import.meta.url)
const helpers = loadTypeScript(new URL('helpers.ts', directory))
const source = readFileSync(new URL('NewCaseDialog.tsx', directory), 'utf8')
const pending = '機密案件のアクセスメンバー設定は現在準備中です。'

test('classification requires an explicit normal decision and blocks unavailable confidential admission', () => {
  assert.equal(helpers.classificationError(''), '案件区分を選択してください。')
  assert.equal(helpers.classificationError('confidential'), pending)
  assert.equal(helpers.classificationError('normal'), '')
})

test('classification renders required empty selection, normal/confidential choices and accessible help', () => {
  const target = new URL('CaseClassificationField.tsx', directory)
  assert.ok(existsSync(target), 'Shared creation-only classification field exists')
  const Field = loadTypeScript(target).default
  const html = renderToStaticMarkup(createElement(Field, { value: '', onChange() {}, error: '案件区分を選択してください。' }))
  assert.match(html, /name="classification"/)
  assert.match(html, /required=""/)
  assert.match(html, /value="" selected=""/)
  assert.match(html, /通常案件/)
  assert.match(html, /機密案件/)
  assert.match(html, /aria-invalid="true"/)
  assert.match(html, /aria-describedby=/)
  assert.match(html, /role="alert"/)
  const confidential = renderToStaticMarkup(createElement(Field, { value: 'confidential', onChange() {} }))
  assert.ok(confidential.includes(pending))
})

test('review validation and final confirmation block missing/confidential classification before mutation', async () => {
  for (const classification of ['', 'confidential']) {
    const errors = []
    const validate = productionArrow(source, 'validateForReview', {
      selectedClient: { id: 7 }, clientDraft: {}, dob: '', draft: { case_type_id: '5', summary: '' }, selectedType: { id: 5 },
      classification, classificationError: helpers.classificationError,
      showErrors: value => errors.push(value), setFields() {}, setError() {},
    })
    assert.equal(validate(), false)
    assert.ok(errors[0].classification)
    let called = 0
    const confirm = productionArrow(source, 'confirmCreate', {
      submitLock: { current: false }, validateForReview: validate,
      setSaving() {}, setError() {}, createPayload() { throw new Error('No payload before validation') },
      caseApi: { create() { called++; throw new Error('No mutation permitted') } },
      caseError() { throw new Error('No backend call permitted') }, onCreated() {}, setReviewing() {}, showErrors() {},
    })
    await confirm()
    assert.equal(called, 0)
  }
})

test('new normal payload is explicit and preserves client/type/summary fields without DB booleans', () => {
  const payload = productionArrow(source, 'createPayload', {
    classification: 'normal', selectedClient: { id: 7 }, title: 'Synthetic case',
    draft: { case_type_id: '5', summary: ' note ' }, canAssign: false,
  })()
  assert.deepEqual(payload, { classification: 'normal', client_id: 7, title: 'Synthetic case', case_type_id: 5, summary: 'note' })
  assert.equal('is_confidential' in payload, false)
})

test('422/403/409 errors keep the form open and preserve classification field errors', async () => {
  const { caseError } = loadTypeScript(new URL('api.ts', directory), new Map([
    [fileURLToPath(new URL('../src/services/api.ts', import.meta.url)), {}],
  ]))
  for (const status of [422, 403, 409]) {
    const failure = { isAxiosError: true, response: { status, data: { code: 'confidential_case_admission_pending', message: pending, errors: { classification: ['Required'] } } } }
    const calls = []
    const confirm = productionArrow(source, 'confirmCreate', {
      submitLock: { current: false }, validateForReview: () => true,
      setSaving: value => calls.push(['saving', value]), setError: value => calls.push(['error', value]),
      createPayload: () => ({ classification: 'normal' }), caseApi: { async create() { throw failure } }, caseError,
      onCreated() { assert.fail('No false success') }, setReviewing: value => calls.push(['reviewing', value]), showErrors: value => calls.push(['fields', value]),
    })
    await confirm()
    assert.ok(calls.some(([key, value]) => key === 'reviewing' && value === false))
    assert.ok(calls.some(([key, value]) => key === 'error' && value))
    if (status === 422) assert.ok(calls.some(([key, value]) => key === 'fields' && value.classification === 'Required'))
    if (status === 409) assert.ok(calls.some(([key, value]) => key === 'error' && value === pending))
    assert.deepEqual(calls.at(-1), ['saving', false])
  }
})
