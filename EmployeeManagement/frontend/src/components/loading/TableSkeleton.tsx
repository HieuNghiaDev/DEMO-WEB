import { Skeleton } from './Skeleton'

export interface TableSkeletonProps {
  rows?: number
  columns?: number
  className?: string
  label?: string
}

export function TableSkeleton({ rows = 5, columns = 5, className = '', label = '一覧を読み込み中…' }: TableSkeletonProps) {
  return (
    <div className={`w-full overflow-hidden rounded-[var(--tm-radius-panel)] border border-[var(--tm-border)] bg-[var(--tm-surface)] ${className}`} role="status" aria-label={label} aria-busy="true">
      <div className="flex items-center gap-4 border-b border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] p-4">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`th-${i}`} className="h-4 w-24 rounded" />
        ))}
      </div>
      <div className="flex flex-col">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={`tr-${rowIndex}`} className="flex items-center gap-4 border-b border-[var(--tm-border-subtle)] p-4 last:border-0">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton
                key={`td-${rowIndex}-${colIndex}`}
                className={`h-4 rounded ${colIndex === 0 ? 'w-32' : 'w-24'} ${colIndex === columns - 1 ? 'ml-auto w-10' : ''}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
