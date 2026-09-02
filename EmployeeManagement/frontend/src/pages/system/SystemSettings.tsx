import { useState } from 'react'
import { Check, ChevronRight, KeyRound, Moon, Palette, ShieldCheck, Sun, UserRound } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { setAppLanguage, type SupportedLocale } from '../../i18n'
import LogoutConfirmationDialog from '../../components/settings/LogoutConfirmationDialog'
import SettingsLogoutAction from '../../components/settings/SettingsLogoutAction'

const categories = [
  { id: 'account', label: 'アカウント', caption: 'Account', icon: UserRound },
  { id: 'security', label: 'セキュリティ', caption: 'Security', icon: ShieldCheck },
  { id: 'appearance', label: '外観', caption: 'Appearance', icon: Palette },
] as const

export default function SystemSettings() {
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const section = categories.find(({ id }) => id === searchParams.get('section'))?.id ?? 'account'
  const [isLogoutConfirmationOpen, setIsLogoutConfirmationOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
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

  return (
    <div className="px-4 pb-8 pt-20 text-slate-900 dark:text-slate-100 md:p-6 xl:p-8">
      <header className="mb-6 border-b border-slate-200 pb-6 dark:border-slate-800">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">設定</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">システム・アカウント設定</p>
      </header>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[180px_minmax(0,1fr)] xl:gap-10">
        <div className="lg:sticky lg:top-6 lg:flex lg:min-h-80 lg:self-start lg:flex-col">
          <nav aria-label="設定カテゴリー" className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800/50 lg:grid-cols-1 lg:gap-2 lg:bg-transparent lg:p-0 lg:dark:bg-transparent">
            {categories.map(({ id, label, caption, icon: Icon }) => (
              <Link key={id} to={`/system?section=${id}`} aria-current={section === id ? 'page' : undefined}
                className={`flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-md px-1 py-3 text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:flex-row sm:gap-2 sm:text-sm lg:justify-start lg:px-3 ${section === id
                  ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-700 dark:text-indigo-200 lg:bg-indigo-50 lg:shadow-none lg:dark:bg-indigo-500/10'
                  : 'text-slate-500 hover:bg-white/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-slate-100'}`}>
                <Icon size={18} className="shrink-0" aria-hidden="true" />
                <span>{label}<span className="mt-0.5 hidden text-[10px] font-normal tracking-wide opacity-70 lg:block">{caption}</span></span>
              </Link>
            ))}
          </nav>
          <div className="mt-auto hidden pt-8 lg:block">
            <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
              <SettingsLogoutAction onClick={() => setIsLogoutConfirmationOpen(true)} disabled={isLoggingOut} />
            </div>
          </div>
        </div>

        <div className="min-w-0 max-w-4xl">
          <section aria-labelledby={`settings-${section}-title`} className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            {section === 'account' && <>
              <div className="border-b border-slate-200 px-5 py-5 dark:border-slate-700 sm:px-6">
                <h2 id="settings-account-title" className="text-lg font-semibold">アカウント情報</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">登録されている社員情報を確認できます。</p>
              </div>
              <div className="px-5 py-6 sm:px-6">
                <div className="mb-6 flex items-center gap-4">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-xl font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-200" aria-hidden="true">{employeeName.charAt(0).toUpperCase()}</span>
                  <div className="min-w-0">
                    <p className="break-words text-base font-semibold">{employeeName}</p>
                    <p className="mt-1 break-all text-sm text-slate-500 dark:text-slate-400">{user?.login_id}</p>
                  </div>
                </div>
                <dl className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                  {accountFields.map(({ label, value }) => <div key={label} className="grid gap-1 py-4 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
                    <dt className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">{label}</dt>
                    <dd className="min-w-0 break-words text-sm font-medium [overflow-wrap:anywhere]">{value}</dd>
                  </div>)}
                </dl>
              </div>
            </>}

            {section === 'security' && <>
              <div className="border-b border-slate-200 px-5 py-5 dark:border-slate-700 sm:px-6">
                <h2 id="settings-security-title" className="text-lg font-semibold">セキュリティ</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">アカウントとログインに関する設定</p>
              </div>
              <Link to="/system/password" className="group flex items-center gap-4 px-5 py-6 transition-colors duration-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:hover:bg-slate-800/50 sm:px-6">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"><KeyRound size={20} aria-hidden="true" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">パスワードを変更</span><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">現在のパスワードを確認し、新しいパスワードを設定します。</span></span>
                <ChevronRight size={18} className="shrink-0 text-slate-400 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transform-none" aria-hidden="true" />
              </Link>
              <p className="border-t border-slate-100 px-5 py-4 text-xs leading-5 text-slate-500 dark:border-slate-800 dark:text-slate-400 sm:px-6">変更後は、すべての端末で再ログインが必要です。</p>
            </>}

            {section === 'appearance' && <>
              <div className="border-b border-slate-200 px-5 py-5 dark:border-slate-700 sm:px-6">
                <h2 id="settings-appearance-title" className="text-lg font-semibold">外観</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">ワークスペースの表示を設定します。</p>
              </div>
              <fieldset className="px-5 py-6 sm:px-6">
                <legend className="float-left mb-1 w-full text-sm font-semibold">テーマ</legend>
                <p className="clear-both mb-5 text-xs leading-5 text-slate-500 dark:text-slate-400">選択するとすぐに反映され、このブラウザーに保存されます。</p>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  {([{ id: 'light', label: 'ライト', icon: Sun }, { id: 'dark', label: 'ダーク', icon: Moon }] as const).map(({ id, label, icon: Icon }) => (
                    <label key={id} className="relative cursor-pointer">
                      <input type="radio" name="theme" value={id} checked={theme === id} onChange={(event) => setTheme(id, event.currentTarget.closest('label') ?? undefined)} className="peer sr-only" />
                      <span className="block rounded-lg border border-slate-200 p-3 transition-colors duration-200 hover:border-indigo-300 peer-checked:border-indigo-500 peer-checked:ring-1 peer-checked:ring-indigo-500 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-indigo-500 dark:border-slate-700 dark:peer-checked:border-indigo-400">
                        <span aria-hidden="true" className={`mb-3 flex h-24 overflow-hidden rounded-md border ${id === 'light' ? 'border-slate-200 bg-slate-50' : 'border-slate-600 bg-slate-950'}`}>
                          <span className={`w-1/4 space-y-2 border-r p-2 ${id === 'light' ? 'border-slate-200 bg-slate-100' : 'border-slate-700 bg-slate-800'}`}>
                            <span className="block h-2 rounded-sm bg-indigo-400" /><span className="block h-1 rounded-sm bg-slate-400/40" /><span className="block h-1 rounded-sm bg-slate-400/40" />
                          </span>
                          <span className="flex-1 space-y-2 p-3"><span className={`block h-2 w-2/3 rounded-sm ${id === 'light' ? 'bg-slate-300' : 'bg-slate-500'}`} /><span className={`block h-10 rounded-sm border ${id === 'light' ? 'border-slate-200 bg-slate-100' : 'border-slate-700 bg-slate-800'}`} /></span>
                        </span>
                        <span className="flex items-center gap-2 text-sm font-medium"><Icon size={16} aria-hidden="true" />{label}{theme === id && <Check size={16} className="ml-auto text-indigo-600 dark:text-indigo-300" aria-hidden="true" />}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="mt-6 border-t border-slate-100 px-5 pt-6 dark:border-slate-800 sm:px-6">
                <legend className="float-left mb-1 w-full text-sm font-semibold">{t('settings.display.title')}</legend>
                <p className="clear-both mb-5 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('settings.display.description')}</p>
                <label className="block max-w-sm space-y-2">
                  <span className="block text-sm font-medium">{t('settings.language.label')}</span>
                  <span className="block text-xs leading-5 text-slate-500 dark:text-slate-400">{t('settings.language.description')}</span>
                  <select
                    aria-label={t('settings.language.label')}
                    value={language}
                    onChange={(event) => void setAppLanguage(event.target.value as SupportedLocale)}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="ja">{t('settings.language.japanese')}</option>
                    <option value="vi">{t('settings.language.vietnamese')}</option>
                  </select>
                </label>
              </fieldset>
            </>}
          </section>

          <section aria-labelledby="settings-session-title" className="mt-8 border-t border-slate-200 pt-5 dark:border-slate-800 lg:hidden">
            <h2 id="settings-session-title" className="text-xs font-medium text-slate-500 dark:text-slate-400">アカウント操作</h2>
            <div className="mt-3 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div><p className="text-sm font-medium">ログアウト</p><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">現在のセッションを終了します。</p></div>
              <div className="w-full shrink-0 sm:w-auto"><SettingsLogoutAction onClick={() => setIsLogoutConfirmationOpen(true)} disabled={isLoggingOut} /></div>
            </div>
          </section>
        </div>
      </div>
      {isLogoutConfirmationOpen && <LogoutConfirmationDialog isLoggingOut={isLoggingOut} onCancel={() => setIsLogoutConfirmationOpen(false)} onConfirm={() => void handleLogout()} />}
    </div>
  )
}
