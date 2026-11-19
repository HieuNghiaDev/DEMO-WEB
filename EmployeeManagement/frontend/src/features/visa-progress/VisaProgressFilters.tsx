import { Check, ChevronDown, RotateCcw, Search, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

export type VisaQuickCounts = {
  all: number
  attention: number
  overdue: number
  has_deadline: number
  none: number
}

type Props = {
  keyword: string
  selectedStatuses: string[]
  responsiblePerson: string
  deadlineLevel: string
  statuses: string[]
  responsiblePeople: string[]
  totalCount: number
  filteredCount: number
  quickCounts: VisaQuickCounts
  onKeywordChange: (value: string) => void
  onStatusesChange: (values: string[]) => void
  onResponsiblePersonChange: (value: string) => void
  onDeadlineLevelChange: (value: string) => void
  onReset: () => void
}

const quickFilterTabs: Array<{ id: keyof VisaQuickCounts; label: string }> = [
  { id: 'all', label: 'すべて' },
  { id: 'attention', label: '要対応（30日以内）' },
  { id: 'overdue', label: '期限超過' },
  { id: 'has_deadline', label: '期限あり' },
  { id: 'none', label: '期限なし' },
]

export default function VisaProgressFilters(props: Props) {
  const activeFilterCount = [
    props.keyword.trim() !== '',
    props.selectedStatuses.length > 0,
    props.responsiblePerson !== 'all',
    props.deadlineLevel !== 'all',
  ].filter(Boolean).length

  return (
    <section className="cm-case-toolbar" aria-label="在留申請の検索と絞り込み">
      <div className="cm-case-toolbar-primary">
        <div className="relative min-w-0 flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--tm-text-muted)]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={props.keyword}
            onChange={(event) => props.onKeywordChange(event.target.value)}
            placeholder="申請者名・案件IDで検索…"
            aria-label="申請者名・案件IDで検索"
            className="cm-case-control w-full pl-10 pr-9"
          />
          {props.keyword && (
            <button
              type="button"
              aria-label="検索語をクリア"
              onClick={() => props.onKeywordChange('')}
              className="cm-case-clear"
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 xl:flex xl:items-center">
          <StatusMultiSelect
            selectedStatuses={props.selectedStatuses}
            statuses={props.statuses}
            onChange={props.onStatusesChange}
          />
          <FilterSelect
            value={props.responsiblePerson}
            onChange={props.onResponsiblePersonChange}
            label="担当者"
            className="xl:w-[164px]"
          >
            <option value="all">すべての担当者</option>
            {props.responsiblePeople.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </FilterSelect>
          <FilterSelect
            value={props.deadlineLevel}
            onChange={props.onDeadlineLevelChange}
            label="期限"
            className="xl:w-[172px]"
          >
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

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={props.onReset}
              className="cm-case-filter-button sm:col-span-2 md:col-span-3 xl:col-span-1 xl:shrink-0"
              title="絞り込み条件をリセット"
            >
              <RotateCcw size={13} aria-hidden="true" />
              <span>クリア</span>
              <span className="cm-case-quick-count">{activeFilterCount}</span>
            </button>
          )}
        </div>
      </div>

      <div className="cm-case-toolbar-secondary">
        <nav className="cm-case-quick-filters" aria-label="期限による絞り込み">
          {quickFilterTabs.map((tab) => {
            const isSelected = props.deadlineLevel === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => props.onDeadlineLevelChange(tab.id)}
                className={`cm-case-quick-filter ${isSelected ? 'is-active' : ''}`}
              >
                <span>{tab.label}</span>
                <span className="cm-case-quick-count">{props.quickCounts[tab.id]}</span>
              </button>
            )
          })}
        </nav>

        <span className="cm-case-result-count" aria-live="polite">
          <strong>{props.filteredCount}</strong> / {props.totalCount}件
        </span>
      </div>
    </section>
  )
}

function StatusMultiSelect({
  selectedStatuses,
  statuses,
  onChange,
}: {
  selectedStatuses: string[]
  statuses: string[]
  onChange: (values: string[]) => void
}) {
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
    onChange(
      selectedStatuses.includes(status)
        ? selectedStatuses.filter((value) => value !== status)
        : [...selectedStatuses, status],
    )
  }

  const label = selectedStatuses.length === 0
    ? 'すべてのステータス'
    : selectedStatuses.length === 1
      ? selectedStatuses[0]
      : `${selectedStatuses.length}件選択中`

  return (
    <div ref={rootRef} className="relative min-w-0 xl:w-[176px]">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={() => setIsOpen((open) => !open)}
        className="cm-case-control flex w-full items-center justify-between gap-2 px-3 text-left font-semibold"
      >
        <span className="truncate">{label}</span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-[var(--tm-text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="ステータスを複数選択"
          className="absolute left-0 z-20 mt-1.5 max-h-64 w-56 overflow-y-auto rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface)] p-1 shadow-lg sm:left-auto sm:right-0"
        >
          <button
            type="button"
            onClick={() => onChange([])}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium text-[var(--tm-text-secondary)] transition-colors hover:bg-[var(--tm-surface-hover)] hover:text-[var(--tm-text-primary)]"
          >
            <span
              className={`flex h-4 w-4 items-center justify-center rounded border ${
                selectedStatuses.length === 0
                  ? 'border-[var(--tm-primary)] bg-[var(--tm-primary)] text-white'
                  : 'border-[var(--tm-border)]'
              }`}
            >
              {selectedStatuses.length === 0 && <Check size={11} strokeWidth={3} aria-hidden="true" />}
            </span>
            すべてのステータス
          </button>
          <div className="my-1 border-t border-[var(--tm-border-subtle)]" />
          {statuses.map((status) => {
            const isSelected = selectedStatuses.includes(status)
            return (
              <label
                key={status}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-xs text-[var(--tm-text-primary)] transition-colors hover:bg-[var(--tm-surface-hover)]"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleStatus(status)}
                  className="sr-only"
                />
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    isSelected
                      ? 'border-[var(--tm-primary)] bg-[var(--tm-primary)] text-white'
                      : 'border-[var(--tm-border)]'
                  }`}
                >
                  {isSelected && <Check size={11} strokeWidth={3} aria-hidden="true" />}
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

function FilterSelect({
  value,
  onChange,
  label,
  className = '',
  children,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`relative min-w-0 ${className}`}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="cm-case-control cm-case-select"
      >
        {children}
      </select>
      <ChevronDown size={14} className="cm-case-select-icon" aria-hidden="true" />
    </div>
  )
}
