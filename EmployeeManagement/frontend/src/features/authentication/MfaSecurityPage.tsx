import { useEffect, useState, type FormEvent } from 'react'
import axios from 'axios'
import { ArrowRight, Info, KeyRound, ShieldOff, Smartphone } from 'lucide-react'
import { SettingsSection, SettingsSecurityBackLink } from '../../components/settings/SettingsSection'
import { Button, StatusBadge } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import api, { captureAuthSession } from '../../services/api'
import StepUpDialog from './StepUpDialog'
import { authTransport } from './authApi'
import { AuthFailure, japaneseAuthError, parseRecoveryCodes, record } from './authFlow'
import './authentication.css'

const mfaActions = [
  { action: 'mfa.device_change', icon: Smartphone, title: '認証アプリ', description: '機種変更などで別の認証アプリを登録します。', button: 'アプリを変更' },
  { action: 'mfa.recovery_codes', icon: KeyRound, title: 'バックアップコード', description: '認証アプリが使えないときに備えて、コードを再発行します。', button: 'コードを再発行' },
  { action: 'mfa.disable', icon: ShieldOff, title: '二段階認証を無効にする', description: '無効化すると、次回からパスワードでログインします。', button: '無効にする' },
] as const

const setupSteps = [
  { title: '現在のパスワードを確認', description: '本人確認を行い、この端末のセッションを終了します。' },
  { title: '認証アプリを登録', description: '設定キーをアプリに登録し、表示された6桁のコードを入力します。' },
  { title: 'バックアップコードを保存', description: 'コードを安全な場所に保存し、再度ログインします。' },
] as const

