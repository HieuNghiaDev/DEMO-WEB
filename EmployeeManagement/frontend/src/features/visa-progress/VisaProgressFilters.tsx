import { Check, ChevronDown, RotateCcw, Search } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

type Props = {
  keyword: string
  selectedStatuses: string[]
  responsiblePerson: string
  deadlineLevel: string
  statuses: string[]
  responsiblePeople: string[]
  totalCount: number
  filteredCount: number
  visibleStart: number
  visibleEnd: number
  onKeywordChange: (value: string) => void
  onStatusesChange: (values: string[]) => void
  onResponsiblePersonChange: (value: string) => void
  onDeadlineLevelChange: (value: string) => void
  onReset: () => void
}

export default function VisaProgressFilters(props: Props) {
  const activeFilterCount = [
    props.keyword.trim() !== '',
    props.selectedStatuses.length > 0,
    props.responsiblePerson !== 'all',
    props.deadlineLevel !== 'all',
  ].filter(Boolean).length

  return (
    <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3.5 dark:border-slate-700 dark:bg-slate-900/70 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">申請データ一覧</h2>
          <span className="rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
            {props.filteredCount === 0
              ? `0 / ${props.totalCount}件`
              : props.filteredCount === props.totalCount
                ? `${props.filteredCount}件`
                : `${props.filteredCount} / ${props.totalCount}件`}
          </span>
          {props.filteredCount !== props.totalCount && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              （{props.visibleStart}–{props.visibleEnd}件を表示）
            </span>
          )}
        </div>

        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={props.onReset}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200/70 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <RotateCcw size={13} aria-hidden="true" />
            条件をクリア
            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] tabular-nums dark:bg-slate-700">{activeFilterCount}</span>
          </button>
        )}
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(260px,1.4fr)_minmax(150px,.7fr)_minmax(150px,.7fr)_minmax(150px,.7fr)]">
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
        <StatusMultiSelect
          selectedStatuses={props.selectedStatuses}
          statuses={props.statuses}
          onChange={props.onStatusesChange}
        />
        <FilterSelect value={props.responsiblePerson} onChange={props.onResponsiblePersonChange} label="担当者">
          <option value="all">すべての担当者</option>
          {props.responsiblePeople.map((value) => <option key={value} value={value}>{value}</option>)}
        </FilterSelect>
        <FilterSelect value={props.deadlineLevel} onChange={props.onDeadlineLevelChange} label="期限">
          <option value="all">すべての期限</option>
          <option value="attention">要対応（30日以内）</option>
          <option value="overdue">期限超過</option>
          <option value="critical">5日以内</option>
          <option value="warning">6〜10日</option>
          <option value="notice">11〜15日</option>
          <option value="upcoming">16〜30日</option>
          <option value="has_deadline">期限あり</option>
          <option value="none">期限なし</option>
        </FilterSelect>
      </div>
    </div>
  )
}

function StatusMultiSelect({ selectedStatuses, statuses, onChange }: { selectedStatuses: string[]; statuses: string[]; onChange: (values: string[]) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const closeOnOutsidePointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setIsOpen(false)
    }

    document.addEventListener('mousedown', closeOnOutsidePointer)

    return () => document.removeEventListener('mousedown', closeOnOutsidePointer)
  }, [])

  const toggleStatus = (status: string) => {
    onChange(selectedStatuses.includes(status)
      ? selectedStatuses.filter((value) => value !== status)
      : [...selectedStatuses, status])
  }
  const label = selectedStatuses.length === 0
    ? 'すべてのステータス'
    : selectedStatuses.length === 1
      ? selectedStatuses[0]
      : `${selectedStatuses.length}件のステータスを選択`

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={() => setIsOpen((open) => !open)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 text-left text-sm font-medium text-slate-700 outline-none transition-colors hover:border-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600"
      >
        <span className="truncate">{label}</span>
        <ChevronDown size={15} className={`shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {isOpen && (
        <div role="listbox" aria-label="ステータスを複数選択" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => onChange([])}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <span className={`flex h-4 w-4 items-center justify-center rounded border ${selectedStatuses.length === 0 ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
              {selectedStatuses.length === 0 && <Check size={12} strokeWidth={3} aria-hidden="true" />}
            </span>
            すべてのステータス
          </button>
          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
          {statuses.map((status) => {
            const isSelected = selectedStatuses.includes(status)

            return (
              <label key={status} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800">
                <input type="checkbox" checked={isSelected} onChange={() => toggleStatus(status)} className="sr-only" />
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${isSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                  {isSelected && <Check size={12} strokeWidth={3} aria-hidden="true" />}
                </span>
                <span className="min-w-0 truncate">{status}</span>
              </label>
            )
          })}
        </div>
      )}
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
