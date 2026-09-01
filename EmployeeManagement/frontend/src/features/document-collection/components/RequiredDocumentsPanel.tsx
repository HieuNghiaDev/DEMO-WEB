import { CalendarClock, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import type { CaseActivity } from '../../case-workspace/types'
import { documentCollectionApi } from '../api'
import { collectionLabels, fulfillmentLabels, reviewLabels } from '../labels'
import type { CollectionItem, CollectionStatus, EmployeeOption } from '../types'
import { formatDate, isRequiredDocument, itemToRow } from '../utils'
import { useWorkflowCaseDocuments } from '../hooks/useWorkflowCaseDocuments'
import CollectionFeedback from './CollectionFeedback'
import RequiredDocumentInspector from './RequiredDocumentInspector'

type DeadlineFilter = 'all' | 'overdue' | 'upcoming' | 'unset'

export default function RequiredDocumentsPanel({ caseId, canUpdate, canReadEmployees, activities, onCandidates, onHistory, onChanged }: {
  caseId: number; canUpdate: boolean; canReadEmployees: boolean; activities: CaseActivity[]
  onCandidates: () => void; onHistory: () => void; onChanged: () => void
}) {
  const [revision, setRevision] = useState(0)
  const collection = useWorkflowCaseDocuments(caseId, true, revision)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | CollectionStatus>('all')
  const [assignee, setAssignee] = useState<'all' | 'unassigned' | number>('all')
  const [deadline, setDeadline] = useState<DeadlineFilter>('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [filterClock] = useState(() => Date.now())
  const filterId = useId()

  useEffect(() => {
    if (!canReadEmployees) return
    const controller = new AbortController()
    void documentCollectionApi.employees(controller.signal).then(value => { if (!controller.signal.aborted) setEmployees(value) }).catch(() => {})
    return () => controller.abort()
  }, [canReadEmployees])

  const required = useMemo(() => collection.items.filter(isRequiredDocument), [collection.items])
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    const now = filterClock
    const inSevenDays = now + 7 * 24 * 60 * 60 * 1000
    return required.filter(item => {
      if (term && !`${item.title} ${item.document_type?.code ?? ''} ${item.document_type?.name_ja ?? ''} ${item.collection_source ?? ''}`.toLocaleLowerCase().includes(term)) return false
      if (status !== 'all' && item.collection_status !== status) return false
      if (assignee === 'unassigned' && item.assigned_employee !== null) return false
      if (typeof assignee === 'number' && item.assigned_employee?.id !== assignee) return false
      const due = item.response_deadline ? new Date(item.response_deadline).getTime() : null
      if (deadline === 'unset' && due !== null) return false
      if (deadline === 'overdue' && (due === null || due >= now || ['received', 'closed'].includes(item.collection_status))) return false
      if (deadline === 'upcoming' && (due === null || due < now || due > inSevenDays)) return false
      return true
    })
  }, [assignee, deadline, filterClock, query, required, status])
  const refresh = () => { setRevision(value => value + 1); onChanged() }
  const activeSecondaryFilters = Number(assignee !== 'all') + Number(deadline !== 'all')
  const overdueCount = required.filter(item => {
    const due = item.response_deadline ? new Date(item.response_deadline).getTime() : null
    return due !== null && due < filterClock && !['received', 'closed'].includes(item.collection_status)
  }).length
  const clearSecondaryFilters = () => { setAssignee('all'); setDeadline('all') }

  return <div className="dc-preview dc-production dc-required" aria-label="必要資料ワークスペース">
    <div className="dc-collection-heading"><div><h2>必要資料</h2><p>この案件で「必要」と判断された資料の取得・確認状況を管理します。</p></div>{!canUpdate && <span className="dc-meta">閲覧のみ</span>}</div>
    <div className="dc-required-summary" aria-label="必要資料サマリー"><span>必要資料 <b>{required.length}</b>件</span><i/><span className={overdueCount ? 'is-attention' : ''}>期限超過 <b>{overdueCount}</b></span><span>確認待ち <b>{required.filter(item => item.review_status === 'unreviewed').length}</b></span><span className={required.some(item => item.fulfillment_status === 'insufficient') ? 'is-attention' : ''}>不足あり <b>{required.filter(item => item.fulfillment_status === 'insufficient').length}</b></span></div>
    <div className={`dc-workspace ${selectedId !== null ? 'has-inspector' : ''}`}>
      <div className="dc-master">
        <div className="dc-required-toolbar">
          <label className="dc-workflow-search"><Search size={17}/><input aria-label="必要資料を検索" value={query} onChange={event => setQuery(event.target.value)} placeholder="資料名・コード・取得先を検索"/></label>
          <label>取得状況<select aria-label="取得状況" value={status} onChange={event => setStatus(event.target.value as typeof status)}><option value="all">すべて</option>{Object.entries(collectionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <button type="button" className={`dc-button dc-filter-button ${filtersOpen || activeSecondaryFilters ? 'is-active' : ''}`} onClick={() => setFiltersOpen(value => !value)} aria-expanded={filtersOpen} aria-controls={filterId}><SlidersHorizontal size={15}/>絞り込み{activeSecondaryFilters > 0 && ` ${activeSecondaryFilters}`}</button>
          {filtersOpen && <div id={filterId} className="dc-required-filter-panel"><label>担当者<select aria-label="必要資料の担当者" value={assignee} onChange={event => setAssignee(event.target.value === 'all' || event.target.value === 'unassigned' ? event.target.value : Number(event.target.value))}><option value="all">すべて</option><option value="unassigned">未割当</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.display_name}</option>)}</select></label><label>期限<select aria-label="必要資料の期限" value={deadline} onChange={event => setDeadline(event.target.value as DeadlineFilter)}><option value="all">すべて</option><option value="overdue">期限超過</option><option value="upcoming">7日以内</option><option value="unset">未設定</option></select></label>{activeSecondaryFilters > 0 && <button type="button" className="dc-text-action dc-filter-clear" onClick={clearSecondaryFilters}><X size={14}/>条件をクリア</button>}</div>}
        </div>
        <div className="dc-list-caption"><span>{filtered.length} / {required.length}件</span></div>
        {collection.error ? <CollectionFeedback error={collection.error} onRetry={collection.retry}/> : collection.loading ? <div className="dc-empty-results" role="status">必要資料を読み込み中…</div> : <RequiredDocumentList items={filtered} selectedId={selectedId} onSelect={setSelectedId}/>} 
        {!collection.loading && required.length === 0 && <div className="dc-required-empty"><p>必要と判断された資料はまだありません。</p><button type="button" className="dc-button" onClick={onCandidates}>資料収集で候補を確認</button></div>}
      </div>
      {selectedId !== null && <RequiredDocumentInspector key={selectedId} caseId={caseId} itemId={selectedId} canUpdate={canUpdate} employees={employees} activities={activities} onCandidates={onCandidates} onHistory={onHistory} onClose={() => setSelectedId(null)} onSaved={refresh}/>} 
    </div>
  </div>
}

