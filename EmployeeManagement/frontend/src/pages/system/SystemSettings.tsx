import { useRef, useState, type ReactNode } from 'react'
import axios from 'axios'
import {
  Bell,
  Building2,
  Camera,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  EyeOff,
  Globe,
  Info,
  KeyRound,
  Laptop,
  Lock,
  Mail,
  Moon,
  Palette,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  UserRound,
  Volume2,
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
import {
  canShowChatSystemNotifications,
  chatNotificationEnabled,
  enableChatSystemNotifications,
  setChatNotificationEnabled,
} from '../../features/internal-chat/chatNotifications'
import './systemSettings.css'

const activeCategories = ['account', 'security', 'appearance', 'notifications', 'privacy'] as const
type ActiveCategory = (typeof activeCategories)[number]

const categories = [
  { id: 'account', label: 'アカウント', subtitle: 'プロフィール・所属情報', icon: UserRound },
  { id: 'security', label: 'セキュリティ', subtitle: 'パスワード・二段階認証', icon: ShieldCheck },
  { id: 'appearance', label: '外観', subtitle: 'テーマ・言語・表示設定', icon: Palette },
  { id: 'notifications', label: '通知', subtitle: 'サウンド・デスクトップ通知', icon: Bell },
  { id: 'privacy', label: 'プライバシー', subtitle: 'マスク表示・ローカルデータ', icon: Shield },
] as const

function isActiveCategory(value: string | null): value is ActiveCategory {
  return activeCategories.some((category) => category === value)
}

function getBrowserSummary(): string {
  if (typeof navigator === 'undefined') return 'Web Browser'
  const ua = navigator.userAgent
  const browser = ua.includes('Edg/')
    ? 'Microsoft Edge'
    : ua.includes('Chrome/')
    ? 'Google Chrome'
    : ua.includes('Firefox/')
    ? 'Mozilla Firefox'
    : ua.includes('Safari/')
    ? 'Safari'
    : 'Web Browser'
  const os = ua.includes('Windows')
    ? 'Windows'
    : ua.includes('Mac OS')
    ? 'macOS'
    : ua.includes('Linux')
    ? 'Linux'
    : 'Desktop'
  return `${browser} (${os})`
}

export default function SystemSettings() {
  const { user, logout, refreshUser, requiresMfa } = useAuth()
  const { theme, setTheme } = useTheme()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const securityDetail = useOutlet()
  const [searchParams] = useSearchParams()
  const requestedSection = searchParams.get('section')
  const section: ActiveCategory = securityDetail
    ? 'security'
    : isActiveCategory(requestedSection)
    ? requestedSection
    : 'account'
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
  const assignedRoles = user?.roles?.map((item) => item.display_name || item.name).filter(Boolean) ?? []
  const roles = assignedRoles.length ? [...new Set(assignedRoles)] : user?.role ? [user.role] : []

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
      const message =
        responseMessage ||
        (error instanceof Error && error.message ? error.message : '') ||
        'プロフィール画像を更新できませんでした。'
      setAvatarUploadError(message)
      throw new Error(message, { cause: error })
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  return (
    <div className="settings-page mx-auto w-full min-w-0 max-w-[1440px] px-3 pb-6 pt-3 sm:px-5 sm:pb-8 sm:pt-4 lg:px-6">
      <PageHeader
        title={
          <>
            <span className="settings-page-icon" aria-hidden="true">
              <Settings size={21} />
            </span>
            設定
          </>
        }
        description="アカウント情報、セキュリティ認証、表示テーマ、通知設定を一元管理します。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge variant="success" dot>
              アカウント有効
            </StatusBadge>
            <StatusBadge variant={requiresMfa ? 'info' : 'neutral'}>
              {requiresMfa ? '2段階認証: 有効' : '2段階認証: 標準'}
            </StatusBadge>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] px-2.5 py-1 text-xs font-medium text-[var(--tm-text-secondary)]">
              {theme === 'dark' ? <Moon size={13} className="text-[var(--tm-primary)]" /> : <Sun size={13} className="text-amber-500" />}
              <span>{theme === 'dark' ? 'ダーク' : 'ライト'}</span>
              <span className="text-[var(--tm-border)]">·</span>
              <span>{language === 'vi' ? 'Tiếng Việt' : '日本語'}</span>
            </span>
          </div>
        }
        className="settings-page-header"
      />

      <div className="settings-layout">
        <aside className="settings-rail">
          {/* Compact Account Summary on Desktop Rail */}
          <div className="hidden items-center gap-3 border-b border-[var(--tm-border-subtle)] bg-[var(--tm-surface-elevated)] px-3.5 py-3.5 lg:flex">
            <UserAvatar
              name={employeeName}
              stableKey={user?.employee?.id ?? user?.id}
              imageSrc={getEmployeeAvatarImageUrl(user?.employee?.avatar_path)}
              imageAlt={`${employeeName}のプロフィール画像`}
              size="md"
              status="online"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-[var(--tm-text-primary)]">{employeeName}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                {employeeCode && (
                  <span className="font-mono text-[11px] text-[var(--tm-text-muted)]">{employeeCode}</span>
                )}
                {roles[0] && (
                  <span className="rounded border border-[var(--tm-border)] bg-[var(--tm-surface)] px-1.5 py-0.2 text-[10px] font-semibold text-[var(--tm-text-secondary)]">
                    {roles[0]}
                  </span>
                )}
              </div>
            </div>
          </div>

          <nav aria-label="設定カテゴリー" className="settings-nav">
            {categories.map(({ id, label, subtitle, icon: Icon }) => {
              const isActive = section === id
              return (
                <Link
                  key={id}
                  to={`/system?section=${id}`}
                  aria-current={isActive ? 'page' : undefined}
                  className="settings-nav-item"
                >
                  <span className="settings-nav-item-icon" aria-hidden="true">
                    <Icon size={17} />
                  </span>
                  <span className="settings-nav-item-text">
                    <span>{label}</span>
                    <span className="settings-nav-item-sub">{subtitle}</span>
                  </span>
                  <ChevronRight size={15} className="settings-nav-chevron" aria-hidden="true" />
                </Link>
              )
            })}
          </nav>

          {/* Session & Environment Summary pinned above logout on Desktop */}
          <div className="mt-auto hidden border-t border-[var(--tm-border-subtle)] bg-[var(--tm-surface-elevated)] px-3.5 py-3 lg:block">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--tm-text-muted)]">
              現在のセッション
            </p>
            <dl className="mt-2 space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-[var(--tm-text-muted)]">
                  <Laptop size={12} aria-hidden="true" />
                  環境
                </dt>
                <dd className="truncate font-medium text-[var(--tm-text-secondary)]" title={getBrowserSummary()}>
                  {getBrowserSummary()}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-[var(--tm-text-muted)]">
                  <ShieldCheck size={12} aria-hidden="true" />
                  2段階認証
                </dt>
                <dd className={`font-semibold ${requiresMfa ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--tm-text-secondary)]'}`}>
                  {requiresMfa ? '有効' : '標準'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-[var(--tm-text-muted)]">
                  <Globe size={12} aria-hidden="true" />
                  表示
                </dt>
                <dd className="font-medium text-[var(--tm-text-secondary)]">
                  {theme === 'dark' ? 'ダーク' : 'ライト'} · {language === 'vi' ? 'Tiếng Việt' : '日本語'}
                </dd>
              </div>
            </dl>
          </div>

          <div className="hidden border-t border-[var(--tm-border-subtle)] p-2.5 lg:block">
            <SettingsLogoutAction onClick={() => setIsLogoutConfirmationOpen(true)} disabled={isLoggingOut} />
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          {section === 'account' && (
            <AccountPanel
              user={user}
              employeeName={employeeName}
              employeeCode={employeeCode}
              officeName={officeName}
              roles={roles}
              requiresMfa={requiresMfa}
              theme={theme}
              language={language}
              isUploadingAvatar={isUploadingAvatar}
              avatarUploadError={avatarUploadError}
              avatarInputRef={avatarInputRef}
              onAvatarSelection={handleAvatarSelection}
            />
          )}

          {section === 'security' && (
            securityDetail ?? (
              <SecurityPanel
                requiresMfa={requiresMfa}
                mustChangePassword={user?.must_change_password === true}
                onRequestLogout={() => setIsLogoutConfirmationOpen(true)}
              />
            )
          )}

          {section === 'appearance' && (
            <AppearancePanel theme={theme} setTheme={setTheme} language={language} t={t} />
          )}

          {section === 'notifications' && user && (
            <ChatNotificationsPanel key={user.id} userId={user.id} />
          )}

          {section === 'privacy' && (
            <PrivacyPanel user={user} />
          )}

          <section aria-label="アカウント操作" className="mt-4 lg:hidden">
            <SettingsLogoutAction onClick={() => setIsLogoutConfirmationOpen(true)} disabled={isLoggingOut} />
          </section>
        </div>
      </div>

      {isLogoutConfirmationOpen && (
        <LogoutConfirmationDialog
          isLoggingOut={isLoggingOut}
          onCancel={() => setIsLogoutConfirmationOpen(false)}
          onConfirm={() => void handleLogout()}
        />
      )}
      {selectedAvatarFile && (
        <AvatarCropDialog
          key={`${selectedAvatarFile.name}-${selectedAvatarFile.lastModified}`}
          file={selectedAvatarFile}
          isSaving={isUploadingAvatar}
          onCancel={() => setSelectedAvatarFile(null)}
          onSave={handleAvatarSave}
        />
      )}
    </div>
  )
}

