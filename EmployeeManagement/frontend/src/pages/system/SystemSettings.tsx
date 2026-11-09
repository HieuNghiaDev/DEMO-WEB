import { useRef, useState, type ReactNode } from 'react'
import axios from 'axios'
import {
  Bell,
  Building2,
  Camera,
  Check,
  ChevronRight,
  Info,
  KeyRound,
  Mail,
  Moon,
  Palette,
  Settings,
  Shield,
  ShieldCheck,
  Sun,
  UserRound,
} from 'lucide-react'
import { Link, useNavigate, useOutlet, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import type { ThemeMode } from '../../contexts/ThemeContext'
import { setAppLanguage, type SupportedLocale } from '../../i18n'
import AvatarCropDialog from '../../components/settings/AvatarCropDialog'
import LogoutConfirmationDialog from '../../components/settings/LogoutConfirmationDialog'
import SensitiveValue from '../../components/settings/SensitiveValue'
import SettingsLogoutAction from '../../components/settings/SettingsLogoutAction'
import { SettingsSection } from '../../components/settings/SettingsSection'
import EmailChangeDialog from '../../components/settings/EmailChangeDialog'
import api from '../../services/api'
import { getEmployeeAvatarImageUrl } from '../../utils/employeeAvatar'
import { maskEmail } from '../../utils/sensitiveMasking'
import { Button, PageHeader, StatusBadge, UserAvatar } from '../../components/ui'

const activeCategories = ['account', 'security', 'appearance'] as const
type ActiveCategory = (typeof activeCategories)[number]

const categories = [
  { id: 'account', label: 'アカウント', icon: UserRound, enabled: true },
  { id: 'security', label: 'セキュリティ', icon: ShieldCheck, enabled: true },
  { id: 'appearance', label: '外観', icon: Palette, enabled: true },
  { id: 'notifications', label: '通知', icon: Bell, enabled: false },
  { id: 'privacy', label: 'プライバシー', icon: Shield, enabled: false },
] as const

function isActiveCategory(value: string | null): value is ActiveCategory {
  return activeCategories.some((category) => category === value)
}

export default function SystemSettings() {
  const { user, logout, refreshUser } = useAuth()
  const { theme, setTheme } = useTheme()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const securityDetail = useOutlet()
  const [searchParams] = useSearchParams()
  const requestedSection = searchParams.get('section')
  const section: ActiveCategory = securityDetail ? 'security'
    : isActiveCategory(requestedSection) ? requestedSection : 'account'
  const [isLogoutConfirmationOpen, setIsLogoutConfirmationOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [avatarUploadError, setAvatarUploadError] = useState('')
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null)
  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const employeeName = user?.employee?.full_name || user?.name || '社員'
  const employeeCode = user?.employee?.employee_code
  const officeName = user?.employee?.office?.name
  const language: SupportedLocale = i18n.resolvedLanguage === 'vi' ? 'vi' : 'ja'
  const role = user?.roles?.map((item) => item.display_name || item.name).filter(Boolean).join('・') || user?.role

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

  const handleAvatarSelection = (file?: File) => {
    if (!file || isUploadingAvatar) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setAvatarUploadError('JPG、PNG、WebP形式（10MB以下）の画像を選択してください。')
      if (avatarInputRef.current) avatarInputRef.current.value = ''
      return
    }

    setAvatarUploadError('')
    setSelectedAvatarFile(file)
    if (avatarInputRef.current) avatarInputRef.current.value = ''
  }

  const handleAvatarSave = async (avatar: Blob) => {
    try {
      setIsUploadingAvatar(true)
      setAvatarUploadError('')
      const formData = new FormData()
      formData.append('avatar', avatar, avatar.type === 'image/webp' ? 'avatar.webp' : 'avatar.jpg')
      await api.post('/me/avatar', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      await refreshUser()
      setSelectedAvatarFile(null)
    } catch (error) {
      const responseMessage = axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message : undefined
      const message = responseMessage
        || (error instanceof Error && error.message ? error.message : '')
        || 'プロフィール画像を更新できませんでした。'
      setAvatarUploadError(message)
      throw new Error(message, { cause: error })
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1240px] px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <PageHeader
        title={<span className="flex items-center gap-2.5"><Settings size={21} className="text-[var(--tm-text-secondary)]" aria-hidden="true" />設定</span>}
        description="プロフィール、ログイン方法、表示設定を管理できます。"
        className="rounded-xl border border-[var(--tm-border)]"
      />
      <div className="mt-4 grid min-w-0 items-start gap-4 lg:grid-cols-[204px_minmax(0,1fr)] lg:gap-5">
        <aside className="min-w-0 rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface)]">
          <nav aria-label="設定カテゴリー" className="grid min-w-0 grid-cols-6 gap-1 p-2 lg:grid-cols-1 lg:p-3">
            {categories.map(({ id, label, icon: Icon, enabled }) => {
              const isActive = section === id
              const sharedClassName = `relative flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg px-1.5 text-xs font-medium transition-colors duration-150 sm:text-sm lg:col-span-1 lg:justify-start lg:gap-2.5 lg:px-3 ${
                isActive
                  ? 'bg-[var(--tm-surface-active)] font-semibold text-[var(--tm-text-primary)]'
                  : 'text-[var(--tm-text-secondary)] hover:bg-[var(--tm-surface-hover)] hover:text-[var(--tm-text-primary)]'
              }`

              if (!enabled) {
                return (
                  <button key={id} type="button" disabled aria-label={`${label}（準備中）`} title="準備中" className={`${sharedClassName} col-span-3 cursor-not-allowed opacity-65 hover:bg-transparent`}>
                    <Icon size={16} className="shrink-0" aria-hidden="true" />
                    <span>{label}</span>
                    <span className="text-[10px] font-normal lg:ml-auto">準備中</span>
                  </button>
                )
              }

              return (
                <Link key={id} to={`/system?section=${id}`} aria-current={isActive ? 'page' : undefined} className={`${sharedClassName} col-span-2 focus-visible:outline-2 focus-visible:outline-[var(--tm-focus-ring)]`}>
                  {isActive && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-t bg-[var(--tm-primary)] lg:inset-y-2 lg:right-auto lg:left-0 lg:h-auto lg:w-0.5 lg:rounded-r" aria-hidden="true" />}
                  <Icon size={16} className="shrink-0" aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              )
            })}
          </nav>

          <div className="hidden border-t border-[var(--tm-border)] p-3 lg:block">
            <SettingsLogoutAction onClick={() => setIsLogoutConfirmationOpen(true)} disabled={isLoggingOut} />
          </div>
        </aside>

        <div className="min-w-0">
          {section === 'account' && (
            <AccountPanel
              user={user}
              employeeName={employeeName}
              employeeCode={employeeCode}
              officeName={officeName}
              role={role}
              isUploadingAvatar={isUploadingAvatar}
              avatarUploadError={avatarUploadError}
              avatarInputRef={avatarInputRef}
              onAvatarSelection={handleAvatarSelection}
            />
          )}

          {section === 'security' && (securityDetail ?? <SecurityPanel />)}
          {section === 'appearance' && (
            <AppearancePanel theme={theme} setTheme={setTheme} language={language} t={t} />
          )}

          <section aria-label="アカウント操作" className="mt-4 rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface)] p-2 lg:hidden">
            <SettingsLogoutAction onClick={() => setIsLogoutConfirmationOpen(true)} disabled={isLoggingOut} />
          </section>
        </div>
      </div>

      {isLogoutConfirmationOpen && (
        <LogoutConfirmationDialog isLoggingOut={isLoggingOut} onCancel={() => setIsLogoutConfirmationOpen(false)} onConfirm={() => void handleLogout()} />
      )}
      {selectedAvatarFile && (
        <AvatarCropDialog key={`${selectedAvatarFile.name}-${selectedAvatarFile.lastModified}`} file={selectedAvatarFile} isSaving={isUploadingAvatar} onCancel={() => setSelectedAvatarFile(null)} onSave={handleAvatarSave} />
      )}
    </div>
  )
}

type AccountPanelProps = {
  user: ReturnType<typeof useAuth>['user']
  employeeName: string
  employeeCode?: string
  officeName?: string
  role?: string
  isUploadingAvatar: boolean
  avatarUploadError: string
  avatarInputRef: React.RefObject<HTMLInputElement | null>
  onAvatarSelection: (file?: File) => void
}

function AccountPanel({ user, employeeName, employeeCode, officeName, role, isUploadingAvatar, avatarUploadError, avatarInputRef, onAvatarSelection }: AccountPanelProps) {
  const [changingEmail, setChangingEmail] = useState(false)
  const { logout } = useAuth()
  const navigate = useNavigate()
  return (
    <SettingsSection title="アカウント" description="プロフィールと登録情報を確認できます。">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-3 border-b border-[var(--tm-border)] px-4 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-4 sm:px-6">
        <UserAvatar name={employeeName} stableKey={user?.employee?.id ?? user?.id} imageSrc={getEmployeeAvatarImageUrl(user?.employee?.avatar_path)} imageAlt={`${employeeName}のプロフィール画像`} size="xl" />
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-[var(--tm-text-primary)] [overflow-wrap:anywhere] sm:text-lg">{employeeName}</h3>
          {employeeCode && <p className="mt-1 text-xs text-[var(--tm-text-secondary)]">社員ID <span className="ml-1 font-mono">{employeeCode}</span></p>}
        </div>
        <Button type="button" variant="outline" icon={<Camera size={16} aria-hidden="true" />} loading={isUploadingAvatar} onClick={() => avatarInputRef.current?.click()} className="col-span-2 min-h-10 justify-self-start sm:col-span-1">
          プロフィール画像を変更
        </Button>
        <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => onAvatarSelection(event.target.files?.[0])} />
      </div>

      <div className="px-4 pb-2 pt-4 sm:px-6">
        {avatarUploadError && <p role="alert" className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">{avatarUploadError}</p>}
        <h3 className="mb-1 text-sm font-semibold text-[var(--tm-text-primary)]">基本情報</h3>
        <dl className="divide-y divide-[var(--tm-border)]">
          {user?.email && <AccountInfoRow icon={Mail} label="メールアドレス">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <div className="min-w-0 flex-1 basis-36"><SensitiveValue value={user.email} label="メールアドレス" mask={maskEmail} /></div>
              <Button variant="outline" className="min-h-10 shrink-0" aria-label="メールアドレスを変更" onClick={() => setChangingEmail(true)}>変更</Button>
            </div>
          </AccountInfoRow>}
          {role && <AccountInfoRow icon={ShieldCheck} label="権限">{role}</AccountInfoRow>}
          {officeName && <AccountInfoRow icon={Building2} label="所属オフィス">{officeName}</AccountInfoRow>}
        </dl>
      </div>
      {changingEmail && <EmailChangeDialog onClose={() => setChangingEmail(false)} onChanged={() => {
        setChangingEmail(false)
        navigate('/login', { replace: true, state: { message: 'メールアドレスを変更しました。新しいメールアドレスでログインしてください。' } })
        void logout().catch(() => undefined)
      }} />}
    </SettingsSection>
  )
}

function SecurityPanel() {
  return (
    <SettingsSection title="セキュリティ" description="ログイン方法とアカウントの保護を管理できます。">
      <ul className="divide-y divide-[var(--tm-border)] px-2 py-1 sm:px-3">
        <SecurityLink to="/system/password" icon={KeyRound} title="パスワードを変更" description="現在のパスワードを確認し、新しいパスワードを設定します。" />
        <SecurityLink to="/system/mfa" icon={ShieldCheck} title="二段階認証" description="認証アプリとバックアップコードを管理します。" badge={<StatusBadge variant="info">推奨</StatusBadge>} />
      </ul>
      <p className="flex items-start gap-2 rounded-b-xl border-t border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] px-4 py-3 text-xs leading-5 text-[var(--tm-text-secondary)] sm:px-6">
        <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        パスワードを変更すると、すべての端末で再ログインが必要です。
      </p>
    </SettingsSection>
  )
}

function SecurityLink({ to, icon: Icon, title, description, badge }: {
  to: string; icon: typeof UserRound; title: string; description: string; badge?: ReactNode
}) {
  return (
    <li className="py-1">
      <Link to={to} className="flex min-h-16 items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-[var(--tm-surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--tm-focus-ring)] sm:px-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--tm-surface-elevated)] text-[var(--tm-text-secondary)]"><Icon size={17} aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--tm-text-primary)]">{title}{badge}</span>
          <span className="mt-1 block text-xs leading-5 text-[var(--tm-text-secondary)]">{description}</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-[var(--tm-text-secondary)]" aria-hidden="true" />
      </Link>
    </li>
  )
}

