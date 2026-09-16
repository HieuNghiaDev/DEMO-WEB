import { ThemisLoadingMark } from './ThemisLoadingMark'

export interface InlineLoaderProps {
  label?: string
  className?: string
  ai?: boolean
}

export function InlineLoader({ label = '読み込み中…', className = '', ai = false }: InlineLoaderProps) {
  if (ai) {
    return (
      <span className={`themis-ai-thinking ${className}`.trim()} role="status" aria-label={label}>
        <span aria-hidden="true"><i /><i /><i /></span>
        <span>{label}</span>
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center gap-2 text-xs font-medium text-[var(--tm-text-secondary)] ${className}`.trim()} role="status">
      <ThemisLoadingMark size="sm" />
      <span>{label}</span>
    </span>
  )
}
