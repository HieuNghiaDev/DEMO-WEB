export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-md bg-slate-200/70 dark:bg-slate-700/50 ${className ?? ''}`.trim()}
      {...props}
    />
  )
}
