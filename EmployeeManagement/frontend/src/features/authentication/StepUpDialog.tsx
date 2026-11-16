import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button, IconButton, ModalShell } from '../../components/ui'
import { VerificationCodeInput } from './VerificationCodeInput'
import { AuthFailure, MutationUncertain, japaneseAuthError, type StepUpOperation } from './authFlow'
import { withStepUp } from './authApi'
import './authentication.css'

const copy = {
  vi: {
    title: 'Xác minh thao tác đặc quyền',
    instructions: 'Nhập mật khẩu và mã Authenticator mới. Xác minh chỉ dùng một lần cho đúng thao tác đã chọn.',
    password: 'Mật khẩu hiện tại',
    showPassword: 'Hiện mật khẩu',
    hidePassword: 'Ẩn mật khẩu',
    otp: 'Mã Authenticator',
    submit: 'Xác minh và thực hiện',
    cancel: 'Hủy',
    retry: 'Không thể xác minh thao tác. Vui lòng thử lại với mã mới.',
  },
  ja: {
    title: '操作の追加認証',
    instructions: '現在のパスワードと認証アプリの6桁のコードを入力してください。認証は選択した操作に対して1回のみ有効です。',
    password: '現在のパスワード',
    showPassword: 'パスワードを表示する',
    hidePassword: 'パスワードを隠す',
    otp: '認証コード',
    submit: '認証して実行',
    cancel: 'キャンセル',
    retry: '認証できませんでした。新しいコードで再度お試しください。',
  },
}

export default function StepUpDialog({ operation, description, language = 'vi', mutate, onComplete, onCancel, onMutationError }: {
  operation: StepUpOperation; description: string; language?: keyof typeof copy; mutate: () => Promise<unknown>
  onComplete: (result: unknown) => void; onCancel: () => void; onMutationError: (message: string) => void
}) {
  const labels = copy[language]
  const [showPassword, setShowPassword] = useState(false)
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const locked = useRef(false)
  const active = useRef(true)
  const errorRef = useRef<HTMLDivElement>(null)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (locked.current) return
    const form = event.currentTarget
    const data = new FormData(form)
    const password = String(data.get('password') ?? '')
    const otp = String(data.get('otp') ?? '').trim()
    form.reset()
    locked.current = true; setBusy(true); setError('')
    let mutationCompleted = false
    try {
      const result = await withStepUp(operation, password, otp, async () => {
        if (!active.current) throw new AuthFailure(401)
        return mutate()
      })
      mutationCompleted = true
      if (active.current) onComplete(result)
    } catch (failure) {
      if (!active.current) return
      if (failure instanceof MutationUncertain || mutationCompleted) {
        const uncertain = failure instanceof MutationUncertain ? failure : new MutationUncertain()
        if (language === 'ja') {
          const reason = uncertain.status >= 400 && uncertain.status < 500
            ? japaneseAuthError(uncertain.status) : '操作の結果を確認できませんでした。'
          onMutationError(`${reason}自動で再送はされません。操作をやり直す前に現在の状態を確認してください。`)
        } else onMutationError(uncertain.message)
      } else if (failure instanceof AuthFailure) {
        setError(language === 'ja' ? japaneseAuthError(failure.status) : failure.message)
      } else setError(labels.retry)
    } finally { locked.current = false; if (active.current) setBusy(false) }
  }
  return <ModalShell isOpen onClose={onCancel} dismissible={!busy} title={<span lang={language}>{labels.title}</span>} titleId="step-up-title" description={<span lang={language}>{description}</span>} size="sm">
    <form className="auth-security-form" lang={language} onSubmit={submit} onReset={() => {
      setOtp('')
      setShowPassword(false)
    }} aria-busy={busy}>
      <p id="step-up-instructions">{labels.instructions}</p>
      <div className="grid gap-1.5">
        <label htmlFor="step-up-password">{labels.password}</label>
        <div className="auth-step-up-password relative">
          <input id="step-up-password" name="password" type={showPassword ? 'text' : 'password'}
            autoComplete="current-password" required disabled={busy} autoFocus />
          <IconButton type="button" className="absolute end-1 top-1/2 -translate-y-1/2"
            aria-label={showPassword ? labels.hidePassword : labels.showPassword} aria-controls="step-up-password"
            disabled={busy} onClick={() => setShowPassword(value => !value)}>
            {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </IconButton>
        </div>
      </div>
      <label htmlFor="step-up-otp">{labels.otp}
        <VerificationCodeInput id="step-up-otp" name="otp" value={otp} onChange={setOtp}
          disabled={busy} describedBy="step-up-instructions" />
      </label>
      {error && <div className="auth-security-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</div>}
      <Button type="submit" variant="primary" loading={busy}>{labels.submit}</Button>
      <Button type="button" disabled={busy} onClick={onCancel}>{labels.cancel}</Button>
    </form>
  </ModalShell>
}
