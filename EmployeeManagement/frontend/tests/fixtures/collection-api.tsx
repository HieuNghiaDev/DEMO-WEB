// Vite dev-only harness of the PRODUCTION panel and configured Axios client.
// Every request is intercepted in memory; no backend connection or DB mutation.
import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { AxiosError } from 'axios'
import api from '../../src/services/api'
import DocumentCollectionPanel from '../../src/features/document-collection/DocumentCollectionPanel'
import type { CollectionDetail, CollectionDraft, CollectionItem, CollectionQuery } from '../../src/features/document-collection/types'
import type { CaseActivity } from '../../src/features/case-workspace/types'
import { fixtureDetails, fixtureListItem, previewFixture } from './collectionApiData'
import '../../src/index.css'

if (!import.meta.env.DEV) throw new Error('Test harness is development-only')
let scenario = 'existing'
let items = fixtureDetails()
let failure = ''
let delay = 25
let logs: Array<{ method: string; url: string; params?: CollectionQuery; payload?: unknown }> = []
let logChanged = () => {}
let activities: CaseActivity[] = []

const matches = (item: CollectionItem, params: CollectionQuery) => {
  if (params.search && !`${item.title} ${item.document_type?.code} ${item.document_type?.name_ja}`.toLowerCase().includes(params.search.toLowerCase())) return false
  if (params.purpose && !item.purposes.some(p => p.code === params.purpose)) return false
  if (params.source && item.collection_source !== params.source) return false
  if (params.assignee_id && item.assigned_employee?.id !== params.assignee_id) return false
  for (const key of ['necessity_status', 'collection_status', 'fulfillment_status', 'review_status', 'collection_result', 'preservation_priority'] as const) if (params[key] !== undefined && (params[key] === '' ? null : params[key]) !== item[key]) return false
  if (params.overdue && (!item.response_deadline || Date.parse(item.response_deadline) >= Date.now() || ['received', 'closed'].includes(item.collection_status))) return false
  return true
}
api.defaults.adapter = async config => {
  const url = config.url ?? ''
  const method = config.method ?? 'get'
  logs.push({ method, url, params: config.params, ...(config.data ? { payload: JSON.parse(config.data) } : {}) })
  logChanged()
  await new Promise(resolve => setTimeout(resolve, delay))
  const stage = url.endsWith('initialization-preview') ? 'preview' : url.endsWith('initialize') ? 'initialize' : method === 'patch' ? 'patch' : /document-collection\/\d+$/.test(url) ? 'detail' : 'list'
  if (failure.startsWith(`${stage}:`)) {
    const status = Number(failure.split(':')[1])
    if (!status) throw new AxiosError('Test network failure', 'ERR_NETWORK', config)
    throw new AxiosError('Test HTTP error', undefined, config, undefined, { status, statusText: 'Test', config, headers: {}, data: { message: 'Never display this raw server message', errors: status === 422 ? { collection_source: ['取得先の入力を確認してください。'] } : {} } })
  }
  let data: unknown
  if (url === '/organization') data = { employees: [{ id: 1, full_name: '試験担当者' }, { id: 2, full_name: '試験担当者B' }] }
  else if (stage === 'preview') {
    const preview = structuredClone(previewFixture)
    Object.assign(preview.initialization, { total_existing_collection_items: items.length, existing_generated_count: items.length, missing_candidate_count: scenario === 'uninitialized' ? 3 : ['new', 'noop'].includes(scenario) ? 2 : 0 })
    if (scenario === 'no-rules') { preview.initialization.candidate_count = 0; preview.warnings = [{ code: 'no_rules', message: 'この事件類型には資料収集ルールが登録されていません。' }] }
    if (scenario === 'missing-type') { preview.case.case_type = null; preview.initialization.available = false; preview.warnings = [{ code: 'case_type_missing', message: '事件類型が設定されていません。' }] }
    if (scenario === 'warnings') preview.warnings = [{ code: 'manual_items_present', message: '手動で追加された資料があります。既存の資料も確認してください。' }, { code: 'legacy_document_items_present', message: '旧書類データが含まれています。自動移行は行いません。' }]
    data = preview
  } else if (stage === 'initialize') {
    const created = scenario === 'noop' ? 0 : scenario === 'uninitialized' ? 3 : scenario === 'new' ? 2 : 0
    if (!items.length) items = fixtureDetails().map(item => ({ ...item, necessity: { status: 'undetermined', reason: null, decided_by: null, decided_at: null } }))
    if (scenario === 'new') items.push(...fixtureDetails().slice(0, 2).map(item => ({ ...item, id: item.id + 10 })))
    scenario = 'existing'
    data = { initialization: { created_count: created, skipped_count: items.length - created, candidate_count: items.length, created_case_document_ids: items.slice(-created).map(item => item.id), total_collection_items: items.length } }
  } else if (stage === 'detail' || stage === 'patch') {
    const item = items.find(item => item.id === Number(url.split('/').at(-1)))!
    if (stage === 'patch') {
      const patch: Partial<CollectionDraft> = JSON.parse(config.data)
      const collectionFields: Record<string, keyof CollectionDetail['collection']> = { target_person: 'target_person', collection_source: 'source', collection_method: 'method', target_period_from: 'target_period_from', target_period_to: 'target_period_to', target_scope: 'target_scope', requested_at: 'requested_at', response_deadline: 'response_deadline', collection_priority: 'priority', preservation_priority: 'preservation_priority', preservation_reason: 'preservation_reason', collection_status: 'status', collection_result: 'result' }
      for (const [field, value] of Object.entries(patch)) {
        if (field in collectionFields) Object.assign(item.collection, { [collectionFields[field]]: value })
        else if (field === 'necessity_status') item.necessity.status = value as CollectionDraft['necessity_status']
        else if (field === 'necessity_reason') item.necessity.reason = value as string | null
        else if (field === 'assigned_employee_id') item.assigned_employee = value ? { id: Number(value), display_name: Number(value) === 1 ? '試験担当者' : '試験担当者B' } : null
        else Object.assign(item, { [field]: value })
      }
      activities = [{ id: 900, activity_type: 'note', channel: 'internal', title: '資料収集項目を更新', content: item.title, occurred_at: '2026-08-31T04:00:00Z', created_by_employee: { full_name: '試験担当者' }, metadata: { event: 'document_collection.updated', document_id: item.id } }]
    }
    data = { document: structuredClone(item) }
  } else if (url.endsWith('/document-collection')) {
    const all = items.map(fixtureListItem)
    const params: CollectionQuery = config.params ?? {}
    const filtered = all.filter(item => matches(item, params))
    const page = params.page ?? 1; const perPage = params.per_page ?? 25
    data = { documents: filtered.slice((page - 1) * perPage, page * perPage), pagination: { current_page: page, per_page: perPage, last_page: Math.max(1, Math.ceil(filtered.length / perPage)), total: filtered.length, from: filtered.length ? (page - 1) * perPage + 1 : null, to: filtered.length ? Math.min(page * perPage, filtered.length) : null }, summary: { total: all.length, necessity: { required: all.filter(item => item.necessity_status === 'required').length, not_required: all.filter(item => item.necessity_status === 'not_required').length, undetermined: all.filter(item => item.necessity_status === 'undetermined').length }, overdue: all.filter(item => matches(item, { overdue: true })).length, preservation_priority: all.filter(item => item.preservation_priority).length, collection_result_count: all.filter(item => item.collection_result).length, filtered_count: filtered.length } }
  } else throw new Error(`Unmocked request blocked: ${method} ${url}`)
  return { status: 200, statusText: 'OK', headers: {}, config, data }
}

