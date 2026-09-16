import { Skeleton } from './Skeleton'

export interface SectionSkeletonProps {
  rows?: number
  className?: string
  label?: string
  showHeader?: boolean
}

export function SectionSkeleton({ rows = 4, className = '', label = 'データを読み込み中…', showHeader = true }: SectionSkeletonProps) {
  return (
    <section
      className={`rounded-[var(--tm-radius-panel)] border border-[var(--tm-border)] bg-[var(--tm-surface)] p-5 ${className}`.trim()}
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      {showHeader && (
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-44 max-w-[55vw]" />
          </div>
          <Skeleton className="h-9 w-24" />
        </div>
      )}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex min-h-12 items-center gap-3 border-t border-[var(--tm-border-subtle)] pt-3 first:border-0 first:pt-0">
            <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-[min(16rem,70%)]" />
              <Skeleton className="h-3 w-[min(11rem,52%)]" />
            </div>
            <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </section>
  )
}
