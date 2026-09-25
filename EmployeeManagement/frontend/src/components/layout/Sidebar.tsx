import { useEffect, useRef, useState } from 'react'
import {
  BadgeCheck, BotMessageSquare, FileSpreadsheet, FolderKanban, Home, LogOut,
  Menu, Settings, UsersRound, X, type LucideIcon,
} from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import LogoutConfirmationDialog from '../settings/LogoutConfirmationDialog'
import SidebarUtilityPanel from './SidebarUtilityPanel'

function SidebarItem({ path, name, icon: Icon, onSelect }: {
  path: string
  name: string
  icon: LucideIcon
  onSelect: () => void
}) {
  return (
    <NavLink
      to={path}
      end={path === '/'}
      onClick={onSelect}
      className={({ isActive }) =>
        `group relative flex min-h-[42px] items-center gap-3 rounded-xl px-3.5 py-2 text-[13.5px] font-medium transition-all duration-200 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
          isActive
            ? 'text-white font-semibold'
            : 'text-slate-600 hover:bg-indigo-50/80 hover:text-indigo-800 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-100'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {/* Smooth animated active pill background */}
          <span
            className={`absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-700 to-indigo-900 shadow-md shadow-indigo-700/20 transition-all duration-250 ease-out pointer-events-none dark:!bg-none dark:!bg-[#25255f] dark:!shadow-none ${
              isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
            }`}
            aria-hidden="true"
          />

          <Icon
            size={18}
            strokeWidth={isActive ? 2.2 : 1.8}
            className={`relative z-10 shrink-0 transition-colors duration-200 ${
              isActive
                ? 'text-white'
                : 'text-slate-500 group-hover:text-indigo-600 dark:text-slate-400 dark:group-hover:text-indigo-400'
            }`}
            aria-hidden="true"
          />
          <span className="relative z-10 min-w-0 flex-1 truncate">{name}</span>
          <span
            className={`relative z-10 h-1.5 w-1.5 shrink-0 rounded-full bg-white shadow-xs transition-all duration-250 ease-out ${
              isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-0'
            }`}
            aria-hidden="true"
          />
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [isLogoutConfirmationOpen, setIsLogoutConfirmationOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const employeeName = user?.employee?.full_name || user?.name || user?.login_id || 'THEMIS MANAGER'
  const employeeCode = user?.employee?.employee_code || user?.login_id || 'TMS-2600S'
  const menuItems = [
    { path: '/', name: t('navigation.employeeRoom'), icon: Home },
    { path: '/organization', name: t('navigation.organization'), icon: UsersRound },
    { path: '/quests', name: t('navigation.businessQuest'), icon: FolderKanban },
    { path: '/visa-progress', name: t('navigation.visaProgress'), icon: FileSpreadsheet },
    { path: '/ai', name: t('navigation.aiEmployee'), icon: BotMessageSquare },
    { path: '/approvals', name: t('navigation.approvals'), icon: BadgeCheck },
  ]

  useEffect(() => {
    if (!isOpen) return
    const trigger = triggerRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const desktop = window.matchMedia('(min-width: 1280px)')
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
      setIsLogoutConfirmationOpen(false)
      closeMenu()
      navigate('/login', { replace: true })
    }
  }

  return <>
    <header className="fixed inset-x-0 top-0 z-30 flex h-[calc(56px+env(safe-area-inset-top))] items-center justify-between border-b border-slate-200/90 bg-white/95 px-3 pt-[env(safe-area-inset-top)] shadow-xs backdrop-blur-sm xl:hidden dark:border-tm-border dark:bg-tm-sidebar/95 dark:shadow-none">
      <button ref={triggerRef} type="button" onClick={() => setIsOpen(true)} aria-label={t('sidebar.openMenu')} aria-expanded={isOpen} aria-controls="main-sidebar"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-tm-border dark:bg-tm-surface dark:text-slate-100 dark:shadow-none">
        <Menu size={20} />
      </button>
      <NavLink to="/" aria-label="THEMIS HQ" className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
        <img src={`${import.meta.env.BASE_URL}images/logoTHEMIS.png`} alt="" className="h-7 w-7 object-contain" />
        <span className="whitespace-nowrap text-sm font-extrabold tracking-tight text-slate-900 dark:text-white">THEMIS HQ</span>
      </NavLink>
      <NavLink to="/system?section=account" aria-label={t('sidebar.accountSettings', { name: employeeName })} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-xs font-black text-white shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:bg-tm-primary dark:ring-offset-tm-sidebar">
        {employeeName.charAt(0).toUpperCase()}
      </NavLink>
    </header>
    {isOpen && <button type="button" onClick={closeMenu} aria-label={t('sidebar.closeMenu')} className="fixed inset-0 z-40 bg-slate-950/50 xl:hidden" />}
    <aside ref={sidebarRef} id="main-sidebar" aria-label={t('sidebar.mainMenu')}
      className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-[84vw] max-w-[320px] shrink-0 flex-col border-r border-slate-200/90 bg-white p-3.5 text-slate-700 shadow-xs transition-[transform,visibility] duration-200 motion-reduce:transition-none dark:border-tm-border dark:bg-tm-sidebar dark:text-slate-200 xl:sticky xl:top-0 xl:w-64 xl:max-w-none xl:visible xl:translate-x-0 ${isOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'}`}>
      <div className="flex shrink-0 items-center gap-3 px-1 py-1.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 p-1.5 ring-1 ring-indigo-200/80 dark:bg-indigo-500/15 dark:ring-indigo-500/30">
          <img src={`${import.meta.env.BASE_URL}images/logoTHEMIS.png`} alt="THEMIS HQ" className="h-full w-full object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-extrabold tracking-tight text-slate-900 dark:text-white leading-none">THEMIS HQ</p>
          <p className="mt-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 tracking-wide">合同法律事務所</p>
        </div>
        <button type="button" onClick={closeMenu} aria-label={t('sidebar.closeMenu')} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-white/[0.06] dark:hover:text-slate-200 xl:hidden"><X size={18} /></button>
      </div>
      <SidebarUtilityPanel />
      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-label={t('sidebar.workspaceAndSystem')}>
        <div className="mb-2 mt-2 flex items-baseline justify-between gap-2 px-3 text-[11px] font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
          <span>{t('sidebar.workspace')}</span><span className="tracking-widest text-[10px] text-slate-400 dark:text-slate-500">WORKSPACE</span>
        </div>
        <div className="space-y-1">{menuItems.map((item) => <SidebarItem key={item.path} {...item} onSelect={closeMenu} />)}</div>
        <div className="mb-2 mt-5 flex items-baseline justify-between gap-2 border-t border-slate-200 px-3 pt-4 text-[11px] font-bold tracking-wider text-slate-500 dark:border-white/[0.08] dark:text-slate-400 uppercase">
          <span>{t('sidebar.system')}</span><span className="tracking-widest text-[10px] text-slate-400 dark:text-slate-500">SYSTEM</span>
        </div>
        <SidebarItem path="/system" name={t('navigation.settings')} icon={Settings} onSelect={closeMenu} />
      </nav>
      <div className="mt-4 shrink-0 border-t border-slate-200/90 pt-3 dark:border-white/[0.08]">
        <div className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 via-white to-indigo-50/50 p-2 shadow-xs transition-all duration-150 hover:border-indigo-300 hover:shadow-sm dark:!bg-none dark:!bg-tm-surface dark:border-tm-border dark:shadow-none dark:hover:border-tm-border-strong dark:hover:shadow-none">
          <NavLink to="/system?section=account" onClick={closeMenu} aria-label={t('sidebar.accountSettings', { name: employeeName })}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-xs font-black text-white shadow-sm shadow-indigo-500/30 ring-2 ring-indigo-500/20 dark:!bg-none dark:!bg-tm-primary dark:shadow-none dark:ring-indigo-400/20">{employeeName.charAt(0).toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <p title={employeeName} className="truncate text-xs font-bold text-slate-900 dark:text-slate-100 leading-tight">{employeeName}</p>
            <p className="mt-0.5 truncate font-mono text-[11px] font-bold text-indigo-600 dark:text-indigo-400">{employeeCode}</p>
          </div>
          </NavLink>
          <button type="button" onClick={() => setIsLogoutConfirmationOpen(true)} disabled={isLoggingOut} aria-label={t('common.logout')} title={t('common.logout')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-wait disabled:opacity-60 dark:text-slate-400 dark:hover:bg-rose-500/15 dark:hover:text-rose-300">
            <LogOut size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
    {isLogoutConfirmationOpen && <LogoutConfirmationDialog isLoggingOut={isLoggingOut} onCancel={() => setIsLogoutConfirmationOpen(false)} onConfirm={() => void handleLogout()} />}
  </>
}
