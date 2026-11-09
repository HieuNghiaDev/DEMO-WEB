import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadTypeScript, productionArrow } from './helpers/loadTypeScript.mjs'

const require = createRequire(import.meta.url)
const React = require('react')
const feature = name => resolve(`src/features/interpretation/${name}`)
const { initialForm, validateInterpretation, interpretationPayload, japanInput, officeDate, interpretationError, nextStatus } = loadTypeScript(feature('presentation.ts'))
const caps = { can_create: true, can_update: true, can_assign: true, can_transition: true, can_cancel: true, can_view_costs: false }
const item = { id: 7, case_file_id: 42, language: 'ベトナム語', content: 'Synthetic meeting', work_type: 'meeting', mode: 'online', starts_at: '2026-12-10T00:00:00Z', ends_at: '2026-12-10T01:00:00Z', location: null, notes: null, status: 'pending', revision: 1, interpreter: null, updated_at: null }
const valid = () => ({ ...initialForm(item), interpreter_id: '12' })

test('JST form values roundtrip UTC and validation rejects missing, reverse, invalid and long intervals', () => {
  assert.equal(japanInput(item.starts_at), '2026-12-10T09:00')
  assert.match(officeDate(item.starts_at), /09:00/)
  assert.deepEqual(validateInterpretation(valid()), {})
  assert.ok(validateInterpretation({ ...valid(), content: ' ' }).content)
  assert.ok(validateInterpretation({ ...valid(), starts_at: '' }).starts_at)
  for (const end of ['2026-12-10T08:00', 'invalid', '2026-12-12T09:00']) assert.ok(validateInterpretation({ ...valid(), ends_at: end }).ends_at)
})

test('create and edit payloads exclude trusted identities, finance and assignment without permission', () => {
  const data = interpretationPayload(valid(), undefined, 'synthetic-key', true)
  assert.equal(data.starts_at, '2026-12-10T00:00:00.000Z')
  assert.equal(data.request_key, 'synthetic-key')
  assert.equal(data.interpreter_id, 12)
  const viewer = interpretationPayload(valid(), undefined, 'key', false)
  assert.equal('interpreter_id' in viewer, false)
  const update = interpretationPayload(valid(), item, 'key', true)
  assert.equal(update.revision, 1)
  for (const name of ['request_key', 'interpreter_id', 'case_file_id', 'client_id', 'created_by_user_id', 'fee', 'invoice_id']) assert.equal(name in update, false, name)
})

test('403/404/409/503 and network errors are safe Japanese messages; 422 retains field errors', () => {
  for (const status of [401, 403, 404, 409, 503]) {
    const problem = interpretationError({ isAxiosError: true, response: { status, data: { message: 'SYNTHETIC_SECRET_PROVIDER_TRACE' } } })
    assert.notEqual(problem.message, 'SYNTHETIC_SECRET_PROVIDER_TRACE')
    assert.ok(problem.message.length)
  }
  assert.deepEqual(interpretationError({ isAxiosError: true, response: { status: 422, data: { errors: { ends_at: ['終了を確認'] } } } }).fields, { ends_at: '終了を確認' })
  assert.match(interpretationError(new Error('private')).message, /接続/)
})

test('status presentation has only forward transitions and no finalization privilege', () => {
  assert.deepEqual(nextStatus, { pending: 'arranging', arranging: 'confirmed', confirmed: 'completed' })
  assert.equal(nextStatus.completed, undefined)
  assert.equal(nextStatus.cancelled, undefined)
})

const fakeTransport = { get: async () => { throw Error('Unexpected transport') } }
const replacements = new Map([
  [resolve('src/services/api.ts'), fakeTransport],
  [feature('interpretation.css'), {}],
  [resolve('src/components/ui/ModalShell.tsx'), { ModalShell: ({ children }) => React.createElement('div', {}, children) }],
])
const Panel = loadTypeScript(feature('InterpretationPanel.tsx'), replacements).default
const Drawer = loadTypeScript(feature('InterpretationDrawer.tsx'), replacements).default
const response = { items: [], statistics: { pending: 0, arranging: 0, confirmed: 0, completed: 0, cancelled: 0 }, capabilities: caps, pagination: { page: 1, last_page: 1, total: 0 } }
function withState(values, Component, props) {
  const original = React.useState
  let cursor = 0
  React.useState = initial => [cursor < values.length ? values[cursor++] : (typeof initial === 'function' ? initial() : initial), () => {}]
  try { return renderToStaticMarkup(React.createElement(Component, props)) }
  finally { React.useState = original }
}
const props = { caseId: 42, caseLabel: 'SYNTHETIC CASE', clientName: 'Synthetic client' }

test('panel loading has no fake counts or empty message', () => {
  const html = renderToStaticMarkup(React.createElement(Panel, props))
  assert.match(html, /通訳依頼を読み込み中/)
  assert.doesNotMatch(html, /まだありません|ip-metric is-/)
})

test('empty, error and loaded states never overlap; capabilities gate create', () => {
  const empty = withState([1, response, false, '', '', null], Panel, props)
  assert.match(empty, /通訳依頼はまだありません/)
  assert.match(empty, /通訳依頼を追加/)
  const denied = withState([1, null, false, 'この操作を行う権限がありません。', '', null], Panel, props)
  assert.match(denied, /role="alert"/)
  assert.match(denied, /再試行/)
  assert.doesNotMatch(denied, /まだありません|通訳依頼を追加/)
  const viewer = withState([1, { ...response, capabilities: {} }, false, '', '', null], Panel, props)
  assert.doesNotMatch(viewer, /通訳依頼を追加/)
})

