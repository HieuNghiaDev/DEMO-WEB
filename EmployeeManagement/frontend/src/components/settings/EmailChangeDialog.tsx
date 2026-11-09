import { useEffect, useRef, useState, type FormEvent } from 'react'
import { isAxiosError } from 'axios'
import { Button, ModalShell } from '../ui'
import api from '../../services/api'

type Delivery = { available: boolean; requires_mfa: boolean; delivery: 'email' | 'local_log' }
type Challenge = { challenge_id: string; expires_in: number; resend_after: number }

function failureMessage(error: unknown, confirming: boolean): string {
  if (!isAxiosError(error)) return '処理できませんでした。もう一度お試しください。'
  const status = error.response?.status
  const fields = error.response?.data?.errors
  if (status === 429) return 'しばらく待ってから再度お試しください。'
  if (status === 401 || status === 403) return '認証を確認できません。再度ログインしてください。'
  if (status === 422) {
    if (fields?.admin) return '管理者保護のため、このアカウントの変更には管理窓口での確認が必要です。'
    if (fields?.current_password) return '現在のパスワードが正しくありません。'
    if (fields?.mfa || fields?.otp) return '認証アプリのコードを確認してください。'
    return confirming ? '確認コードが無効、または有効期限が切れています。再送信してください。'
      : '新しいメールアドレスと認証情報を確認してください。'
  }
  if (status === 503) return '現在メールアドレスを変更できません。時間をおいて再試行してください。'
  return confirming ? '変更結果を確認できません。接続を確認し、必要に応じて再ログインしてください。'
    : '送信結果を確認できません。時間をおいて再送信してください。'
}

export default function EmailChangeDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [delivery, setDelivery] = useState<Delivery | null>(null)
  const [email, setEmail] = useState('')
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retryAt, setRetryAt] = useState(0)
  const [now, setNow] = useState(Date.now)
  const request = useRef<AbortController | null>(null)
  const locked = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    request.current = controller
    void api.get<Delivery>('/me/email-change', { signal: controller.signal }).then(response => {
      if (!controller.signal.aborted) setDelivery(response.data)
    }).catch(() => {
      if (!controller.signal.aborted) setError('変更機能を確認できませんでした。画面を閉じて再度お試しください。')
    })
    return () => { controller.abort(); request.current?.abort() }
  }, [])
  useEffect(() => {
    if (!challenge) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [challenge])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (locked.current || !delivery?.available) return
    locked.current = true
    setBusy(true)
    setError('')
    const form = event.currentTarget
    const data = new FormData(form)
    const controller = new AbortController()
    request.current = controller
    const confirming = challenge !== null
    const payload = confirming ? { challenge_id: challenge.challenge_id, code: String(data.get('code') ?? '').trim() }
      : { email: email.trim().toLowerCase(), current_password: String(data.get('current_password') ?? ''),
        ...(delivery.requires_mfa ? { otp: String(data.get('otp') ?? '').trim() } : {}) }
    for (const name of ['current_password', 'otp', 'code']) {
      const input = form.elements.namedItem(name)
      if (input instanceof HTMLInputElement) input.value = ''
    }
    try {
      if (confirming) {
        const response = await api.post<{ reauthentication_required: boolean }>('/me/email-change/confirm', payload, { signal: controller.signal, timeout: 20_000 })
        if (response.data.reauthentication_required !== true) throw new Error('Unexpected confirmation response')
        if (!controller.signal.aborted) onChanged()
      } else {
        const response = await api.post<Challenge>('/me/email-change', payload, { signal: controller.signal, timeout: 20_000 })
        if (!/^[a-f0-9-]{36}$/i.test(response.data.challenge_id) || !Number.isInteger(response.data.expires_in)
          || response.data.expires_in <= 0 || !Number.isInteger(response.data.resend_after) || response.data.resend_after < 0) {
          throw new Error('Unexpected email challenge response')
        }
        if (!controller.signal.aborted) {
          setChallenge(response.data)
          setRetryAt(Date.now() + response.data.resend_after * 1000)
          setNow(Date.now())
        }
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(failureMessage(failure, confirming))
    } finally {
      locked.current = false
      if (!controller.signal.aborted) setBusy(false)
    }
  }
  const fieldClass = 'mt-2 block h-10 w-full rounded-lg border border-[var(--tm-border)] bg-[var(--tm-control)] px-3 text-sm text-[var(--tm-text-primary)] disabled:opacity-60'
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000))

  return <ModalShell isOpen onClose={onClose} dismissible={!busy} title="メールアドレスを変更" titleId="email-change-title" size="sm">
    <form onSubmit={event => void submit(event)} aria-busy={busy} className="space-y-4">
      {!delivery && !error && <p role="status" className="text-sm text-[var(--tm-text-secondary)]">確認中…</p>}
      {delivery && !delivery.available && <p role="status" className="text-sm text-[var(--tm-text-secondary)]">変更機能の準備が完了していません。管理者にお問い合わせください。</p>}
      {delivery?.delivery === 'local_log' && <p className="rounded-lg bg-[var(--tm-surface-elevated)] p-3 text-xs leading-5 text-[var(--tm-text-secondary)]">
        ローカルテストモードです。メールは外部送信されません。確認コードはサーバーの email-verification.log で確認してください。
      </p>}
      {challenge ? <>
        <p className="break-all text-sm leading-6 text-[var(--tm-text-secondary)]">{email} 宛ての6桁の確認コードを入力してください。有効期限は{Math.ceil(challenge.expires_in / 60)}分です。</p>
        <label className="block text-sm font-medium text-[var(--tm-text-primary)]" htmlFor="email-change-code">確認コード
          <input key={challenge.challenge_id} id="email-change-code" name="code" className={fieldClass}
            autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required disabled={busy} autoFocus />
        </label>
        <Button type="button" variant="ghost" size="sm" disabled={busy || remaining > 0} onClick={() => { setChallenge(null); setError('') }}>
          {remaining > 0 ? `再送信まで ${remaining}秒` : 'コードを再送信'}
        </Button>
      </> : <>
        <label className="block text-sm font-medium text-[var(--tm-text-primary)]" htmlFor="email-change-address">新しいメールアドレス
          <input id="email-change-address" name="email" type="email" className={fieldClass} value={email} maxLength={255}
            onChange={event => setEmail(event.target.value)} autoComplete="email" required disabled={busy || !delivery?.available} autoFocus />
        </label>
        <label className="block text-sm font-medium text-[var(--tm-text-primary)]" htmlFor="email-change-password">現在のパスワード
          <input id="email-change-password" name="current_password" type="password" className={fieldClass}
            autoComplete="current-password" maxLength={128} required disabled={busy || !delivery?.available} />
        </label>
        {delivery?.requires_mfa && <label className="block text-sm font-medium text-[var(--tm-text-primary)]" htmlFor="email-change-mfa">認証アプリのコード
          <input id="email-change-mfa" name="otp" className={fieldClass} inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
            autoComplete="one-time-code" required disabled={busy} />
        </label>}
        <p className="text-xs leading-5 text-[var(--tm-text-secondary)]">確認後はすべての端末からログアウトします。新しいメールアドレスで再度ログインしてください。</p>
      </>}
      {error && <p role="alert" className="text-sm text-[var(--tm-danger)]">{error}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" disabled={busy} onClick={onClose}>キャンセル</Button>
        <Button type="submit" variant="primary" loading={busy} disabled={!delivery?.available}>
          {challenge ? '確認して変更' : '確認コードを送信'}
        </Button>
      </div>
    </form>
  </ModalShell>
}
