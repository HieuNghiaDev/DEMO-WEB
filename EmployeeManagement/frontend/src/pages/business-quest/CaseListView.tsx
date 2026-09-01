import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, RefreshCw, Search } from 'lucide-react'
import { safeProgress, statusConfig } from './helpers'
import { CasePageHeader, CaseSummaryStrip } from '../../features/case-management/CasePrimitives'
import { generatedCaseTitle } from '../../features/case-management/helpers'
import type { BusinessCase, CaseQuickFilter, CaseStatus } from './types'

type Props = {
  cases: BusinessCase[]
  filteredCases: BusinessCase[]
  loading: boolean
  error: string | null
  keyword: string
  status: 'all' | CaseStatus
  caseType: string
  quickFilter: CaseQuickFilter
  caseTypes: string[]
  canCreate: boolean
  canAssign: boolean
  assignees: AssigneeOption[]
  assigningCaseId: number | null
  onKeywordChange: (value: string) => void
  onStatusChange: (value: 'all' | CaseStatus) => void
  onCaseTypeChange: (value: string) => void
  onQuickFilterChange: (value: CaseQuickFilter) => void
  onRefresh: () => void
  onCreate: () => void
  onOpen: (id: number) => void
  onAssign: (caseId: number, employeeId: number | null) => void
}

type AssigneeOption = { id: number; full_name: string; full_name_kana: string | null; position_title: string | null }