function CopyableChip({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard API may be restricted in some environments.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      title={`${label}をコピー`}
      aria-label={`${label}をコピー`}
      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--tm-text-primary)] transition hover:border-[var(--tm-primary)]/40 hover:bg-[var(--tm-surface-hover)]"
    >
      <span>{value}</span>
      {copied ? (
        <Check size={12} className="text-emerald-500" aria-hidden="true" />
      ) : (
        <Copy size={12} className="text-[var(--tm-text-muted)]" aria-hidden="true" />
      )}
    </button>
  )
}

type AccountPanelProps = {
  user: ReturnType<typeof useAuth>['user']
  employeeName: string
  employeeCode?: string
  officeName?: string
  roles: string[]
  requiresMfa: boolean
  theme: ThemeMode
  language: SupportedLocale
  isUploadingAvatar: boolean
  avatarUploadError: string
  avatarInputRef: React.RefObject<HTMLInputElement | null>
  onAvatarSelection: (file?: File) => void
}

function AccountPanel({
  user,
  employeeName,
  employeeCode,
  officeName,
  roles,
  requiresMfa,
  theme,
  language,
  isUploadingAvatar,
  avatarUploadError,
  avatarInputRef,
  onAvatarSelection,
}: AccountPanelProps) {
  const [changingEmail, setChangingEmail] = useState(false)
  const { logout } = useAuth()
  const navigate = useNavigate()
  const officeCode = user?.employee?.office?.office_code
  const permissionCount = user?.permission_names?.length ?? 0
  const loginIdentifier = user?.login_id || employeeCode || ''

  return (
    <SettingsSection
      icon={UserRound}
      title="アカウント"
      description="プロフィール画像、連絡先メールアドレス、および所属・権限情報を確認できます。"
      status={<StatusBadge variant="success" dot>オンライン・有効</StatusBadge>}
    >
      <div className="settings-profile">
        <UserAvatar
          name={employeeName}
          stableKey={user?.employee?.id ?? user?.id}
          imageSrc={getEmployeeAvatarImageUrl(user?.employee?.avatar_path)}
          imageAlt={`${employeeName}のプロフィール画像`}
          size="xl"
          status="online"
          className="settings-profile-avatar"
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold leading-tight text-[var(--tm-text-primary)] [overflow-wrap:anywhere] sm:text-xl">
              {employeeName}
            </h3>
            {roles.map((role) => (
              <span
                key={role}
                className="inline-flex items-center rounded-md border border-[var(--tm-primary)]/25 bg-[var(--tm-primary-muted)] px-2 py-0.5 text-xs font-semibold text-[var(--tm-primary)]"
              >
                {role}
              </span>
            ))}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[var(--tm-text-secondary)]">
            {employeeCode && (
              <span className="inline-flex items-center gap-1.5">
                <span className="text-[var(--tm-text-muted)]">社員ID</span>
                <CopyableChip value={employeeCode} label="社員ID" />
              </span>
            )}
            {officeName && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface)] px-2.5 py-0.5 font-medium text-[var(--tm-text-primary)]">
                <Building2 size={12} className="text-[var(--tm-primary)]" aria-hidden="true" />
                {officeName}
              </span>
            )}
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          icon={<Camera size={16} aria-hidden="true" />}
          loading={isUploadingAvatar}
          onClick={() => avatarInputRef.current?.click()}
          className="settings-profile-action min-h-10 bg-[var(--tm-surface)]"
        >
          プロフィール画像を変更
        </Button>
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(event) => onAvatarSelection(event.target.files?.[0])}
        />
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
        {avatarUploadError && (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200"
          >
            {avatarUploadError}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {/* Left Sub-card: Basic & Contact Information */}
          <div className="flex flex-col rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] p-4">
            <div className="mb-2 flex items-center justify-between border-b border-[var(--tm-border-subtle)] pb-2.5">
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--tm-primary)]">
                  BASIC PROFILE
                </span>
                <h3 className="text-sm font-bold text-[var(--tm-text-primary)]">基本情報・連絡先</h3>
              </div>
              <Mail size={16} className="text-[var(--tm-text-muted)]" aria-hidden="true" />
            </div>

            <dl className="flex-1 divide-y divide-[var(--tm-border-subtle)]">
              <AccountInfoRow icon={UserRound} label="氏名">
                <span className="text-[13px] font-semibold text-[var(--tm-text-primary)]">{employeeName}</span>
              </AccountInfoRow>

              {user?.email && (
                <AccountInfoRow icon={Mail} label="メールアドレス">
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <SensitiveValue value={user.email} label="メールアドレス" mask={maskEmail} />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 bg-[var(--tm-surface)] px-2.5 text-xs"
                      aria-label="メールアドレスを変更"
                      onClick={() => setChangingEmail(true)}
                    >
                      変更
                    </Button>
                  </div>
                </AccountInfoRow>
              )}

              <AccountInfoRow icon={KeyRound} label="ログインID">
                {loginIdentifier ? (
                  <CopyableChip value={loginIdentifier} label="ログインID" />
                ) : (
                  <span className="text-xs text-[var(--tm-text-muted)]">未設定</span>
                )}
              </AccountInfoRow>

              <AccountInfoRow icon={Check} label="アカウント状態">
                <StatusBadge variant="success" dot>
                  有効（通常稼働）
                </StatusBadge>
              </AccountInfoRow>
            </dl>
          </div>

          {/* Right Sub-card: Organization & Access Scope */}
          <div className="flex flex-col rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] p-4">
            <div className="mb-2 flex items-center justify-between border-b border-[var(--tm-border-subtle)] pb-2.5">
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--tm-primary)]">
                  ORGANIZATION & ACCESS
                </span>
                <h3 className="text-sm font-bold text-[var(--tm-text-primary)]">所属オフィス・権限スコープ</h3>
              </div>
              <Building2 size={16} className="text-[var(--tm-text-muted)]" aria-hidden="true" />
            </div>

            <dl className="flex-1 divide-y divide-[var(--tm-border-subtle)]">
              {officeName && (
                <AccountInfoRow icon={Building2} label="所属オフィス">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-[var(--tm-text-primary)]">{officeName}</span>
                    {officeCode && (
                      <span className="rounded border border-[var(--tm-border)] bg-[var(--tm-surface)] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--tm-text-muted)]">
                        {officeCode}
                      </span>
                    )}
                  </div>
                </AccountInfoRow>
              )}

              {roles.length > 0 && (
                <AccountInfoRow icon={ShieldCheck} label="権限ロール">
                  <ul className="flex flex-wrap gap-1.5">
                    {roles.map((role) => (
                      <li
                        key={role}
                        className="rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface)] px-2.5 py-0.5 text-xs font-semibold leading-5 text-[var(--tm-text-primary)]"
                      >
                        {role}
                      </li>
                    ))}
                  </ul>
                </AccountInfoRow>
              )}

              <AccountInfoRow icon={Lock} label="二段階認証">
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge variant={requiresMfa ? 'success' : 'neutral'} dot={requiresMfa}>
                    {requiresMfa ? '有効' : '標準（未設定）'}
                  </StatusBadge>
                  <Link
                    to="/system?section=security"
                    className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-[var(--tm-primary)] transition hover:underline"
                  >
                    設定へ
                    <ChevronRight size={13} aria-hidden="true" />
                  </Link>
                </div>
              </AccountInfoRow>

              <AccountInfoRow icon={Sparkles} label="利用可能機能">
                <div className="flex flex-wrap gap-1.5">
                  {['社員ルーム', '業務クエスト', '在留申請進捗管理', '社内チャット', 'AI社員'].map((moduleName) => (
                    <span
                      key={moduleName}
                      className="rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface)] px-2 py-0.5 text-[11px] font-medium text-[var(--tm-text-secondary)]"
                    >
                      {moduleName}
                    </span>
                  ))}
                  {permissionCount > 0 && (
                    <span className="rounded-md bg-[var(--tm-primary-muted)] px-2 py-0.5 text-[11px] font-semibold text-[var(--tm-primary)]">
                      +{permissionCount} 権限
                    </span>
                  )}
                </div>
              </AccountInfoRow>
            </dl>
          </div>
        </div>

        {/* Bottom Quick Settings Strip — fills lower workspace purposefully */}
        <div className="mt-auto grid grid-cols-1 gap-3 border-t border-[var(--tm-border-subtle)] pt-4 sm:grid-cols-3">
          <Link
            to="/system?section=security"
            className="group flex items-center gap-3 rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] px-3.5 py-3 transition-colors hover:border-[var(--tm-primary)]/35 hover:bg-[var(--tm-surface-hover)]"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface)] text-[var(--tm-primary)]">
              <ShieldCheck size={16} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold text-[var(--tm-text-primary)]">セキュリティ管理</span>
              <span className="mt-0.5 block truncate text-[11px] text-[var(--tm-text-muted)]">
                パスワード変更・2段階認証
              </span>
            </span>
            <ChevronRight size={15} className="shrink-0 text-[var(--tm-text-dim)] transition-colors group-hover:text-[var(--tm-primary)]" aria-hidden="true" />
          </Link>

          <Link
            to="/system?section=appearance"
            className="group flex items-center gap-3 rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] px-3.5 py-3 transition-colors hover:border-[var(--tm-primary)]/35 hover:bg-[var(--tm-surface-hover)]"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface)] text-[var(--tm-primary)]">
              <Palette size={16} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold text-[var(--tm-text-primary)]">外観・言語設定</span>
              <span className="mt-0.5 block truncate text-[11px] text-[var(--tm-text-muted)]">
                現在: {theme === 'dark' ? 'ダーク' : 'ライト'} · {language === 'vi' ? 'Tiếng Việt' : '日本語'}
              </span>
            </span>
            <ChevronRight size={15} className="shrink-0 text-[var(--tm-text-dim)] transition-colors group-hover:text-[var(--tm-primary)]" aria-hidden="true" />
          </Link>

          <Link
            to="/system?section=notifications"
            className="group flex items-center gap-3 rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] px-3.5 py-3 transition-colors hover:border-[var(--tm-primary)]/35 hover:bg-[var(--tm-surface-hover)]"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface)] text-[var(--tm-primary)]">
              <Bell size={16} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold text-[var(--tm-text-primary)]">通知設定</span>
              <span className="mt-0.5 block truncate text-[11px] text-[var(--tm-text-muted)]">
                サウンド・デスクトップ通知
              </span>
            </span>
            <ChevronRight size={15} className="shrink-0 text-[var(--tm-text-dim)] transition-colors group-hover:text-[var(--tm-primary)]" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {changingEmail && (
        <EmailChangeDialog
          onClose={() => setChangingEmail(false)}
          onChanged={() => {
            setChangingEmail(false)
            navigate('/login', {
              replace: true,
              state: { message: 'メールアドレスを変更しました。新しいメールアドレスでログインしてください。' },
            })
            void logout().catch(() => undefined)
          }}
        />
      )}
    </SettingsSection>
  )
}

