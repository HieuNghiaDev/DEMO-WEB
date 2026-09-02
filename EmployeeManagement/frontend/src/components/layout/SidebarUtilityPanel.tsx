import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import ThemeToggle from './ThemeToggle'
import './SidebarUtilityPanel.css'

export default function SidebarUtilityPanel() {
  const { t } = useTranslation()

  return (
    <div className="sidebar-utility-panel my-4 flex w-full shrink-0 items-center gap-2">
      <button type="button" disabled title={t('sidebar.currentWorkspaceTitle')}
        className="sidebar-workspace-pill flex h-[38px] min-w-0 flex-1 items-center gap-2 rounded-xl border px-3 text-[12px] font-medium text-slate-600 dark:text-slate-300">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
        <span className="truncate">{t('sidebar.currentWorkspace')}</span>
        <ChevronDown size={14} className="ml-auto shrink-0 text-slate-400" aria-hidden="true" />
      </button>
      <ThemeToggle />
    </div>
  )
}
