import { Skeleton } from './Skeleton'

export interface TableSkeletonProps {
  rows?: number
  columns?: number
  className?: string
}

export function TableSkeleton({ rows = 5, columns = 5, className = '' }: TableSkeletonProps) {
  return (
    <div className={`w-full overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      <div className="flex items-center gap-4 border-b border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800/80 dark:bg-slate-800/20">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`th-${i}`} className="h-4 w-24 rounded" />
        ))}
      </div>
      <div className="flex flex-col">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={`tr-${rowIndex}`} className="flex items-center gap-4 border-b border-slate-50 p-4 last:border-0 dark:border-slate-800/40">
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