function ChatNotificationsPanel({ userId }: { userId: number }) {
  const supported = canShowChatSystemNotifications()
  const [sound, setSound] = useState(() => chatNotificationEnabled(userId, 'sound'))
  const [system, setSystem] = useState(
    () => supported && Notification.permission === 'granted' && chatNotificationEnabled(userId, 'system'),
  )
  const [requesting, setRequesting] = useState(false)
  const [error, setError] = useState('')
  const [testPlayed, setTestPlayed] = useState(false)

  const playPreviewSound = () => {
    try {
      if (typeof window === 'undefined' || !('AudioContext' in window)) return
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const now = ctx.currentTime
      osc.type = 'sine'
      osc.frequency.setValueAtTime(587.33, now)
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.16)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.14, now + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.38)
      setTestPlayed(true)
      window.setTimeout(() => {
        setTestPlayed(false)
        void ctx.close().catch(() => undefined)
      }, 1500)
    } catch {
      // Ignore audio errors if blocked by browser policy.
    }
  }

  const toggleSystem = async () => {
    setError('')
    if (system) {
      setChatNotificationEnabled(userId, 'system', false)
      setSystem(false)
      return
    }
    setRequesting(true)
    try {
      if (await enableChatSystemNotifications()) {
        setChatNotificationEnabled(userId, 'system', true)
        setSystem(true)
      } else {
        setError('端末またはブラウザーの設定で通知を許可してください。')
      }
    } catch {
      setError('端末への通知を設定できませんでした。もう一度お試しください。')
    } finally {
      setRequesting(false)
    }
  }

  return (
    <SettingsSection
      icon={Bell}
      title="社内チャットの通知"
      description="新着メッセージのサウンド通知およびデスクトップ通知の動作を設定します。"
      status={
        <StatusBadge variant={sound || system ? 'success' : 'neutral'} dot>
          {sound || system ? '通知アクティブ' : 'ミュート中'}
        </StatusBadge>
      }
    >
      <div className="space-y-3.5 p-4 sm:p-5">
        {/* Sound Notification Card */}
        <div className="rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)]/40 p-4">
          <label className="flex cursor-pointer items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span className="settings-row-icon">
                <Volume2 size={18} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span id="settings-chat-sound-label" className="text-sm font-bold text-[var(--tm-text-primary)]">
                    新着メッセージの通知音
                  </span>
                  <StatusBadge variant={sound ? 'success' : 'neutral'}>
                    {sound ? 'オン' : 'オフ'}
                  </StatusBadge>
                </span>
                <span id="settings-chat-sound-help" className="mt-1 block text-xs leading-5 text-[var(--tm-text-secondary)]">
                  オフにしても、あなた宛てのメンション（@指定）には通知音が鳴ります。
                </span>
              </span>
            </div>
            <span className="relative mt-1 shrink-0">
              <input
                type="checkbox"
                role="switch"
                className="sr-only"
                aria-labelledby="settings-chat-sound-label"
                aria-describedby="settings-chat-sound-help"
                checked={sound}
                onChange={(event) => {
                  setSound(event.currentTarget.checked)
                  setChatNotificationEnabled(userId, 'sound', event.currentTarget.checked)
                }}
              />
              <span className="settings-switch" aria-hidden="true" />
            </span>
          </label>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--tm-border-subtle)] pt-3">
            <span className="text-xs text-[var(--tm-text-muted)]">
              現在の音量設定で通知チャイムをテストできます。
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={testPlayed ? <Check size={14} aria-hidden="true" /> : <Volume2 size={14} aria-hidden="true" />}
              onClick={playPreviewSound}
              className="min-h-8 bg-[var(--tm-surface)]"
            >
              {testPlayed ? '再生しました' : 'テスト音を再生'}
            </Button>
          </div>
        </div>

        {/* System Desktop Notification Card */}
        <div className="rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)]/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 flex-1 basis-56 items-start gap-3">
              <span className="settings-row-icon">
                <Bell size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-[var(--tm-text-primary)]">端末への通知（デスクトップ通知）</p>
                  <StatusBadge variant={system ? 'info' : 'neutral'}>
                    {system ? '許可済み' : 'オフ'}
                  </StatusBadge>
                </div>
                <p className="mt-1 text-xs leading-5 text-[var(--tm-text-secondary)]">
                  THEMISを開いている間、別のタブやアプリを表示していても新着メッセージを端末に通知します。
                </p>
              </div>
            </div>

            <Button
              variant={system ? 'outline' : 'primary'}
              size="sm"
              className={`min-h-9 shrink-0 ${system ? 'bg-[var(--tm-surface)]' : ''}`}
              loading={requesting}
              disabled={!supported}
              onClick={() => void toggleSystem()}
            >
              {system ? '端末への通知をオフにする' : '端末への通知をオンにする'}
            </Button>
          </div>

          {!supported && (
            <p className="mt-3 border-t border-[var(--tm-border-subtle)] pt-2.5 text-xs text-[var(--tm-text-secondary)]">
              このブラウザーでは端末への通知を設定できません。
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 border-t border-[var(--tm-border-subtle)] pt-2.5 text-xs text-[var(--tm-danger)]">
              {error}
            </p>
          )}
        </div>
      </div>
    </SettingsSection>
  )
}

