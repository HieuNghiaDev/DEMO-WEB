import { LogOut } from 'lucide-react'

export default function SettingsLogoutAction({ onClick, disabled = false }: {
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="group flex h-11 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-slate-600 transition-colors duration-200 hover:bg-rose-500/[0.07] hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none dark:text-slate-400 dark:hover:text-rose-300">
      <LogOut size={18} className="shrink-0 text-slate-400 transition-colors group-hover:text-rose-600 dark:group-hover:text-rose-300" aria-hidden="true" />
      ログアウト
    </button>
  )
}
