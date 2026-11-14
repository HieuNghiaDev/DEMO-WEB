import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, KeyRound, ShieldCheck } from 'lucide-react'
import { Button } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import AuthPageLayout from './AuthPageLayout'
import { authTransport } from './authApi'
import { AuthFailure, japaneseAuthError, record } from './authFlow'
import './authentication.css'

export default function ActivationPage() {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
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
      setErrorMessage('パスワードは11〜128文字で、半角英大文字と記号を含めてください。確認欄には同じパスワードを入力してください。')
      return
    }
    form.reset()
    setBusy(true)
    setErrorMessage('')
    try {
      const response = await authTransport('/account-activation/complete', { token, password, password_confirmation: passwordConfirmation }, true)
      if (response.status !== 200 || !record(response.data) || typeof response.data.message !== 'string' || 'token' in response.data) throw new AuthFailure(422)
      setDone(true)
    } catch (error) {
      const status = error instanceof AuthFailure ? error.status : 0
      setErrorMessage(status === 422
        ? '有効化できませんでした。招待コードと入力内容をご確認ください。招待コードの再発行は管理担当者にご依頼ください。'
        : japaneseAuthError(status))
    } finally {
      setBusy(false)
    }
  }
  if (user) return <Navigate to="/" replace />
  return (
    <AuthPageLayout compact>
      <section className="auth-challenge-panel" aria-labelledby="activation-title">
        <header className="auth-challenge-heading">
          <span className={`auth-challenge-icon${done ? ' auth-activation-complete' : ''}`} aria-hidden="true">
            {done ? <ShieldCheck size={22} /> : <KeyRound size={22} />}
          </span>
          <div>
            <p>社員ポータル</p>
            <h2 id="activation-title">{done ? 'アカウントを有効化しました' : 'アカウントの有効化'}</h2>
          </div>
        </header>
        {done ? (
          <p className="auth-security-help" role="status">設定したパスワードでログインしてください。二段階認証が必要な場合は、ログイン時に案内が表示されます。</p>
        ) : (
          <>
            <p className="auth-security-help">受け取った招待コードを入力し、ログイン用のパスワードを設定してください。</p>
            <form className="auth-security-form auth-activation-form" onSubmit={submit} aria-busy={busy}>
              <label htmlFor="activation-token">招待コード
                <input id="activation-token" name="token" type="password" pattern="[a-f0-9]{64}" minLength={64} maxLength={64} autoComplete="off" required disabled={busy} />
              </label>
              <div>
                <label htmlFor="activation-password">新しいパスワード
                  <input id="activation-password" name="password" type="password" minLength={11} maxLength={128} autoComplete="new-password" aria-describedby="activation-password-help" required disabled={busy} />
                </label>
                <p id="activation-password-help" className="auth-security-help">11〜128文字。半角英大文字と記号を含めてください。</p>
              </div>
              <label htmlFor="activation-password-confirmation">パスワードの確認
                <input id="activation-password-confirmation" name="password_confirmation" type="password" minLength={11} maxLength={128} autoComplete="new-password" required disabled={busy} />
              </label>
              {errorMessage && <p className="auth-security-error" role="alert">{errorMessage}</p>}
              <Button className="themis-auth-primary" variant="primary" size="lg" type="submit" fullWidth loading={busy} icon={<ArrowRight size={16} aria-hidden="true" />} iconPosition="right">アカウントを有効化</Button>
            </form>
          </>
        )}
        <footer className="auth-challenge-footer">
          <Link to="/login" className="auth-activation-back">
            <ArrowLeft size={15} aria-hidden="true" /> ログインに戻る
          </Link>
        </footer>
      </section>
    </AuthPageLayout>
  )
}
