import { useCallback, useEffect, useRef, useState } from 'react'
import { documentCollectionApi } from '../api'
import { collectionError } from '../errors'
import type { CollectionError } from '../errors'
import type { CollectionItem } from '../types'

/**
 * The API deliberately paginates the canonical list. The required-documents tab
 * reads every page and filters the same CaseDocument identities in memory; it does
 * not create or persist a parallel document store.
 */
export function useWorkflowCaseDocuments(caseId: number, enabled: boolean) {
  const [items, setItems] = useState<CollectionItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<CollectionError | null>(null)
  const activeRequest = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    if (!enabled) return false
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    setLoading(true); setError(null)
    try {
      const first = await documentCollectionApi.list(caseId, { page: 1, per_page: 100 }, controller.signal)
      const pages = await Promise.all(Array.from({ length: Math.max(0, first.pagination.last_page - 1) }, (_, index) =>
        documentCollectionApi.list(caseId, { page: index + 2, per_page: 100 }, controller.signal),
      ))
      if (controller.signal.aborted) return false
      setItems([first, ...pages].flatMap(page => page.documents))
      return true
    } catch (requestError) {
      if (!controller.signal.aborted) setError(collectionError(requestError))
      return false
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [caseId, enabled])

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => { if (!cancelled) return refresh() })
    // Another tab/reviewer can change a file while this list remains mounted.
    // Re-read canonical server state rather than inferring it from the local file.
    const revalidate = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('focus', revalidate)
    document.addEventListener('visibilitychange', revalidate)
    return () => {
      cancelled = true
      activeRequest.current?.abort()
      window.removeEventListener('focus', revalidate)
      document.removeEventListener('visibilitychange', revalidate)
    }
  }, [refresh])

  return { items, loading, error, refresh, retry: () => { void refresh() } }
}
