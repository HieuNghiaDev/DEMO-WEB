import { useEffect, useState } from 'react'
import {
  Check,
  FileText,
  Grid,
  Home,
  LoaderCircle,
  LogOut,
  Menu,
  Moon,
  Sparkles,
  SquareCode,
  Sun,
  X,
} from 'lucide-react'
import {
  NavLink,
  useNavigate,
} from 'react-router-dom'

import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'

const menuItems = [
  {
    path: '/',
    name: '社員ルーム',
    icon: Home,
  },
  {
    path: '/organization',
    name: '組織設計',
    icon: Grid,
  },
  {
    path: '/quests',
    name: '業務クエスト',
    icon: SquareCode,
  },
  {
    path: '/manual',
    name: 'マニュアル工房',
    icon: FileText,
  },
  {
    path: '/ai',
    name: 'AI社員',
    icon: Sparkles,
  },
  {
    path: '/approvals',
    name: '承認室',
    icon: Check,
  },
]

export default function Sidebar() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { isDark, toggleTheme } = useTheme()

  const [isOpen, setIsOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] =
    useState(false)

  const employeeName =
    user?.employee?.full_name ||
    user?.name ||
    user?.login_id ||
    '社員'

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const previousOverflow =
      document.body.style.overflow

    document.body.style.overflow = 'hidden'

    const handleEscape = (
      event: KeyboardEvent,
    ) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    window.addEventListener(
      'keydown',
      handleEscape,
    )

    return () => {
      document.body.style.overflow =
        previousOverflow

      window.removeEventListener(
        'keydown',
        handleEscape,
      )
    }
  }, [isOpen])

  const handleLogout = async () => {
    if (isLoggingOut) {
      return
    }

    try {
      setIsLoggingOut(true)
      await logout()
    } catch {
      // AuthContext vẫn xóa trạng thái đăng nhập.
    } finally {
      setIsLoggingOut(false)
      setIsOpen(false)

      navigate('/login', {
        replace: true,
      })
    }
  }

  return (
    <>
      {/* Nút mở Sidebar trên điện thoại */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed left-4 top-4 z-40 flex h-11 w-11 items-center justify-center rounded-xl bg-[#0d1020] text-white shadow-lg transition hover:bg-[#171b34] md:hidden"
        aria-label="メニューを開く"
        aria-expanded={isOpen}
        aria-controls="main-sidebar"
      >
        <Menu size={22} />
      </button>

      {/* Lớp nền tối trên điện thoại */}
      {isOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-sm md:hidden"
          onClick={() => setIsOpen(false)}
          aria-label="メニューを閉じる"
        />
      )}

      <aside
        id="main-sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-72 max-w-[88vw] shrink-0 flex-col bg-[#0d1020] p-3 shadow-2xl transition-transform duration-300 ease-out md:sticky md:top-0 md:h-screen md:max-w-none md:translate-x-0 md:shadow-none ${
          isOpen
            ? 'translate-x-0'
            : '-translate-x-full'
        }`}
        aria-label="メインメニュー"
      >
        {/* Logo */}
        <div className="mb-4 flex items-center gap-3 px-2 py-1">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-xl font-bold text-white shadow-md">
            T
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-bold tracking-wide text-white">
              THEMIS HQ
            </span>

            <span className="truncate text-xs text-gray-400">
              合同AI事務所
            </span>
          </div>

          {/* Nút đóng trên điện thoại */}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-white/10 hover:text-white md:hidden"
            aria-label="メニューを閉じる"
          >
            <X size={20} />
          </button>
        </div>

        {/* Workspace */}
        <div className="mb-6 flex items-center gap-2.5 rounded-xl border border-gray-800 bg-[#161b30]/60 px-3.5 py-2.5 text-xs text-gray-300">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-400" />

          <span className="truncate font-medium">
            合同ワークスペース
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1.5 overflow-y-auto overscroll-contain">
          {menuItems.map((item) => {
            const Icon = item.icon

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                onClick={() =>
                  setIsOpen(false)
                }
                className={({ isActive }) =>
                  `flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-[#635BFF] text-white shadow-lg shadow-indigo-500/20'
                      : 'text-gray-300 hover:bg-white/5 hover:text-white'
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
                          : 'shrink-0 text-gray-400'
                      }
                    />

                    <span className="truncate">
                      {item.name}
                    </span>
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Người đang đăng nhập */}
        <div className="mt-4 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={toggleTheme}
            className="mb-3 flex w-full items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.045] px-3 py-2.5 text-left transition hover:border-indigo-300/15 hover:bg-white/[0.08]"
            aria-label={isDark ? 'ライトモードに切り替える' : 'ダークモードに切り替える'}
            title={isDark ? 'ライトモード' : 'ダークモード'}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
              {isDark ? <Moon size={17} /> : <Sun size={17} />}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold text-white">
                表示モード
              </span>
              <span className="mt-0.5 block text-[10px] text-gray-500">
                {isDark ? 'ダーク' : 'ライト'}
              </span>
            </span>

            <span
              className={`relative h-6 w-11 shrink-0 rounded-full border transition ${
                isDark
                  ? 'border-indigo-400/40 bg-indigo-500/75'
                  : 'border-white/10 bg-white/10'
              }`}
              aria-hidden="true"
            >
              <span
                className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-md transition-transform ${
                  isDark ? 'translate-x-[1.35rem]' : 'translate-x-1'
                }`}
              />
            </span>
          </button>

          <div className="mb-3 flex items-center gap-3 rounded-xl bg-white/5 px-3 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 text-sm font-bold text-indigo-300">
              {employeeName
                .charAt(0)
                .toUpperCase()}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-white">
                {employeeName}
              </p>

              <p className="mt-0.5 truncate text-[10px] text-gray-500">
                {user?.login_id}
              </p>
            </div>
          </div>

          {/* Đăng xuất */}
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300 transition hover:bg-red-500/20 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoggingOut ? (
              <LoaderCircle
                size={18}
                className="animate-spin"
              />
            ) : (
              <LogOut size={18} />
            )}

            {isLoggingOut
              ? 'ログアウト中...'
              : 'ログアウト'}
          </button>
        </div>
      </aside>
    </>
  )
}
