import React, { type ReactNode } from 'react'

export interface MetricStripProps {
  children: ReactNode
  columns?: 2 | 3 | 4 | 5
  title?: ReactNode
  description?: ReactNode
  hint?: ReactNode
  className?: string
}

const columnClasses: Record<number, string> = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
  4: 'grid-cols-2 md:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
}

export const MetricStrip: React.FC<MetricStripProps> = ({
  children,
  columns = 4,
  title,
  description,
  hint,
  className = '',
}) => {
  const grid = (
    <div className={`grid gap-2 sm:gap-3 ${columnClasses[columns] || columnClasses[4]}`}>
      {children}
    </div>
  )

  if (!title && !description && !hint) {
    return <div className={className}>{grid}</div>
  }

  return (
    <section
      className={`rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] p-3 sm:p-4 ${className}`.trim()}
    >
      <header className="mb-3 flex items-end justify-between gap-3 px-0.5">
        <div className="min-w-0">
          {title && <h2 className="text-xs font-semibold text-[var(--tm-text-primary)]">{title}</h2>}
          {description && <p className="mt-0.5 text-[11px] text-[var(--tm-text-secondary)]">{description}</p>}
        </div>
        {hint && <span className="hidden shrink-0 text-[11px] font-medium text-[var(--tm-text-secondary)] sm:inline">{hint}</span>}
      </header>
      {grid}
    </section>
  )
}

export default MetricStrip
