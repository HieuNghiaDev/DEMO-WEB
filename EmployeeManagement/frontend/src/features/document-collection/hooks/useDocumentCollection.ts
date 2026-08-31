import { useEffect, useRef, useState } from 'react'
import { documentCollectionApi } from '../api'
import { collectionError } from '../errors'
import type { CollectionError } from '../errors'
import type { CollectionListResponse, CollectionQuery, EmployeeOption, InitializationPreview } from '../types'
import { withFilter } from '../utils'

export function useDocumentCollection(caseId: number, canReadEmployees: boolean) {
  const [preview, setPreview] = useState<InitializationPreview | null>(null)
  const [data, setData] = useState<CollectionListResponse | null>(null)
  const [previewError, setPreviewError] = useState<CollectionError | null>(null)
  const [listError, setListError] = useState<CollectionError | null>(null)
  const [initializationError, setInitializationError] = useState<CollectionError | null>(null)
  const [previewLoading, setPreviewLoading] = useState(true)
  const [listLoading, setListLoading] = useState(false)
  const [initializing, setInitializing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const [query, setQuery] = useState<CollectionQuery>({ page: 1, per_page: 25 })
  const [search, setSearch] = useState('')
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [employeeError, setEmployeeError] = useState<string | null>(null)
  const initializeLock = useRef(false)
  const refresh = () => setRevision(value => value + 1)

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setPreviewLoading(true); setPreviewError(null)
      try { const result = await documentCollectionApi.preview(caseId, controller.signal); if (!controller.signal.aborted) setPreview(result) }
      catch (error) { if (!controller.signal.aborted) setPreviewError(collectionError(error)) }
      finally { if (!controller.signal.aborted) setPreviewLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [caseId, revision])

  const listEnabled = preview !== null && !previewError
  useEffect(() => {
    if (!listEnabled) return
    const controller = new AbortController()
    const load = async () => {
      setListLoading(true); setListError(null)
      try { const result = await documentCollectionApi.list(caseId, query, controller.signal); if (!controller.signal.aborted) setData(result) }
      catch (error) { if (!controller.signal.aborted) setListError(collectionError(error)) }
      finally { if (!controller.signal.aborted) setListLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [caseId, query, revision, listEnabled])

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(previous => previous.search === (search || undefined) ? previous : withFilter(previous, { search: search || undefined })), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (!canReadEmployees) return
    const controller = new AbortController()
    void documentCollectionApi.employees(controller.signal).then(result => { if (!controller.signal.aborted) setEmployees(result) }).catch(() => { if (!controller.signal.aborted) setEmployeeError('担当者一覧を取得できませんでした。担当者は変更せずに他の項目を編集できます。') })
    return () => controller.abort()
  }, [canReadEmployees])

  const changeFilter = (patch: CollectionQuery, reset = false) => {
    if (reset) { setSearch(''); setQuery({ page: 1, per_page: query.per_page }); return }
    setQuery(previous => withFilter(previous, patch))
  }
  const initialize = async () => {
    if (initializeLock.current) return false
    initializeLock.current = true
    setInitializing(true); setInitializationError(null); setNotice('')
    try {
      const response = await documentCollectionApi.initialize(caseId)
      setNotice(response.initialization.created_count > 0 ? `${response.initialization.created_count}件の候補資料を作成しました。` : '追加する候補資料はありませんでした。最新の状態を表示します。')
      setConfirming(false); refresh()
      return true
    } catch (error) { setInitializationError(collectionError(error)); return false }
    finally { initializeLock.current = false; setInitializing(false) }
  }
  return {
    preview, data, previewError, listError, initializationError, previewLoading, listLoading, initializing,
    confirming, setConfirming, notice, setNotice, refresh, query, search, setSearch, changeFilter,
    setPage: (page: number) => setQuery(previous => ({ ...previous, page })),
    employees, employeeError: canReadEmployees ? employeeError : '担当者一覧の閲覧権限がありません。', initialize,
  }
}