const PAGE_SIZE = 10
const quickTabs: { id: CaseQuickFilter; label: string }[] = [
  { id: 'all', label: 'すべて' }, { id: 'in_progress', label: '対応中' },
  { id: 'waiting', label: '書類待ち' }, { id: 'reviewing', label: '確認中' },
  { id: 'documents_complete', label: '資料確認済み' },
]
export default function CaseListView(props: Props) {
  const [page, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(props.filteredCases.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const visible = props.filteredCases.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  useEffect(() => {
    const timer = window.setTimeout(() => setPage(1), 0)
    return () => window.clearTimeout(timer)
  }, [props.keyword, props.status, props.caseType, props.quickFilter])
  const count = (id: CaseQuickFilter) => props.cases.filter(item => id === 'all' || (id === 'documents_complete' ? item.documentsTotal > 0 && item.documentsDone === item.documentsTotal : item.status === id)).length
  const totalDocuments = props.cases.reduce((total, item) => total + item.documentsTotal, 0)
  const confirmed = props.cases.reduce((total, item) => total + item.documentsDone, 0)
  return <main className="dc-preview cm-page"><section className="cm-surface" aria-label="案件管理">
    <CasePageHeader title="案件管理" description="依頼案件を検索・管理します。" actions={<>
      <button type="button" className="dc-button" disabled={props.loading} onClick={props.onRefresh}><RefreshCw size={15}/>最新データを取得</button>
      <button type="button" className="dc-button dc-primary" disabled={!props.canCreate} onClick={props.onCreate} title={!props.canCreate ? '案件の作成権限が必要です' : undefined}><Plus size={15}/>新規案件</button>
    </>}/>
    <CaseSummaryStrip items={[{ label: '全案件', value: props.cases.length }, { label: '対応中', value: count('in_progress') }, { label: '要確認', value: count('waiting') + count('reviewing') }, { label: '書類確認率', value: totalDocuments ? `${safeProgress(confirmed, totalDocuments)}%` : '—' }]}/>
    <div className="cm-toolbar" aria-label="案件を検索・絞り込み">
      <label className="cm-search-field"><span className="sr-only">検索</span><Search size={17} aria-hidden="true"/><input type="search" value={props.keyword} onChange={event => props.onKeywordChange(event.target.value)} placeholder="依頼者・案件番号・担当者で検索"/></label>
      <label><span>案件状態</span><select value={props.status} onChange={event => props.onStatusChange(event.target.value as 'all' | CaseStatus)}><option value="all">すべての状態</option>{Object.entries(statusConfig).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}</select></label>
      <label><span>事件類型</span><select value={props.caseType} onChange={event => props.onCaseTypeChange(event.target.value)}><option value="all">すべての事件類型</option>{props.caseTypes.map(type => <option key={type}>{type}</option>)}</select></label>
    </div>
    <nav className="cm-quick" aria-label="案件の絞り込み">{quickTabs.map(tab => <button type="button" key={tab.id} aria-pressed={tab.id === props.quickFilter} onClick={() => props.onQuickFilterChange(tab.id)}><span>{tab.label}</span><b>{count(tab.id)}</b></button>)}</nav>
    {props.loading && <p className="cm-empty" role="status">案件を読み込み中…</p>}
    {props.error && <p className="cm-message" role="alert">{props.error}</p>}
    {!props.loading && !props.error && !visible.length && <div className="cm-empty"><h2>{props.cases.length ? '条件に一致する案件はありません。' : '案件はまだ登録されていません。'}</h2><p className="dc-meta">{props.cases.length ? '検索条件を変更してください。' : '最初の案件を登録してください。'}</p>{props.canCreate && <button type="button" className="dc-button dc-primary" onClick={props.onCreate}><Plus size={15}/>新規案件</button>}</div>}
    {!props.loading && !props.error && !!visible.length && <div className="cm-table">
      <div className="cm-table-head" aria-hidden="true"><span>依頼者 / 案件</span><span>事件類型 / 目標完了日</span><span>担当者</span><span>状態</span><span>資料状況</span><span className="cm-updated">更新日時</span></div>
      {visible.map(item => <article className="cm-row" key={item.id} onClick={() => props.onOpen(item.id)}>
        <button type="button" className="cm-row-open" onClick={event => { event.stopPropagation(); props.onOpen(item.id) }}><strong>{item.customerName}</strong><small>{item.code}{item.customerKana && ` · ${item.customerKana}`}</small><span className={`cm-case-title ${item.title === generatedCaseTitle(item.customerName, item.caseType.split(' / ').at(-1) ?? '') ? 'is-unset' : ''}`}>{item.title === generatedCaseTitle(item.customerName, item.caseType.split(' / ').at(-1) ?? '') ? '案件名未設定' : item.title}</span></button>
        <div className="cm-case-type"><span>{item.caseType}</span>{item.targetCompletionAt && <small>目標完了日 {item.targetCompletionAt.slice(0, 10)}</small>}</div>
        <div className="cm-assignee" onClick={event => event.stopPropagation()}>
          {props.canAssign ? <label><span className="sr-only">{item.customerName}の担当者</span><select disabled={props.assigningCaseId === item.id} value={item.assignedEmployeeId ?? ''} onChange={event => props.onAssign(item.id, event.target.value ? Number(event.target.value) : null)}><option value="">未割当</option>{item.assignedEmployeeId && !props.assignees.some(employee => employee.id === item.assignedEmployeeId) && <option value={item.assignedEmployeeId}>{item.assignee}</option>}{props.assignees.map(employee => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</select></label> : <span>{item.assignee}</span>}
          <small>{item.role}</small>
        </div>
        <div><span className={`cm-status cm-status--${item.status}`}><i aria-hidden="true" />{statusConfig[item.status].label}</span></div>
        <div className="cm-documents" title={item.memo}>{item.documentsTotal ? <><b>{item.documentsDone} <small>/ {item.documentsTotal}件</small></b><span>{item.memo}</span><div className="cm-progress"><span style={{ width: `${safeProgress(item.documentsDone, item.documentsTotal)}%` }}/></div></> : <span className="dc-meta">資料未登録</span>}</div>
        <time className="cm-updated" dateTime={item.rawUpdatedAt}>{item.updatedAt}</time>
      </article>)}
    </div>}
    <footer className="cm-footer"><span>{props.filteredCases.length ? (current - 1) * PAGE_SIZE + 1 : 0}–{Math.min(current * PAGE_SIZE, props.filteredCases.length)} / {props.filteredCases.length}件 · 1ページ10件</span><nav aria-label="案件のページ切り替え">
      <button type="button" aria-label="前のページ" disabled={current === 1 || props.loading} onClick={() => setPage(current - 1)}><ChevronLeft size={16}/></button>
      {Array.from({ length: pages }, (_, index) => index + 1).filter(number => Math.abs(number - current) <= 2).map(number => <button type="button" key={number} aria-current={number === current ? 'page' : undefined} onClick={() => setPage(number)}>{number}</button>)}
      <button type="button" aria-label="次のページ" disabled={current === pages || props.loading} onClick={() => setPage(current + 1)}><ChevronRight size={16}/></button>
    </nav></footer>
  </section></main>
}
