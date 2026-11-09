export const REQUIRED_DOCUMENT_PAGE_SIZES = [10, 20, 50] as const

/** Paginate the complete filtered collection, without changing API order or identities. */
export function requiredDocumentPage<T>(items: T[], requestedPage: number, pageSize: number) {
  const perPage = REQUIRED_DOCUMENT_PAGE_SIZES.find(size => size === pageSize) ?? 10
  const total = items.length
  const pages = Math.max(1, Math.ceil(total / perPage))
  const page = Math.min(pages, Math.max(1, Math.trunc(requestedPage) || 1))
  const from = total ? (page - 1) * perPage + 1 : 0
  const to = Math.min(page * perPage, total)
  const numbers = pages <= 5
    ? Array.from({ length: pages }, (_, index) => index + 1)
    : [...new Set([1, page - 1, page, page + 1, pages].filter(number => number >= 1 && number <= pages))].sort((a, b) => a - b)

  return {
    page, pages, total, from, to, numbers,
    rows: items.slice(from ? from - 1 : 0, to),
    range: requiredDocumentRange(total, from, to),
  }
}

export function requiredDocumentRange(total: number, from: number, to: number) {
  return total ? `${total}件中${from}–${to}件を表示` : '0件'
}
