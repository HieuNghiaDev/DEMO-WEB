import { Skeleton } from './Skeleton'

type MobileCardSkeletonProps = {
  rows?: number
  className?: string
  label?: string
}

/** A compact list-card placeholder for narrow operational screens. */
export function MobileCardSkeleton({ rows = 4, className = '', label = '一覧を読み込み中…' }: MobileCardSkeletonProps) {
  return (
    <div className={`space-y-3 ${className}`.trim()} role="status" aria-label={label} aria-busy="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="rounded-[var(--tm-radius-panel)] border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-36 max-w-[64%]" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--tm-border-subtle)] pt-3">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}