function RequiredDocumentList({ items, selectedId, onSelect }: { items: CollectionItem[]; selectedId: number | null; onSelect: (id: number) => void }) {
  if (!items.length) return <div className="dc-empty-results"><Search size={22}/><h3>該当する必要資料がありません</h3><p>検索または絞り込み条件を変更してください。</p></div>
  return <div className="dc-required-list"><div className="dc-required-head"><span>資料</span><span>取得作業</span><span>確認</span><span>内容充足</span><span>担当者</span><span>回答期限</span><span aria-hidden="true" /></div>{items.map(item => {
    const row = itemToRow(item)
    const exception = row.result
    return <button key={item.id} type="button" className={`dc-required-row ${selectedId === item.id ? 'is-selected' : ''}`} onClick={() => onSelect(item.id)} aria-label={`${row.code} ${row.title} の必要資料詳細`}>
      <span className="dc-document"><span className="dc-code">{row.code}</span><strong>{row.title}</strong><span className="dc-source">{[item.collection_source, row.period].filter(Boolean).join(' · ') || '取得先・対象期間 未設定'}</span>{exception && <span className="dc-required-exception">{exception}</span>}</span>
      <StatusLane tone={collectionTone(item.collection_status)} label={collectionLabels[item.collection_status]}/>
      <StatusLane tone={reviewTone(item.review_status)} label={reviewLabels[item.review_status]}/>
      <StatusLane tone={fulfillmentTone(item.fulfillment_status)} label={fulfillmentLabels[item.fulfillment_status]}/>
      <span className="dc-owner">{item.assigned_employee?.display_name ?? '未割当'}</span>
      <Deadline value={item.response_deadline} overdue={row.overdue}/>
      <ChevronRight className="dc-required-chevron" size={15}/>
    </button>
  })}</div>
}

function StatusLane({ tone, label }: { tone: string; label: string }) { return <span className={`dc-status-lane ${tone}`}><i aria-hidden="true" />{label}</span> }

function Deadline({ value, overdue }: { value: string | null; overdue: boolean }) {
  const due = value ? new Date(value).getTime() : null
  const days = due === null ? 0 : Math.max(1, Math.ceil((Date.now() - due) / 86_400_000))
  return <span className={`dc-required-deadline ${overdue ? 'is-overdue' : ''}`}><span><CalendarClock size={12}/>{formatDate(value)}</span>{overdue && <small>期限超過 {days}日</small>}</span>
}

function collectionTone(status: CollectionStatus) { return status === 'received' || status === 'closed' ? 'is-positive' : status === 'partially_received' || status === 'difficult' ? 'is-attention' : status === 'requested' || status === 'preparing' ? 'is-progress' : 'is-neutral' }
function reviewTone(status: CollectionItem['review_status']) { return status === 'reviewed' ? 'is-positive' : status === 'returned' ? 'is-attention' : status === 'reviewing' ? 'is-progress' : 'is-neutral' }
function fulfillmentTone(status: CollectionItem['fulfillment_status']) { return status === 'satisfied' || status === 'satisfied_by_alternative' ? 'is-positive' : status === 'insufficient' ? 'is-attention' : 'is-neutral' }
