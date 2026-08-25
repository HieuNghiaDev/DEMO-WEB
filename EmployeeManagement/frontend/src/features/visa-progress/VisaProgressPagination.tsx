import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'

type Props = {
  currentPage: number
  pageSize: number
  totalItems: number
  totalSourceItems: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

const PAGE_SIZES = [25, 50, 100]

export default function VisaProgressPagination({
  currentPage,
  pageSize,
  totalItems,
  totalSourceItems,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const firstItem = (currentPage - 1) * pageSize + 1
  const lastItem = Math.min(currentPage * pageSize, totalItems)
  const pages = buildPageItems(currentPage, totalPages)

  return (
    <footer className="border-t border-slate-200 bg-slate-50/60 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/70 sm:px-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center justify-between gap-3 lg:justify-start">
          <p className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-700 dark:text-slate-200">{totalItems}件中 {firstItem}–{lastItem}件</span>を表示
            {totalItems !== totalSourceItems && <span className="ml-1.5">（全{totalSourceItems}件）</span>}
          </p>

          <label className="relative inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="hidden sm:inline">表示件数</span>
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              aria-label="1ページあたりの表示件数"
              className="h-9 appearance-none rounded-md border border-slate-300 bg-white py-0 pl-3 pr-8 text-xs font-medium text-slate-700 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}件/ページ</option>)}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2.5 text-slate-400" aria-hidden="true" />
          </label>
        </div>

        <nav className="flex items-center justify-between gap-2 sm:justify-end" aria-label="申請一覧のページ移動">
          <PageButton
            label="前へ"
            ariaLabel="前のページ"
            disabled={currentPage === 1}
            onClick={() => onPageChange(currentPage - 1)}
            icon="previous"
          />

          <div className="hidden items-center gap-1 sm:flex">
            {pages.map((page, index) => page === 'ellipsis' ? (
              <span key={`ellipsis-${index}`} className="flex h-8 w-7 items-center justify-center text-xs text-slate-400" aria-hidden="true">…</span>
            ) : (
              <button
                key={page}
                type="button"
                onClick={() => onPageChange(page)}
                aria-label={`${page}ページ目`}
                aria-current={page === currentPage ? 'page' : undefined}
                className={`h-8 min-w-8 rounded-md px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${page === currentPage
                  ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                  : 'text-slate-600 hover:bg-slate-200/80 dark:text-slate-300 dark:hover:bg-slate-800'}`}
              >
                {page}
              </button>
            ))}
          </div>

          <span className="min-w-16 text-center text-xs font-medium tabular-nums text-slate-600 dark:text-slate-300 sm:hidden">
            {currentPage} / {totalPages}
          </span>

          <PageButton
            label="次へ"
            ariaLabel="次のページ"
            disabled={currentPage === totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            icon="next"
          />
        </nav>
      </div>
    </footer>
  )
}

function PageButton({ label, ariaLabel, disabled, onClick, icon }: {
  label: string
  ariaLabel: string
  disabled: boolean
  onClick: () => void
  icon: 'previous' | 'next'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      {icon === 'previous' && <ChevronLeft size={15} aria-hidden="true" />}
      {label}
      {icon === 'next' && <ChevronRight size={15} aria-hidden="true" />}
    </button>
  )
}

function buildPageItems(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1)

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1])
  const validPages = Array.from(pages).filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b)
  const items: Array<number | 'ellipsis'> = []

  validPages.forEach((page, index) => {
    if (index > 0 && page - validPages[index - 1] > 1) items.push('ellipsis')
    items.push(page)
  })

  return items
}
