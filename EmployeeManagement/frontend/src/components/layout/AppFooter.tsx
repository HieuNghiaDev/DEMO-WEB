import { appBuildLabel, appReleaseName } from '../../config/app'

export default function AppFooter() {
  return (
    // Leave the existing floating assistant's corner clear without moving it.
    <footer className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-slate-200/70 py-3 pl-4 pr-24 text-[11px] leading-5 text-slate-500 dark:border-tm-border-subtle dark:text-[var(--tm-text-muted)] md:pl-6 xl:pl-8">
      <p><span className="font-medium">THEMIS HQ</span><span className="mx-2" aria-hidden="true">·</span>Internal System</p>
      <p className="flex flex-wrap items-center justify-end gap-x-2">
        <span>社内専用</span><span aria-hidden="true">·</span>
        <span className="flex flex-col text-right">
          <span className="font-medium text-slate-600 dark:text-[var(--tm-text-secondary)]">THEMIS {appReleaseName}</span>
          <span>{appBuildLabel}</span>
        </span>
      </p>
    </footer>
  )
}
