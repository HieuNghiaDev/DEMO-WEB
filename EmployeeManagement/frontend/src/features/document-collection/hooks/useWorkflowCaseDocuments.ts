import { useEffect, useState } from 'react'
import { documentCollectionApi } from '../api'
import { collectionError } from '../errors'
import type { CollectionError } from '../errors'
import type { CollectionItem } from '../types'

/**
 * The API deliberately paginates the canonical list. The required-documents tab
 * reads every page and filters the same CaseDocument identities in memory; it does
 * not create or persist a parallel document store.
 */
export function useWorkflowCaseDocuments(caseId: number, enabled: boolean, revision: number) {
  const [items, setItems] = useState<CollectionItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<CollectionError | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    const load = async () => {
      setLoading(true); setError(null)
      try {
        const first = await documentCollectionApi.list(caseId, { page: 1, per_page: 100 }, controller.signal)
        const pages = await Promise.all(Array.from({ length: Math.max(0, first.pagination.last_page - 1) }, (_, index) =>
          documentCollectionApi.list(caseId, { page: index + 2, per_page: 100 }, controller.signal),
        ))
        if (!controller.signal.aborted) setItems([first, ...pages].flatMap(page => page.documents))
      } catch (requestError) {
        if (!controller.signal.aborted) setError(collectionError(requestError))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [caseId, enabled, reloadToken, revision])

  return { items, loading, error, retry: () => setReloadToken(value => value + 1) }
}
