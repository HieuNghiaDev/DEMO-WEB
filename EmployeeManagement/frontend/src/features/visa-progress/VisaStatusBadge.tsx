import { getVisaStatusTone } from './visaProgressUi'

const toneClasses = {
  info: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-300',
  warning: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-300',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300',
  danger: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-300',
  neutral: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300',
}

export default function VisaStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-slate-400 dark:text-slate-500">—</span>

  const tone = getVisaStatusTone(status)

  return (
    <span className={`inline-flex max-w-40 items-center gap-1.5 truncate rounded-md border px-2 py-1 text-xs font-medium ${toneClasses[tone]}`} title={status}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      <span className="truncate">{status}</span>
    </span>
  )
}
