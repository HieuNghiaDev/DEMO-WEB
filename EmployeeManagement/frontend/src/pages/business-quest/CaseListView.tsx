import { useEffect, useRef, useState } from 'react'
import {
  Briefcase,
  Check,
  CircleAlert,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  Files,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  TimerReset,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CaseEmployee } from '../../features/case-management/types'
import { TableSkeleton } from '../../components/loading'
import { MetricCard, MetricStrip } from '../../components/ui'
import { CasePageHeader } from '../../features/case-management/CasePrimitives'
import { safeProgress, statusConfig } from './helpers'
import { generatedCaseTitle } from '../../features/case-management/helpers'
import type { BusinessCase, CaseQuickFilter, CaseStatus } from './types'
import CaseQuickViewDrawer from './CaseQuickViewDrawer'

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
  assignees: CaseEmployee[]
  assigningCaseId: number | null
  onKeywordChange: (value: string) => void
  onStatusChange: (value: 'all' | CaseStatus) => void
  onCaseTypeChange: (value: string) => void
  onQuickFilterChange: (value: CaseQuickFilter) => void
  onRefresh: () => void
  onCreate: () => void
  onOpen: (id: number) => void
  onOpenCollection: (id: number) => void
  onAssign: (id: number, employeeId: number | null) => void
}

const PAGE_SIZE = 10
const quickTabs: CaseQuickFilter[] = ['all', 'in_progress', 'waiting', 'reviewing', 'documents_complete']

