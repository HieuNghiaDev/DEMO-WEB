import { Skeleton } from './Skeleton'

export interface TableSkeletonProps {
  rows?: number
  columns?: number
  className?: string
  label?: string
}

export function TableSkeleton({ rows = 5, columns = 5, className = '', label = '一覧を読み込み中…' }: TableSkeletonProps) {
  const template = columns > 5
    ? 'minmax(180px, 1.8fr) repeat(4, minmax(88px, 1fr)) minmax(88px, .8fr) 42px'
    : `minmax(150px, 1.5fr) repeat(${Math.max(columns - 2, 0)}, minmax(88px, 1fr)) 42px`
  return (
    <div className={`w-full overflow-hidden rounded-[var(--tm-radius-panel)] border border-[var(--tm-border)] bg-[var(--tm-surface)] ${className}`} role="status" aria-label={label} aria-busy="true">
      <div className="grid items-center gap-4 border-b border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] p-4" style={{ gridTemplateColumns: template }}>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`th-${i}`} className="h-4 w-24 rounded" />
        ))}
      </div>
      <div className="flex flex-col">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={`tr-${rowIndex}`} className="grid min-h-[64px] items-center gap-4 border-b border-[var(--tm-border-subtle)] p-4 last:border-0" style={{ gridTemplateColumns: template }}>
            <div className="flex min-w-0 items-center gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-3.5 w-32 max-w-full" /><Skeleton className="h-3 w-20" /></div>
            </div>
            {Array.from({ length: Math.max(columns - 2, 0) }).map((_, colIndex) => (
              <Skeleton key={`td-${rowIndex}-${colIndex}`} className={colIndex === columns - 3 ? 'h-5 w-16 rounded-full' : 'h-3.5 w-20 max-w-full'} />
            ))}
            <Skeleton className="ml-auto h-8 w-8 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  )
}