export function Harness() {
  const [key, setKey] = useState(0)
  const [readOnly, setReadOnly] = useState(false)
  const [, setLogRevision] = useState(0)
  const [history, setHistory] = useState(false)
  useEffect(() => { logChanged = () => setLogRevision(value => value + 1); return () => { logChanged = () => {} } }, [])
  const reset = (value: string) => {
    scenario = value; logs = []; activities = []; setHistory(false)
    items = ['uninitialized', 'no-rules', 'missing-type'].includes(value) ? [] : fixtureDetails()
    if (value === 'paginated') items = Array.from({ length: 31 }, (_, index) => ({ ...structuredClone(fixtureDetails()[index % 3]), id: 201 + index }))
    setKey(previous => previous + 1)
  }
  return <BrowserRouter><div className="themis-app min-h-screen bg-gray-50">
    <aside className="hidden md:block fixed inset-y-0 left-0 w-72 border-r border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"><strong>THEMIS · TEST HARNESS</strong><p>API transport intercepted.<br />No backend / no DB writes.</p></aside>
    <main className="md:ml-72 p-4">
      <div className="mb-4 flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-300">
        <label>試験シナリオ<select aria-label="試験シナリオ" onChange={event => reset(event.target.value)} defaultValue="existing">{['existing', 'uninitialized', 'new', 'noop', 'no-rules', 'missing-type', 'warnings', 'paginated'].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>試験エラー<select aria-label="試験エラー" value={failure} onChange={event => { failure = event.target.value; setLogRevision(value => value + 1) }}><option value="">なし</option>{['preview:401', 'preview:403', 'preview:404', 'preview:500', 'preview:network', 'list:500', 'detail:404', 'detail:500', 'patch:422', 'patch:403', 'patch:500', 'initialize:500'].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>応答時間<select aria-label="応答時間" onChange={event => { delay = Number(event.target.value) }} defaultValue="25"><option value="25">通常</option><option value="1200">遅延</option></select></label>
        <label><input type="checkbox" checked={readOnly} onChange={event => { setReadOnly(event.target.checked); setKey(value => value + 1) }} />閲覧のみ</label>
        <button onClick={() => document.documentElement.classList.toggle('dark')}>テーマ切替</button>
        <button onClick={() => { logs = []; setLogRevision(value => value + 1) }}>通信記録をクリア</button>
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        {history ? <><h2>案件履歴</h2><button onClick={() => setHistory(false)}>資料収集へ戻る</button></> : <DocumentCollectionPanel key={key} caseId={9001} canUpdate={!readOnly} canReadEmployees activities={activities} onBack={() => setHistory(true)} onHistory={() => setHistory(true)} onChanged={() => setLogRevision(value => value + 1)} />}
      </section>
      <details className="mt-4"><summary>試験用通信記録（機密情報なし）</summary><pre data-testid="transport-log" className="whitespace-pre-wrap break-all text-xs">{JSON.stringify(logs)}</pre></details>
    </main>
  </div></BrowserRouter>
}
createRoot(document.getElementById('root')!).render(<Harness />)
