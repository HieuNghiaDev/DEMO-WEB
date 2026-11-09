import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { compileFunction } from 'node:vm'
import ts from 'typescript'

test('mounted document list revalidates on return, ignores hidden events, aborts and unsubscribes on unmount', async () => {
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const browser = new EventTarget()
  const page = new EventTarget()
  page.visibilityState = 'visible'
  globalThis.window = browser
  globalThis.document = page
  let serverStatus = 'in_progress'
  let calls = 0
  let lastSignal
  const slots = []
  const cleanups = []
  let cursor = 0
  const react = {
    useState(initial) {
      const index = cursor++
      slots[index] = initial
      return [initial, value => { slots[index] = value }]
    },
    useRef(initial) { const ref = { current: initial }; slots[cursor++] = ref; return ref },
    useCallback: callback => callback,
    useEffect: callback => cleanups.push(callback()),
  }
  const module = { exports: {} }
  const code = ts.transpileModule(readFileSync(new URL('../src/features/document-collection/hooks/useWorkflowCaseDocuments.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText
  const api = { documentCollectionApi: { async list(caseId, query, signal) {
    calls++; lastSignal = signal
    assert.equal(caseId, 49)
    return { pagination: { last_page: 1 }, documents: [{ id: 826, workflow_state: { code: serverStatus } }] }
  } } }
  try {
    compileFunction(code, ['exports', 'require', 'module'])(module.exports, name => name === 'react' ? react : name === '../api' ? api : { collectionError: error => error }, module)
    module.exports.useWorkflowCaseDocuments(49, true)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(slots[0][0].workflow_state.code, 'in_progress')
    serverStatus = 'pending_review'
    assert.equal(slots[0][0].workflow_state.code, 'in_progress', 'existing mounted snapshot reproduces the stale row')
    browser.dispatchEvent(new Event('focus'))
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(slots[0][0].workflow_state.code, 'pending_review')
    const count = calls
    page.visibilityState = 'hidden'
    page.dispatchEvent(new Event('visibilitychange'))
    assert.equal(calls, count)
    serverStatus = 'completed'
    page.visibilityState = 'visible'
    page.dispatchEvent(new Event('visibilitychange'))
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(slots[0][0].workflow_state.code, 'completed')
    cleanups.forEach(cleanup => cleanup?.())
    assert.equal(lastSignal.aborted, true)
    const finalCount = calls
    browser.dispatchEvent(new Event('focus'))
    page.dispatchEvent(new Event('visibilitychange'))
    assert.equal(calls, finalCount)
  } finally {
    cleanups.forEach(cleanup => cleanup?.())
    globalThis.window = previousWindow
    globalThis.document = previousDocument
  }
})
