import { ChevronDown, RotateCcw, Search } from 'lucide-react'
import type { ReactNode } from 'react'

type Props = {
  keyword: string
  status: string
  responsiblePerson: string
  deadlineLevel: string
  statuses: string[]
  responsiblePeople: string[]
  totalCount: number
  filteredCount: number
  visibleStart: number
  visibleEnd: number
  onKeywordChange: (value: string) => void
  onStatusChange: (value: string) => void
  onResponsiblePersonChange: (value: string) => void
  onDeadlineLevelChange: (value: string) => void
  onReset: () => void
}

export default function VisaProgressFilters(props: Props) {
  const activeFilterCount = [
    props.keyword.trim() !== '',
    props.status !== 'all',
    props.responsiblePerson !== 'all',
    props.deadlineLevel !== 'all',
  ].filter(Boolean).length

  return (
    <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-4 dark:border-slate-700 dark:bg-slate-900/70 sm:px-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">申請データ</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {props.filteredCount === 0
              ? `全${props.totalCount}件中 0件`
              : props.filteredCount === props.totalCount
                ? `${props.filteredCount}件中 ${props.visibleStart}–${props.visibleEnd}件を表示`
                : `全${props.totalCount}件中 ${props.filteredCount}件 · ${props.visibleStart}–${props.visibleEnd}件を表示`}
          </p>
        </div>

        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={props.onReset}
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200/70 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <RotateCcw size={14} aria-hidden="true" />
            条件をクリア
            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] tabular-nums dark:bg-slate-700">{activeFilterCount}</span>
          </button>
        )}
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(260px,1.4fr)_minmax(150px,.7fr)_minmax(150px,.7fr)_minmax(150px,.7fr)]">
        <label className="relative md:col-span-2 xl:col-span-1">
          <span className="sr-only">申請者名・案件IDを検索</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            value={props.keyword}
            onChange={(event) => props.onKeywordChange(event.target.value)}
            className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            placeholder="申請者名・案件IDを検索"
          />
        </label>
        <FilterSelect value={props.status} onChange={props.onStatusChange} label="ステータス">
          <option value="all">すべてのステータス</option>
          {props.statuses.map((value) => <option key={value} value={value}>{value}</option>)}
        </FilterSelect>
        <FilterSelect value={props.responsiblePerson} onChange={props.onResponsiblePersonChange} label="担当者">
          <option value="all">すべての担当者</option>
          {props.responsiblePeople.map((value) => <option key={value} value={value}>{value}</option>)}
        </FilterSelect>
        <FilterSelect value={props.deadlineLevel} onChange={props.onDeadlineLevelChange} label="期限">
          <option value="all">すべての期限</option>
          <option value="attention">要対応（10日以内）</option>
          <option value="overdue">期限超過</option>
          <option value="critical">5日以内</option>
          <option value="warning">10日以内</option>
          <option value="has_deadline">期限あり</option>
          <option value="none">期限なし</option>
        </FilterSelect>
      </div>
    </div>
  )
}

function FilterSelect({ value, onChange, label, children }: { value: string; onChange: (value: string) => void; label: string; children: ReactNode }) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="h-10 w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 pr-9 text-sm font-medium text-slate-700 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      >
        {children}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
    </label>
  )
}
