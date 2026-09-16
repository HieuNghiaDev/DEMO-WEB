export interface ThemisLoadingMarkProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeClasses = {
  sm: 'h-7 w-7',
  md: 'h-10 w-10',
  lg: 'h-14 w-14',
} as const

export function ThemisLoadingMark({ size = 'md', className = '' }: ThemisLoadingMarkProps) {
  return (
    <span className={`themis-loading-mark ${sizeClasses[size]} ${className}`.trim()} aria-hidden="true">
      <span className="themis-loading-mark__frame" />
      <span className="themis-loading-mark__scan" />
      <span className="themis-loading-mark__core" />
    </span>
  )
}
