import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname, extname } from 'node:path'
import { createRequire } from 'node:module'
import { compileFunction } from 'node:vm'
import ts from 'typescript'
import { AuthFlow, AuthFailure, MutationUncertain, performStepUp, parseRecoveryCodes } from '../src/features/authentication/authFlow.ts'

const raw = 'a'.repeat(64)
const codes = Array.from({ length: 10 }, (_, index) => index.toString(16).padStart(32, '0'))
const secret = 'A'.repeat(32)
const session = (mfa = false) => ({ token: '1|synthetic-business-token', user: { id: 1, email: 'synthetic@example.test', is_active: true, roles: [], role_names: ['employee'], permission_names: [] }, authentication: { requires_mfa: mfa } })
const required = purpose => ({ status: 202, data: { mfa_required: true, purpose, challenge: raw, expires_in: 300 } })
const enrolled = () => ({ status: 200, data: { secret, otpauth_uri: `otpauth://totp/THEMIS:synthetic?secret=${secret}&issuer=THEMIS` } })
const credentials = { email: 'synthetic@example.test', password: 'Synthetic-only!Password', remember: false }
function fixture(...responses) {
  const calls = [], commits = []
  let now = 1_000
  const flow = new AuthFlow(async (path, body, preAuth) => {
    calls.push({ path, body, preAuth })
    const response = responses.shift()
    if (response instanceof Error) throw response
    if (typeof response === 'function') return response()
    assert.ok(response, 'Unexpected request')
    return response
  }, (data, remember) => commits.push({ data, remember }), () => now)
  return { flow, calls, commits, advance: milliseconds => { now += milliseconds; flow.expire() } }
}
test('ordinary password login commits the server business session, retaining remember behavior', async () => {
  const f = fixture({ status: 200, data: session() })
  assert.equal(await f.flow.login({ ...credentials, remember: true }), true)
  assert.equal(f.flow.getSnapshot().phase, 'authenticated')
  assert.equal(f.commits[0].remember, true)
  assert.equal(f.calls[0].preAuth, true)
})
for (const purpose of ['login_mfa', 'login_enroll']) test(`password 202 ${purpose} is never an authenticated business session`, async () => {
  const f = fixture(required(purpose))
  assert.equal(await f.flow.login(credentials), false)
  assert.equal(f.commits.length, 0)
  assert.equal(f.flow.getSnapshot().phase, purpose === 'login_mfa' ? 'mfa_required' : 'mfa_enrollment_required')
  assert.equal('token' in f.flow.getSnapshot(), false)
})
test('only valid OTP response completes MFA, uses the exact current challenge, and clears volatile data', async () => {
  const f = fixture(required('login_mfa'), { status: 200, data: session(true) })
  await f.flow.login(credentials)
  await f.flow.verify({ otp: '123456' })
  assert.deepEqual(f.calls[1], { path: '/mfa/login', body: { challenge: raw, otp: '123456' }, preAuth: true })
  assert.equal(f.commits.length, 1)
  assert.deepEqual(f.flow.getSnapshot(), { phase: 'authenticated', busy: false, error: '' })
})
test('wrong OTP remains unauthenticated and allows a manual fresh-code retry', async () => {
  const f = fixture(required('login_mfa'), new AuthFailure(422), { status: 200, data: session(true) })
  await f.flow.login(credentials); await f.flow.verify({ otp: '000000' })
  assert.equal(f.flow.getSnapshot().phase, 'mfa_required')
  assert.equal(f.commits.length, 0)
  await f.flow.verify({ otp: '123456' })
  assert.equal(f.commits.length, 1)
})
test('expired challenge erases secret and cannot send another verify request', async () => {
  const f = fixture(required('login_enroll'), enrolled())
  await f.flow.login(credentials); await f.flow.startEnrollment()
  f.advance(300_001)
  await f.flow.confirmEnrollment('123456')
  assert.equal(f.calls.length, 2)
  assert.equal(f.flow.getSnapshot().phase, 'expired_or_failed')
  assert.equal(f.flow.getSnapshot().enrollment, undefined)
})
test('enrollment visibility does not activate MFA; only verify returns ten one-time recovery codes', async () => {
  const f = fixture(required('login_enroll'), enrolled(), { status: 200, data: { recovery_codes: codes, reauthentication_required: true } })
  await f.flow.login(credentials); await f.flow.startEnrollment(); await f.flow.startEnrollment()
  assert.equal(f.calls.length, 2, 'Secret start cannot be repeated to reload the secret')
  assert.equal(f.commits.length, 0)
  assert.equal(f.flow.getSnapshot().phase, 'mfa_enrollment_required')
  await f.flow.confirmEnrollment('123456')
  assert.equal(f.flow.getSnapshot().phase, 'recovery_codes')
  assert.deepEqual(f.flow.getSnapshot().codes, codes)
  assert.equal(f.flow.getSnapshot().enrollment, undefined)
  assert.equal(f.flow.getSnapshot().challenge, undefined)
  assert.equal(f.commits.length, 0)
  f.flow.reset()
  assert.equal(f.flow.getSnapshot().codes, undefined)
})
test('lost enrollment-start response fails closed and cannot silently retry a one-shot start', async () => {
  const f = fixture(required('login_enroll'), new AuthFailure())
  await f.flow.login(credentials); await f.flow.startEnrollment(); await f.flow.startEnrollment()
  assert.equal(f.flow.getSnapshot().phase, 'expired_or_failed')
  assert.equal(f.calls.length, 2)
})
test('recovery-code login yields only new-device enrollment; new OTP and clean password login still required', async () => {
  const next = 'b'.repeat(64)
  const f = fixture(required('login_mfa'), { status: 200, data: { challenge: next, purpose: 'recovery_enroll', expires_in: 300 } }, enrolled(), { status: 200, data: { recovery_codes: codes, reauthentication_required: true } })
  await f.flow.login(credentials); await f.flow.verify({ recovery_code: codes[0] })
  assert.equal(f.flow.getSnapshot().challenge, next)
  assert.equal(f.flow.getSnapshot().phase, 'mfa_enrollment_required')
  assert.equal(f.commits.length, 0)
  await f.flow.startEnrollment(); await f.flow.confirmEnrollment('123456')
  assert.equal(f.commits.length, 0)
  assert.equal(f.flow.getSnapshot().phase, 'recovery_codes')
})
test('even a malformed token response on recovery path cannot grant a business session', async () => {
  const f = fixture(required('login_mfa'), { status: 200, data: session(true) })
  await f.flow.login(credentials); await f.flow.verify({ recovery_code: codes[0] })
  assert.equal(f.commits.length, 0)
})
test('reset/logout/account switch invalidates late OTP responses for a previous account', async () => {
  let finish
  const f = fixture(required('login_mfa'), () => new Promise(resolve => { finish = resolve }))
  await f.flow.login(credentials)
  const pending = f.flow.verify({ otp: '123456' })
  f.flow.reset()
  finish({ status: 200, data: session(true) }); await pending
  assert.equal(f.commits.length, 0)
  assert.equal(f.flow.getSnapshot().phase, 'idle')
})
test('duplicate password and OTP clicks make only one request per in-flight operation', async () => {
  let finish
  const f = fixture(() => new Promise(resolve => { finish = resolve }))
  const pending = f.flow.login(credentials)
  await f.flow.login(credentials)
  assert.equal(f.calls.length, 1)
  finish(required('login_mfa')); await pending
  let finishOtp
  const g = fixture(required('login_mfa'), () => new Promise(resolve => { finishOtp = resolve }))
  await g.flow.login(credentials)
  const pendingOtp = g.flow.verify({ otp: '123456' })
  await g.flow.verify({ otp: '123456' })
  assert.equal(g.calls.length, 2)
  finishOtp({ status: 200, data: session(true) }); await pendingOtp
  assert.equal(g.commits.length, 1)
})
test('refresh creates an empty flow rather than restoring challenge or authenticator secret', async () => {
  const f = fixture(required('login_enroll'), enrolled())
  await f.flow.login(credentials); await f.flow.startEnrollment()
  const fresh = fixture()
  assert.deepEqual(fresh.flow.getSnapshot(), { phase: 'idle', busy: false, error: '' })
  assert.equal(fresh.commits.length, 0)
})
for (const status of [401, 403, 419, 429]) test(`MFA ${status} does not authenticate or leak a raw API response`, async () => {
  const f = fixture(required('login_mfa'), new AuthFailure(status))
  await f.flow.login(credentials); await f.flow.verify({ otp: '123456' })
  assert.equal(f.commits.length, 0)
  assert.ok(f.flow.getSnapshot().error)
  if (status !== 429) assert.equal(f.flow.getSnapshot().challenge, undefined)
})
for (const malformed of [
  { status: 202, data: { ...required('login_mfa').data, token: 'unexpected' } },
  { status: 202, data: { ...required('login_mfa').data, purpose: 'other_account' } },
  { status: 200, data: { ...session(), user: { id: 1, is_active: true, activation_required: true } } },
  { status: 200, data: { ...session(), token: undefined } },
  { status: 200, data: session(true) },
  { status: 200, data: { ...session(), user: { id: 1, is_active: true } } },
]) test(`malformed or pending authentication response fails closed ${JSON.stringify(malformed).length}`, async () => {
  const f = fixture(malformed)
  await f.flow.login(credentials)
  assert.equal(f.commits.length, 0)
})
test('invalid/duplicate recovery code arrays and fake enrollment success cannot display codes', () => {
  for (const data of [{ recovery_codes: codes }, { recovery_codes: [codes[0]], reauthentication_required: true },
    { recovery_codes: Array(10).fill(codes[0]), reauthentication_required: true },
    { recovery_codes: codes, reauthentication_required: true, token: 'unexpected' }]) assert.throws(() => parseRecoveryCodes(data), AuthFailure)
})
test('server-confirmed code rotation and device change clear old challenge state and still cannot authenticate', async () => {
  const f = fixture(required('login_mfa'))
  await f.flow.login(credentials)
  f.flow.receiveRecoveryCodes({ recovery_codes: codes, reauthentication_required: true })
  assert.equal(f.flow.getSnapshot().phase, 'recovery_codes')
  assert.equal(f.flow.getSnapshot().challenge, undefined)
  f.flow.receiveDeviceChallenge({ purpose: 'recovery_enroll', challenge: 'b'.repeat(64), expires_in: 300 })
  assert.equal(f.flow.getSnapshot().codes, undefined)
  assert.equal(f.flow.getSnapshot().phase, 'mfa_enrollment_required')
  assert.equal(f.commits.length, 0)
  f.flow.reset()
  assert.equal(f.flow.getSnapshot().challenge, undefined)
})
test('optional enrollment from settings completes setup without committing a login session', async () => {
  const f = fixture(enrolled(), { status: 200, data: { recovery_codes: codes, reauthentication_required: true } })
  const response = { purpose: 'opt_in_enroll', challenge: raw, expires_in: 300 }
  assert.throws(() => f.flow.receiveOptInChallenge({ ...response, token: 'unexpected' }), AuthFailure)
  f.flow.receiveOptInChallenge(response)
  await f.flow.startEnrollment()
  await f.flow.confirmEnrollment('123456')
  assert.deepEqual(f.calls, [
    { path: '/mfa/enrollment/start', body: { challenge: raw }, preAuth: true },
    { path: '/mfa/enrollment/confirm', body: { challenge: raw, otp: '123456' }, preAuth: true },
  ])
  assert.equal(f.flow.getSnapshot().phase, 'recovery_codes')
  assert.equal(f.commits.length, 0)
})
test('step-up uses the exact action/scope on current session; mutation runs once, without a client proof token', async () => {
  const calls = []
  let mutations = 0
  const operation = { action: 'role.assign', scope: { user_id: 15, role_id: 7 } }
  const result = await performStepUp(async (...args) => { calls.push(args); return { status: 200, data: { verified: true, action: operation.action, expires_in: 300 } } }, operation, 'synthetic-password', '123456', async () => ++mutations, () => true)
  assert.equal(result, 1)
  assert.deepEqual(calls, [['/mfa/step-up', { password: 'synthetic-password', otp: '123456', action: 'role.assign', scope: { user_id: 15, role_id: 7 } }, false]])
})
for (const status of [401, 403, 419, 422, 429]) test(`step-up wrong scope/expired/replayed/denied response ${status} never calls mutation`, async () => {
  let mutations = 0
  await assert.rejects(performStepUp(async () => { throw new AuthFailure(status) }, { action: 'account.password', scope: {} }, '', '', async () => ++mutations, () => true), AuthFailure)
  assert.equal(mutations, 0)
})
test('wrong action in step-up response and logout during verification fail before mutation', async () => {
  let mutations = 0, current = true
  const mutate = async () => ++mutations
  await assert.rejects(performStepUp(async () => ({ status: 200, data: { verified: true, action: 'role.assign', expires_in: 300 } }), { action: 'account.password', scope: {} }, '', '', mutate, () => true), AuthFailure)
  await assert.rejects(performStepUp(async () => { current = false; return { status: 200, data: { verified: true, action: 'account.password', expires_in: 300 } } }, { action: 'account.password', scope: {} }, '', '', mutate, () => current), AuthFailure)
  assert.equal(mutations, 0)
})
test('mutation timeout does not retry or pretend success; explicit reconciliation is required', async () => {
  let mutations = 0
  await assert.rejects(performStepUp(async () => ({ status: 200, data: { verified: true, action: 'account.password', expires_in: 300 } }), { action: 'account.password', scope: {} }, '', '', async () => { ++mutations; throw new Error('raw private provider message') }, () => true), MutationUncertain)
  assert.equal(mutations, 1)
})