test('real response values and metadata render without finance or HR fields', () => {
  const html = withState([1, { ...response, items: [{ ...item, interpreter: { id: 12, name: 'Synthetic external', kind: 'external' }, fee: 'SECRET_FEE' }], statistics: { pending: 17 }, pagination: { page: 1, last_page: 2, total: 21 } }, false, '', '', null], Panel, props)
  for (const text of ['ベトナム語', 'Synthetic external', '09:00', '手配待ち', '21件', '>17<']) assert.ok(html.includes(text), text)
  assert.doesNotMatch(html, /SECRET_FEE|nationality|date_of_birth/)
})

test('drawer has read-only context, proper dialog, form and permission-aware actions', () => {
  const values = [item, caps, initialForm(item), { interpreters: [], employees: [] }, false, false, '', {}, [{ id: 1, title: '通訳依頼を追加', occurred_at: item.starts_at, actor_name: 'Synthetic operator', after: {} }], 1, 1, 'external', '', '', false, '', false]
  const html = withState(values, Drawer, { ...props, itemId: item.id, capabilities: caps })
  for (const text of ['role="dialog"', 'aria-modal="true"', 'SYNTHETIC CASE', 'Synthetic client', '対応言語', '通訳内容', '開始日時', '終了日時', '通訳者を登録', '変更を保存', '変更履歴']) assert.ok(html.includes(text), text)
  assert.doesNotMatch(html, /name="case_file_id"|name="client_id"/)
  assert.match(html, /Synthetic operator/)
  const viewer = withState([item, {}, initialForm(item), { interpreters: [], employees: [] }, false, false, '', {}, [], 1, 1, 'external', '', '', false, '', false], Drawer, { ...props, itemId: item.id })
  assert.doesNotMatch(viewer, /変更を保存|通訳者を登録|手配中にする|キャンセルにする/)
})

test('terminal item has no editable or transition controls and renders cancellation reason', () => {
  const closed = { ...item, status: 'cancelled', cancellation_reason: 'Synthetic cancellation' }
  const html = withState([closed, caps, initialForm(closed), { interpreters: [], employees: [] }, false, false, '', {}, [], 1, 1, 'external', '', '', false, '', false], Drawer, { ...props, itemId: item.id })
  assert.match(html, /Synthetic cancellation/)
  assert.doesNotMatch(html, /変更を保存|状態の変更|通訳者を登録/)
})

test('drawer action prevents duplicate requests and never reports success for denied writes', async () => {
  const source = readFileSync(feature('InterpretationDrawer.tsx'), 'utf8')
  const busy = { current: false }, mounted = { current: true }
  let calls = 0, successes = 0, resolveRequest
  const errors = []
  const bindings = { busy, mounted, setSaving() {}, setError: text => errors.push(text), setFields() {}, onSaved: async () => successes++, onClose() {}, load: async () => {}, interpretationError,
    window: { setTimeout() {} }, errorRef: { current: null } }
  const action = productionArrow(source, 'action', bindings)
  const one = action(() => { calls++; return new Promise(resolve => { resolveRequest = resolve }) }, 'saved')
  await action(async () => { calls++ }, 'saved')
  assert.equal(calls, 1)
  resolveRequest(); await one
  assert.equal(successes, 1)
  await action(async () => { throw { isAxiosError: true, response: { status: 409 } } }, 'saved')
  assert.equal(successes, 1)
  assert.match(errors.at(-1), /競合/)
  assert.equal(busy.current, false)
})

test('fake adapter preserves nested routes, versions, errors and never sends trusted IDs', async () => {
  const calls = []
  const transport = {}
  for (const method of ['get', 'post', 'patch']) transport[method] = async (...args) => { calls.push([method, ...args]); return { data: { item, events: [] } } }
  const { interpretationApi } = loadTypeScript(feature('api.ts'), new Map([[resolve('src/services/api.ts'), transport]]))
  await interpretationApi.save(42, interpretationPayload(valid(), undefined, 'key', true))
  await interpretationApi.assign(42, item, 12)
  await interpretationApi.transition(42, item, 'cancelled', 'Synthetic reason')
  await interpretationApi.history(42, item.id, 2)
  assert.equal(calls[0][1], '/case-files/42/interpretation-requests')
  assert.deepEqual(calls[1][2], { revision: 1, interpreter_id: 12 })
  assert.equal(calls[2][2].cancellation_reason, 'Synthetic reason')
  assert.deepEqual(calls[3][2], { params: { page: 2 } })
  transport.post = async () => { throw { response: { status: 403 } } }
  await assert.rejects(() => interpretationApi.transition(42, item, 'completed'), error => error.response.status === 403)
})

test('drawer uses existing portal/focus environment and right-slide respects reduced motion', () => {
  const source = readFileSync(feature('InterpretationDrawer.tsx'), 'utf8')
  const css = readFileSync(feature('interpretation.css'), 'utf8')
  assert.match(source, /<ModalShell isOpen.*customContent/)
  assert.match(source, /dismissible=\{!saving\}/)
  assert.match(css, /translateX\(100%\)/)
  assert.match(css, /prefers-reduced-motion/)
  for (const width of ['1024px', '768px', '420px']) assert.ok(css.includes(width))
  assert.doesNotMatch(css, /min-width:\s*(?:600|800|1000)px/)
})
