import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Button } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { authTransport } from './authApi'
import { AuthFailure, record } from './authFlow'
import './authentication.css'

export default function ActivationPage() {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [done, setDone] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    const data = new FormData(form)
    const token = String(data.get('token') ?? '').trim()
    const password = String(data.get('password') ?? '')
    const passwordConfirmation = String(data.get('password_confirmation') ?? '')
    if (password.length < 11 || password.length > 128 || !/[A-Z]/.test(password) || !/[\p{P}\p{S}]/u.test(password) || password !== passwordConfirmation) {
      setMessage('Mật khẩu phải có 11–128 ký tự, chữ hoa, ký hiệu và khớp xác nhận.'); return
    }
    form.reset(); setBusy(true); setMessage('')
    try {
      const response = await authTransport('/account-activation/complete', { token, password, password_confirmation: passwordConfirmation }, true)
      if (response.status !== 200 || !record(response.data) || typeof response.data.message !== 'string' || 'token' in response.data) throw new AuthFailure(422)
      setDone(true); setMessage('Tài khoản đã được kích hoạt. Đăng nhập bằng mật khẩu vừa đặt; MFA vẫn bắt buộc nếu máy chủ yêu cầu.')
    } catch (error) { setMessage(error instanceof AuthFailure ? error.message : 'Không thể xác nhận kích hoạt tài khoản.') }
    finally { setBusy(false) }
  }
  if (user) return <Navigate to="/" replace />
  return <main className="auth-security-page" lang="vi"><section className="auth-security-panel">
    <h1>Kích hoạt tài khoản THEMIS</h1>
    <p className="auth-security-help mb-4">Chỉ dùng mã mời được bàn giao qua quy trình đã phê duyệt. Giao diện này không phát hành hoặc gửi lời mời và không cung cấp mật khẩu dùng chung.</p>
    {message && <p className={done ? 'auth-security-help' : 'auth-security-error'} role={done ? 'status' : 'alert'}>{message}</p>}
    {!done && <form className="auth-security-form mt-4" onSubmit={submit} aria-busy={busy}>
      <label htmlFor="activation-token">Mã kích hoạt<input id="activation-token" name="token" type="password" pattern="[a-f0-9]{64}" minLength={64} maxLength={64} autoComplete="off" required disabled={busy} /></label>
      <label htmlFor="activation-password">Mật khẩu mới<input id="activation-password" name="password" type="password" minLength={11} maxLength={128} autoComplete="new-password" required disabled={busy} /></label>
      <label htmlFor="activation-password-confirmation">Xác nhận mật khẩu<input id="activation-password-confirmation" name="password_confirmation" type="password" minLength={11} maxLength={128} autoComplete="new-password" required disabled={busy} /></label>
      <Button variant="primary" type="submit" loading={busy}>Kích hoạt tài khoản</Button>
    </form>}
    <Link to="/login" className="mt-4 block text-sm underline text-[var(--tm-primary)]">Quay lại đăng nhập</Link>
  </section></main>
}
