import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import ThemeToggle from './ThemeToggle'
import './SidebarUtilityPanel.css'

export default function SidebarUtilityPanel() {
  const { t } = useTranslation()

  return (
    <div className="sidebar-utility-panel my-3 flex w-full shrink-0 items-center gap-2">
      <button
        type="button"
        disabled
        title={t('sidebar.currentWorkspaceTitle')}
        className="sidebar-workspace-pill group flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 text-xs font-bold text-slate-800 transition-all hover:border-indigo-300 dark:text-slate-100"
      >
        <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-xs shadow-emerald-500/50" />
        </span>
        <span className="truncate">{t('sidebar.currentWorkspace')}</span>
        <ChevronDown size={14} className="ml-auto shrink-0 text-slate-400 group-hover:text-indigo-600 transition-colors dark:text-slate-400 dark:group-hover:text-indigo-400" aria-hidden="true" />
      </button>
      <ThemeToggle />
    </div>
  )
}
