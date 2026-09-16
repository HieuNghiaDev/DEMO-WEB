export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={`themis-skeleton rounded-md ${className ?? ''}`.trim()}
      aria-hidden="true"
      {...props}
    />
  )
}