function SecurityPanel({
  requiresMfa,
  mustChangePassword,
  onRequestLogout,
}: {
  requiresMfa?: boolean
  mustChangePassword?: boolean
  onRequestLogout: () => void
}) {
  const browserSummary = getBrowserSummary()

  return (
    <SettingsSection
      icon={ShieldCheck}
      title="セキュリティ"
      description="ログイン認証方式、二段階認証（MFA）、および現在のセッション保護を管理します。"
      status={
        <StatusBadge variant={requiresMfa ? 'success' : 'info'} dot>
          {requiresMfa ? '高セキュリティ保護中' : '標準保護'}
        </StatusBadge>
      }
    >
      <div className="space-y-4 p-4 sm:p-5">
        {/* Security Posture Callout */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--tm-primary)]/25 bg-[var(--tm-primary-muted)]/60 p-4">
          <div className="flex min-w-0 flex-1 basis-56 items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-[var(--tm-primary)]/25 bg-[var(--tm-surface)] text-[var(--tm-primary)]">
              <ShieldCheck size={20} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[var(--tm-text-primary)]">
                {requiresMfa ? '二段階認証（MFA）で保護されています' : '二段階認証（MFA）の有効化を推奨します'}
              </h3>
              <p className="mt-0.5 text-xs leading-5 text-[var(--tm-text-secondary)]">
                認証アプリ（Google Authenticator / Microsoft Authenticator 等）を登録すると、不正アクセスを強力に防止できます。
              </p>
            </div>
          </div>
          <Link
            to="/system/mfa"
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--tm-primary)]/30 bg-[var(--tm-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--tm-primary)] transition hover:bg-[var(--tm-surface-hover)]"
          >
            <span>MFA設定を確認</span>
            <ChevronRight size={14} aria-hidden="true" />
          </Link>
        </div>

        {/* Security Action Cards */}
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <SecurityLink
            to="/system/password"
            icon={KeyRound}
            title="パスワードを変更"
            description="現在のパスワードを確認し、11文字以上・大文字・記号を含む新しいパスワードを設定します。"
            badge={
              mustChangePassword ? (
                <StatusBadge variant="warning">変更推奨</StatusBadge>
              ) : (
                <StatusBadge variant="neutral">設定済み</StatusBadge>
              )
            }
          />
          <SecurityLink
            to="/system/mfa"
            icon={ShieldCheck}
            title="二段階認証"
            description="認証アプリ（TOTP）の登録・変更および緊急用バックアップコードを管理します。"
            badge={
              requiresMfa ? (
                <StatusBadge variant="success" dot>
                  有効
                </StatusBadge>
              ) : (
                <StatusBadge variant="info">推奨</StatusBadge>
              )
            }
          />
        </ul>

        {/* Active Session Card */}
        <div className="rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)]/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="settings-row-icon">
                <Laptop size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-[var(--tm-text-primary)]">現在のログインセッション</h3>
                  <StatusBadge variant="success" dot>
                    この端末
                  </StatusBadge>
                </div>
                <p className="mt-0.5 text-xs text-[var(--tm-text-secondary)]">
                  {browserSummary} · Sanctum 認証トークン有効
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRequestLogout}
              className="min-h-9 bg-[var(--tm-surface)]"
            >
              ログアウト
            </Button>
          </div>
        </div>
      </div>

      <p className="flex items-start gap-2 rounded-b-xl border-t border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] px-4 py-3 text-xs leading-5 text-[var(--tm-text-secondary)] sm:px-6">
        <Info size={15} className="mt-0.5 shrink-0 text-[var(--tm-primary)]" aria-hidden="true" />
        パスワードを変更すると、セキュリティ保護のためすべての端末で再ログインが必要です。
      </p>
    </SettingsSection>
  )
}