export default function CaseListView(props: Props) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [assigningCaseId, setAssigningCaseId] = useState<number | null>(null)
  const [isAdvancedFilterOpen, setIsAdvancedFilterOpen] = useState(false)
  const [quickViewCase, setQuickViewCase] = useState<BusinessCase | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const pages = Math.max(1, Math.ceil(props.filteredCases.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const visible = props.filteredCases.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  useEffect(() => {
    const timer = window.setTimeout(() => setPage(1), 0)
    return () => window.clearTimeout(timer)
  }, [props.keyword, props.status, props.caseType, props.quickFilter])

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setAssigningCaseId(null)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const count = (id: CaseQuickFilter) =>
    props.cases.filter(item =>
      id === 'all' ||
      (id === 'documents_complete'
        ? item.documentsTotal > 0 && item.documentsDone === item.documentsTotal
        : item.status === id)
    ).length

  const totalDocuments = props.cases.reduce((total, item) => total + item.documentsTotal, 0)
  const confirmed = props.cases.reduce((total, item) => total + item.documentsDone, 0)
  const docConfirmationRate = totalDocuments ? safeProgress(confirmed, totalDocuments) : 29
  const inProgressCount = count('in_progress')
  const needsAttentionCount = count('waiting') + count('reviewing')

  const statusLabel = (status: CaseStatus) =>
    t(`cases.status.${status === 'in_progress' ? 'inProgress' : status === 'waiting_payment' ? 'waitingPayment' : status}`)
  const tabLabel = (tab: CaseQuickFilter) =>
    t(`cases.list.${tab === 'documents_complete' ? 'documentsConfirmed' : tab === 'in_progress' ? 'inProgress' : tab === 'waiting' ? 'waitingDocuments' : tab}`)
  const caseTypeLabel = (value: string) => presentCaseType(value, t)
  const dateTime = (value: string) => {
    try {
      const d = new Date(value)
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    } catch {
      return value
    }
  }

  return (
    <div className="cm-case-list-page min-h-screen pb-16 text-slate-800 dark:text-slate-100" aria-label={t('cases.list.ariaLabel')}>
      <div className="cm-case-list-shell">
        <section className="cm-case-list-hero" aria-label={t('cases.list.ariaLabel')}>
          <CasePageHeader
            title={t('cases.list.title')}
            description={t('cases.list.description')}
            kicker={<><Briefcase size={12} />{t('cases.list.kicker')}</>}
            showIllustration={false}
            actions={<>
              <button type="button" className="dc-button" disabled={props.loading} onClick={props.onRefresh}>
                <RefreshCw size={15} />{t('cases.list.refresh')}
              </button>
              <button type="button" className="dc-button dc-primary" disabled={!props.canCreate} onClick={props.onCreate} title={!props.canCreate ? t('cases.list.createPermissionRequired') : undefined}>
                <Plus size={15} />{t('cases.list.create')}
              </button>
            </>}
          />
        </section>

        <MetricStrip
          columns={4}
          title="案件サマリー"
          description="案件の進行状況を確認できます"
          className="mt-3.5"
        >
          <MetricCard label="全案件" value={props.cases.length} subtext="件" icon={<Files size={16} />} status="info" />
          <MetricCard label="対応中" value={inProgressCount} subtext="件" icon={<TimerReset size={16} />} status="info" />
          <MetricCard label="要確認" value={needsAttentionCount} subtext="件" icon={<CircleAlert size={16} />} status="warning" />
          <MetricCard label="書類確認率" value={`${docConfirmationRate}%`} icon={<FileCheck2 size={16} />} status="success" />
        </MetricStrip>
      </div>

      {/* Main Workspace Area */}
      <main className="cm-case-list-shell cm-case-list-workspace">
        {/* Search, filters and quick statuses share one operational toolbar. */}
        <section className="cm-case-toolbar">
          <div className="cm-case-toolbar-primary">
            <div className="relative min-w-0 flex-1">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={props.keyword}
                onChange={event => props.onKeywordChange(event.target.value)}
                placeholder="依頼者・案件番号・担当者で検索…"
                className="cm-case-control w-full pl-10 pr-9"
              />
              {props.keyword && (
                <button
                  type="button"
                  aria-label="検索語をクリア"
                  onClick={() => props.onKeywordChange('')}
                  className="cm-case-clear"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="cm-case-filter-controls">
              <div className="relative min-w-0">
                <select
                  aria-label="案件状態"
                  value={props.status}
                  onChange={event => props.onStatusChange(event.target.value as 'all' | CaseStatus)}
                  className="cm-case-control cm-case-select"
                >
                  <option value="all">{t('cases.list.allStatuses')}</option>
                  {Object.keys(statusConfig).map(value => (
                    <option key={value} value={value}>{statusLabel(value as CaseStatus)}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="cm-case-select-icon" />
              </div>

              <div className="relative min-w-0">
                <select
                  aria-label="事件類型"
                  value={props.caseType}
                  onChange={event => props.onCaseTypeChange(event.target.value)}
                  className="cm-case-control cm-case-select"
                >
                  <option value="all">{t('cases.list.allCaseTypes')}</option>
                  {props.caseTypes.map(type => (
                    <option key={type} value={type}>{caseTypeLabel(type)}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="cm-case-select-icon" />
              </div>

              <button
                type="button"
                aria-expanded={isAdvancedFilterOpen}
                onClick={() => setIsAdvancedFilterOpen(!isAdvancedFilterOpen)}
                className={`cm-case-filter-button ${isAdvancedFilterOpen ? 'is-active' : ''}`}
              >
                <SlidersHorizontal size={14} />
                <span>詳細条件</span>
              </button>
            </div>
          </div>

          <div className="cm-case-toolbar-secondary">
          {/* Quick Filters */}
          <nav className="cm-case-quick-filters" aria-label={t('cases.list.quickFiltersAria')}>
            {quickTabs.map(tab => {
              const isSelected = tab === props.quickFilter
              return (
                <button
                  key={tab}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => props.onQuickFilterChange(tab)}
                  className={`cm-case-quick-filter ${isSelected ? 'is-active' : ''}`}
                >
                  <span>{tabLabel(tab)}</span>
                  <span className="cm-case-quick-count">{count(tab)}</span>
                </button>
              )
            })}
          </nav>
            <span className="cm-case-result-count" aria-live="polite">
              表示中 <strong>{props.filteredCases.length}</strong> / {props.cases.length}件
            </span>
          </div>
        </section>

        {/* 4. Table / Customer Case List (Primary Visual Focus) */}
        <section className="cm-case-table" ref={menuRef}>
          {props.loading && (
            <div className="p-4 animate-in fade-in">
              <TableSkeleton rows={10} columns={7} className="border-0 shadow-none dark:bg-transparent" />
            </div>
          )}

          {props.error && (
            <p className="p-6 text-sm text-red-500" role="alert">{props.error}</p>
          )}

          {!props.loading && !props.error && !visible.length && (
            <div className="p-12 text-center">
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">
                {props.cases.length ? t('cases.list.noResults') : t('cases.list.noCases')}
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                {props.cases.length ? t('cases.list.changeSearch') : t('cases.list.createFirst')}
              </p>
              {props.canCreate && (
                <button
                  type="button"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#4338CA]"
                  onClick={props.onCreate}
                >
                  <Plus size={15} />
                  {t('cases.list.create')}
                </button>
              )}
            </div>
          )}

          {!props.loading && !props.error && !!visible.length && (
            <div className="cm-cc-scroll">
              {/* Column Headers */}
              <div className="cm-cc-grid cm-cc-header">
                <div>依頼者</div>
                <div>事件類型</div>
                <div>担当者</div>
                <div>状態</div>
                <div>資料状況</div>
                <div>更新日時</div>
                <div />
              </div>

              {/* Card Rows */}
              <div className="cm-cc-list">
                {visible.map(item => {
                  const title = item.title === generatedCaseTitle(item.customerName, item.caseType.split(' / ').at(-1) ?? '') ? null : item.title
                  const isAssigningThis = assigningCaseId === item.id
                  const statusCfg = statusConfig[item.status]
                  const initials = item.customerName.trim().split(/\s+/).slice(0, 2).map((w: string) => w.charAt(0).toUpperCase()).join('')
                  const docPct   = safeProgress(item.documentsDone, item.documentsTotal)
                  const docDone  = item.documentsTotal > 0 && item.documentsDone === item.documentsTotal
                  const isActive = item.status === 'in_progress'

                  const accentMap: Record<string, string> = {
                    received:        'bg-cyan-400',
                    in_progress:     'bg-indigo-500',
                    reviewing:       'bg-amber-400',
                    waiting:         'bg-orange-400',
                    waiting_payment: 'bg-violet-500',
                    completed:       'bg-emerald-500',
                  }

                  const avatarMap: Record<string, string> = {
                    received:        'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300',
                    in_progress:     'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300',
                    reviewing:       'bg-amber-50 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
                    waiting:         'bg-orange-50 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',
                    waiting_payment: 'bg-violet-50 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300',
                    completed:       'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
                  }

                  const progressFill = docDone
                    ? 'bg-emerald-500'
                    : docPct >= 60 ? 'bg-indigo-500'
                    : docPct > 0   ? 'bg-amber-400'
                    : 'bg-slate-300 dark:bg-slate-600'

                  return (
                    <div
                      key={item.id}
                      data-status={item.status}
                      onClick={() => props.onOpen(item.id)}
                      className="cm-cc-card group"
                    >
                      {/* Accent bar */}
                      <div className={`cm-cc-accent ${accentMap[item.status] ?? 'bg-slate-400'}`} />

                      {/* Grid body */}
                      <div className="cm-cc-body cm-cc-grid">

                        {/* 1. Client */}
                        <div className="cm-cc-client">
                          <div className={`cm-cc-avatar ${avatarMap[item.status] ?? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                            {initials || '?'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="cm-cc-client-name">{item.customerName}</span>
                            <div className="cm-cc-client-sub">
                              <span className="cm-cc-client-code">{item.code}</span>
                              {item.customerKana && (
                                <span className="cm-cc-client-kana">· {item.customerKana}</span>
                              )}
                            </div>
                            {title
                              ? <span className="cm-cc-client-title is-real">{title}</span>
                              : <span className="cm-cc-client-title">案件名未設定</span>
                            }
                          </div>
                        </div>

                        {/* 2. Case Type */}
                        <div>
                          <span className="cm-cc-type-tag">{caseTypeLabel(item.caseType)}</span>
                          {item.targetCompletionAt && (
                            <span className="cm-cc-target-date">目標: {item.targetCompletionAt.slice(0, 10)}</span>
                          )}
                        </div>

                        {/* 3. Assignee */}
                        <div className="relative" onClick={e => e.stopPropagation()}>
                          {props.canAssign ? (
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setAssigningCaseId(isAssigningThis ? null : item.id)}
                                className="group/assign inline-flex items-center gap-1 text-left text-xs font-bold text-slate-800 transition hover:text-[var(--tm-primary)] dark:text-slate-200 dark:hover:text-indigo-300"
                              >
                                <span>{item.assignedEmployeeId ? item.assignee : '未割当'}</span>
                                <ChevronDown size={11} className="text-slate-400 transition group-hover/assign:text-[var(--tm-primary)]" />
                              </button>
                              <span className="block text-[11px] text-slate-400 dark:text-slate-500">
                                {item.assignedEmployeeId ? item.role : '担当者'}
                              </span>
                              {isAssigningThis && (
                                <div className="absolute left-0 top-full z-50 mt-1.5 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-[#1A2338]">
                                  <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 border-b border-slate-100 dark:border-slate-700/60">担当者を変更</div>
                                  <button
                                    type="button"
                                    onClick={() => { props.onAssign(item.id, null); setAssigningCaseId(null) }}
                                    className="flex w-full items-center justify-between px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/50"
                                  >
                                    <span>未割当</span>
                                    {!item.assignedEmployeeId && <Check size={14} className="text-blue-600" />}
                                  </button>
                                  {props.assignees.map(emp => (
                                    <button
                                      key={emp.id}
                                      type="button"
                                      onClick={() => { props.onAssign(item.id, emp.id); setAssigningCaseId(null) }}
                                      className="flex w-full items-center justify-between px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/50"
                                    >
                                      <div className="flex flex-col text-left">
                                        <span className="font-semibold">{emp.full_name}</span>
                                        <span className="text-[10px] text-slate-400">{emp.position_title || '担当者'}</span>
                                      </div>
                                      {item.assignedEmployeeId === emp.id && <Check size={14} className="text-blue-600" />}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <>
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                {item.assignedEmployeeId ? item.assignee : '未割当'}
                              </span>
                              <span className="block text-[11px] text-slate-400 dark:text-slate-500">
                                {item.assignedEmployeeId ? item.role : '担当者'}
                              </span>
                            </>
                          )}
                        </div>

                        {/* 4. Status */}
                        <div>
                          <span className={`cm-cc-status ${statusCfg.badge}`}>
                            <span className={`cm-cc-dot ${statusCfg.dot} ${isActive ? 'animate-pulse' : ''}`} />
                            {statusLabel(item.status)}
                          </span>
                        </div>

                        {/* 5. Document Progress */}
                        <div>
                          <div className="flex items-baseline">
                            <span className={`cm-cc-prog-num ${docDone ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100'}`}>
                              {item.documentsDone}
                            </span>
                            <span className="cm-cc-prog-denom">/ {item.documentsTotal}件</span>
                          </div>
                          {item.documentsTotal > 0 ? (
                            <>
                              <div className="cm-cc-prog-track">
                                <div className={`cm-cc-prog-fill ${progressFill}`} style={{ width: `${docPct}%` }} />
                              </div>
                              <span className={`cm-cc-prog-label ${docDone ? '!text-emerald-600 dark:!text-emerald-400' : ''}`}>
                                {docDone ? '✓ 確認完了' : `残り ${item.documentsTotal - item.documentsDone} 件`}
                              </span>
                            </>
                          ) : (
                            <span className="cm-cc-prog-label">資料未選択</span>
                          )}
                        </div>

                        {/* 6. Date */}
                        <div>
                          <time className="cm-cc-date" dateTime={item.rawUpdatedAt}>
                            {dateTime(item.rawUpdatedAt)}
                          </time>
                        </div>

                        {/* 7. Action */}
                        <div className="flex justify-end" onClick={e => e.stopPropagation()}>
                          <button
                            type="button"
                            aria-label={`${item.customerName}の案件詳細を表示`}
                            title="案件詳細を表示"
                            onClick={() => setQuickViewCase(item)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/90 bg-white text-slate-400 shadow-2xs transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-600 dark:border-slate-700 dark:bg-[#131B2E] dark:text-slate-400 dark:hover:bg-slate-800"
                          >
                            <MoreHorizontal size={15} />
                          </button>
                        </div>

                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 5. Pagination Footeration Footer */}
          <footer className="cm-case-pagination flex flex-col gap-3 px-6 py-3.5 text-xs sm:flex-row sm:items-center sm:justify-between">
            <div className="font-medium text-slate-500 dark:text-slate-400">
              {props.filteredCases.length ? (current - 1) * PAGE_SIZE + 1 : 0}-{Math.min(current * PAGE_SIZE, props.filteredCases.length)} / {props.filteredCases.length}件・1ページ{PAGE_SIZE}件
            </div>
            <div className="flex items-center gap-3 self-end sm:self-auto">
              <nav className="flex items-center gap-1.5" aria-label={t('cases.list.paginationAria')}>
                <button
                  type="button"
                  aria-label={t('cases.list.previousPage')}
                  disabled={current === 1 || props.loading}
                  onClick={() => setPage(current - 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/90 bg-white text-slate-400 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-[#131B2E] dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: pages }, (_, index) => index + 1).filter(number => Math.abs(number - current) <= 2).map(number => (
                  <button
                    type="button"
                    key={number}
                    aria-current={number === current ? 'page' : undefined}
                    onClick={() => setPage(number)}
                    className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-semibold transition ${
                      number === current
                        ? 'bg-[#2563EB] font-bold text-white shadow-xs'
                        : 'border border-slate-200/90 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#131B2E] dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    {number}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label={t('cases.list.nextPage')}
                  disabled={current === pages || props.loading}
                  onClick={() => setPage(current + 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/90 bg-white text-slate-400 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-[#131B2E] dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  <ChevronRight size={14} />
                </button>
              </nav>
              <div className="relative">
                <select
                  disabled
                  className="h-8 appearance-none rounded-lg border border-slate-200/90 bg-white pl-3 pr-7 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-[#131B2E] dark:text-slate-300"
                >
                  <option>10件 / ページ</option>
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
          </footer>
        </section>
      </main>

      <CaseQuickViewDrawer
        caseItem={quickViewCase}
        onClose={() => setQuickViewCase(null)}
        onOpen={props.onOpen}
        onOpenCollection={props.onOpenCollection}
      />
    </div>
  )
}

function presentCaseType(value: string, t: (key: string) => string) {
  const [parent, ...children] = value.split(' / ')
  const translationKey = parent === '労災' ? 'cases.caseTypes.laborAccident' : parent === '交通事故' ? 'cases.caseTypes.trafficAccident' : null
  return translationKey ? [t(translationKey), ...children].join(' / ') : value
}
