import React, { type ReactNode } from 'react'

export interface SectionHeaderProps {
  title: ReactNode
  description?: ReactNode
  badge?: ReactNode
  action?: ReactNode
  icon?: ReactNode
  className?: string
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  description,
  badge,
  action,
  icon,
  className = '',
}) => {
  return (
    <div
      className={`
        flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between
        border-b border-[var(--tm-border)] pb-3 mb-4
        ${className}
      `.trim()}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {icon && <span className="text-[var(--tm-text-secondary)] shrink-0">{icon}</span>}
          <h2 className="text-base font-semibold text-[var(--tm-text-primary)] tracking-tight">
            {title}
          </h2>
          {badge && <div className="shrink-0">{badge}</div>}
        </div>
        {description && (
          <p className="mt-0.5 text-xs text-[var(--tm-text-secondary)]">
            {description}
          </p>
        )}
      </div>

      {action && (
        <div className="flex shrink-0 items-center gap-2">
          {action}
        </div>
      )}
    </div>
  )
}

export default SectionHeader
