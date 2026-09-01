import { useEffect, useRef, useState } from 'react'
import {
  BadgeCheck, BotMessageSquare, FileSpreadsheet, FolderKanban, Home, LogOut,
  Menu, Settings, UsersRound, X, type LucideIcon,
} from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import SidebarUtilityPanel from './SidebarUtilityPanel'

const menuItems = [
  { path: '/', name: '社員ルーム', icon: Home },
  { path: '/organization', name: '組織設計', icon: UsersRound },
  { path: '/quests', name: '業務クエスト', icon: FolderKanban },
  { path: '/visa-progress', name: '在留申請進捗管理', icon: FileSpreadsheet },
  { path: '/ai', name: 'AI社員', icon: BotMessageSquare },
  { path: '/approvals', name: '承認室', icon: BadgeCheck },
]

function SidebarItem({ path, name, icon: Icon, onSelect }: {
  path: string
  name: string
  icon: LucideIcon
  onSelect: () => void
}) {
  return (
    <NavLink to={path} end={path === '/'} onClick={onSelect}
      className={({ isActive }) => `group flex min-h-12 items-center gap-3 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${isActive
        ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-400/25 dark:bg-indigo-500/10 dark:text-indigo-200'
        : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'}`}>
      {({ isActive }) => <>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors duration-200 ${isActive ? 'bg-indigo-600 text-white dark:bg-indigo-500' : 'text-slate-500 group-hover:text-indigo-600 dark:text-slate-400 dark:group-hover:text-indigo-300'}`}>
          <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">{name}</span>
        {isActive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500 dark:bg-indigo-300" aria-hidden="true" />}
      </>}
    </NavLink>
  )
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const employeeName = user?.employee?.full_name || user?.name || user?.login_id || '社員'

  useEffect(() => {
    if (!isOpen) return
    const trigger = triggerRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const desktop = window.matchMedia('(min-width: 768px)')
    const closeOnDesktop = () => { if (desktop.matches) setIsOpen(false) }
    const focusable = () => Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [])
      .filter((element) => element.getClientRects().length > 0)
    focusable()[0]?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
      if (event.key !== 'Tab') return
      const elements = focusable()
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    window.addEventListener('keydown', handleKey)
    desktop.addEventListener('change', closeOnDesktop)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKey)
      desktop.removeEventListener('change', closeOnDesktop)
      if (!desktop.matches) trigger?.focus()
    }
  }, [isOpen])

  const closeMenu = () => setIsOpen(false)

  const handleLogout = async () => {
    if (isLoggingOut) return
    try {
      setIsLoggingOut(true)
      await logout()
    } catch {
      // AuthContext clears local authentication even if the API is unavailable.
    } finally {
      setIsLoggingOut(false)
      closeMenu()
      navigate('/login', { replace: true })
    }
  }

  return <>
    <button ref={triggerRef} type="button" onClick={() => setIsOpen(true)} aria-label="メニューを開く" aria-expanded={isOpen} aria-controls="main-sidebar"
      className="fixed left-4 top-4 z-40 flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 md:hidden">
      <Menu size={20} />
    </button>
    {isOpen && <button type="button" onClick={closeMenu} aria-label="メニューを閉じる" className="fixed inset-0 z-40 bg-slate-950/50 md:hidden" />}
    <aside ref={sidebarRef} id="main-sidebar" aria-label="メインメニュー"
      className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-72 max-w-[88vw] shrink-0 flex-col border-r border-slate-200 bg-white p-4 text-slate-700 transition-[transform,visibility] duration-200 motion-reduce:transition-none dark:border-slate-800 dark:bg-slate-900 md:sticky md:top-0 md:visible md:max-w-none md:translate-x-0 ${isOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'}`}>
      <div className="flex shrink-0 items-center gap-3 px-1 py-2">
        <img src={`${import.meta.env.BASE_URL}images/logoTHEMIS.png`} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-1.5 dark:border-slate-700" />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold tracking-wide text-slate-900 dark:text-slate-100">THEMIS HQ</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">合同AI事務所</p>
        </div>
        <button type="button" onClick={closeMenu} aria-label="メニューを閉じる" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800 md:hidden"><X size={18} /></button>
      </div>
      <SidebarUtilityPanel />
      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-label="ワークスペースとシステム">
        <div className="mb-2 flex items-baseline justify-between gap-2 px-3 text-[10px] font-medium text-slate-500 dark:text-slate-400">
          <span>ワークスペース</span><span className="tracking-widest">WORKSPACE</span>
        </div>
        <div className="space-y-1">{menuItems.map((item) => <SidebarItem key={item.path} {...item} onSelect={closeMenu} />)}</div>
        <div className="mb-2 mt-6 flex items-baseline justify-between gap-2 border-t border-slate-200 px-3 pt-5 text-[10px] font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <span>システム</span><span className="tracking-widest">SYSTEM</span>
        </div>
        <SidebarItem path="/system" name="設定" icon={Settings} onSelect={closeMenu} />
      </nav>
      <div className="mt-4 shrink-0 border-t border-slate-200 pt-4 dark:border-slate-800">
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5 transition-colors duration-200 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-indigo-400/50">
          <NavLink to="/system?section=account" onClick={closeMenu} aria-label={`${employeeName} のアカウント設定`}
            className="flex min-w-0 flex-1 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200">{employeeName.charAt(0).toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <p title={employeeName} className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">{employeeName}</p>
            <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">{user?.login_id}</p>
          </div>
          </NavLink>
          <button type="button" onClick={() => void handleLogout()} disabled={isLoggingOut} aria-label="ログアウト" title="ログアウト"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors duration-200 hover:bg-rose-500/[0.07] hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-wait disabled:opacity-60 dark:text-slate-500 dark:hover:text-rose-300">
            <LogOut size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  </>
}
