import { useState } from 'react'
import {
  Home,
  Grid,
  SquareCode,
  FileText,
  Sparkles,
  Check,
  Menu,
  X,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'

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

function Sidebar() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      {/* Nút mở menu trên điện thoại */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed left-4 top-4 z-40 flex h-11 w-11 items-center justify-center rounded-xl bg-[#0d1020] text-white shadow-lg md:hidden"
        aria-label="Mở menu"
      >
        <Menu size={22} />
      </button>

      {/* Lớp nền tối khi mở Sidebar */}
      {isOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setIsOpen(false)}
          aria-label="Đóng menu"
        />
      )}

        <aside
            className={`fixed inset-y-0 left-0 z-50 flex h-screen w-72 shrink-0 flex-col bg-[#0d1020] p-3 shadow-2xl transition-transform duration-300 md:sticky md:top-0 md:translate-x-0 ${
                isOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
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
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-white/10 hover:text-white md:hidden"
            aria-label="Đóng menu"
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
        <nav className="flex-1 space-y-1.5 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                onClick={() => setIsOpen(false)}
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
                          ? 'text-white'
                          : 'text-gray-400'
                      }
                    />

                    <span>{item.name}</span>
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>
      </aside>
    </>
  )
}

export default Sidebar