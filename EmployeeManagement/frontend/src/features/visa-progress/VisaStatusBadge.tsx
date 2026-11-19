import { getVisaStatusTone } from './visaProgressUi'

const toneClasses = {
  info: {
    badge: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/25 dark:bg-sky-500/12 dark:text-sky-300',
    dot: 'bg-sky-500 dark:bg-sky-400',
  },
  warning: {
    badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-500/12 dark:text-amber-300',
    dot: 'bg-amber-500 dark:bg-amber-400',
  },
  success: {
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/12 dark:text-emerald-300',
    dot: 'bg-emerald-500 dark:bg-emerald-400',
  },
  danger: {
    badge: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/25 dark:bg-rose-500/12 dark:text-rose-300',
    dot: 'bg-rose-500 dark:bg-rose-400',
  },
  neutral: {
    badge: 'border-[var(--tm-border)] bg-[var(--tm-surface-hover)] text-[var(--tm-text-secondary)]',
    dot: 'bg-slate-400 dark:bg-slate-500',
  },
}

export default function VisaStatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return <span className="text-xs text-[var(--tm-text-dim)]">—</span>
  }

  const tone = toneClasses[getVisaStatusTone(status)]

  return (
    <span
      className={`cm-cc-status max-w-44 ${tone.badge}`}
      title={status}
    >
      <span className={`cm-cc-dot ${tone.dot}`} aria-hidden="true" />
      <span className="truncate">{status}</span>
    </span>
  )
}
