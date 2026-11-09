import { StrictMode, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AxiosError, AxiosHeaders } from 'axios'
import { AuthProvider, useAuth } from '../../src/contexts/AuthContext'
import ProtectedRoute from '../../src/components/auth/ProtectedRoute'
import Login from '../../src/pages/Login'
import api, { clearAuthToken, hasAuthToken, storeAuthToken } from '../../src/services/api'
import '../../src/index.css'

// Separate-origin diagnostics only. No transport ever delegates to XHR/fetch.
// CSP additionally forbids connections to the real application/backend origins.
const scenarios = ['ordinary', 'old-contract', 'login-500', 'login-network', 'mfa',
  'mfa-network', 'mfa-malformed', 'session-200', 'session-500', 'session-network',
  'session-401', 'session-403', 'session-429', 'session-malformed', 'late-session'] as const
type Scenario = typeof scenarios[number]
type Entry = { method: string; path: string; status: number; durationMs: number; bearerPresent: boolean; result: string }
let selected: Scenario = 'ordinary'
let completedMfa = false
let entries: Entry[] = []
let releaseSession: (() => void) | undefined
const subscribers = new Set<() => void>()
const subscribe = (listener: () => void) => { subscribers.add(listener); return () => { subscribers.delete(listener) } }
const getEntries = () => entries
const notify = () => subscribers.forEach(listener => listener())
const user = { id: 1, employee_id: 1, login_id: 'SYNTHETIC', email: 'synthetic@example.test',
  name: 'Synthetic user', role: 'employee', is_active: true, must_change_password: false,
  roles: [], role_names: [], permission_names: [], employee: null }
const session = (mfa: boolean) => ({ user, token: '1|synthetic-fixture-only', authentication: { requires_mfa: mfa } })
api.defaults.baseURL = '/__isolated_auth_mock__'
api.defaults.adapter = async config => {
  const started = performance.now()
  const path = config.url ?? ''
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data ?? {}
  const scenario = selected
  let status = 200, result = 'mock-success', data: unknown
  if (path === '/login') {
    if (scenario === 'login-500') { status = 500; result = 'mock-server-unavailable' }
    else if (scenario === 'login-network') { status = 0; result = 'mock-network-failure' }
    else if (scenario.startsWith('mfa')) {
      status = 202; data = { mfa_required: true, purpose: 'login_mfa', challenge: 'a'.repeat(64), expires_in: 300 }
    } else if (scenario === 'old-contract') data = { user, token: '1|synthetic-fixture-only' }
    else { completedMfa = false; data = session(false) }
  } else if (path === '/mfa/login') {
    if (scenario === 'mfa-network') { status = 0; result = 'mock-network-failure' }
    else if (scenario === 'mfa-malformed') data = { user }
    else if (body.otp !== '123456') { status = 422; result = 'mock-invalid-factor' }
    else { completedMfa = true; data = session(true) }
  } else if (path === '/me') {
    if (scenario === 'late-session') await new Promise<void>(resolve => {
      const previous = releaseSession
      releaseSession = () => { previous?.(); resolve() }
    })
    if (scenario === 'session-network') { status = 0; result = 'mock-network-failure' }
    else if (scenario === 'session-malformed') data = { authentication: { requires_mfa: false } }
    else if (['session-500', 'session-401', 'session-403', 'session-429'].includes(scenario)) {
      status = Number(scenario.split('-')[1]); result = 'mock-session-error'
    } else data = { user: scenario === 'late-session' ? { ...user, id: 2 } : user, authentication: { requires_mfa: completedMfa } }
  } else if (path === '/logout' || path === '/presence/heartbeat') { status = 204; data = null }
  else { status = 503; result = 'blocked-unknown-request' }
  entries = [...entries, { method: (config.method ?? '').toUpperCase(), path: path.split('?')[0], status,
    durationMs: Math.round(performance.now() - started),
    bearerPresent: typeof config.headers.get('Authorization') === 'string', result }]
  notify()
  if (status === 0) throw new AxiosError('Synthetic network failure', 'ERR_NETWORK', config)
  const response = { data, status, statusText: 'Synthetic', headers: new AxiosHeaders(), config }
  if (status >= 400) throw new AxiosError('Synthetic rejected request', 'ERR_BAD_RESPONSE', config, undefined, response)
  return response
}

function StatusPanel() {
  const auth = useAuth()
  const location = useLocation()
  const events = useSyncExternalStore(subscribe, getEntries)
  return <aside style={{ padding: 12, background: 'var(--tm-surface)', color: 'var(--tm-text)', borderBottom: '1px solid var(--tm-border)' }}>
    <p>DIAGNOSTICS ONLY · Synthetic transport · No real backend · CORS not exercised</p>
    <output data-testid="auth-state">{JSON.stringify({ phase: auth.authState.phase, userPresent: !!auth.user,
      syntheticUserId: auth.user?.id ?? null, tokenPresent: hasAuthToken(), restoreError: auth.sessionRestoreError,
      isLoading: auth.isLoading, route: location.pathname, requiresMfa: auth.requiresMfa })}</output>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
      <button onClick={() => void auth.refreshUser()}>Refresh session (fake)</button>
      <button onClick={() => void auth.logout().catch(() => undefined)}>Logout (fake)</button>
      <button onClick={() => void auth.login({ email: user.email, password: 'Synthetic-only!Password', remember: false })}>Switch account login (fake)</button>
      <button onClick={() => { releaseSession?.(); releaseSession = undefined }}>Release old session response</button>
      <button onClick={() => { selected = 'session-200' }}>Restore fake server</button>
      <button onClick={auth.authFlow.expire}>Check challenge expiry</button>
    </div>
    <pre data-testid="sanitized-requests" style={{ maxHeight: 130, overflowY: 'auto', whiteSpace: 'pre-wrap', fontSize: 11 }}>{JSON.stringify(events, null, 1)}</pre>
  </aside>
}

function AuthenticatedLanding() {
  return <main><h1 data-testid="workspace">Synthetic authenticated workspace</h1><p>No business API is called.</p></main>
}

export function LoginDebugFixture() {
  const [scenario, setScenario] = useState<Scenario>('ordinary')
  const [revision, setRevision] = useState(0)
  const start = (value: Scenario) => {
    selected = value; completedMfa = false; clearAuthToken(); entries = []
    // Only this dedicated fixture origin receives a synthetic stored session.
    if (value.startsWith('session-') || value === 'late-session') storeAuthToken('1|synthetic-fixture-only', false)
    setScenario(value); setRevision(current => current + 1)
  }
  return <>
    <header style={{ padding: 12, background: 'var(--tm-surface)', color: 'var(--tm-text)' }}>
      <h1>THEMIS isolated Login + AuthProvider diagnostics</h1>
      <label>Scenario <select aria-label="Synthetic scenario" value={scenario} onChange={event => start(event.target.value as Scenario)}>
        {scenarios.map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
      <button onClick={() => start(scenario)}>Restart selected scenario</button>
    </header>
    <StrictMode><MemoryRouter key={revision} initialEntries={[scenario.startsWith('session-') ? '/' : '/login']}>
      <AuthProvider><StatusPanel /><Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}><Route path="/" element={<AuthenticatedLanding />} /></Route>
      </Routes></AuthProvider>
    </MemoryRouter></StrictMode>
  </>
}

const root = createRoot(document.getElementById('root')!)
root.render(<LoginDebugFixture />)
// Vite reloads this test entry after edits; do not attach a second React root.
import.meta.hot?.dispose(() => root.unmount())