function SecurityLink({
  to,
  icon: Icon,
  title,
  description,
  badge,
}: {
  to: string
  icon: typeof UserRound
  title: string
  description: string
  badge?: ReactNode
}) {
  return (
    <li className="flex">
      <Link
        to={to}
        className="group flex w-full flex-col justify-between gap-3 rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)]/40 p-4 transition-all hover:border-[var(--tm-primary)]/40 hover:bg-[var(--tm-surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--tm-focus-ring)]"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="settings-row-icon">
            <Icon size={18} aria-hidden="true" />
          </span>
          {badge}
        </div>
        <div>
          <span className="flex items-center justify-between gap-2 text-sm font-bold text-[var(--tm-text-primary)]">
            <span>{title}</span>
            <ChevronRight
              size={16}
              className="shrink-0 text-[var(--tm-text-secondary)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--tm-primary)]"
              aria-hidden="true"
            />
          </span>
          <span className="mt-1 block text-xs leading-5 text-[var(--tm-text-secondary)]">{description}</span>
        </div>
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
  const [compactMode, setCompactMode] = useState(() => {
    try {
      return window.localStorage.getItem('themis_pref_compact') === '1'
    } catch {
      return false
    }
  })

  const handleCompactToggle = (checked: boolean) => {
    setCompactMode(checked)
    try {
      window.localStorage.setItem('themis_pref_compact', checked ? '1' : '0')
    } catch {
      // Ignore storage restriction.
    }
  }

  return (
    <SettingsSection
      icon={Palette}
      title="外観"
      description="THEMIS ワークスペースのカラーテーマ、表示言語、およびUI密度を設定します。"
    >
      <div className="space-y-5 p-4 sm:p-5">
        {/* Theme Selector */}
        <fieldset className="min-w-0 rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)]/40 p-4">
          <legend className="float-left mb-1 w-full text-sm font-bold text-[var(--tm-text-primary)]">テーマ</legend>
          <p className="clear-both mb-3.5 text-xs leading-5 text-[var(--tm-text-secondary)]">
            選択するとすぐに反映され、このブラウザーに保存されます。
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(
              [
                { id: 'light', label: 'ライト', subtitle: '明るく清潔感のある標準オフィス表示', icon: Sun },
                { id: 'dark', label: 'ダーク', subtitle: 'THEMIS Command ダークネイビー表示', icon: Moon },
              ] as const
            ).map(({ id, label, subtitle, icon: Icon }) => (
              <label key={id} className="relative cursor-pointer">
                <input
                  type="radio"
                  name="theme"
                  value={id}
                  checked={theme === id}
                  onChange={(event) => setTheme(id, event.currentTarget.closest('label') ?? undefined)}
                  className="peer sr-only"
                />
                <span className="block rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface)] p-3 transition-all duration-150 hover:border-[var(--tm-border-strong)] peer-checked:border-[var(--tm-primary)] peer-checked:bg-[var(--tm-surface-active)] peer-checked:shadow-xs peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--tm-focus-ring)]">
                  <ThemePreview theme={id} />
                  <span className="flex items-center gap-2 text-sm font-bold text-[var(--tm-text-primary)]">
                    <Icon size={16} className={theme === id ? 'text-[var(--tm-primary)]' : 'text-[var(--tm-text-secondary)]'} aria-hidden="true" />
                    <span>{label}</span>
                    {theme === id && (
                      <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[var(--tm-primary-muted)] px-2 py-0.5 text-[10px] font-semibold text-[var(--tm-primary)]">
                        <Check size={12} aria-hidden="true" />
                        適用中
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-xs text-[var(--tm-text-secondary)]">{subtitle}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Language Selector */}
        <fieldset className="min-w-0 rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)]/40 p-4">
          <legend className="float-left mb-1 w-full text-sm font-bold text-[var(--tm-text-primary)]">
            {t('settings.display.title')}
          </legend>
          <p className="clear-both mb-3.5 text-xs leading-5 text-[var(--tm-text-secondary)]">
            {t('settings.display.description')}
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(
              [
                { code: 'ja', title: t('settings.language.japanese'), sub: '法務・業務標準の日本語インターフェース' },
                { code: 'vi', title: t('settings.language.vietnamese'), sub: 'Giao diện hỗ trợ song ngữ Tiếng Việt' },
              ] as const
            ).map((item) => {
              const active = language === item.code
              return (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => void setAppLanguage(item.code)}
                  className={`flex items-start justify-between gap-3 rounded-xl border p-3.5 text-left transition ${
                    active
                      ? 'border-[var(--tm-primary)] bg-[var(--tm-surface-active)]'
                      : 'border-[var(--tm-border)] bg-[var(--tm-surface)] hover:border-[var(--tm-border-strong)]'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="settings-row-icon">
                      <Globe size={17} aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-[var(--tm-text-primary)]">{item.title}</p>
                      <p className="mt-0.5 text-xs text-[var(--tm-text-secondary)]">{item.sub}</p>
                    </div>
                  </div>
                  {active && <Check size={16} className="mt-1 shrink-0 text-[var(--tm-primary)]" aria-hidden="true" />}
                </button>
              )
            })}
          </div>

          <label className="mt-3.5 block max-w-sm space-y-1.5">
            <span className="block text-xs font-semibold text-[var(--tm-text-secondary)]">
              {t('settings.language.label')} ({t('settings.language.description')})
            </span>
            <select
              aria-label={t('settings.language.label')}
              value={language}
              onChange={(event) => void setAppLanguage(event.target.value as SupportedLocale)}
              className="h-10 w-full rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface)] px-3 text-sm text-[var(--tm-text-primary)] outline-none transition focus:border-[var(--tm-border-focus)] focus:ring-2 focus:ring-[var(--tm-focus-ring)]/25"
            >
              <option value="ja" className="bg-[var(--tm-surface)]">
                {t('settings.language.japanese')}
              </option>
              <option value="vi" className="bg-[var(--tm-surface)]">
                {t('settings.language.vietnamese')}
              </option>
            </select>
          </label>
        </fieldset>

        {/* Display Density Preference */}
        <div className="rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)]/40 p-4">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="settings-row-icon">
                <Clock3 size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--tm-text-primary)]">高密度オペレーション表示</p>
                <p className="mt-0.5 text-xs leading-5 text-[var(--tm-text-secondary)]">
                  一覧画面やチャットパネルの余白を抑え、1画面により多くの業務情報を表示します。
                </p>
              </div>
            </div>
            <span className="relative shrink-0">
              <input
                type="checkbox"
                role="switch"
                className="sr-only"
                aria-label="高密度オペレーション表示"
                checked={compactMode}
                onChange={(event) => handleCompactToggle(event.currentTarget.checked)}
              />
              <span className="settings-switch" aria-hidden="true" />
            </span>
          </label>
        </div>
      </div>
    </SettingsSection>
  )
}

function PrivacyPanel({ user }: { user: ReturnType<typeof useAuth>['user'] }) {
  const storageKey = user?.id ? `themis_notifications_${user.id}` : ''
  const [cachedCount, setCachedCount] = useState(() => {
    if (!storageKey) return 0
    try {
      const items = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]') as unknown[]
      return Array.isArray(items) ? items.length : 0
    } catch {
      return 0
    }
  })
  const [clearedBanner, setClearedBanner] = useState(false)

  const handleClearLocalCache = () => {
    try {
      if (storageKey) {
        window.localStorage.removeItem(storageKey)
      }
      setCachedCount(0)
      setClearedBanner(true)
      window.setTimeout(() => setClearedBanner(false), 2500)
    } catch {
      // Ignore storage error.
    }
  }

  return (
    <SettingsSection
      icon={Shield}
      title="プライバシー・データ管理"
      description="画面上の機密情報保護（マスキング表示）と、このブラウザーに保存されたローカルデータを管理します。"
      status={<StatusBadge variant="info">保護有効</StatusBadge>}
    >
      <div className="space-y-4 p-4 sm:p-5">
        {/* Sensitive Data Masking Card */}
        <div className="rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)]/40 p-4">
          <div className="flex items-start gap-3">
            <span className="settings-row-icon">
              <EyeOff size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-[var(--tm-text-primary)]">個人情報の自動マスキング保護</h3>
                <StatusBadge variant="success" dot>
                  常時有効
                </StatusBadge>
              </div>
              <p className="mt-1 text-xs leading-5 text-[var(--tm-text-secondary)]">
                オフィス内での覗き見（ショルダーハッキング）を防ぐため、メールアドレスや機密情報は初期状態で伏せ字（例: <code className="rounded bg-[var(--tm-surface)] px-1.5 py-0.5 font-mono text-[11px]">ngh***@gmail.com</code>）で表示されます。
              </p>
            </div>
          </div>
        </div>

        {/* Access & Session Isolation Card */}
        <div className="rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)]/40 p-4">
          <div className="flex items-start gap-3">
            <span className="settings-row-icon">
              <Lock size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-[var(--tm-text-primary)]">アカウント別データ分離</h3>
              <p className="mt-1 text-xs leading-5 text-[var(--tm-text-secondary)]">
                社内チャットの下書きや通知状態はログイン中のアカウントIDごとに分離されており、ログアウト時にセッション情報は直ちに破棄されます。
              </p>
            </div>
          </div>
        </div>

        {/* Local Notification Cache Cleanup */}
        <div className="rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)]/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 basis-56 items-start gap-3">
              <span className="settings-row-icon">
                <Trash2 size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-[var(--tm-text-primary)]">ブラウザー内通知キャッシュの整理</h3>
                  <span className="rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface)] px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--tm-text-secondary)]">
                    保存件数: {cachedCount}件
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-[var(--tm-text-secondary)]">
                  この端末に一時保存されている業務通知履歴キャッシュを消去します（サーバー上の業務データやログイン状態には影響しません）。
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClearLocalCache}
              disabled={cachedCount === 0 && !clearedBanner}
              icon={clearedBanner ? <Check size={14} aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />}
              className="min-h-9 shrink-0 bg-[var(--tm-surface)]"
            >
              {clearedBanner ? 'クリアしました' : 'キャッシュをクリア'}
            </Button>
          </div>
        </div>
      </div>
    </SettingsSection>
  )
}

function ThemePreview({ theme }: { theme: 'light' | 'dark' }) {
  const isLight = theme === 'light'
  return (
    <span
      aria-hidden="true"
      className={`mb-2.5 flex h-20 overflow-hidden rounded-lg border sm:h-24 ${
        isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-950'
      }`}
    >
      <span
        className={`w-1/4 space-y-1.5 border-r p-2 ${
          isLight ? 'border-slate-200 bg-[var(--color-white)]' : 'border-slate-800 bg-slate-900'
        }`}
      >
        <span className="block h-2 w-2 rounded-sm bg-[var(--tm-primary)]" />
        <span className="block h-1.5 rounded-sm bg-[var(--tm-primary)]/40" />
        <span className="block h-1 rounded-sm bg-slate-400/40" />
        <span className="block h-1 w-2/3 rounded-sm bg-slate-400/40" />
      </span>
      <span className="flex flex-1 flex-col gap-1.5 p-2 sm:p-2.5">
        <span className="flex items-center justify-between">
          <span className={`block h-1.5 w-1/2 rounded-sm ${isLight ? 'bg-slate-300' : 'bg-slate-700'}`} />
          <span className="block h-1.5 w-4 rounded-full bg-emerald-500/70" />
        </span>
        <span
          className={`flex flex-1 flex-col justify-center gap-1.5 rounded-md border px-2 ${
            isLight ? 'border-slate-200 bg-[var(--color-white)]' : 'border-slate-800 bg-slate-900'
          }`}
        >
          <span className="block h-1.5 w-3/4 rounded-sm bg-slate-400/45" />
          <span className="block h-1 w-1/2 rounded-sm bg-slate-400/35" />
        </span>
      </span>
    </span>
  )
}

type AccountInfoRowProps = { icon: typeof UserRound; label: string; children: ReactNode }

function AccountInfoRow({ icon: Icon, label, children }: AccountInfoRowProps) {
  return (
    <div className="grid min-h-[46px] gap-1.5 py-2.5 sm:grid-cols-[110px_minmax(0,1fr)] sm:items-center sm:gap-3">
      <dt className="flex items-center gap-2 text-xs font-semibold text-[var(--tm-text-secondary)]">
        <Icon size={14} className="shrink-0 text-[var(--tm-text-muted)]" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </dt>
      <dd className="min-w-0 text-sm font-medium text-[var(--tm-text-primary)]">{children}</dd>
    </div>
  )
}
