import { AlertTriangle, CheckCircle2, ClipboardList, FileWarning, Search } from 'lucide-react'
import type { ReactNode } from 'react'
import type { VisaProgressSummary as Summary } from './types'

type Props = {
  summary: Summary
}

const metrics: Array<{ key: keyof Summary; label: string; tone: string; iconTone: string; icon: ReactNode }> = [
  { key: 'total', label: '全案件', tone: 'bg-slate-400', iconTone: 'bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300', icon: <ClipboardList size={18} /> },
  { key: 'in_review', label: '審査中', tone: 'bg-sky-500', iconTone: 'bg-sky-50 text-sky-600 dark:bg-sky-400/10 dark:text-sky-300', icon: <Search size={18} /> },
  { key: 'additional_documents', label: '追加資料対応', tone: 'bg-amber-500', iconTone: 'bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300', icon: <FileWarning size={18} /> },
  { key: 'attention_required', label: '期限注意', tone: 'bg-rose-500', iconTone: 'bg-rose-50 text-rose-600 dark:bg-rose-400/10 dark:text-rose-300', icon: <AlertTriangle size={18} /> },
  { key: 'approved', label: '許可', tone: 'bg-emerald-500', iconTone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300', icon: <CheckCircle2 size={18} /> },
]

export default function VisaProgressSummary({ summary }: Props) {
  return (
    <section className="border-t border-slate-200 bg-slate-50/55 dark:border-slate-700 dark:bg-slate-950/25" aria-labelledby="visa-summary-heading">
      <h2 id="visa-summary-heading" className="sr-only">運用サマリー</h2>
      <div className="grid grid-cols-2 sm:grid-cols-5">
        {metrics.map((metric, index) => (
          <div
            key={metric.key}
            className={`relative px-4 py-3.5 sm:px-5 ${index === metrics.length - 1 ? 'col-span-2 sm:col-span-1' : `${index % 2 === 0 ? 'border-r' : ''} border-b border-slate-100 dark:border-slate-800 sm:border-b-0 sm:border-r`}`}
          >
            <span className={`absolute inset-x-0 top-0 h-0.5 ${metric.tone}`} aria-hidden="true" />
            <div className="flex items-center gap-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${metric.iconTone}`} aria-hidden="true">{metric.icon}</span>
              <div className="min-w-0"><p className="text-2xl font-semibold tracking-tight tabular-nums text-slate-950 dark:text-slate-100">{summary[metric.key]}</p><p className="mt-0.5 truncate text-xs font-medium text-slate-500 dark:text-slate-400">{metric.label}</p></div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
