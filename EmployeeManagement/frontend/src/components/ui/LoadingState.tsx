import React from 'react'
import { Loader2 } from 'lucide-react'

export interface LoadingStateProps {
  message?: string
  className?: string
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'データを読み込み中…',
  className = '',
}) => {
  return (
    <div
      className={`
        flex flex-col items-center justify-center p-12 text-center
        ${className}
      `.trim()}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-7 w-7 animate-spin text-[var(--tm-primary)]" />
      {message && (
        <p className="mt-3 text-xs font-medium text-[var(--tm-text-secondary)]">
          {message}
        </p>
      )}
    </div>
  )
}

export default LoadingState
