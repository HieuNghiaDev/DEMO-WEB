import { Skeleton } from './Skeleton'

type KpiSkeletonValueProps = {
  className?: string
}

/** Keeps metric card geometry stable while API-backed values are unavailable. */
export function KpiSkeletonValue({ className = '' }: KpiSkeletonValueProps) {
  return <Skeleton className={`h-7 w-12 rounded-sm ${className}`.trim()} />
}
