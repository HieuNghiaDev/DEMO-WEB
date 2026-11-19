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
    <footer className="rounded-b-[var(--tm-radius-panel)] border-t border-[var(--tm-border-subtle)] bg-[var(--tm-surface)] px-4 py-3 sm:px-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center justify-between gap-3 lg:justify-start">
          <p className="text-xs tabular-nums text-[var(--tm-text-secondary)]">
            <span className="font-semibold text-[var(--tm-text-primary)]">{firstItem}–{lastItem}</span> / {totalItems}件
            {totalItems !== totalSourceItems && (
              <span className="ml-1.5 text-[var(--tm-text-muted)]">（全{totalSourceItems}件）</span>
            )}
          </p>

          <label className="relative inline-flex items-center gap-2 text-xs text-[var(--tm-text-muted)]">
            <span className="hidden sm:inline">表示件数</span>
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              aria-label="1ページあたりの表示件数"
              className="h-8 appearance-none rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface)] py-0 pl-2.5 pr-7 text-xs font-medium text-[var(--tm-text-primary)] outline-none transition-colors focus:border-[var(--tm-primary)]"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>{size}件/ページ</option>
              ))}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2 text-[var(--tm-text-muted)]" aria-hidden="true" />
          </label>
        </div>

        <nav className="flex items-center justify-between gap-1.5 sm:justify-end" aria-label="申請一覧のページ移動">
          <PageButton
            ariaLabel="前のページ"
            disabled={currentPage === 1}
            onClick={() => onPageChange(currentPage - 1)}
            icon="previous"
          />

          <div className="hidden items-center gap-1 sm:flex">
            {pages.map((page, index) => (
              page === 'ellipsis' ? (
                <span key={`ellipsis-${index}`} className="flex h-8 w-7 items-center justify-center text-xs text-[var(--tm-text-muted)]" aria-hidden="true">…</span>
              ) : (
                <button
                  key={page}
                  type="button"
                  onClick={() => onPageChange(page)}
                  aria-label={`${page}ページ目`}
                  aria-current={page === currentPage ? 'page' : undefined}
                  className={`h-8 min-w-8 rounded-lg px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-primary)] ${
                    page === currentPage
                      ? 'bg-[var(--tm-primary)] text-white'
                      : 'text-[var(--tm-text-secondary)] hover:bg-[var(--tm-surface-hover)] hover:text-[var(--tm-text-primary)]'
                  }`}
                >
                  {page}
                </button>
              )
            ))}
          </div>

          <span className="min-w-16 text-center text-xs font-medium tabular-nums text-[var(--tm-text-secondary)] sm:hidden">
            {currentPage} / {totalPages}
          </span>

          <PageButton
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

function PageButton({
  ariaLabel,
  disabled,
  onClick,
  icon,
}: {
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
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface)] text-[var(--tm-text-secondary)] transition-colors hover:bg-[var(--tm-surface-hover)] hover:text-[var(--tm-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-primary)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {icon === 'previous' ? <ChevronLeft size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
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
