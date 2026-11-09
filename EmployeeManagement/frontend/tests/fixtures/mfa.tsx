import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { AxiosError, AxiosHeaders } from 'axios'
import { AuthProvider, useAuth } from '../../src/contexts/AuthContext'
import api from '../../src/services/api'
import AuthChallengePage from '../../src/features/authentication/AuthChallengePage'
import MfaSecurityPage from '../../src/features/authentication/MfaSecurityPage'
import ActivationPage from '../../src/features/authentication/ActivationPage'
import { Button } from '../../src/components/ui'
import '../../src/index.css'

// Dedicated-origin QA fixture. EVERY request is intercepted; no API/network fallback.
const challenge = 'a'.repeat(64)
const secret = 'A'.repeat(32)
const codes = Array.from({ length: 10 }, (_, index) => index.toString(16).padStart(32, '0'))
let enrolled = false
let currentMfa = true
const user = { id: 1, employee_id: 1, login_id: 'SYNTHETIC', email: 'synthetic@example.test', name: 'Synthetic', role: 'employee', is_active: true, must_change_password: false, roles: [], role_names: [], permission_names: [], employee: null }
api.defaults.adapter = async config => {
  const data = typeof config.data === 'string' ? JSON.parse(config.data) : config.data ?? {}
  const path = config.url
  let status = 200, result: unknown
  const next = { challenge, purpose: 'recovery_enroll', expires_in: 300 }
  const session = () => ({ user, token: '1|synthetic-only-fixture', authentication: { requires_mfa: currentMfa } })
  if (path === '/login') {
    currentMfa = data.email !== 'ordinary@example.test'
    if (currentMfa) { status = 202; result = { mfa_required: true, purpose: enrolled ? 'login_mfa' : 'login_enroll', challenge, expires_in: 300 } }
    else result = session()
  } else if (path === '/mfa/enrollment/start') result = { secret, otpauth_uri: `otpauth://totp/THEMIS:synthetic?secret=${secret}&issuer=THEMIS` }
  else if (path === '/mfa/login' && data.recovery_code) result = next
  else if (['/mfa/login', '/mfa/enrollment/confirm', '/mfa/step-up'].includes(path ?? '')) {
    if (data.otp !== '123456') throw new AxiosError('Synthetic rejected OTP', 'ERR_BAD_REQUEST', config, undefined,
      { data: { message: 'Synthetic only' }, status: 422, statusText: 'Unprocessable', headers: new AxiosHeaders(), config })
    if (path === '/mfa/login') result = session()
    else if (path === '/mfa/step-up') result = { verified: true, action: data.action, expires_in: 300 }
    else { enrolled = true; result = { recovery_codes: codes, reauthentication_required: true } }
  } else if (path === '/mfa/recovery-codes/regenerate') result = { recovery_codes: codes, reauthentication_required: true }
  else if (path === '/mfa/settings') result = { enabled: currentMfa, required: currentMfa }
  else if (path === '/mfa/device/change') result = next
  else if (path === '/me') result = { user, authentication: { requires_mfa: currentMfa } }
  else if (path === '/account-activation/complete') result = { message: 'Synthetic activation only' }
  else if (path === '/logout' || path === '/presence/heartbeat') { status = 204; result = null }
  else throw new Error('Synthetic fixture blocks every unrecognized request')
  return { data: result, status, statusText: 'Synthetic', headers: new AxiosHeaders(), config }
}

export function Fixture() {
  const { user: authenticated, authState, authFlow, login, logout, isLoading } = useAuth()
  const [activation, setActivation] = useState(false)
  if (isLoading) return <p>Đang khởi tạo fixture giả…</p>
  if (activation && !authenticated) return <><Button onClick={() => setActivation(false)}>Quay lại fixture</Button><ActivationPage /></>
  if (!['idle', 'submitting_password', 'authenticated'].includes(authState.phase)) return <AuthChallengePage />
  if (authenticated) return <><p role="status">Đã đăng nhập bằng dữ liệu giả.</p><Button onClick={() => void logout()}>Đăng xuất (giả)</Button><MfaSecurityPage /></>
  return <main className="auth-security-page"><section className="auth-security-panel auth-security-form">
    <h1>MFA fixture — không dùng dữ liệu thật</h1>
    <p>OTP giả: 123456. Mọi request đều bị chặn và thay bằng dữ liệu giả.</p>
    <Button onClick={() => { enrolled = false; void login({ email: 'synthetic@example.test', password: 'Synthetic-only!Password', remember: false }) }}>Bắt đầu enrollment giả</Button>
    <Button onClick={() => { enrolled = true; void login({ email: 'synthetic@example.test', password: 'Synthetic-only!Password', remember: false }) }}>Bắt đầu MFA login giả</Button>
    <Button onClick={() => void login({ email: 'ordinary@example.test', password: 'Synthetic-only!Password', remember: false })}>Nhân viên thường (giả)</Button>
    <Button onClick={() => { authFlow.reset(); setActivation(true) }}>Kích hoạt giả</Button>
  </section></main>
}
createRoot(document.getElementById('root')!).render(<MemoryRouter><AuthProvider>
  <Button onClick={() => document.documentElement.classList.toggle('dark')}>Đổi sáng/tối (fixture)</Button><Fixture />
</AuthProvider></MemoryRouter>)
