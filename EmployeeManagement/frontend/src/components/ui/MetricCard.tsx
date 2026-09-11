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

const statusIndicatorColors: Record<MetricStatus, string> = {
  neutral: 'bg-slate-400',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-indigo-500',
}

const statusValueColors: Record<MetricStatus, string> = {
  neutral: 'text-[var(--tm-text-primary)]',
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-red-600 dark:text-red-400',
  info: 'text-indigo-600 dark:text-indigo-400',
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
        relative flex flex-col p-4 rounded-xl text-left transition-all duration-150
        border bg-[var(--tm-surface)]
        ${
          active
            ? 'border-[var(--tm-primary)] ring-2 ring-[var(--tm-focus-ring)]/25 bg-[var(--tm-surface-elevated)]'
            : 'border-[var(--tm-border)] hover:border-[var(--tm-border-strong)]'
        }
        ${isClickable ? 'cursor-pointer active:scale-[0.99] select-none' : ''}
        ${className}
      `.trim()}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`h-2 w-2 rounded-full shrink-0 ${statusIndicatorColors[status]}`}
            aria-hidden="true"
          />
          <span className="text-xs font-medium text-[var(--tm-text-secondary)] truncate">
            {label}
          </span>
        </div>
        {icon && (
          <div className="text-[var(--tm-text-muted)] shrink-0 flex items-center">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className={`text-2xl font-semibold tracking-tight ${statusValueColors[status]}`}>
          {value}
        </span>
        {subtext && (
          <span className="text-xs text-[var(--tm-text-muted)] truncate">
            {subtext}
          </span>
        )}
      </div>
    </Component>
  )
}

export default MetricCard
