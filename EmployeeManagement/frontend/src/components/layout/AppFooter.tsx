import { appBuildLabel, appReleaseName } from '../../config/app'

type AppFooterProps = {
  onOpenReleaseNotes: () => void
}

export default function AppFooter({ onOpenReleaseNotes }: AppFooterProps) {
  return (
    // Leave the existing floating assistant's corner clear without moving it.
    <footer className="flex min-h-12 shrink-0 flex-col items-center justify-center gap-2 border-t border-slate-200/70 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 text-center text-[10px] leading-4 text-slate-500 dark:border-tm-border-subtle dark:text-[var(--tm-text-muted)] sm:flex-row sm:flex-wrap sm:justify-between sm:gap-x-6 sm:gap-y-1 sm:py-3 sm:pl-6 sm:pr-24 sm:text-left sm:text-[11px] sm:leading-5 xl:pl-8">
      <p className="flex flex-col items-center sm:flex-row">
        <span className="text-[12px] font-semibold text-slate-600 dark:text-[var(--tm-text-secondary)] sm:text-[11px]">THEMIS HQ</span>
        <span className="hidden sm:mx-2 sm:inline" aria-hidden="true">·</span>
        <span>Internal System</span>
      </p>
      <div className="flex flex-col items-center gap-1 sm:flex-row sm:items-center sm:justify-end sm:gap-2">
        <div className="flex flex-col items-center sm:items-end">
          <button
            type="button"
            className="rounded-sm font-medium text-slate-600 transition-colors hover:text-[var(--tm-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-focus-ring)] dark:text-[var(--tm-text-secondary)] dark:hover:text-[var(--tm-primary)]"
            onClick={onOpenReleaseNotes}
          >
            {appReleaseName}
          </button>
          <span>{appBuildLabel}</span>
        </div>
        <span className="sm:order-first">社内専用</span>
        <span className="hidden sm:inline" aria-hidden="true">·</span>
      </div>
    </footer>
  )
}
