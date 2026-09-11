import React, { type ReactNode } from 'react'

export type StatusBadgeVariant =
  | 'success'
  | 'warning'
  | 'info'
  | 'danger'
  | 'neutral'
  | 'ai'

export interface StatusBadgeProps {
  variant?: StatusBadgeVariant
  status?: string
  dot?: boolean
  pulse?: boolean
  size?: 'sm' | 'md'
  icon?: ReactNode
  className?: string
  children?: ReactNode
}

function resolveVariant(status?: string, fallback: StatusBadgeVariant = 'neutral'): StatusBadgeVariant {
  if (!status) return fallback
  const s = status.toLowerCase()

  // Success / Completed / Working
  if (
    s.includes('承認') ||
    s.includes('完了') ||
    s.includes('勤務中') ||
    s.includes('success') ||
    s.includes('approved') ||
    s.includes('active')
  ) {
    return 'success'
  }

  // Warning / Pending / Break / Preservation
  if (
    s.includes('申請中') ||
    s.includes('審査中') ||
    s.includes('保留') ||
    s.includes('休憩') ||
    s.includes('warning') ||
    s.includes('pending')
  ) {
    return 'warning'
  }

  // Info / In Progress / Outside
  if (
    s.includes('進行中') ||
    s.includes('対応中') ||
    s.includes('外出') ||
    s.includes('info') ||
    s.includes('in_progress') ||
    s.includes('processing')
  ) {
    return 'info'
  }

  // Danger / Rejected / Overdue / Error
  if (
    s.includes('却下') ||
    s.includes('差戻') ||
    s.includes('遅延') ||
    s.includes('danger') ||
    s.includes('rejected') ||
    s.includes('error') ||
    s.includes('overdue')
  ) {
    return 'danger'
  }

  // AI
  if (s.includes('ai') || s.includes('bot') || s.includes('auto')) {
    return 'ai'
  }

  return 'neutral'
}

const variantStyles: Record<StatusBadgeVariant, { badge: string; dot: string }> = {
  success: {
    badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25',
    dot: 'bg-emerald-500',
  },
  warning: {
    badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25',
    dot: 'bg-amber-500',
  },
  info: {
    badge: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/25',
    dot: 'bg-indigo-500',
  },
  danger: {
    badge: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/25',
    dot: 'bg-red-500',
  },
  ai: {
    badge: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/25',
    dot: 'bg-purple-500',
  },
  neutral: {
    badge: 'bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/25',
    dot: 'bg-slate-400',
  },
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  variant,
  status,
  dot = false,
  pulse = false,
  size = 'md',
  icon,
  className = '',
  children,
}) => {
  const activeVariant = variant || resolveVariant(status || (typeof children === 'string' ? children : undefined))
  const config = variantStyles[activeVariant]

  const sizeClass =
    size === 'sm'
      ? 'text-[11px] px-2 py-0.5 gap-1 rounded-md'
      : 'text-xs px-2.5 py-1 gap-1.5 rounded-md'

  return (
    <span
      className={`
        inline-flex items-center font-medium border select-none shrink-0 tracking-wide
        ${config.badge}
        ${sizeClass}
        ${className}
      `.trim()}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          {pulse && (
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${config.dot}`}
            />
          )}
          <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${config.dot}`} />
        </span>
      )}
      {icon && <span className="shrink-0 flex items-center">{icon}</span>}
      {children || status}
    </span>
  )
}

export default StatusBadge
