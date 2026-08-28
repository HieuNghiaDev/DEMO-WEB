import { useEffect, useState } from 'react'
import {
  BadgeCheck,
  BotMessageSquare,
  ChevronRight,
  FolderKanban,
  FileSpreadsheet,
  Home,
  KeyRound,
  LoaderCircle,
  LogOut,
  Menu,
  Moon,
  Sun,
  UsersRound,
  X,
} from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'

import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'

const menuItems = [
  { path: '/', name: '社員ルーム', icon: Home },
  { path: '/organization', name: '組織設計', icon: UsersRound },
  { path: '/quests', name: '業務クエスト', icon: FolderKanban },
  { path: '/visa-progress', name: '在留申請進捗管理', icon: FileSpreadsheet },
  { path: '/ai', name: 'AI社員', icon: BotMessageSquare },
  { path: '/approvals', name: '承認室', icon: BadgeCheck },
]

export default function Sidebar() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { isDark, toggleTheme } = useTheme()

  const [isOpen, setIsOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isLogoutConfirmationOpen, setIsLogoutConfirmationOpen] = useState(false)
  const themisLogoUrl = `${import.meta.env.BASE_URL}images/logoTHEMIS.png`

  const employeeName =
    user?.employee?.full_name ||
    user?.name ||
    user?.login_id ||
    '社員'

  useEffect(() => {
    if (!isOpen && !isLogoutConfirmationOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsLogoutConfirmationOpen(false)
        setIsOpen(false)
      }
    }

    window.addEventListener('keydown', handleEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, isLogoutConfirmationOpen])

  const handleLogout = async () => {
    if (isLoggingOut) return

    try {
      setIsLoggingOut(true)
      await logout()
    } catch {
      // AuthContext vẫn xóa trạng thái đăng nhập
    } finally {
      setIsLoggingOut(false)
      setIsLogoutConfirmationOpen(false)
      setIsOpen(false)
      navigate('/login', { replace: true })
    }
  }

  return (
    <>
      {/* Mobile menu button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed left-4 top-4 z-40 flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-lg transition hover:bg-slate-50 dark:border-white/10 dark:bg-[#0d1020] dark:text-white dark:hover:bg-[#171b34] md:hidden"
        aria-label="メニューを開く"
        aria-expanded={isOpen}
        aria-controls="main-sidebar"
      >
        <Menu size={22} />
      </button>

      {/* Mobile overlay */}
      {isOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm md:hidden"
          onClick={() => setIsOpen(false)}
          aria-label="メニューを閉じる"
        />
      )}

      <aside
        id="main-sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-72 max-w-[88vw] shrink-0 flex-col border-r border-slate-200 bg-white p-3 text-slate-700 shadow-2xl transition-all duration-300 ease-out dark:border-white/[0.06] dark:bg-[#0d1020] dark:text-white md:sticky md:top-0 md:h-screen md:max-w-none md:translate-x-0 md:shadow-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="メインメニュー"
      >
        {/* Logo */}
        <div className="mb-4 flex items-center gap-3 px-2 py-1">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-md dark:border-white/10 dark:bg-white/95">
            <img alt="" className="h-full w-full object-contain" src={themisLogoUrl} />
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-bold tracking-wide text-slate-900 dark:text-white">
              THEMIS HQ
            </span>

            <span className="truncate text-xs text-slate-400 dark:text-gray-400">
              合同AI事務所
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white md:hidden"
            aria-label="メニューを閉じる"
          >
            <X size={20} />
          </button>
        </div>

        {/* Workspace + theme */}
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-[10px] text-slate-600 dark:border-gray-800 dark:bg-[#161b30]/60 dark:text-gray-300">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-400" />
            <span className="truncate font-medium">合同ワークスペース</span>
          </div>

          {/* Theme switch */}
          <button
            type="button"
            onClick={toggleTheme}
            className={`theme-mode-pill group relative block h-9 w-28 shrink-0 overflow-hidden rounded-full border transition duration-300 hover:-translate-y-px hover:scale-[1.02] active:translate-y-0 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
              isDark
                ? 'border-[#151923] bg-gradient-to-b from-[#424754] via-[#333844] to-[#242934] shadow-[inset_0_3px_3px_rgba(255,255,255,0.09),inset_0_-3px_5px_rgba(2,6,23,0.28),0_2px_0_rgba(255,255,255,0.08),0_7px_16px_rgba(2,6,23,0.3)] hover:border-indigo-300/30'
                : 'border-slate-300 bg-gradient-to-b from-white via-slate-100 to-slate-200 shadow-[inset_0_2px_3px_rgba(255,255,255,1),0_4px_10px_rgba(15,23,42,0.12)] hover:border-indigo-300'
            }`}
            aria-label={isDark ? 'ライトモードに切り替える' : 'ダークモードに切り替える'}
            title={isDark ? 'ライトモード' : 'ダークモード'}
          >
            <span
              className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-left text-[8px] font-black leading-[0.6rem] tracking-[0.04em] transition-all ${
                isDark ? 'left-[2.8rem] text-slate-200' : 'left-2.5 text-slate-600'
              }`}
            >
              {isDark ? (
                <>
                  DARK
                  <br />
                  MODE
                </>
              ) : (
                <>
                  LIGHT
                  <br />
                  MODE
                </>
              )}
            </span>

            <span className="pointer-events-none absolute inset-[2px] rounded-full border-t border-white/25 opacity-70" />

            <span
              className={`absolute top-0.5 flex h-8 w-8 items-center justify-center rounded-full border-2 bg-gradient-to-br from-white via-slate-100 to-slate-300 shadow-md transition-all duration-300 ${
                isDark
                  ? 'left-0.5 border-slate-400 text-slate-500'
                  : 'left-[4.75rem] border-amber-200 text-amber-500'
              }`}
              aria-hidden="true"
            >
              {isDark ? (
                <Moon size={18} strokeWidth={1.7} />
              ) : (
                <Sun size={18} strokeWidth={1.7} />
              )}
            </span>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1.5 overflow-x-hidden overflow-y-auto overscroll-contain">
          {menuItems.map((item) => {
            const Icon = item.icon

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                onClick={() => setIsOpen(false)}
                className={({ isActive }) =>
                  `workspace-nav-link flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-[#635BFF] text-white shadow-lg shadow-indigo-500/20'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      size={18}
                      className={
                        isActive
                          ? 'shrink-0 text-white'
                          : 'shrink-0 text-slate-400 dark:text-gray-400'
                      }
                    />

                    <span className="truncate">{item.name}</span>
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Logged user */}
        <div className="mt-4 border-t border-slate-200 pt-4 dark:border-white/10">
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-white/[0.05] dark:bg-white/5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-sm font-bold text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300">
              {employeeName.charAt(0).toUpperCase()}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                {employeeName}
              </p>

              <p className="mt-0.5 truncate text-[10px] text-slate-400 dark:text-gray-500">
                {user?.login_id}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setIsOpen(false)
              navigate('/change-password')
            }}
            className="group mb-2 flex h-11 w-full items-center gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-left shadow-sm shadow-indigo-500/10 transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-100 hover:shadow-md hover:shadow-indigo-500/20 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-indigo-400/30 dark:bg-indigo-500/15 dark:shadow-indigo-950/30 dark:hover:border-indigo-300/50 dark:hover:bg-indigo-500/25"
            title="アカウントのセキュリティ設定"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-indigo-600 shadow-sm transition-transform duration-200 group-hover:scale-110 group-hover:rotate-[-4deg] dark:bg-indigo-400/20 dark:text-indigo-200">
              <KeyRound size={15} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-indigo-700 dark:text-indigo-200">パスワードを変更</span>
            <ChevronRight size={16} className="shrink-0 text-indigo-400 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-indigo-600 dark:text-indigo-300 dark:group-hover:text-indigo-100" aria-hidden="true" />
          </button>

          {/* Logout */}
          <button
            type="button"
            onClick={() => setIsLogoutConfirmationOpen(true)}
            disabled={isLoggingOut}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20 dark:hover:text-red-200"
          >
            {isLoggingOut ? (
              <LoaderCircle size={18} className="animate-spin" />
            ) : (
              <LogOut size={18} />
            )}

            {isLoggingOut ? 'ログアウト中...' : 'ログアウト'}
          </button>
        </div>
      </aside>

      {isLogoutConfirmationOpen && (
        <div
          className="workspace-confirm-backdrop fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/55 p-4 backdrop-blur-sm sm:items-center"
          onMouseDown={() => !isLoggingOut && setIsLogoutConfirmationOpen(false)}
        >
          <div
            className="workspace-confirm-panel w-full max-w-sm rounded-3xl border border-white/15 bg-white p-5 shadow-2xl dark:bg-[#11182a] sm:p-6"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-confirmation-title"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 shadow-sm dark:bg-rose-500/15 dark:text-rose-300">
              <LogOut size={22} />
            </div>
            <h2 id="logout-confirmation-title" className="mt-4 text-lg font-bold text-slate-900 dark:text-white">
              ログアウトしますか？
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-slate-400">
              現在のワークスペースから安全にログアウトします。未保存の入力がある場合は先に保存してください。
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={isLoggingOut}
                onClick={() => setIsLogoutConfirmationOpen(false)}
                className="workspace-action-button rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={isLoggingOut}
                onClick={() => void handleLogout()}
                className="workspace-action-button flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-rose-500/20 transition hover:bg-rose-500 disabled:opacity-60"
              >
                {isLoggingOut && <LoaderCircle size={16} className="animate-spin" />}
                {isLoggingOut ? '処理中...' : 'ログアウト'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
