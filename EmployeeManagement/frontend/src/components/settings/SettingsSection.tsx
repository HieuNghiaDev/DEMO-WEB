import { useId, type ReactNode } from 'react'
import { ArrowLeft, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

export function SettingsSection({ title, description, icon: Icon, status, backToSecurity = false, children }: {
  title: string
  description: string
  icon: LucideIcon
  status?: ReactNode
  backToSecurity?: boolean
  children: ReactNode
}) {
  const titleId = useId()

  return (
    <section
      aria-labelledby={titleId}
      className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface)] shadow-[var(--tm-shadow-sm)]"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] px-4 py-4 sm:px-6">
        <div className="flex min-w-0 flex-1 basis-56 items-center gap-3.5">
          {backToSecurity ? (
            <Link
              to="/system?section=security"
              aria-label="セキュリティに戻る"
              title="セキュリティに戻る"
              className="grid size-10 shrink-0 place-items-center rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface)] text-[var(--tm-text-secondary)] transition-colors hover:bg-[var(--tm-surface-hover)] hover:text-[var(--tm-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tm-focus-ring)] sm:size-11"
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </Link>
          ) : (
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-[var(--tm-primary)]/20 bg-[var(--tm-primary-muted)] text-[var(--tm-primary)] sm:size-11">
              <Icon size={19} aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-bold tracking-tight text-[var(--tm-text-primary)] sm:text-lg">
              {title}
            </h2>
            <p className="mt-0.5 text-xs leading-5 text-[var(--tm-text-secondary)]">{description}</p>
          </div>
        </div>
        {status}
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </section>
  )
}
