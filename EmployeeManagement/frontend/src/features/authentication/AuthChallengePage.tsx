import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { RecoveryCodes } from './RecoveryCodes'
import { japaneseAuthError } from './authFlow'
import './authentication.css'

export default function AuthChallengePage() {
  const { authState: state, authFlow } = useAuth()
  const [recovery, setRecovery] = useState(false)
  const errorRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (state.error) errorRef.current?.focus() }, [state.error])
  const hasChallenge = typeof state.challenge === 'string' && /^[a-f0-9]{64}$/.test(state.challenge)
    && typeof state.expiresAt === 'number'
  const showMfa = hasChallenge && ['mfa_required', 'mfa_enrollment_required', 'verifying_mfa'].includes(state.phase)
  const restartRequired = !showMfa && state.phase !== 'recovery_codes'
  const enroll = state.phase === 'mfa_enrollment_required' || !!state.enrollment
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const input = String(new FormData(form).get('factor') ?? '').trim()
    form.reset()
    if (enroll) await authFlow.confirmEnrollment(input)
    else await authFlow.verify(recovery ? { recovery_code: input.toLowerCase() } : { otp: input })
  }
  return <main className="auth-security-page" lang="ja"><section className="auth-security-panel">
    <p className="auth-security-help mb-3">THEMIS · アカウント認証</p>
    <h1>{restartRequired ? '認証を完了できませんでした' : state.phase === 'recovery_codes' ? '認証アプリを確認しました' : enroll ? '認証アプリの設定' : '二段階認証'}</h1>
    {state.error && <div className="auth-security-error mb-4" role="alert" tabIndex={-1} ref={errorRef}>{japaneseAuthError(state.errorStatus ?? 0)}</div>}
    {restartRequired ? <div className="auth-security-form"><p>メールアドレスとパスワードを使って、もう一度ログインしてください。</p><Button variant="primary" onClick={authFlow.reset}>ログインに戻る</Button></div>
      : state.phase === 'recovery_codes' ? <RecoveryCodes codes={state.codes ?? []} onDone={authFlow.reset} />
      : <div className="auth-security-form">
        <p>{enroll ? '認証アプリにTHEMISのアカウントを追加し、設定キーを手動で入力してください。時間ベース（TOTP）、6桁、30秒を選択します。' : '認証アプリに表示される6桁のコードを入力してください。使用済みの場合は次のコードをお待ちください。'}</p>
        {enroll && !state.enrollment ? <Button variant="primary" loading={state.busy} onClick={() => void authFlow.startEnrollment()}>設定キーを表示する</Button> : <>
          {state.enrollment && <>
            <div><p>設定キー</p><code>{state.enrollment.secret}</code></div>
            <details><summary className="text-sm cursor-pointer">認証アプリ用の設定URI</summary><code>{state.enrollment.uri}</code></details>
            <p>設定キーとURIは他の人と共有しないでください。設定を中断した場合は、再度ログインして最初からやり直してください。</p>
          </>}
          <form className="auth-security-form" onSubmit={submit} aria-busy={state.busy}>
            <label htmlFor="mfa-factor">{recovery && !enroll ? 'バックアップコード' : '認証コード'}
              <input id="mfa-factor" name="factor" type={recovery && !enroll ? 'password' : 'text'} inputMode={recovery && !enroll ? 'text' : 'numeric'} autoComplete={recovery && !enroll ? 'off' : 'one-time-code'} required pattern={recovery && !enroll ? '[a-fA-F0-9]{32}' : '[0-9]{6}'} maxLength={recovery && !enroll ? 32 : 6} disabled={state.busy} autoFocus />
            </label>
            <Button type="submit" variant="primary" fullWidth loading={state.busy}>{enroll ? '認証アプリを確認する' : recovery ? '認証アプリを復旧する' : '認証してログイン'}</Button>
          </form>
        </>}
        {!enroll && <Button variant="ghost" disabled={state.busy} onClick={() => setRecovery(value => !value)}>{recovery ? '認証アプリのコードを使う' : 'バックアップコードを使う'}</Button>}
        {recovery && !enroll && <p>バックアップコードで新しい認証アプリを登録できます。登録後に再度ログインしてください。</p>}
        <p>認証アプリとバックアップコードの両方が使えない場合は、アカウントの管理担当者に連絡してください。</p>
        <Button variant="outline" disabled={state.busy} onClick={authFlow.reset}>キャンセルしてログインに戻る</Button>
      </div>}
  </section></main>
}