export default function MfaSecurityPage() {
  const { completeMfaAction, logout } = useAuth()
  const [settings, setSettings] = useState<{ enabled: boolean; required: boolean } | null>(null)
  const [action, setAction] = useState<'mfa.recovery_codes' | 'mfa.device_change' | 'mfa.disable' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    void api.get<unknown>('/mfa/settings', { signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return
      if (!record(data) || typeof data.enabled !== 'boolean' || typeof data.required !== 'boolean') throw new AuthFailure()
      setSettings({ enabled: data.enabled, required: data.required })
    }).catch(failure => {
      if (!controller.signal.aborted) setError(japaneseAuthError(axios.isAxiosError(failure) ? failure.response?.status ?? 0 : 0))
    })
    return () => controller.abort()
  }, [])

  const optIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || settings?.enabled !== false || settings.required) return
    const form = event.currentTarget
    const password = String(new FormData(form).get('password') ?? '')
    form.reset()
    const isCurrent = captureAuthSession()
    setBusy(true)
    setError('')
    try {
      const response = await authTransport('/mfa/enrollment/opt-in', { password }, false)
      if (response.status !== 200) throw new AuthFailure(422)
      if (isCurrent() && form.isConnected) completeMfaAction('opt-in', response.data)
    } catch (failure) {
      if (isCurrent() && form.isConnected) setError(japaneseAuthError(failure instanceof AuthFailure ? failure.status : 0))
    } finally {
      if (form.isConnected) setBusy(false)
    }
  }

  return <div lang="ja" className="min-w-0">
    <SettingsSecurityBackLink />
    <SettingsSection title="二段階認証" description="ログイン時に認証アプリのコードを使って、アカウントを保護します。"
      status={settings && <div role="status" className="flex flex-wrap gap-2">
        <StatusBadge variant={settings.enabled ? 'success' : 'neutral'} dot>{settings.enabled ? '有効' : '未設定'}</StatusBadge>
        {settings.required
          ? <StatusBadge variant="neutral">必須</StatusBadge>
          : !settings.enabled && <StatusBadge variant="info">推奨</StatusBadge>}
      </div>}
    >

      {error && <div className="auth-security-error mx-4 mt-4 sm:mx-6" role="alert">{error}</div>}
      {!settings && !error && <p className="p-4 text-sm text-[var(--tm-text-secondary)] sm:p-6" role="status">設定を読み込んでいます…</p>}

      {settings?.enabled && <ul className="divide-y divide-[var(--tm-border)] px-4 sm:px-6">
        {mfaActions.filter(item => item.action !== 'mfa.disable' || !settings.required).map(({ action, icon: Icon, title, description, button }) => (
          <li key={action} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
            <div className="flex min-w-0 flex-1 basis-56 items-start gap-3">
              <Icon size={17} className="mt-0.5 shrink-0 text-[var(--tm-text-secondary)]" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-semibold text-[var(--tm-text-primary)]">{title}</h3>
                <p className="mt-1 text-xs leading-5 text-[var(--tm-text-secondary)]">{description}</p>
              </div>
            </div>
            <Button type="button" variant="outline" className={`min-h-10 shrink-0 ${action === 'mfa.disable' ? 'text-red-700 dark:text-red-300' : ''}`} onClick={() => setAction(action)}>{button}</Button>
          </li>
        ))}
      </ul>}

      {settings && !settings.enabled && !settings.required && <div className="grid min-w-0 divide-y divide-[var(--tm-border)] xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:divide-x xl:divide-y-0">
        <form className="auth-security-form content-start p-4 sm:p-6" onSubmit={optIn} aria-busy={busy}>
          <div>
            <h3 className="text-sm font-semibold text-[var(--tm-text-primary)]">二段階認証を設定する</h3>
            <p className="mt-1">設定を始めるには、現在のパスワードで本人確認を行います。</p>
          </div>
          <label htmlFor="mfa-opt-in-password" className="max-w-sm">現在のパスワード
            <input id="mfa-opt-in-password" name="password" type="password" autoComplete="current-password" required disabled={busy} aria-describedby="mfa-setup-notice" />
          </label>
          <p id="mfa-setup-notice" className="flex items-start gap-2">
            <Info size={15} className="mt-0.5 shrink-0 text-[var(--tm-text-muted)]" aria-hidden="true" />
            設定を開始すると、この端末からログアウトします。
          </p>
          <Button type="submit" variant="primary" size="lg" className="sm:justify-self-start" icon={<ArrowRight size={16} aria-hidden="true" />} iconPosition="right" loading={busy}>
            {busy ? '設定を開始中…' : '設定を開始する'}
          </Button>
        </form>

        <div className="rounded-b-xl bg-[var(--tm-surface-elevated)] p-4 sm:p-6 xl:rounded-bl-none xl:rounded-br-xl">
          <h3 className="text-sm font-semibold text-[var(--tm-text-primary)]">設定の流れ</h3>
          <ol className="mt-3 space-y-3">
            {setupSteps.map(({ title, description }, index) => <li key={title} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded border border-[var(--tm-border)] bg-[var(--tm-surface)] text-xs font-semibold tabular-nums text-[var(--tm-text-secondary)]" aria-hidden="true">{index + 1}</span>
              <div>
                <p className="text-sm font-medium text-[var(--tm-text-primary)]">{title}</p>
                <p className="mt-0.5 text-xs leading-5 text-[var(--tm-text-secondary)]">{description}</p>
              </div>
            </li>)}
          </ol>
        </div>
      </div>}
    </SettingsSection>
    {action && <StepUpDialog language="ja" operation={{ action, scope: {} }} description={
      action === 'mfa.recovery_codes' ? '既存のバックアップコードを無効にして、新しいコードを発行します。'
        : action === 'mfa.device_change' ? '新しい認証アプリの登録を開始します。'
          : '二段階認証を無効にします。バックアップコードは無効になり、すべての端末で再ログインが必要です。'}
      mutate={async () => {
        const endpoint = action === 'mfa.recovery_codes' ? '/mfa/recovery-codes/regenerate'
          : action === 'mfa.device_change' ? '/mfa/device/change' : '/mfa/disable'
        const response = await authTransport(endpoint, {}, false)
        if (response.status !== 200) throw new AuthFailure(422)
        if (action === 'mfa.recovery_codes') parseRecoveryCodes(response.data)
        else if (action === 'mfa.disable') {
          if (!record(response.data) || response.data.reauthentication_required !== true || 'token' in response.data) throw new AuthFailure(422)
        }
        else if (!record(response.data) || response.data.purpose !== 'recovery_enroll' || typeof response.data.challenge !== 'string'
          || !/^[a-f0-9]{64}$/.test(response.data.challenge) || response.data.expires_in !== 300 || 'token' in response.data) throw new AuthFailure(422)
        return response.data
      }}
      onComplete={data => {
        if (action === 'mfa.disable') void logout().catch(() => undefined)
        else completeMfaAction(action === 'mfa.recovery_codes' ? 'codes' : 'device', data)
      }}
      onCancel={() => setAction(null)} onMutationError={message => { setAction(null); setError(message) }}
    />}
  </div>
}
