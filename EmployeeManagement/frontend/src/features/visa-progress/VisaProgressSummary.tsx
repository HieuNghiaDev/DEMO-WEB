import { AlertTriangle, CheckCircle2, ClipboardList, FileWarning, Search } from 'lucide-react'
import type { ReactNode } from 'react'
import { KpiSkeletonValue } from '../../components/loading'
import type { VisaProgressSummary as Summary } from './types'

type Props = {
  summary?: Summary
  loading?: boolean
}

const metrics: Array<{
  key: keyof Summary
  label: string
  cardClass: string
  iconClass?: string
  icon: ReactNode
}> = [
  {
    key: 'total',
    label: '全案件',
    cardClass: 'cm-clv-kpi-indigo',
    icon: <ClipboardList size={14} aria-hidden="true" />,
  },
  {
    key: 'in_review',
    label: '審査中',
    cardClass: 'cm-clv-kpi-blue',
    icon: <Search size={14} aria-hidden="true" />,
  },
  {
    key: 'additional_documents',
    label: '追加資料対応',
    cardClass: 'cm-clv-kpi-amber',
    icon: <FileWarning size={14} aria-hidden="true" />,
  },
  {
    key: 'attention_required',
    label: '期限注意',
    cardClass: '!border-l-rose-500',
    iconClass: '!border-rose-500/20 !bg-rose-500/10 !text-rose-500 dark:!text-rose-400',
    icon: <AlertTriangle size={14} aria-hidden="true" />,
  },
  {
    key: 'approved',
    label: '許可',
    cardClass: 'cm-clv-kpi-teal',
    icon: <CheckCircle2 size={14} aria-hidden="true" />,
  },
]

export default function VisaProgressSummary({ summary, loading = false }: Props) {
  return (
    <div
      className="mt-[10px] grid grid-cols-2 gap-[10px] sm:grid-cols-3 lg:grid-cols-5"
      role="region"
      aria-label="在留申請サマリー"
    >
      {metrics.map((metric, index) => (
        <div
          key={metric.key}
          className={`cm-clv-kpi-card ${metric.cardClass} ${index === metrics.length - 1 ? 'col-span-2 sm:col-span-1' : ''}`}
        >
          <div className={`cm-clv-kpi-icon ${metric.iconClass ?? ''}`}>{metric.icon}</div>
          <div className="cm-clv-kpi-body">
            <span className="cm-clv-kpi-label">{metric.label}</span>
            <div className="cm-clv-kpi-value-row">
              {loading ? (
                <KpiSkeletonValue />
              ) : (
                <>
                  <span className="cm-clv-kpi-num">{summary?.[metric.key] ?? 0}</span>
                  <span className="cm-clv-kpi-unit">件</span>
                </>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
