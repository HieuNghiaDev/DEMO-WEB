import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { compileFunction } from 'node:vm'
import { resolve } from 'node:path'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { AuthFlow, AuthFailure, japaneseAuthError } from '../src/features/authentication/authFlow.ts'
import * as authNavigation from '../src/utils/authNavigation.ts'

const credential = { email: 'debug@example.test', password: 'Synthetic-only!Password', remember: false }
const challenge = { status: 202, data: { mfa_required: true, purpose: 'login_mfa', challenge: 'a'.repeat(64), expires_in: 300 } }
const session = { user: { id: 1, email: credential.email, is_active: true, roles: [], role_names: [], permission_names: [] },
  token: '1|synthetic-debug-only', authentication: { requires_mfa: false } }
function flowWith(...responses) {
  let commits = 0
  const flow = new AuthFlow(async () => {
    const result = responses.shift()
    if (result instanceof Error) throw result
    assert.ok(result, 'Unexpected synthetic request')
    return result
  }, () => { commits++ })
  return { flow, commits: () => commits }
}

// Render production error components. Context is injected only for this SSR test;
// real AuthProvider effects, transport and route transitions are tested in the browser fixture.
function componentAt(path, context) {
  const localRequire = createRequire(resolve(path))
  const source = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const module = { exports: {} }
  compileFunction(source, ['require', 'module', 'exports'])(specifier => {
    if (specifier.endsWith('/contexts/AuthContext')) return { useAuth: () => context }
    if (specifier.endsWith('/utils/authNavigation')) return authNavigation
    if (specifier.endsWith('.css')) return {}
    if (specifier.endsWith('/components/ui')) return { Button: ({ children }) => React.createElement('button', null, children) }
    if (specifier === '../loading') return { AppLoadingScreen: () => React.createElement('p', null, 'Loading fixture') }
    if (specifier === './RecoveryCodes') return { RecoveryCodes: () => null }
    if (specifier === './authFlow') return { japaneseAuthError }
    return localRequire(specifier)
  }, module, module.exports)
  return module.exports.default
}
const renderChallenge = flow => {
  const Component = componentAt('src/features/authentication/AuthChallengePage.tsx', { authState: flow.getSnapshot(), authFlow: flow })
  return renderToStaticMarkup(React.createElement(Component))
}
const renderGuard = overrides => {
  const Component = componentAt('src/components/auth/ProtectedRoute.tsx', {
    user: null, isLoading: false, sessionRestoreError: false, refreshUser: async () => {}, ...overrides,
  })
  return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Component)))
}

for (const status of [0, 500]) test(`ordinary password failure ${status} creates error A state WITHOUT any MFA challenge or session`, async () => {
  const f = flowWith(new AuthFailure(status))
  assert.equal(await f.flow.login(credential), false)
  assert.equal(f.flow.getSnapshot().phase, 'expired_or_failed')
  assert.equal(f.flow.getSnapshot().challenge, undefined)
  assert.equal(f.commits(), 0)
  assert.match(renderChallenge(f.flow), /サーバーからの応答を確認できませんでした/)
  assert.doesNotMatch(renderChallenge(f.flow), /name="factor"|認証コード/)
})

test('an ordinary login500 must not be titled two-step verification', async () => {
  const f = flowWith(new AuthFailure(500))
  await f.flow.login(credential)
  assert.equal(f.commits(), 0)
  assert.doesNotMatch(renderChallenge(f.flow), /二段階認証/)
})

test('a validated MFA challenge still renders the OTP controls and MFA heading', async () => {
  const f = flowWith(challenge)
  await f.flow.login(credential)
  assert.match(renderChallenge(f.flow), /二段階認証/)
  assert.match(renderChallenge(f.flow), /name="factor"/)
  assert.equal(f.commits(), 0)
})

test('malformed password202 cannot render MFA controls without a valid challenge', async () => {
  const f = flowWith({ status: 202, data: { ...challenge.data, challenge: 'invalid' } })
  await f.flow.login(credential)
  assert.equal(f.commits(), 0)
  assert.doesNotMatch(renderChallenge(f.flow), /二段階認証|name="factor"/)
})

test('validated enrollment preserves Authenticator setup without granting a session', async () => {
  const f = flowWith({ status: 202, data: { ...challenge.data, purpose: 'login_enroll' } })
  await f.flow.login(credential)
  assert.match(renderChallenge(f.flow), /認証アプリの設定/)
  assert.match(renderChallenge(f.flow), /設定キーを表示する/)
  assert.equal(f.commits(), 0)
})

test('network failure during OTP destroys the limited challenge and cannot authenticate', async () => {
  const f = flowWith(challenge, new AuthFailure(0))
  await f.flow.login(credential)
  assert.equal(f.flow.getSnapshot().phase, 'mfa_required')
  await f.flow.verify({ otp: '123456' })
  assert.equal(f.flow.getSnapshot().phase, 'expired_or_failed')
  assert.equal(f.flow.getSnapshot().challenge, undefined)
  assert.equal(f.commits(), 0)
})

test('malformed OTP200 cannot create a business session or fake success', async () => {
  const f = flowWith(challenge, { status: 200, data: { user: session.user } })
  await f.flow.login(credential)
  await f.flow.verify({ otp: '123456' })
  assert.equal(f.flow.getSnapshot().phase, 'mfa_required')
  assert.ok(f.flow.getSnapshot().error)
  assert.equal(f.commits(), 0)
})

test('old ordinary200 missing the new metadata is a contract rejection, not an authenticated session', async () => {
  const { authentication: ignored, ...oldSession } = session
  assert.ok(ignored)
  const f = flowWith({ status: 200, data: oldSession })
  assert.equal(await f.flow.login(credential), false)
  assert.equal(f.commits(), 0)
  assert.equal(f.flow.getSnapshot().phase, 'idle')
  assert.ok(f.flow.getSnapshot().error)
})

test('error B requires failed session restoration plus absent user, and does not render the workspace', () => {
  const html = renderGuard({ sessionRestoreError: true })
  assert.match(html, /ログイン状態を確認できませんでした/)
  assert.match(html, /セッションは保持されています/)
  assert.doesNotMatch(html, /Synthetic authenticated workspace/)
  assert.doesNotMatch(renderGuard({ sessionRestoreError: false }), /ログイン状態を確認できませんでした/)
})

test('initial hydration loading takes precedence over error B', () => {
  const html = renderGuard({ isLoading: true, sessionRestoreError: true })
  assert.match(html, /Loading fixture/)
  assert.doesNotMatch(html, /ログイン状態を確認できませんでした/)
})

test('MFA response tagged as non-MFA is rejected even if it contains a business-token-shaped field', async () => {
  const f = flowWith(challenge, { status: 200, data: session })
  await f.flow.login(credential)
  await f.flow.verify({ otp: '123456' })
  assert.equal(f.commits(), 0)
  assert.equal(f.flow.getSnapshot().phase, 'mfa_required')
})

test('diagnostic browser fixture has no real transport fallback and records only whitelisted telemetry', () => {
  const source = readFileSync('tests/fixtures/login-debug.tsx', 'utf8')
  assert.match(source, /api\.defaults\.adapter = async/)
  assert.match(source, /blocked-unknown-request/)
  assert.match(source, /baseURL = '\/__isolated_auth_mock__'/)
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|console\.|JSON\.stringify\(config|JSON\.stringify\(body/)
  const html = readFileSync('tests/fixtures/login-debug.html', 'utf8')
  assert.match(html, /Content-Security-Policy/)
  assert.match(html, /connect-src 'self'/)
})
