import { useId } from 'react'

type OfficeOption<Id extends string> = {
  id: Id
  name: string
  address: string
  logo: string
}

type OfficeSwitcherProps<Id extends string> = {
  offices: readonly OfficeOption<Id>[]
  selectedOfficeId: Id
  onSelectOffice: (id: Id) => void
  summary: string
}

export default function OfficeSwitcher<Id extends string>({
  offices, selectedOfficeId, onSelectOffice, summary,
}: OfficeSwitcherProps<Id>) {
  const labelId = useId()

  return (
    <div className="@container mb-3">
      <section
        aria-labelledby={labelId}
        className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface)] p-2 sm:px-3"
      >
        <h2
          id={labelId}
          className="order-1 shrink-0 text-[11px] font-semibold text-[var(--tm-text-secondary)] sm:w-16 sm:text-[12px]"
        >
          オフィス
        </h2>

        <div
          className="order-3 grid w-full min-w-0 basis-full grid-cols-2 gap-1.5 @min-[580px]:flex @min-[580px]:flex-wrap @min-[580px]:gap-2 @min-[850px]:order-2 @min-[850px]:flex-1 @min-[850px]:basis-auto"
          role="group"
          aria-labelledby={labelId}
        >
          {offices.map((office) => {
            const isSelected = selectedOfficeId === office.id
            return (
              <button
                key={office.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelectOffice(office.id)}
                title={`${office.name}\n${office.address}`}
                className={`flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-border-focus)] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 @min-[580px]:h-12 @min-[580px]:w-[calc((100%-0.5rem)/2)] @min-[580px]:gap-2.5 @min-[580px]:px-2.5 @min-[850px]:w-[280px] ${
                  isSelected
                    ? 'border-[var(--tm-primary)]/50 bg-[var(--tm-primary-muted)]'
                    : 'border-[var(--tm-border)] bg-[var(--tm-surface)] hover:border-[var(--tm-border-strong)] hover:bg-[var(--tm-surface-hover)]'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white @min-[580px]:h-8 @min-[580px]:w-8 @min-[580px]:text-sm ${
                    office.logo === '法' ? 'bg-indigo-700' : 'bg-indigo-600'
                  }`}
                >
                  {office.logo}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-xs font-bold text-[var(--tm-text-primary)] @min-[580px]:text-sm">
                      {office.name}
                    </span>
                    {isSelected && (
                      <span className="ml-auto hidden shrink-0 rounded-full bg-[var(--tm-primary)] px-1.5 py-0.5 text-[9px] font-semibold leading-3 text-white @min-[580px]:inline">
                        表示中
                      </span>
                    )}
                    {isSelected && (
                      <span
                        className="ml-auto h-2 w-2 shrink-0 rounded-full bg-emerald-500 @min-[580px]:hidden"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <span className="mt-0.5 hidden min-w-0 items-center gap-2 @min-[580px]:flex">
                    <span className="min-w-0 flex-1 truncate text-[11px] leading-4 text-[var(--tm-text-muted)]">
                      {office.address}
                    </span>
                    {isSelected && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                    )}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <span className="order-2 ml-auto flex h-6 shrink-0 items-center px-1.5 text-[11px] font-semibold text-[var(--tm-text-muted)] @min-[580px]:h-7 @min-[580px]:px-2 @min-[850px]:order-3">
          {summary}
        </span>
      </section>
    </div>
  )
}
