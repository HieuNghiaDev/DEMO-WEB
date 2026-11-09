import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
type SensitiveValueProps = {
  value: string
  label: string
  mask: (value: string) => string
}

export default function SensitiveValue({ value, label, mask }: SensitiveValueProps) {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <span className="flex min-w-0 items-center justify-between gap-3">
      <span className="min-w-0 break-all font-medium text-[var(--tm-text-primary)]">
        {isVisible ? value : mask(value)}
      </span>
      <button
        type="button"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent text-[var(--tm-text-muted)] transition-colors duration-150 hover:border-[var(--tm-border)] hover:bg-[var(--tm-surface-hover)] hover:text-[var(--tm-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-focus-ring)]"
        aria-label={`${label}を${isVisible ? '隠す' : '表示'}`}
        aria-pressed={isVisible}
        onClick={() => setIsVisible((current) => !current)}
      >
        {isVisible ? <Eye size={17} aria-hidden="true" /> : <EyeOff size={17} aria-hidden="true" />}
      </button>
    </span>
  )
}
