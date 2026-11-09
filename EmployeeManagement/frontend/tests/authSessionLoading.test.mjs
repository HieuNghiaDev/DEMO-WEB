import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { compileFunction } from 'node:vm'
import { resolve } from 'node:path'
import ts from 'typescript'
import { AuthFlow } from '../src/features/authentication/authFlow.ts'

const credentials = { email: 'synthetic@example.test', password: 'Synthetic-only!Password', remember: false }
const user = id => ({ id, email: credentials.email, is_active: true, roles: [], role_names: [], permission_names: [], must_change_password: false })
const session = (id = 1, mfa = false) => ({ status: 200, data: { user: user(id), token: `synthetic-${id}`, authentication: { requires_mfa: mfa } } })
const mfa = { status: 202, data: { mfa_required: true, purpose: 'login_mfa', challenge: 'a'.repeat(64), expires_in: 300 } }
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }

// Execute the production provider and AuthFlow. Only React's scheduler/browser
// primitives and HTTP/storage are synthetic; separate browser testing is still
// required to verify real effects.
function providerHarness(responses = [session()]) {
  const slots = [], effects = [], timers = new Map(), requests = []
  const events = new EventTarget()
  const pendingMe = deferred()
  let cursor = 0, token = 'synthetic-old', timerId = 0, value
  const same = (left, right) => left && right && left.length === right.length && left.every((item, i) => Object.is(item, right[i]))
  const react = {
    createContext: () => ({ Provider: 'synthetic-provider' }),
    useContext: () => value,
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next }] },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial } },
    useCallback(callback, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { callback, deps }; return slots[index].callback },
    useEffect(effect, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) { const previous = slots[index]; slots[index] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect() }) } },
    useSyncExternalStore(_subscribe, getSnapshot) { cursor++; return getSnapshot() },
  }
  const fakeWindow = {
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id },
    clearTimeout(id) { timers.delete(id) }, setInterval: () => ++timerId, clearInterval() {},
    addEventListener: (...args) => events.addEventListener(...args), removeEventListener: (...args) => events.removeEventListener(...args),
  }
  const api = { get(path, config) { requests.push({ path, config }); return pendingMe.promise }, post: async () => ({ status: 204 }) }
  const path = resolve('src/contexts/AuthContext.tsx')
  const localRequire = createRequire(path)
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  compileFunction(compiled, ['require', 'module', 'exports', 'window', 'document'])(specifier => {
    if (specifier === 'react') return react
    if (specifier === '../services/api') return { __esModule: true, default: api, hasAuthToken: () => token !== null, clearAuthToken: () => { token = null }, storeAuthToken: next => { token = next }, logoutCurrentSession: async () => { token = null } }
    if (specifier.endsWith('/authentication/authFlow')) return { AuthFlow }
    if (specifier.endsWith('/authentication/authApi')) return { authTransport: async () => { assert.ok(responses.length, 'Unexpected auth request'); return responses.shift() } }
    return localRequire(specifier)
  }, module, module.exports, fakeWindow, { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} })
  const render = () => { cursor = 0; value = module.exports.AuthProvider({ children: null }).props.value }
  const flush = async () => { for (let i = 0; i < 8; i++) { render(); while (effects.length) effects.shift()(); await Promise.resolve() } return value }
  return { flush, pendingMe, requests, token: () => token,
    runBootstrapDelay() { for (const [id, timer] of timers) if (timer.delay === 600) { timers.delete(id); timer.callback() } },
    expire() { events.dispatchEvent(new Event('themis-auth-expired')) } }
}

test('new HTTP200 session retires bootstrap loading while old /me stays unresolved', async () => {
  const f = providerHarness()
  let auth = await f.flush()
  assert.equal(auth.isLoading, true)
  assert.equal(f.requests[0].path, '/me')
  assert.equal(f.requests[0].config.timeout, 30_000)
  assert.equal(await auth.login(credentials), true)
  auth = await f.flush()
  assert.equal(auth.user.id, 1)
  assert.equal(auth.isLoading, false, 'A never-settling old request must not block the new session')
  assert.equal(f.token(), 'synthetic-1')
})

for (const stale of ['success', '401', 'network']) test(`late bootstrap ${stale} cannot replace or clear the newer HTTP200 session`, async () => {
  const f = providerHarness()
  await (await f.flush()).login(credentials)
  if (stale === 'success') f.pendingMe.resolve({ data: { user: user(2), authentication: { requires_mfa: false } } })
  else f.pendingMe.reject({ isAxiosError: true, response: stale === '401' ? { status: 401 } : undefined })
  f.runBootstrapDelay()
  const auth = await f.flush()
  assert.equal(auth.user.id, 1)
  assert.equal(auth.isLoading, false)
  assert.equal(auth.sessionRestoreError, false)
  assert.equal(f.token(), 'synthetic-1')
})

test('logout retires loading immediately and late /me cannot resurrect a session', async () => {
  const f = providerHarness()
  await (await f.flush()).logout()
  let auth = await f.flush()
  assert.equal(auth.isLoading, false)
  assert.equal(auth.user, null)
  assert.equal(f.token(), null)
  f.pendingMe.resolve({ data: { user: user(2), authentication: { requires_mfa: false } } })
  f.runBootstrapDelay()
  auth = await f.flush()
  assert.equal(auth.user, null)
  assert.equal(f.token(), null)
})

test('HTTP202 remains pre-auth; only OTP200 retires loading and commits an MFA session', async () => {
  const f = providerHarness([mfa, session(1, true)])
  assert.equal(await (await f.flush()).login(credentials), false)
  let auth = await f.flush()
  assert.equal(auth.user, null)
  assert.equal(f.token(), null)
  assert.equal(auth.authState.phase, 'mfa_required')
  await auth.authFlow.verify({ otp: '123456' })
  auth = await f.flush()
  assert.equal(auth.isLoading, false)
  assert.equal(auth.user.id, 1)
  assert.equal(auth.requiresMfa, true)
})

for (const status of ['timeout', 401]) test(`current bootstrap ${status} preserves the network/authentication distinction`, async () => {
  const f = providerHarness()
  await f.flush()
  f.pendingMe.reject({ isAxiosError: true, code: status === 'timeout' ? 'ECONNABORTED' : undefined, response: status === 401 ? { status } : undefined })
  f.runBootstrapDelay()
  const auth = await f.flush()
  assert.equal(auth.isLoading, false)
  assert.equal(auth.user, null)
  assert.equal(auth.sessionRestoreError, status === 'timeout')
  assert.equal(f.token(), status === 'timeout' ? 'synthetic-old' : null)
})

test('auth-expired event retires pending loading and fences the old bootstrap response', async () => {
  const f = providerHarness()
  await f.flush()
  f.expire()
  assert.equal((await f.flush()).isLoading, false)
  f.pendingMe.resolve({ data: { user: user(2), authentication: { requires_mfa: false } } })
  f.runBootstrapDelay()
  const auth = await f.flush()
  assert.equal(auth.user, null)
  assert.equal(f.token(), null)
})
