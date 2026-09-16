import { useRef, useState } from 'react'
import { Check, ChevronRight, KeyRound, Moon, Palette, ShieldCheck, Sun, UserRound, Camera } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { setAppLanguage, type SupportedLocale } from '../../i18n'
import LogoutConfirmationDialog from '../../components/settings/LogoutConfirmationDialog'
import SettingsLogoutAction from '../../components/settings/SettingsLogoutAction'
import api from '../../services/api'
import { getEmployeeAvatarUrl } from '../../utils/employeeAvatar'
import { PageHeader } from '../../components/ui'
import { ButtonSpinner } from '../../components/loading'

const categories = [
  { id: 'account', label: 'アカウント', caption: 'Account', icon: UserRound },
  { id: 'security', label: 'セキュリティ', caption: 'Security', icon: ShieldCheck },
  { id: 'appearance', label: '外観', caption: 'Appearance', icon: Palette },
] as const

export default function SystemSettings() {
  const { user, logout, refreshUser } = useAuth()
  const { theme, setTheme } = useTheme()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const section = categories.find(({ id }) => id === searchParams.get('section'))?.id ?? 'account'
  const [isLogoutConfirmationOpen, setIsLogoutConfirmationOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [avatarUploadError, setAvatarUploadError] = useState('')
  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const employeeName = user?.employee?.full_name || user?.name || user?.login_id || '社員'
  const language: SupportedLocale = i18n.resolvedLanguage === 'vi' ? 'vi' : 'ja'
  const role = user?.roles?.map((item) => item.display_name || item.name).filter(Boolean).join('・') || user?.role
  const accountFields = [
    { label: '氏名', value: employeeName },
    { label: '社員ID', value: user?.employee?.employee_code },
    { label: 'ログインID', value: user?.login_id },
    { label: 'メールアドレス', value: user?.email },
    { label: '権限', value: role },
    { label: '所属オフィス', value: user?.employee?.office?.name },
  ].filter(({ value }) => Boolean(value))

  const handleLogout = async () => {
    if (isLoggingOut) return
    try {
      setIsLoggingOut(true)
      await logout()
    } catch {
      // AuthContext clears local authentication even when the request fails.
    } finally {
      setIsLoggingOut(false)
      setIsLogoutConfirmationOpen(false)
      navigate('/login', { replace: true })
    }
  }

  const handleAvatarChange = async (file?: File) => {
    if (!file || isUploadingAvatar) return

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setAvatarUploadError('JPG、PNG、WebP形式（2MB以下）の画像を選択してください。')
      return
    }

    try {
      setIsUploadingAvatar(true)
      setAvatarUploadError('')
      const formData = new FormData()
      formData.append('avatar', file)
      await api.post('/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      await refreshUser()
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      setAvatarUploadError(message || 'プロフィール画像を更新できませんでした。')
    } finally {
      setIsUploadingAvatar(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    }
  }

  return (
    <div className="min-h-full pb-10">
      <PageHeader
        breadcrumb="設定"
        domainKicker="SYSTEM SETTINGS"
        title="システム設定"
        description="システム・アカウント設定、セキュリティ、外観のカスタマイズ"
      />

      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid min-w-0 gap-6 lg:grid-cols-[200px_minmax(0,1fr)] xl:gap-8">
          {/* Side navigation */}
          <div className="lg:sticky lg:top-6 lg:flex lg:min-h-80 lg:self-start lg:flex-col">
            <nav
              aria-label="設定カテゴリー"
              className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--tm-surface-elevated)] p-1 border border-[var(--tm-border)] lg:grid-cols-1 lg:gap-1.5 lg:bg-transparent lg:border-0 lg:p-0"
            >
              {categories.map(({ id, label, caption, icon: Icon }) => {
                const isActive = section === id
                return (
                  <Link
                    key={id}
                    to={`/system?section=${id}`}
                    aria-current={isActive ? 'page' : undefined}
                    className={`
                      flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-lg px-2 py-3 text-xs font-medium transition-all duration-150 sm:flex-row sm:gap-2.5 sm:text-sm lg:justify-start lg:px-3.5
                      ${
                        isActive
                          ? 'bg-[var(--tm-surface)] text-[var(--tm-primary)] shadow-xs border border-[var(--tm-border)] font-semibold'
                          : 'text-[var(--tm-text-secondary)] hover:bg-[var(--tm-surface-hover)] hover:text-[var(--tm-text-primary)] border border-transparent'
                      }
                    `.trim()}
                  >
                    <Icon size={17} className={`shrink-0 ${isActive ? 'text-[var(--tm-primary)]' : 'text-[var(--tm-text-muted)]'}`} aria-hidden="true" />
                    <span>
                      {label}
                      <span className="mt-0.5 hidden text-[10px] font-normal tracking-wide opacity-70 lg:block">
                        {caption}
                      </span>
                    </span>
                  </Link>
                )
              })}
            </nav>

            <div className="mt-auto hidden pt-8 lg:block">
              <div className="border-t border-[var(--tm-border)] pt-4">
                <SettingsLogoutAction onClick={() => setIsLogoutConfirmationOpen(true)} disabled={isLoggingOut} />
              </div>
            </div>
          </div>

          {/* Section details */}
          <div className="min-w-0 max-w-4xl">
            <section
              aria-labelledby={`settings-${section}-title`}
              className="rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface)] shadow-xs"
            >
              {section === 'account' && (
                <>
                  <div className="border-b border-[var(--tm-border)] px-5 py-5 sm:px-6">
                    <h2 id="settings-account-title" className="text-base font-semibold text-[var(--tm-text-primary)]">
                      アカウント情報
                    </h2>
                    <p className="mt-0.5 text-xs text-[var(--tm-text-secondary)]">
                      登録されている社員情報を確認できます。
                    </p>
                  </div>
                  <div className="px-5 py-6 sm:px-6">
                    <div className="mb-6 flex items-center gap-4">
                      <div className="relative shrink-0">
                        <img
                          src={getEmployeeAvatarUrl(user?.employee?.avatar_path, user?.employee?.gender)}
                          alt=""
                          className="h-14 w-14 rounded-xl border border-[var(--tm-border)] object-cover shadow-2xs"
                        />
                        <button
                          type="button"
                          onClick={() => avatarInputRef.current?.click()}
                          disabled={isUploadingAvatar}
                          className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[var(--tm-surface)] bg-[var(--tm-primary)] text-white shadow-sm transition hover:opacity-90 disabled:cursor-wait"
                          aria-label="プロフィール画像を変更"
                        >
                          <Camera size={12} aria-hidden="true" />
                        </button>
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          onChange={(event) => void handleAvatarChange(event.target.files?.[0])}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="break-words text-base font-semibold text-[var(--tm-text-primary)]">
                          {employeeName}
                        </p>
                        <p className="mt-0.5 break-all text-xs text-[var(--tm-text-secondary)]">
                          {user?.login_id}
                        </p>
                        <button
                          type="button"
                          onClick={() => avatarInputRef.current?.click()}
                          disabled={isUploadingAvatar}
                          className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--tm-primary)] hover:underline disabled:cursor-wait disabled:text-[var(--tm-text-muted)]"
                        >
                          {isUploadingAvatar && <ButtonSpinner size={13} />}
                          {isUploadingAvatar ? 'アップロード中…' : 'プロフィール画像を変更'}
                        </button>
                      </div>
                    </div>
                    {avatarUploadError && (
                      <p role="alert" className="-mt-3 mb-5 text-xs text-[var(--tm-danger)]">
                        {avatarUploadError}
                      </p>
                    )}
                    <dl className="divide-y divide-[var(--tm-border)] border-t border-[var(--tm-border)]">
                      {accountFields.map(({ label, value }) => (
                        <div key={label} className="grid gap-1 py-3.5 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
                          <dt className="text-xs text-[var(--tm-text-secondary)]">{label}</dt>
                          <dd className="min-w-0 break-words text-xs sm:text-sm font-medium text-[var(--tm-text-primary)] [overflow-wrap:anywhere]">
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </>
              )}

              {section === 'security' && (
                <>
                  <div className="border-b border-[var(--tm-border)] px-5 py-5 sm:px-6">
                    <h2 id="settings-security-title" className="text-base font-semibold text-[var(--tm-text-primary)]">
                      セキュリティ
                    </h2>
                    <p className="mt-0.5 text-xs text-[var(--tm-text-secondary)]">
                      アカウントとログインに関する設定
                    </p>
                  </div>
                  <Link
                    to="/system/password"
                    className="group flex items-center gap-4 px-5 py-6 transition-colors duration-150 hover:bg-[var(--tm-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--tm-focus-ring)] sm:px-6"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--tm-surface-elevated)] border border-[var(--tm-border)] text-[var(--tm-text-secondary)]">
                      <KeyRound size={18} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-[var(--tm-text-primary)]">
                        パスワードを変更
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-[var(--tm-text-secondary)]">
                        現在のパスワードを確認し、新しいパスワードを設定します。
                      </span>
                    </span>
                    <ChevronRight
                      size={18}
                      className="shrink-0 text-[var(--tm-text-muted)] transition-transform duration-200 group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                  <p className="border-t border-[var(--tm-border)] px-5 py-4 text-xs leading-5 text-[var(--tm-text-secondary)] sm:px-6">
                    変更後は、すべての端末で再ログインが必要です。
                  </p>
                </>
              )}

              {section === 'appearance' && (
                <>
                  <div className="border-b border-[var(--tm-border)] px-5 py-5 sm:px-6">
                    <h2 id="settings-appearance-title" className="text-base font-semibold text-[var(--tm-text-primary)]">
                      外観
                    </h2>
                    <p className="mt-0.5 text-xs text-[var(--tm-text-secondary)]">
                      ワークスペースの表示を設定します。
                    </p>
                  </div>
                  <fieldset className="px-5 py-6 sm:px-6">
                    <legend className="float-left mb-1 w-full text-sm font-semibold text-[var(--tm-text-primary)]">
                      テーマ
                    </legend>
                    <p className="clear-both mb-5 text-xs leading-5 text-[var(--tm-text-secondary)]">
                      選択するとすぐに反映され、このブラウザーに保存されます。
                    </p>
                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                      {(
                        [
                          { id: 'light', label: 'ライト', icon: Sun },
                          { id: 'dark', label: 'ダーク', icon: Moon },
                        ] as const
                      ).map(({ id, label, icon: Icon }) => (
                        <label key={id} className="relative cursor-pointer">
                          <input
                            type="radio"
                            name="theme"
                            value={id}
                            checked={theme === id}
                            onChange={(event) => setTheme(id, event.currentTarget.closest('label') ?? undefined)}
                            className="peer sr-only"
                          />
                          <span className="block rounded-lg border border-[var(--tm-border)] p-3 transition-all duration-150 hover:border-[var(--tm-border-strong)] peer-checked:border-[var(--tm-primary)] peer-checked:ring-2 peer-checked:ring-[var(--tm-focus-ring)]/25">
                            <span
                              aria-hidden="true"
                              className={`mb-3 flex h-24 overflow-hidden rounded-md border ${
                                id === 'light'
                                  ? 'border-slate-200 bg-slate-50'
                                  : 'border-slate-700 bg-[#090b0f]'
                              }`}
                            >
                              <span
                                className={`w-1/4 space-y-2 border-r p-2 ${
                                  id === 'light'
                                    ? 'border-slate-200 bg-slate-100'
                                    : 'border-slate-800 bg-[#0d1015]'
                                }`}
                              >
                                <span className="block h-2 rounded-sm bg-indigo-500" />
                                <span className="block h-1 rounded-sm bg-slate-400/40" />
                                <span className="block h-1 rounded-sm bg-slate-400/40" />
                              </span>
                              <span className="flex-1 space-y-2 p-3">
                                <span
                                  className={`block h-2 w-2/3 rounded-sm ${
                                    id === 'light' ? 'bg-slate-300' : 'bg-slate-700'
                                  }`}
                                />
                                <span
                                  className={`block h-10 rounded-sm border ${
                                    id === 'light'
                                      ? 'border-slate-200 bg-white'
                                      : 'border-slate-800 bg-[#101217]'
                                  }`}
                                />
                              </span>
                            </span>
                            <span className="flex items-center gap-2 text-xs sm:text-sm font-medium text-[var(--tm-text-primary)]">
                              <Icon size={16} aria-hidden="true" />
                              {label}
                              {theme === id && (
                                <Check size={16} className="ml-auto text-[var(--tm-primary)]" aria-hidden="true" />
                              )}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset className="mt-6 border-t border-[var(--tm-border)] px-5 pt-6 sm:px-6">
                    <legend className="float-left mb-1 w-full text-sm font-semibold text-[var(--tm-text-primary)]">
                      {t('settings.display.title')}
                    </legend>
                    <p className="clear-both mb-5 text-xs leading-5 text-[var(--tm-text-secondary)]">
                      {t('settings.display.description')}
                    </p>
                    <label className="block max-w-sm space-y-2">
                      <span className="block text-xs sm:text-sm font-medium text-[var(--tm-text-primary)]">
                        {t('settings.language.label')}
                      </span>
                      <span className="block text-xs leading-5 text-[var(--tm-text-secondary)]">
                        {t('settings.language.description')}
                      </span>
                      <select
                        aria-label={t('settings.language.label')}
                        value={language}
                        onChange={(event) => void setAppLanguage(event.target.value as SupportedLocale)}
                        className="h-9 w-full rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] px-3 text-xs sm:text-sm text-[var(--tm-text-primary)] outline-none transition focus:border-[var(--tm-border-focus)] focus:ring-2 focus:ring-[var(--tm-focus-ring)]/25"
                      >
                        <option value="ja" className="bg-[var(--tm-surface)] text-[var(--tm-text-primary)]">
                          {t('settings.language.japanese')}
                        </option>
                        <option value="vi" className="bg-[var(--tm-surface)] text-[var(--tm-text-primary)]">
                          {t('settings.language.vietnamese')}
                        </option>
                      </select>
                    </label>
                  </fieldset>
                </>
              )}
            </section>

            <section
              aria-labelledby="settings-session-title"
              className="mt-8 border-t border-[var(--tm-border)] pt-5 lg:hidden"
            >
              <h2 id="settings-session-title" className="text-xs font-medium text-[var(--tm-text-secondary)]">
                アカウント操作
              </h2>
              <div className="mt-3 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <p className="text-sm font-medium text-[var(--tm-text-primary)]">ログアウト</p>
                  <p className="mt-0.5 text-xs leading-5 text-[var(--tm-text-secondary)]">
                    現在のセッションを終了します。
                  </p>
                </div>
                <div className="w-full shrink-0 sm:w-auto">
                  <SettingsLogoutAction onClick={() => setIsLogoutConfirmationOpen(true)} disabled={isLoggingOut} />
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {isLogoutConfirmationOpen && (
        <LogoutConfirmationDialog
          isLoggingOut={isLoggingOut}
          onCancel={() => setIsLogoutConfirmationOpen(false)}
          onConfirm={() => void handleLogout()}
        />
      )}
    </div>
  )
}
