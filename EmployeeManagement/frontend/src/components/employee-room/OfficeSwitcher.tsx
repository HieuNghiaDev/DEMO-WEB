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
    <div className="@container mb-3 sm:mb-4">
      <section aria-labelledby={labelId} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700/60 dark:bg-slate-900 sm:p-4">
        <h2 id={labelId} className="order-1 w-20 shrink-0 text-[13px] font-semibold text-slate-700 dark:text-slate-200">オフィス</h2>

        <div className="order-3 flex min-w-0 basis-full flex-wrap gap-3 @min-[850px]:order-2 @min-[850px]:flex-1 @min-[850px]:basis-auto" role="group" aria-labelledby={labelId}>
          {offices.map((office) => {
            const isSelected = selectedOfficeId === office.id
            return (
              <button key={office.id} type="button" aria-pressed={isSelected}
                onClick={() => onSelectOffice(office.id)}
                title={`${office.name}\n${office.address}`}
                className={`flex h-15 w-full min-w-0 items-center gap-3 rounded-xl border px-3 text-left transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 @min-[580px]:w-[calc((100%-0.75rem)/2)] @min-[850px]:w-[280px] ${isSelected
                  ? 'border-indigo-400/60 bg-indigo-50/70 dark:border-indigo-400/55 dark:bg-indigo-500/10'
                  : 'border-slate-200/70 bg-white hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700/40 dark:bg-slate-800/40 dark:hover:border-slate-600 dark:hover:bg-slate-800/70'}`}>
                <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-sm font-bold text-white ${office.logo === '法' ? 'bg-indigo-700' : 'bg-indigo-600'}`}>{office.logo}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{office.name}</span>
                    {isSelected && <span className="ml-auto shrink-0 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[9px] font-semibold leading-3 text-white dark:bg-indigo-500">表示中</span>}
                  </span>
                  <span className="mt-1 flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[11px] leading-4 text-slate-500 dark:text-slate-400">{office.address}</span>
                    {isSelected && <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <span className="order-2 ml-auto flex h-7 shrink-0 items-center rounded-full bg-slate-100 px-3 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400 @min-[850px]:order-3">{summary}</span>
      </section>
    </div>
  )
}