type AppearancePanelProps = {
  theme: ThemeMode
  setTheme: (theme: ThemeMode, origin?: HTMLElement) => void
  language: SupportedLocale
  t: ReturnType<typeof useTranslation>['t']
}

function AppearancePanel({ theme, setTheme, language, t }: AppearancePanelProps) {
  return (
    <SettingsSection title="外観" description="ワークスペースの表示を設定します。">
      <fieldset className="min-w-0 px-4 py-4 sm:px-6">
        <legend className="float-left mb-1 w-full text-sm font-semibold text-[var(--tm-text-primary)]">テーマ</legend>
        <p className="clear-both mb-3 text-xs leading-5 text-[var(--tm-text-secondary)]">選択するとすぐに反映され、このブラウザーに保存されます。</p>
        <div className="grid max-w-md grid-cols-2 gap-2 sm:gap-3">
          {([{ id: 'light', label: 'ライト', icon: Sun }, { id: 'dark', label: 'ダーク', icon: Moon }] as const).map(({ id, label, icon: Icon }) => (
            <label key={id} className="relative cursor-pointer">
              <input type="radio" name="theme" value={id} checked={theme === id} onChange={(event) => setTheme(id, event.currentTarget.closest('label') ?? undefined)} className="peer sr-only" />
              <span className="block rounded-lg border border-[var(--tm-border)] p-2 transition-colors duration-150 hover:border-[var(--tm-border-strong)] peer-checked:border-[var(--tm-primary)] peer-checked:bg-[var(--tm-surface-active)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--tm-focus-ring)] sm:p-3">
                <ThemePreview theme={id} />
                <span className="flex items-center gap-2 text-sm font-medium text-[var(--tm-text-primary)]"><Icon size={16} aria-hidden="true" />{label}{theme === id && <Check size={16} className="ml-auto text-[var(--tm-primary)]" aria-hidden="true" />}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="min-w-0 border-t border-[var(--tm-border)] px-4 py-4 sm:px-6">
        <legend className="float-left mb-1 w-full text-sm font-semibold text-[var(--tm-text-primary)]">{t('settings.display.title')}</legend>
        <p className="clear-both mb-3 text-xs leading-5 text-[var(--tm-text-secondary)]">{t('settings.display.description')}</p>
        <label className="block max-w-sm space-y-2">
          <span className="block text-sm font-medium text-[var(--tm-text-primary)]">{t('settings.language.label')}</span>
          <span className="block text-xs leading-5 text-[var(--tm-text-secondary)]">{t('settings.language.description')}</span>
          <select aria-label={t('settings.language.label')} value={language} onChange={(event) => void setAppLanguage(event.target.value as SupportedLocale)} className="h-10 w-full rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] px-3 text-sm text-[var(--tm-text-primary)] outline-none transition focus:border-[var(--tm-border-focus)] focus:ring-2 focus:ring-[var(--tm-focus-ring)]/25">
            <option value="ja" className="bg-[var(--tm-surface)]">{t('settings.language.japanese')}</option>
            <option value="vi" className="bg-[var(--tm-surface)]">{t('settings.language.vietnamese')}</option>
          </select>
        </label>
      </fieldset>
    </SettingsSection>
  )
}

function ThemePreview({ theme }: { theme: 'light' | 'dark' }) {
  const isLight = theme === 'light'
  return (
    <span aria-hidden="true" className={`mb-2 flex h-14 overflow-hidden rounded-md border ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-950'}`}>
      <span className={`w-1/4 space-y-1 border-r p-1.5 ${isLight ? 'border-slate-200 bg-slate-100' : 'border-slate-800 bg-slate-900'}`}><span className="block h-1 rounded-sm bg-[var(--tm-primary)]" /><span className="block h-1 rounded-sm bg-slate-400/40" /><span className="block h-1 rounded-sm bg-slate-400/40" /></span>
      <span className="flex-1 space-y-1.5 p-2"><span className={`block h-1.5 w-2/3 rounded-sm ${isLight ? 'bg-slate-300' : 'bg-slate-700'}`} /><span className={`block h-6 rounded-sm border ${isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900'}`} /></span>
    </span>
  )
}

type AccountInfoRowProps = { icon: typeof UserRound; label: string; children: ReactNode }

function AccountInfoRow({ icon: Icon, label, children }: AccountInfoRowProps) {
  return (
    <div className="grid min-h-12 gap-1 py-2.5 sm:grid-cols-[minmax(124px,1fr)_minmax(0,3fr)] sm:items-center sm:gap-4">
      <dt className="flex items-center gap-2 text-sm text-[var(--tm-text-secondary)]"><Icon size={15} className="shrink-0" aria-hidden="true" />{label}</dt>
      <dd className="min-w-0 text-sm font-medium text-[var(--tm-text-primary)] [overflow-wrap:anywhere]">{children}</dd>
    </div>
  )
}