const requireExternal = createRequire(import.meta.url)
function loadTransport() {
  const modules = new Map()
  function load(path) {
    if (modules.has(path)) return modules.get(path).exports
    const module = { exports: {} }; modules.set(path, module)
    const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText.replaceAll('import.meta.env', '({})')
    const requireModule = specifier => specifier.startsWith('.') ? load(extname(specifier) ? resolve(dirname(path), specifier) : resolve(dirname(path), `${specifier}.ts`)) : requireExternal(specifier)
    compileFunction(code, ['exports', 'require', 'module'], { filename: path })(module.exports, requireModule, module)
    return module.exports
  }
  const auth = load(resolve('src/features/authentication/authApi.ts'))
  return { ...auth, ...load(resolve('src/services/api.ts')), flowTypes: load(resolve('src/features/authentication/authFlow.ts')) }
}
test('real Axios transport keeps pre-auth clean even with another stored bearer; secrets only in fixed POST body', async () => {
  const original = globalThis.window
  const storage = new Map([['themis_auth_token', 'other-account-bearer']])
  const fakeStorage = { getItem: key => storage.get(key) ?? null, removeItem: key => storage.delete(key), setItem: (key, value) => storage.set(key, value) }
  globalThis.window = { sessionStorage: fakeStorage, localStorage: fakeStorage, dispatchEvent: () => {} }
  try {
    const auth = loadTransport(), requests = []
    auth.default.defaults.adapter = 'fetch'
    auth.default.defaults.env = { ...auth.default.defaults.env, Request, Response, fetch: async request => { requests.push(request); return new Response(JSON.stringify(required('login_mfa').data), { status: 202, headers: { 'Content-Type': 'application/json' } }) } }
    await auth.authTransport('/login', credentials, true)
    await auth.authTransport('/mfa/login', { challenge: raw, otp: '123456' }, true)
    await auth.authTransport('/account-activation/complete', { token: raw, password: 'synthetic' }, true)
    for (const request of requests) {
      assert.equal(request.headers.has('Authorization'), false)
      assert.equal(new URL(request.url).search, '')
      assert.equal(request.method, 'POST')
      assert.equal(request.credentials, 'omit')
    }
    assert.deepEqual(JSON.parse(await requests[1].text()), { challenge: raw, otp: '123456' })
    await auth.authTransport('/mfa/step-up', { action: 'account.password', scope: {}, password: 'synthetic', otp: '123456' }, false)
    assert.equal(requests.at(-1).headers.get('Authorization'), 'Bearer other-account-bearer')
    const current = auth.captureAuthSession(); auth.clearAuthToken(); assert.equal(current(), false)
  } finally { globalThis.window = original }
})
test('auth transport discards error config/body and reports only sanitized status', async () => {
  const original = globalThis.window
  globalThis.window = { sessionStorage: { getItem: () => null }, localStorage: { getItem: () => null }, dispatchEvent: () => {} }
  try {
    const auth = loadTransport()
    auth.default.defaults.adapter = () => Promise.reject(Object.assign(new Error('raw-secret'), { isAxiosError: true, response: { status: 422, data: { secret: raw } }, config: { data: raw } }))
    await assert.rejects(auth.authTransport('/mfa/login', { challenge: raw, otp: '123456' }, true), error => !('config' in error) && !JSON.stringify(error).includes(raw) && !error.message.includes('raw-secret'))
  } finally { globalThis.window = original }
})
test('UI integration keeps secrets volatile, provides labels/paste/autocomplete, and never fabricates roles/proof/secret URLs', () => {
  for (const file of ['authFlow.ts', 'AuthChallengePage.tsx', 'StepUpDialog.tsx', 'RecoveryCodes.tsx', 'ActivationPage.tsx', 'authApi.ts']) {
    const source = readFileSync(resolve('src/features/authentication', file), 'utf8')
    assert.doesNotMatch(source, /localStorage|sessionStorage|console\.|navigator\.clipboard|onPaste|window\.open|https:\/\/.*qr/i)
    assert.doesNotMatch(source, /mfa_verified|is_admin\s*:|role\s*:\s*['"]admin/)
  }
  const context = readFileSync('src/contexts/AuthContext.tsx', 'utf8')
  assert.match(context, /authFlow\.reset\(\)/)
  assert.match(context, /useSyncExternalStore/)
  const panel = readFileSync('src/features/authentication/AuthChallengePage.tsx', 'utf8')
  assert.match(panel, /autoComplete=.*one-time-code/)
  assert.match(panel, /form\.reset\(\)/)
  const role = readFileSync('src/pages/OrganizationDesign.tsx', 'utf8')
  assert.match(role, /action: 'role.assign', scope: \{ user_id: roleStepUp.userId, role_id: roleStepUp.roleId \}/)
  assert.match(role, /role_ids: \[roleStepUp.roleId\]/)
})
