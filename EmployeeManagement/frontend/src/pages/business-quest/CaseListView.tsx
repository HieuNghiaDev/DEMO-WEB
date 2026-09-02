import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Briefcase, ChevronLeft, ChevronRight, Plus, RefreshCw, Search } from 'lucide-react'
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
const quickTabs: CaseQuickFilter[] = ['all', 'in_progress', 'waiting', 'reviewing', 'documents_complete']

const AVATAR_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e']
function getColorForName(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export default function CaseListView(props: Props) {
  const { t, i18n } = useTranslation()
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
  const statusLabel = (status: CaseStatus) => t(`cases.status.${status === 'in_progress' ? 'inProgress' : status === 'waiting_payment' ? 'waitingPayment' : status}`)
  const tabLabel = (tab: CaseQuickFilter) => t(`cases.list.${tab === 'documents_complete' ? 'documentsConfirmed' : tab === 'in_progress' ? 'inProgress' : tab === 'waiting' ? 'waitingDocuments' : tab}`)
  const caseTypeLabel = (value: string) => presentCaseType(value, t)
  const dateTime = (value: string) => new Intl.DateTimeFormat(i18n.language, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  return <main className="dc-preview cm-page"><section className="cm-surface" aria-label={t('cases.list.ariaLabel')}>
    <CasePageHeader title={t('cases.list.title')} description={t('cases.list.description')} kicker={<><Briefcase size={12}/>{t('cases.list.kicker')}</>} actions={<>
      <button type="button" className="dc-button" disabled={props.loading} onClick={props.onRefresh}><RefreshCw size={15}/>{t('cases.list.refresh')}</button>
      <button type="button" className="dc-button dc-primary" disabled={!props.canCreate} onClick={props.onCreate} title={!props.canCreate ? t('cases.list.createPermissionRequired') : undefined}><Plus size={15}/>{t('cases.list.create')}</button>
    </>}/>
    <CaseSummaryStrip items={[{ label: t('cases.list.total'), value: props.cases.length }, { label: t('cases.list.inProgress'), value: count('in_progress') }, { label: t('cases.list.needsAttention'), value: count('waiting') + count('reviewing') }, { label: t('cases.list.documentConfirmationRate'), value: totalDocuments ? `${safeProgress(confirmed, totalDocuments)}%` : '—' }]}/>
    <div className="cm-toolbar" aria-label={t('cases.list.filtersAria')}>
      <label className="cm-search-field"><span className="sr-only">{t('cases.list.searchAria')}</span><Search size={17} aria-hidden="true"/><input type="search" value={props.keyword} onChange={event => props.onKeywordChange(event.target.value)} placeholder={t('cases.list.searchPlaceholder')}/></label>
      <label><span>{t('cases.list.status')}</span><select value={props.status} onChange={event => props.onStatusChange(event.target.value as 'all' | CaseStatus)}><option value="all">{t('cases.list.allStatuses')}</option>{Object.keys(statusConfig).map(value => <option key={value} value={value}>{statusLabel(value as CaseStatus)}</option>)}</select></label>
      <label><span>{t('cases.list.caseType')}</span><select value={props.caseType} onChange={event => props.onCaseTypeChange(event.target.value)}><option value="all">{t('cases.list.allCaseTypes')}</option>{props.caseTypes.map(type => <option key={type} value={type}>{caseTypeLabel(type)}</option>)}</select></label>
    </div>
    <nav className="cm-quick" aria-label={t('cases.list.quickFiltersAria')}>{quickTabs.map(tab => <button type="button" key={tab} aria-pressed={tab === props.quickFilter} onClick={() => props.onQuickFilterChange(tab)}><span>{tabLabel(tab)}</span><b>{count(tab)}</b></button>)}</nav>
    {props.loading && <div className="cm-skeleton-list" role="status" aria-label={t('cases.list.loading')}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="cm-skeleton-row" style={{ animationDelay: `${i * 80}ms` }}>
          <div className="cm-sk-cell">
            <div className="cm-sk cm-sk--name"/>
            <div className="cm-sk cm-sk--badge"/>
            <div className="cm-sk cm-sk--sub"/>
          </div>
          <div className="cm-sk-cell">
            <div className="cm-sk cm-sk--tag"/>
            <div className="cm-sk cm-sk--date"/>
          </div>
          <div className="cm-sk-cell"><div className="cm-sk cm-sk--pill"/></div>
          <div className="cm-sk-cell"><div className="cm-sk cm-sk--status"/></div>
          <div className="cm-sk-cell">
            <div className="cm-sk cm-sk--doc"/>
            <div className="cm-sk cm-sk--bar"/>
          </div>
          <div className="cm-sk-cell"><div className="cm-sk cm-sk--time"/></div>
        </div>
      ))}
    </div>}
    {props.error && <p className="cm-message" role="alert">{props.error}</p>}
    {!props.loading && !props.error && !visible.length && <div className="cm-empty"><h2>{props.cases.length ? t('cases.list.noResults') : t('cases.list.noCases')}</h2><p className="dc-meta">{props.cases.length ? t('cases.list.changeSearch') : t('cases.list.createFirst')}</p>{props.canCreate && <button type="button" className="dc-button dc-primary" onClick={props.onCreate}><Plus size={15}/>{t('cases.list.create')}</button>}</div>}
    {!props.loading && !props.error && !!visible.length && <div className="cm-table">
      <div className="cm-table-head" aria-hidden="true"><span>{t('cases.list.clientAndCase')}</span><span>{t('cases.list.typeAndTargetDate')}</span><span>{t('cases.list.assignee')}</span><span>{t('cases.list.state')}</span><span>{t('cases.list.documentStatus')}</span><span className="cm-updated">{t('cases.list.updatedAt')}</span></div>
      {visible.map(item => <article className="cm-row" key={item.id} data-status={item.status} onClick={() => props.onOpen(item.id)}>
        <button type="button" className="cm-row-open" onClick={event => { event.stopPropagation(); props.onOpen(item.id) }}><strong><span className="cm-avatar-dot" style={{ backgroundColor: getColorForName(item.customerName) }}/>{item.customerName}</strong><small><span className="cm-case-code">{item.code}</span>{item.customerKana && <span className="cm-customer-kana">{item.customerKana}</span>}</small><span className={`cm-case-title ${item.title === generatedCaseTitle(item.customerName, item.caseType.split(' / ').at(-1) ?? '') ? 'is-unset' : ''}`}>{item.title === generatedCaseTitle(item.customerName, item.caseType.split(' / ').at(-1) ?? '') ? t('cases.list.untitled') : item.title}</span></button>
        <div className="cm-case-type"><span>{caseTypeLabel(item.caseType)}</span>{item.targetCompletionAt && <small>{t('cases.list.targetCompletion', { date: item.targetCompletionAt.slice(0, 10) })}</small>}</div>
        <div className="cm-assignee" onClick={event => event.stopPropagation()}>
          {props.canAssign ? <label><span className="sr-only">{t('cases.list.assignee')}：{item.customerName}</span><select disabled={props.assigningCaseId === item.id} value={item.assignedEmployeeId ?? ''} onChange={event => props.onAssign(item.id, event.target.value ? Number(event.target.value) : null)}><option value="">{t('cases.list.unassigned')}</option>{item.assignedEmployeeId && !props.assignees.some(employee => employee.id === item.assignedEmployeeId) && <option value={item.assignedEmployeeId}>{item.assignee}</option>}{props.assignees.map(employee => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</select></label> : <span>{item.assignedEmployeeId ? item.assignee : t('cases.list.unassigned')}</span>}
          <small>{item.role}</small>
        </div>
        <div><span className={`cm-status cm-status--${item.status}`}><i aria-hidden="true" />{statusLabel(item.status)}</span></div>
        <div className="cm-documents"><b>{item.documentsDone} <small>/ {item.documentsTotal}{t('cases.list.documentCountUnit')}</small></b><span>{item.documentsTotal === 0 ? t('cases.list.documentsUnregistered') : item.documentsDone === item.documentsTotal ? t('cases.list.documentsConfirmedDetail') : t('cases.list.documentsWaiting', { count: Math.max(0, item.documentsTotal - item.documentsDone) })}</span><div className="cm-progress"><span style={{ width: `${safeProgress(item.documentsDone, item.documentsTotal)}%` }}/></div></div>
        <time className="cm-updated" dateTime={item.rawUpdatedAt}>{dateTime(item.rawUpdatedAt)}</time>
      </article>)}
    </div>}
    <footer className="cm-footer"><span>{t('cases.list.pageSummary', { from: props.filteredCases.length ? (current - 1) * PAGE_SIZE + 1 : 0, to: Math.min(current * PAGE_SIZE, props.filteredCases.length), count: props.filteredCases.length, pageSize: PAGE_SIZE })}</span><nav aria-label={t('cases.list.paginationAria')}>
      <button type="button" aria-label={t('cases.list.previousPage')} disabled={current === 1 || props.loading} onClick={() => setPage(current - 1)}><ChevronLeft size={16}/></button>
      {Array.from({ length: pages }, (_, index) => index + 1).filter(number => Math.abs(number - current) <= 2).map(number => <button type="button" key={number} aria-current={number === current ? 'page' : undefined} onClick={() => setPage(number)}>{number}</button>)}
      <button type="button" aria-label={t('cases.list.nextPage')} disabled={current === pages || props.loading} onClick={() => setPage(current + 1)}><ChevronRight size={16}/></button>
    </nav></footer>
  </section></main>
}

function presentCaseType(value: string, t: (key: string) => string) {
  const [parent, ...children] = value.split(' / ')
  const translationKey = parent === '労災' ? 'cases.caseTypes.laborAccident' : parent === '交通事故' ? 'cases.caseTypes.trafficAccident' : null
  return translationKey ? [t(translationKey), ...children].join(' / ') : value
}
