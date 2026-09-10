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
    <div className="@container mb-4 sm:mb-5">
      <section aria-labelledby={labelId} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900 sm:px-3">
        <h2 id={labelId} className="order-1 w-16 shrink-0 text-[12px] font-semibold text-slate-600 dark:text-slate-300">オフィス</h2>

        <div className="order-3 flex min-w-0 basis-full flex-wrap gap-2 @min-[850px]:order-2 @min-[850px]:flex-1 @min-[850px]:basis-auto" role="group" aria-labelledby={labelId}>
          {offices.map((office) => {
            const isSelected = selectedOfficeId === office.id
            return (
              <button key={office.id} type="button" aria-pressed={isSelected}
                onClick={() => onSelectOffice(office.id)}
                title={`${office.name}\n${office.address}`}
                className={`flex h-12 w-full min-w-0 items-center gap-2.5 rounded-lg border px-2.5 text-left transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 @min-[580px]:w-[calc((100%-0.5rem)/2)] @min-[850px]:w-[280px] ${isSelected
                  ? 'border-indigo-400/60 bg-indigo-50/70 dark:border-indigo-400/55 dark:bg-indigo-500/10'
                  : 'border-slate-200/70 bg-white hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700/40 dark:bg-slate-800/40 dark:hover:border-slate-600 dark:hover:bg-slate-800/70'}`}>
                <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white ${office.logo === '法' ? 'bg-indigo-700' : 'bg-indigo-600'}`}>{office.logo}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{office.name}</span>
                    {isSelected && <span className="ml-auto shrink-0 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[9px] font-semibold leading-3 text-white dark:bg-indigo-500">表示中</span>}
                  </span>
                  <span className="mt-0.5 flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[11px] leading-4 text-slate-500 dark:text-slate-400">{office.address}</span>
                    {isSelected && <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <span className="order-2 ml-auto flex h-7 shrink-0 items-center px-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400 @min-[850px]:order-3">{summary}</span>
      </section>
    </div>
  )
}
