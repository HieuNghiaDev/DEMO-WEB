import { InlineLoader } from './InlineLoader'

export interface LoadingOverlayProps {
  isVisible: boolean
  label?: string
  className?: string
}

export function LoadingOverlay({ isVisible, label = '更新しています…', className = '' }: LoadingOverlayProps) {
  if (!isVisible) return null

  return (
    <div
      className={`themis-loading-overlay absolute inset-0 z-20 flex items-center justify-center ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <span className="rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface)]/95 px-4 py-3 shadow-[var(--tm-shadow-md)]">
        <InlineLoader label={label} />
      </span>
    </div>
  )
}
