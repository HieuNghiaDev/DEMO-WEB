import React, { type ReactNode } from 'react'

export type MetricStatus = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

export interface MetricCardProps {
  label: string
  value: string | number
  subtext?: ReactNode
  icon?: ReactNode
  status?: MetricStatus
  active?: boolean
  onClick?: () => void
  className?: string
}

const statusIconClasses: Record<MetricStatus, string> = {
  neutral: 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400',
  success: 'border-emerald-100 bg-emerald-50 text-emerald-600 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400',
  warning: 'border-amber-100 bg-amber-50 text-amber-600 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400',
  danger: 'border-red-100 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400',
  info: 'border-indigo-100 bg-indigo-50 text-indigo-600 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-400',
}

const activeClasses: Record<MetricStatus, string> = {
  neutral: 'border-slate-400 ring-1 ring-inset ring-slate-500/20 dark:border-slate-600',
  success: 'border-emerald-500 ring-1 ring-inset ring-emerald-500/30 dark:border-emerald-500/60',
  warning: 'border-amber-500 ring-1 ring-inset ring-amber-500/30 dark:border-amber-500/60',
  danger: 'border-red-500 ring-1 ring-inset ring-red-500/30 dark:border-red-500/60',
  info: 'border-indigo-500 ring-1 ring-inset ring-indigo-500/30 dark:border-indigo-500/60',
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  subtext,
  icon,
  status = 'neutral',
  active = false,
  onClick,
  className = '',
}) => {
  const isClickable = typeof onClick === 'function'
  const Component = isClickable ? 'button' : 'div'

  return (
    <Component
      type={isClickable ? 'button' : undefined}
      onClick={onClick}
      className={`
        flex min-h-[78px] items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors duration-150
        bg-[var(--tm-surface)]
        ${
          active
            ? `${activeClasses[status]} bg-[var(--tm-surface-elevated)]`
            : 'border-[var(--tm-border)] hover:border-[var(--tm-border-strong)] hover:bg-[var(--tm-surface-elevated)]/70'
        }
        ${isClickable ? 'cursor-pointer select-none' : ''}
        ${className}
      `.trim()}
    >
      {icon && (
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-sm ${statusIconClasses[status]}`}>
          {icon}
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <span className="mb-0.5 truncate text-[11px] font-semibold text-[var(--tm-text-secondary)]">
          {label}
        </span>
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-semibold leading-none tracking-tight tabular-nums text-[var(--tm-text-primary)]">
            {value}
          </span>
          {subtext && (
            <span className="truncate text-[11px] font-medium text-[var(--tm-text-muted)]">
              {subtext}
            </span>
          )}
        </div>
      </div>
    </Component>
  )
}

export default MetricCard
