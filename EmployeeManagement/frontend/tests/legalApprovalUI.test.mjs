import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { compileFunction } from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'
import * as legalApproval from '../src/features/document-creation/legalApproval.ts'

const external = createRequire(import.meta.url)
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes }); return { promise, resolve } }
// Production JSX and callbacks, synthetic scheduler/transport only. Not a browser test.
function roomHarness(flags, failureStatus, responseDeferred, getResponse, search = '') {
  const slots = [], effects = [], calls = []
  const getParams = [], scrolled = []
  let cursor = 0, tree
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]))
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next }] },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial } },
    useCallback(callback, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { callback, deps }; return slots[i].callback },
    useEffect(effect, deps) { const i = cursor++; if (!same(slots[i], deps)) { slots[i] = deps; effects.push(effect) } },
  }
  const approval = () => ({ id: 1, action_type: 'Synthetic document', payload: null, status: 'pending', created_at: null, executed_at: null, allowed_actions: flags })
  const api = {
    async get(_url, options) { calls.push('GET'); getParams.push(options?.params); return getResponse ? getResponse() : { data: { approvals: [approval()], c001_documents: [] } } },
    async patch() {
      calls.push('PATCH')
      if (responseDeferred) await responseDeferred.promise
      if (failureStatus) throw { response: { status: failureStatus, data: failureStatus === 409 ? { code: 'legal_authority_policy_pending' } : {} } }
      return { data: { approval: { ...approval(), status: 'approved' } } }
    },
  }
  const source = readFileSync(new URL('../src/pages/ApprovalRoom.tsx', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  compileFunction(compiled, ['require', 'module', 'exports', 'window', 'document'])(specifier => {
    if (specifier === 'react') return react
    if (specifier === 'react-router-dom') return { useSearchParams: () => [new URLSearchParams(search)] }
    if (specifier === '../services/api') return { __esModule: true, default: api }
    if (specifier.endsWith('/legalApproval')) return legalApproval
    if (specifier.endsWith('/AuthContext')) return { useAuth: () => ({ user: { permission_names: [] } }) }
    if (specifier.endsWith('/LegalApprovalNotice')) return { __esModule: true, default: 'LegalApprovalNotice' }
    if (specifier.endsWith('/C001DocumentReviewDrawer')) return { __esModule: true, default: 'C001DocumentReviewDrawer' }
    if (specifier === '../components/ui' || specifier === '../components/loading') return new Proxy({}, { get: (_, name) => name })
    return external(specifier)
  }, module, module.exports, { setTimeout(callback) { effects.push(callback); return 1 }, clearTimeout() {} },
  { getElementById: id => ({ scrollIntoView: () => scrolled.push(id) }) })
  const flush = async () => { for (let i = 0; i < 10; i++) { cursor = 0; tree = module.exports.default(); while (effects.length) effects.shift()(); await Promise.resolve() } }
  const all = () => { const nodes = []; const visit = node => { if (Array.isArray(node)) node.forEach(visit); else if (node?.props) { nodes.push(node); visit(node.props.children); visit(node.props.actions) } }; visit(tree); return nodes }
  return { flush, calls, getParams, scrolled, nodes: all, button: label => all().find(node => node.type === 'Button' && node.props.children === label) }
}

test('notification deep link requests and focuses the exact authorized approval', async () => {
  const f = roomHarness({ can_approve: false, can_reject: false }, undefined, undefined, undefined, 'approval=1')
  await f.flush()
  assert.deepEqual(f.getParams, [{ focus_id: 1 }])
  assert.ok(f.nodes().some(node => node.props.id === 'approval-1'))
  assert.deepEqual(f.scrolled, ['approval-1'])
  assert.equal(f.button('承認').props.disabled, true)
})

for (const flags of [undefined, { can_approve: false, can_reject: false, legal_approval_pending: true },
  { can_approve: true, can_reject: true, legal_approval_pending: true }]) {
  test(`queue does not dispatch disabled decisions with ${JSON.stringify(flags)}`, async () => {
    const f = roomHarness(flags); await f.flush()
    for (const label of ['承認', '却下']) { const button = f.button(label); assert.equal(button.props.disabled, true); button.props.onClick() }
    await f.flush()
    assert.equal(f.calls.filter(call => call === 'PATCH').length, 0)
    assert.equal(f.nodes().some(node => node.type === 'LegalApprovalNotice'), flags?.legal_approval_pending === true)
  })
}
for (const status of [403, 409]) test(`stale queue capability handles HTTP${status}, reloads and never displays success`, async () => {
  const f = roomHarness({ can_approve: true, can_reject: true }, status)
  await f.flush(); assert.equal(f.button('承認').props.disabled, false)
  f.button('承認').props.onClick(); await f.flush()
  assert.equal(f.calls.filter(call => call === 'PATCH').length, 1)
  assert.equal(f.calls.filter(call => call === 'GET').length, 2)
  const alert = f.nodes().find(node => node.props.role === 'alert')
  assert.equal(alert.props.children, legalApproval.reviewActionError({ response: { status, data: status === 409 ? { code: 'legal_authority_policy_pending' } : {} } }, 'unused'))
  assert.ok(f.button('承認'), 'Pending request is not falsely marked processed')
})

test('failed initial queue load shows one error and no misleading empty states; retry remains available', async () => {
  const f = roomHarness(undefined, undefined, undefined, async () => { throw new Error('Synthetic outage') })
  await f.flush()
  assert.equal(f.nodes().filter(node => node.props.role === 'alert').length, 1)
  assert.equal(f.nodes().filter(node => node.type === 'EmptyState').length, 0)
  assert.equal(f.button('最新データを取得').props.disabled, false)
})

test('retry of failed empty queue shows loading until successful empty response, then both empty states', async () => {
  const pending = deferred()
  let attempts = 0
  const f = roomHarness(undefined, undefined, undefined, async () => {
    if (++attempts === 1) throw new Error('Synthetic outage')
    return pending.promise
  })
  await f.flush()
  f.button('最新データを取得').props.onClick(); await f.flush()
  assert.equal(f.nodes().filter(node => node.type === 'EmptyState').length, 0)
  assert.equal(f.nodes().some(node => node.props.role === 'alert'), false)
  assert.equal(f.button('更新中…').props.disabled, true)
  // Local ApprovalLoadingState function elements, one for each empty queue.
  assert.equal(f.nodes().filter(node => node.type?.name === 'ApprovalLoadingState').length, 2)
  pending.resolve({ data: { approvals: [], c001_documents: [] } }); await f.flush()
  assert.equal(f.nodes().filter(node => node.type === 'EmptyState').length, 2)
  assert.equal(f.nodes().some(node => node.props.role === 'alert'), false)
  assert.equal(f.calls.filter(call => call === 'PATCH').length, 0)
})

test('transient refresh failure preserves known rows and backend review capability restrictions', async () => {
  let attempts = 0
  const f = roomHarness(undefined, undefined, undefined, async () => {
    if (++attempts > 1) throw new Error('Synthetic outage')
    return { data: { approvals: [{ id: 1, action_type: 'Synthetic', status: 'pending', payload: null, created_at: null, executed_at: null }], c001_documents: [] } }
  })
  await f.flush(); f.button('最新データを取得').props.onClick(); await f.flush()
  assert.equal(f.nodes().some(node => node.props.role === 'alert'), true)
  assert.equal(f.nodes().filter(node => node.type === 'EmptyState').length, 0)
  assert.equal(f.button('承認').props.disabled, true)
  f.button('承認').props.onClick(); await f.flush()
  assert.equal(f.calls.filter(call => call === 'PATCH').length, 0)
})
test('ordinary approval stays available and the in-flight ref rejects duplicate clicks', async () => {
  const response = deferred()
  const f = roomHarness({ can_approve: true, can_reject: true }, undefined, response)
  await f.flush()
  const approve = f.button('承認'); approve.props.onClick(); approve.props.onClick()
  await f.flush()
  assert.equal(f.calls.filter(call => call === 'PATCH').length, 1)
  assert.equal(f.button('承認').props.disabled, true)
  assert.equal(f.button('却下').props.disabled, true)
  response.resolve(); await f.flush()
  assert.equal(f.button('承認'), undefined)
  assert.equal(f.nodes().some(node => node.props.role === 'alert'), false)
})
