import { ButtonSpinner } from '../loading/ButtonSpinner'

export interface LoadingStateProps {
  message?: string
  className?: string
  variant?: 'page' | 'section' | 'compact'
}

const variantClasses = {
  page: 'min-h-[22rem] p-12',
  section: 'min-h-48 p-8',
  compact: 'min-h-40 p-6',
} as const

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'データを読み込み中…',
  className = '',
  variant = 'section',
}) => {
  return (
    <div
      className={`
        flex flex-col items-center justify-center text-center
        ${variantClasses[variant]}
        ${className}
      `.trim()}
      role="status"
      aria-live="polite"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] text-[var(--tm-primary)] shadow-sm">
        <ButtonSpinner className="h-5 w-5" size={20} />
      </span>
      {message && (
        <p className="mt-3 text-xs font-semibold text-[var(--tm-text-secondary)]">
          {message}
        </p>
      )}
      <span className="mt-3 block h-1 w-24 overflow-hidden rounded-full bg-[var(--tm-surface-hover)]" aria-hidden="true">
        <span className="block h-full w-1/2 rounded-full bg-[var(--tm-primary)] [animation:themis-loading-progress_1.2s_ease-in-out_infinite] motion-reduce:animate-none" />
      </span>
    </div>
  )
}

export default LoadingState
