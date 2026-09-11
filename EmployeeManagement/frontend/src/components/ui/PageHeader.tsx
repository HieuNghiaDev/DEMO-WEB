import React, { type ReactNode } from 'react'

export interface BreadcrumbItem {
  label: string
  href?: string
}

export interface PageHeaderProps {
  breadcrumb?: string | BreadcrumbItem[]
  domainKicker?: string
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  illustrationSrc?: string
  metricStrip?: ReactNode
  variant?: 'default' | 'hero'
  className?: string
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  breadcrumb,
  domainKicker,
  title,
  description,
  actions,
  illustrationSrc,
  metricStrip,
  variant = 'default',
  className = '',
}) => {
  const isHero = variant === 'hero'

  const breadcrumbsList: BreadcrumbItem[] = Array.isArray(breadcrumb)
    ? breadcrumb
    : breadcrumb
      ? [{ label: 'ホーム' }, { label: breadcrumb }]
      : []

  if (isHero) {
    return (
      <header
        className={`relative overflow-hidden border-b border-slate-800 bg-gradient-to-r from-[#0d1424] via-[#152037] to-[#101728] px-4 py-6 text-white sm:px-6 lg:px-8 ${className}`.trim()}
      >
        <div className="mx-auto flex max-w-[1600px] flex-col justify-between gap-5 md:flex-row md:items-center">
          <div className="z-10 max-w-xl min-w-0">
            {breadcrumbsList.length > 0 && (
              <nav className="mb-2 flex items-center gap-1.5 text-xs text-slate-300/85" aria-label="パンくず">
                {breadcrumbsList.map((item, index) => (
                  <React.Fragment key={index}>
                    {index > 0 && <span className="text-slate-500">/</span>}
                    {item.href ? (
                      <a href={item.href} className="cursor-pointer transition hover:text-white">
                        {item.label}
                      </a>
                    ) : (
                      <span className={index === breadcrumbsList.length - 1 ? 'font-medium text-white' : 'text-slate-300/85'}>
                        {item.label}
                      </span>
                    )}
                  </React.Fragment>
                ))}
              </nav>
            )}

            {domainKicker && (
              <span className="mb-1.5 inline-block text-[11px] font-semibold tracking-wider text-indigo-400 uppercase">
                {domainKicker}
              </span>
            )}

            <h1 className="m-0 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {title}
            </h1>

            {description && (
              <p className="mt-1.5 text-xs text-slate-300 sm:text-sm">
                {description}
              </p>
            )}
          </div>

          {illustrationSrc && (
            <div className="pointer-events-none absolute bottom-0 right-[220px] hidden select-none items-end justify-end lg:flex xl:right-[260px]">
              <img
                src={illustrationSrc}
                alt=""
                aria-hidden="true"
                className="h-[135px] w-auto select-none object-contain opacity-95"
              />
            </div>
          )}

          {actions && (
            <div className="z-10 flex w-full shrink-0 items-center justify-end gap-2.5 sm:w-auto">
              {actions}
            </div>
          )}
        </div>

        {metricStrip && (
          <div className="mx-auto mt-6 max-w-[1600px]">
            {metricStrip}
          </div>
        )}
      </header>
    )
  }

  return (
    <header
      className={`border-b border-[var(--tm-border)] bg-[var(--tm-surface)] px-4 py-5 sm:px-6 lg:px-8 transition-colors ${className}`.trim()}
    >
      <div className="mx-auto flex max-w-[1600px] flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          {breadcrumbsList.length > 0 && (
            <nav className="mb-1.5 flex items-center gap-1.5 text-xs text-[var(--tm-text-muted)]" aria-label="パンくず">
              {breadcrumbsList.map((item, index) => (
                <React.Fragment key={index}>
                  {index > 0 && <span className="text-[var(--tm-text-dim)]">/</span>}
                  {item.href ? (
                    <a href={item.href} className="hover:text-[var(--tm-text-primary)] transition-colors">
                      {item.label}
                    </a>
                  ) : (
                    <span className={index === breadcrumbsList.length - 1 ? 'font-medium text-[var(--tm-text-primary)]' : ''}>
                      {item.label}
                    </span>
                  )}
                </React.Fragment>
              ))}
            </nav>
          )}

          {domainKicker && (
            <div className="mb-1 text-[11px] font-semibold tracking-wider text-[var(--tm-primary)] uppercase">
              {domainKicker}
            </div>
          )}

          <h1 className="text-xl font-bold tracking-tight text-[var(--tm-text-primary)] sm:text-2xl">
            {title}
          </h1>

          {description && (
            <p className="mt-1 text-xs text-[var(--tm-text-secondary)] sm:text-sm">
              {description}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex shrink-0 items-center gap-2.5">
            {actions}
          </div>
        )}
      </div>

      {metricStrip && (
        <div className="mx-auto mt-5 max-w-[1600px]">
          {metricStrip}
        </div>
      )}
    </header>
  )
}

export default PageHeader
