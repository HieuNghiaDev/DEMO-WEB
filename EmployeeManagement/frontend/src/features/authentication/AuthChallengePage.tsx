import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, CircleAlert, KeyRound, ShieldCheck, Smartphone } from 'lucide-react'
import { Button } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { RecoveryCodes } from './RecoveryCodes'
import { japaneseAuthError } from './authFlow'
import './authentication.css'

export default function AuthChallengePage() {
  const { authState: state, authFlow } = useAuth()
  const [recovery, setRecovery] = useState(false)
  const [otp, setOtp] = useState('')
  const [otpCursor, setOtpCursor] = useState(0)
  const errorRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (state.error) errorRef.current?.focus() }, [state.error])
  const hasChallenge = typeof state.challenge === 'string' && /^[a-f0-9]{64}$/.test(state.challenge)
    && typeof state.expiresAt === 'number'
  const showMfa = hasChallenge && ['mfa_required', 'mfa_enrollment_required', 'verifying_mfa'].includes(state.phase)
  const restartRequired = !showMfa && state.phase !== 'recovery_codes'
  const enroll = state.phase === 'mfa_enrollment_required' || !!state.enrollment
  const useBackupCode = recovery && !enroll
  const HeadingIcon = restartRequired ? CircleAlert : useBackupCode ? KeyRound : ShieldCheck
  const clearOtp = () => {
    setOtp('')
    setOtpCursor(0)
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const input = String(new FormData(form).get('factor') ?? '').trim()
    form.reset()
    if (enroll) await authFlow.confirmEnrollment(input)
    else await authFlow.verify(recovery ? { recovery_code: input.toLowerCase() } : { otp: input })
  }
  return <section className="auth-challenge-panel" lang="ja" aria-labelledby="auth-challenge-title">
    <header className="auth-challenge-heading">
      <span className="auth-challenge-icon" aria-hidden="true"><HeadingIcon size={22} /></span>
      <div>
        <p>THEMIS WORKSPACE</p>
        <h2 id="auth-challenge-title">{restartRequired ? '認証を完了できませんでした' : state.phase === 'recovery_codes' ? '認証アプリを確認しました' : enroll ? '認証アプリの設定' : '二段階認証'}</h2>
      </div>
    </header>
    {state.error && <div className="auth-security-error" role="alert" tabIndex={-1} ref={errorRef}>{japaneseAuthError(state.errorStatus ?? 0)}</div>}
    {restartRequired ? <div className="auth-security-form"><p>メールアドレスとパスワードを使って、もう一度ログインしてください。</p><Button className="themis-auth-primary" type="button" variant="primary" size="lg" icon={<ArrowLeft size={16} aria-hidden="true" />} onClick={authFlow.reset}>ログインに戻る</Button></div>
      : state.phase === 'recovery_codes' ? <RecoveryCodes codes={state.codes ?? []} onDone={authFlow.reset} />
      : <div className="auth-security-form">
        <p id="auth-challenge-instructions">{enroll
          ? '認証アプリにTHEMISのアカウントを追加し、設定キーを手動で入力してください。時間ベース（TOTP）、6桁、30秒を選択します。'
          : useBackupCode
            ? '保存したバックアップコードを入力してください。確認後、新しい認証アプリを登録して再度ログインします。'
            : '認証アプリに表示される6桁のコードを入力してください。使用済みの場合は、次のコードをお待ちください。'}</p>
        {enroll && !state.enrollment ? <Button className="themis-auth-primary" type="button" variant="primary" size="lg" loading={state.busy} onClick={() => void authFlow.startEnrollment()}>設定キーを表示する</Button> : <>
          {state.enrollment && <>
            <div><p>設定キー</p><code>{state.enrollment.secret}</code></div>
            <details><summary className="text-sm cursor-pointer">認証アプリ用の設定URI</summary><code>{state.enrollment.uri}</code></details>
            <p>設定キーとURIは他の人と共有しないでください。設定を中断した場合は、再度ログインして最初からやり直してください。</p>
          </>}
          <form className="auth-security-form" onSubmit={submit} onReset={clearOtp} aria-busy={state.busy}>
            <label htmlFor="mfa-factor">{useBackupCode ? 'バックアップコード' : '認証コード'}
              {useBackupCode ? <input id="mfa-factor" name="factor" className="auth-challenge-backup-input"
                type="password" autoComplete="off" required pattern="[a-fA-F0-9]{32}" maxLength={32}
                aria-describedby="auth-challenge-instructions" disabled={state.busy} autoFocus />
              : <span className="auth-challenge-otp">
                <span className="auth-challenge-otp-slots" aria-hidden="true">
                  {Array.from({ length: 6 }, (_, index) => <span key={index}
                    data-active={index === Math.min(otpCursor, 5)}
                    data-filled={Boolean(otp[index])}>{otp[index]}</span>)}
                </span>
                <input id="mfa-factor" name="factor" type="text" inputMode="numeric" autoComplete="one-time-code"
                  required pattern="[0-9]{6}" value={otp} disabled={state.busy} autoFocus
                  aria-describedby="auth-challenge-instructions"
                  onChange={event => {
                    const field = event.currentTarget
                    const digits = field.value.replace(/\D/g, '').slice(0, 6)
                    setOtp(digits)
                    setOtpCursor(Math.min(field.selectionStart ?? digits.length, digits.length))
                  }}
                  onSelect={event => setOtpCursor(event.currentTarget.selectionStart ?? otp.length)}
                  onClick={event => {
                    const field = event.currentTarget
                    if (!event.detail || field.selectionStart !== field.selectionEnd) return
                    const bounds = field.getBoundingClientRect()
                    const index = Math.floor((event.clientX - bounds.left) * 6 / bounds.width)
                    const cursor = Math.min(Math.max(index, 0), otp.length)
                    field.setSelectionRange(cursor, Math.min(cursor + 1, otp.length))
                    setOtpCursor(cursor)
                  }} />
              </span>}
            </label>
            <Button className="themis-auth-primary" type="submit" variant="primary" size="lg" fullWidth loading={state.busy} icon={<ArrowRight size={16} aria-hidden="true" />} iconPosition="right">{enroll ? '認証アプリを確認する' : useBackupCode ? '認証アプリを復旧する' : '認証してログイン'}</Button>
          </form>
        </>}
        <footer className="auth-challenge-footer">
          {!enroll && <Button type="button" variant="outline" size="lg" fullWidth disabled={state.busy}
            icon={useBackupCode ? <Smartphone size={16} aria-hidden="true" /> : <KeyRound size={16} aria-hidden="true" />}
            onClick={() => {
              clearOtp()
              setRecovery(value => !value)
            }}>{useBackupCode ? '認証アプリのコードを使う' : 'バックアップコードを使う'}</Button>}
          <p>認証アプリとバックアップコードの両方が使えない場合は、アカウントの管理担当者に連絡してください。</p>
          <Button type="button" className="auth-challenge-back" variant="ghost" size="sm" disabled={state.busy}
            icon={<ArrowLeft size={15} aria-hidden="true" />} onClick={authFlow.reset}>キャンセルしてログインに戻る</Button>
        </footer>
      </div>}
  </section>
}
