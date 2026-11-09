import { useId, type ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export function SettingsSection({ title, description, status, children }: {
  title: string
  description: string
  status?: ReactNode
  children: ReactNode
}) {
  const titleId = useId()

  return (
    <section aria-labelledby={titleId} className="min-w-0 rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface)]">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-[var(--tm-border)] px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight text-[var(--tm-text-primary)]">{title}</h2>
          <p className="mt-1 text-sm leading-5 text-[var(--tm-text-secondary)]">{description}</p>
        </div>
        {status}
      </header>
      {children}
    </section>
  )
}

export function SettingsSecurityBackLink() {
  return (
    <Link to="/system?section=security" className="mb-2 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium text-[var(--tm-text-secondary)] transition-colors hover:bg-[var(--tm-surface-hover)] hover:text-[var(--tm-text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--tm-focus-ring)]">
      <ArrowLeft size={16} aria-hidden="true" />
      セキュリティに戻る
    </Link>
  )
}
