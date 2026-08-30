import { appMetadata } from '../../config/app'

export default function AppFooter() {
  return (
    // Leave the existing floating assistant's corner clear without moving it.
    <footer className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-slate-200/70 py-3 pl-4 pr-24 text-[11px] leading-5 text-slate-500 dark:border-slate-800 dark:text-slate-400 md:pl-6 xl:pl-8">
      <p><span className="font-medium">THEMIS HQ</span><span className="mx-2" aria-hidden="true">·</span>Internal System</p>
      <p className="flex flex-wrap items-center gap-x-2">
        <span>社内専用</span><span aria-hidden="true">·</span>
        <span className="text-slate-600 dark:text-slate-300">{appMetadata.environmentLabel ? `${appMetadata.environmentLabel} ` : ''}v{appMetadata.version}</span>
      </p>
    </footer>
  )
}
