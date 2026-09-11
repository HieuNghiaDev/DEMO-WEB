import React, { type ReactNode } from 'react'
import { Inbox } from 'lucide-react'

export interface EmptyStateProps {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  action,
  className = '',
}) => {
  return (
    <div
      className={`
        flex flex-col items-center justify-center p-8 sm:p-12 text-center
        rounded-xl border border-dashed border-[var(--tm-border-strong)]
        bg-[var(--tm-surface-elevated)]/50
        ${className}
      `.trim()}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--tm-surface)] border border-[var(--tm-border)] text-[var(--tm-text-muted)] shadow-2xs mb-3">
        {icon || <Inbox className="h-6 w-6" />}
      </div>

      <h3 className="text-sm font-semibold text-[var(--tm-text-primary)]">
        {title}
      </h3>

      {description && (
        <p className="mt-1 max-w-sm text-xs text-[var(--tm-text-secondary)]">
          {description}
        </p>
      )}

      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export default EmptyState
