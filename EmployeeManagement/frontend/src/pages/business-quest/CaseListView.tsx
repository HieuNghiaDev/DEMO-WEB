import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Briefcase,
  Car,
  Check,
  CircleAlert,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  FileText,
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
import { ButtonSpinner, KpiSkeletonValue, MobileCardSkeleton, Skeleton, TableSkeleton } from '../../components/loading'
import { CasePageHeader } from '../../features/case-management/CasePrimitives'
import { safeProgress, statusConfig } from './helpers'
import { generatedCaseTitle } from '../../features/case-management/helpers'
import type { BusinessCase, CaseQuickFilter, CaseStatus } from './types'
import CaseQuickViewDrawer from './CaseQuickViewDrawer'

type Props = {
  cases: BusinessCase[]
  filteredCases: BusinessCase[]
  loading: boolean
  refreshing: boolean
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
const ASSIGNEE_MENU_WIDTH = 224
const ASSIGNEE_MENU_VIEWPORT_GUTTER = 12
const quickTabs: CaseQuickFilter[] = ['all', 'in_progress', 'waiting', 'reviewing', 'documents_complete']

type AssigneeMenuPosition = {
  top: number
  left: number
  maxHeight: number
}

// Status accent color maps — shared between desktop and mobile
const accentMap: Record<string, string> = {
  received:        'bg-cyan-500',
  in_progress:     'bg-indigo-600',
  reviewing:       'bg-amber-500',
  waiting:         'bg-orange-500',
  waiting_payment: 'bg-violet-600',
  completed:       'bg-emerald-600',
}

const mobileAccentMap: Record<string, string> = {
  received:        'border-l-cyan-500',
  in_progress:     'border-l-indigo-600',
  reviewing:       'border-l-amber-500',
  waiting:         'border-l-orange-500',
  waiting_payment: 'border-l-violet-600',
  completed:       'border-l-emerald-600',
}

const avatarMap: Record<string, string> = {
  received:        'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/60 dark:text-cyan-200',
  in_progress:     'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200',
  reviewing:       'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200',
  waiting:         'bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-200',
  waiting_payment: 'bg-violet-100 text-violet-800 dark:bg-violet-900/60 dark:text-violet-200',
  completed:       'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200',
}

const DEFAULT_AVATAR = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'

export default function CaseListView(props: Props) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [assigningCaseId, setAssigningCaseId] = useState<number | null>(null)
  const [isAdvancedFilterOpen, setIsAdvancedFilterOpen] = useState(false)
  const [quickViewCase, setQuickViewCase] = useState<BusinessCase | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const assigneeMenuRef = useRef<HTMLDivElement | null>(null)
  const assigneeTriggerRefs = useRef(new Map<number, HTMLButtonElement>())
  const [assigneeMenuPosition, setAssigneeMenuPosition] = useState<AssigneeMenuPosition | null>(null)

  const pages = Math.max(1, Math.ceil(props.filteredCases.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const visible = props.filteredCases.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const assigningCase = visible.find((item) => item.id === assigningCaseId) ?? null

  useEffect(() => {
    const timer = window.setTimeout(() => setPage(1), 0)
    return () => window.clearTimeout(timer)
  }, [props.keyword, props.status, props.caseType, props.quickFilter])

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        !menuRef.current?.contains(e.target as Node)
        && !assigneeMenuRef.current?.contains(e.target as Node)
      ) {
        setAssigningCaseId(null)
      }
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAssigningCaseId(null)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  useLayoutEffect(() => {
    if (assigningCaseId === null) {
      setAssigneeMenuPosition(null)
      return
    }

    const updatePosition = () => {
      const trigger = assigneeTriggerRefs.current.get(assigningCaseId)
      const menu = assigneeMenuRef.current
      if (!trigger || !menu) return

      const triggerRect = trigger.getBoundingClientRect()
      if (!triggerRect.width || !triggerRect.height) {
        setAssigningCaseId(null)
        return
      }

      const menuHeight = Math.min(menu.scrollHeight || 280, 320)
      const availableBelow = window.innerHeight - triggerRect.bottom - ASSIGNEE_MENU_VIEWPORT_GUTTER - 8
      const availableAbove = triggerRect.top - ASSIGNEE_MENU_VIEWPORT_GUTTER - 8
      const opensUpward = availableBelow < Math.min(menuHeight, 220) && availableAbove > availableBelow
      const availableHeight = opensUpward ? availableAbove : availableBelow
      const maxHeight = Math.max(120, Math.min(320, availableHeight))
      const top = opensUpward
        ? Math.max(ASSIGNEE_MENU_VIEWPORT_GUTTER, triggerRect.top - 8 - Math.min(menuHeight, maxHeight))
        : triggerRect.bottom + 8
      const left = Math.min(
        Math.max(ASSIGNEE_MENU_VIEWPORT_GUTTER, triggerRect.left),
        window.innerWidth - ASSIGNEE_MENU_WIDTH - ASSIGNEE_MENU_VIEWPORT_GUTTER,
      )

      setAssigneeMenuPosition({ top, left, maxHeight })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [assigningCaseId])

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
    } catch { return value }
  }
  const shortDate = (value: string) => {
    try {
      const d = new Date(value)
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    } catch { return value }
  }

  return (
    <div className="cm-case-list-page" aria-label={t('cases.list.ariaLabel')}>

      {/* ── Page Header + KPI ─────────────────────────────────── */}
      <div className="cm-case-list-shell">
        <section className="cm-clv-hero" aria-label={t('cases.list.ariaLabel')}>
          <CasePageHeader
            title={t('cases.list.title')}
            description={t('cases.list.description')}
            kicker={<><Briefcase size={12} />{t('cases.list.kicker')}</>}
            showIllustration={false}
            actions={<>
              <button type="button" className="dc-button" disabled={props.refreshing} onClick={props.onRefresh}>
                {props.refreshing ? <ButtonSpinner size={14} /> : <RefreshCw size={14} />}{props.refreshing ? '更新中…' : t('cases.list.refresh')}
              </button>
              <button type="button" className="dc-button dc-primary" disabled={!props.canCreate} onClick={props.onCreate} title={!props.canCreate ? t('cases.list.createPermissionRequired') : undefined}>
                <Plus size={14} />{t('cases.list.create')}
              </button>
            </>}
          />
        </section>

        {/* ── KPI Strip ─────────────────────────────────────── */}
        <div className="cm-clv-kpi-strip" role="region" aria-label="案件サマリー">
          <div className="cm-clv-kpi-card cm-clv-kpi-indigo">
            <div className="cm-clv-kpi-icon"><Files size={14} /></div>
            <div className="cm-clv-kpi-body">
              <span className="cm-clv-kpi-label">全案件</span>
              <div className="cm-clv-kpi-value-row">
                {props.loading ? <KpiSkeletonValue /> : <><span className="cm-clv-kpi-num">{props.cases.length}</span><span className="cm-clv-kpi-unit">件</span></>}
              </div>
            </div>
          </div>

          <div className="cm-clv-kpi-card cm-clv-kpi-blue">
            <div className="cm-clv-kpi-icon"><TimerReset size={14} /></div>
            <div className="cm-clv-kpi-body">
              <span className="cm-clv-kpi-label">対応中</span>
              <div className="cm-clv-kpi-value-row">
                {props.loading ? <KpiSkeletonValue /> : <><span className="cm-clv-kpi-num">{inProgressCount}</span><span className="cm-clv-kpi-unit">件</span></>}
              </div>
            </div>
          </div>

          <div className="cm-clv-kpi-card cm-clv-kpi-amber">
            <div className="cm-clv-kpi-icon"><CircleAlert size={14} /></div>
            <div className="cm-clv-kpi-body">
              <span className="cm-clv-kpi-label">要確認</span>
              <div className="cm-clv-kpi-value-row">
                {props.loading ? <KpiSkeletonValue /> : <><span className="cm-clv-kpi-num">{needsAttentionCount}</span><span className="cm-clv-kpi-unit">件</span></>}
              </div>
            </div>
          </div>

          <div className="cm-clv-kpi-card cm-clv-kpi-teal">
            <div className="cm-clv-kpi-icon"><FileCheck2 size={14} /></div>
            <div className="cm-clv-kpi-body">
              <span className="cm-clv-kpi-label">書類確認率</span>
              <div className="cm-clv-kpi-value-row">
                {props.loading ? <KpiSkeletonValue /> : <span className="cm-clv-kpi-num">{docConfirmationRate}%</span>}
              </div>
              <div className="cm-clv-kpi-bar-track" aria-hidden="true">
              {props.loading ? <Skeleton className="h-full w-full rounded-full" /> : <div className="cm-clv-kpi-bar-fill" style={{ width: `${docConfirmationRate}%` }} />}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Workspace ──────────────────────────────────── */}
      <main className="cm-case-list-shell cm-case-list-workspace">

        {/* ── Toolbar ──────────────────────────────────────── */}
        <section className="cm-case-toolbar">
          <div className="cm-case-toolbar-primary">
            {/* Search */}
            <div className="relative min-w-0 flex-1">
              <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
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

            {/* Filters */}
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

          {/* Quick tabs + result count */}
          <div className="cm-case-toolbar-secondary">
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
                    {props.loading ? <Skeleton className="h-4 w-5 rounded-full" /> : <span className="cm-case-quick-count">{count(tab)}</span>}
                  </button>
                )
              })}
            </nav>
            <span className="cm-case-result-count" aria-live="polite">
              {props.loading ? <Skeleton className="inline-block h-4 w-16 align-middle" /> : <><strong>{props.filteredCases.length}</strong> / {props.cases.length}件</>}
            </span>
          </div>
        </section>

        {/* ── Case Table / Cards ─────────────────────────── */}
        <section className="cm-case-table" ref={menuRef}>
          {props.loading && <div className="p-4">
            <div className="cm-clv-desktop-only"><TableSkeleton rows={10} columns={7} className="border-0 shadow-none dark:bg-transparent" /></div>
            <MobileCardSkeleton className="cm-clv-mobile-only" rows={6} label="案件カードを読み込み中…" />
          </div>}

          {props.error && (
            <p className="p-6 text-sm text-red-500" role="alert">{props.error}</p>
          )}

          {!props.loading && !props.error && !visible.length && (
            <div className="px-6 py-14 text-center">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {props.cases.length ? t('cases.list.noResults') : t('cases.list.noCases')}
              </h2>
              <p className="mt-1.5 text-xs text-slate-400">
                {props.cases.length ? t('cases.list.changeSearch') : t('cases.list.createFirst')}
              </p>
              {props.canCreate && (
                <button
                  type="button"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-700 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-800"
                  onClick={props.onCreate}
                >
                  <Plus size={14} />
                  {t('cases.list.create')}
                </button>
              )}
            </div>
          )}

          {!props.loading && !props.error && !!visible.length && (<>

            {/* ══ DESKTOP TABLE — hidden below sm (640px) ════════════════ */}
            <div className="cm-clv-desktop-only cm-cc-scroll">

              {/* Column headers */}
              <div className="cm-cc-grid cm-cc-header">
                <div>依頼者</div>
                <div>事件類型</div>
                <div>担当者</div>
                <div>状態</div>
                <div>資料状況</div>
                <div>更新日時</div>
                <div />
              </div>

              {/* Rows */}
              <div className="cm-cc-list">
                {visible.map(item => {
                  const title = item.title === generatedCaseTitle(item.customerName, item.caseType.split(' / ').at(-1) ?? '') ? null : item.title
                  const isAssigningThis = assigningCaseId === item.id
                  const statusCfg = statusConfig[item.status]
                  const initials = item.customerName.trim().split(/\s+/).slice(0, 2).map((w: string) => w.charAt(0).toUpperCase()).join('')
                  const docPct   = safeProgress(item.documentsDone, item.documentsTotal)
                  const docDone  = item.documentsTotal > 0 && item.documentsDone === item.documentsTotal
                  const isActive = item.status === 'in_progress'

                  const progressFill = docDone
                    ? 'bg-emerald-500'
                    : docPct >= 60 ? 'bg-indigo-600'
                    : docPct >  0  ? 'bg-amber-500'
                    : 'bg-slate-200 dark:bg-slate-700'

                  return (
                    <div
                      key={item.id}
                      data-status={item.status}
                      onClick={() => props.onOpen(item.id)}
                      className="cm-cc-card group"
                    >
                      <div className={`cm-cc-accent ${accentMap[item.status] ?? 'bg-slate-400'}`} />
                      <div className="cm-cc-body cm-cc-grid">

                        {/* 1. Client */}
                        <div className="cm-cc-client">
                          <div className={`cm-cc-avatar ${avatarMap[item.status] ?? DEFAULT_AVATAR}`}>
                            {initials || '?'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="cm-cc-client-name">{item.customerName}</span>
                            <div className="cm-cc-client-sub">
                              <span className="cm-cc-client-code">{item.code}</span>
                              {item.customerKana && <span className="cm-cc-client-kana">· {item.customerKana}</span>}
                            </div>
                            {title
                              ? <span className="cm-cc-client-title is-real">{title}</span>
                              : <span className="cm-cc-client-title">案件名未設定</span>
                            }
                          </div>
                        </div>

                        {/* 2. Case Type */}
                        <div>
                          <CaseTypeBadge caseType={item.caseType} label={caseTypeLabel(item.caseType)} />
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
                                ref={(node) => {
                                  if (node) assigneeTriggerRefs.current.set(item.id, node)
                                  else assigneeTriggerRefs.current.delete(item.id)
                                }}
                                onClick={() => setAssigningCaseId(isAssigningThis ? null : item.id)}
                                className="group/assign inline-flex items-center gap-1 text-left text-xs font-bold text-slate-800 transition hover:text-indigo-700 dark:text-slate-100 dark:hover:text-indigo-300"
                                aria-haspopup="menu"
                                aria-expanded={isAssigningThis}
                                aria-controls={isAssigningThis ? `case-assignee-menu-${item.id}` : undefined}
                              >
                                <span>{item.assignedEmployeeId ? item.assignee : '未割当'}</span>
                                <ChevronDown size={11} className="text-slate-400 transition group-hover/assign:text-indigo-600" />
                              </button>
                              <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                                {item.assignedEmployeeId ? item.role : '担当者'}
                              </span>
                            </div>
                          ) : (
                            <>
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                                {item.assignedEmployeeId ? item.assignee : '未割当'}
                              </span>
                              <span className="block text-[11px] text-slate-500 dark:text-slate-400">
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

                        {/* 5. Doc progress */}
                        <div>
                          <div className="flex items-baseline gap-0.5">
                            <span className={`cm-cc-prog-num ${docDone ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100'}`}>
                              {item.documentsDone}
                            </span>
                            <span className="cm-cc-prog-denom">/ {item.documentsTotal}件</span>
                          </div>
                          {item.documentsTotal > 0 ? (
                            <>
                              <div className="cm-cc-prog-track">
                                <div className={`cm-cc-prog-fill ${progressFill}`} style={{ width: `${docPct}%` }} />
                              </div>
                              <span className={`cm-cc-prog-label ${docDone ? '!text-emerald-700 dark:!text-emerald-400' : ''}`}>
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
                            onClick={() => setQuickViewCase(item)}
                            className="cm-clv-row-action-btn"
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

            {/* ══ MOBILE CARD STACK — hidden at sm (640px) and above ════ */}
            <div className="cm-clv-mobile-only cm-mobile-list">
              {visible.map(item => {
                const statusCfg = statusConfig[item.status]
                const initials = item.customerName.trim().split(/\s+/).slice(0, 2).map((w: string) => w.charAt(0).toUpperCase()).join('')
                const docPct   = safeProgress(item.documentsDone, item.documentsTotal)
                const docDone  = item.documentsTotal > 0 && item.documentsDone === item.documentsTotal
                const isActive = item.status === 'in_progress'
                const progressFill = docDone
                  ? 'bg-emerald-500'
                  : docPct >= 60 ? 'bg-indigo-600'
                  : docPct >  0  ? 'bg-amber-500'
                  : 'bg-slate-200 dark:bg-slate-700'

                return (
                  <div
                    key={item.id}
                    onClick={() => props.onOpen(item.id)}
                    className={`cm-mobile-card border-l-4 ${mobileAccentMap[item.status] ?? 'border-l-slate-400'}`}
                  >
                    {/* Top row */}
                    <div className="cm-mobile-card-top">
                      {/* Left: avatar + name */}
                      <div className="cm-mobile-card-identity">
                        <div className={`cm-mobile-avatar ${avatarMap[item.status] ?? DEFAULT_AVATAR}`}>
                          {initials || '?'}
                        </div>
                        <div className="cm-mobile-card-name-block">
                          <p className="cm-mobile-client-name">{item.customerName}</p>
                          <p className="cm-mobile-case-code">{item.code}</p>
                        </div>
                      </div>
                      {/* Right: action only (status moved below) */}
                      <div onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          aria-label={`${item.customerName}の案件詳細を表示`}
                          onClick={() => setQuickViewCase(item)}
                          className="cm-mobile-action-btn"
                        >
                          <MoreHorizontal size={15} />
                        </button>
                      </div>
                    </div>

                    {/* Status + type row */}
                    <div className="cm-mobile-card-meta">
                      <span className={`cm-cc-status ${statusCfg.badge}`}>
                        <span className={`cm-cc-dot ${statusCfg.dot} ${isActive ? 'animate-pulse' : ''}`} />
                        {statusLabel(item.status)}
                      </span>
                      <CaseTypeBadge caseType={item.caseType} label={caseTypeLabel(item.caseType)} />
                    </div>

                    {/* Assignee */}
                    <div className="cm-mobile-card-assignee">
                      <span>担当:</span>
                      <span className="cm-mobile-card-assignee-name">
                        {item.assignedEmployeeId ? item.assignee : '未割当'}
                      </span>
                    </div>

                    {/* Document progress */}
                    {item.documentsTotal > 0 ? (
                      <div className="cm-mobile-card-progress">
                        <div className="cm-mobile-progress-header">
                          <span>書類</span>
                          <span className={docDone ? 'text-emerald-600 dark:text-emerald-400' : ''}>
                            {item.documentsDone}/{item.documentsTotal}件{docDone && ' ✓'}
                          </span>
                        </div>
                        <div className="cm-mobile-progress-track">
                          <div className={`cm-mobile-progress-fill ${progressFill}`} style={{ width: `${docPct}%` }} />
                        </div>
                      </div>
                    ) : (
                      <p className="cm-mobile-card-no-docs">資料未選択</p>
                    )}

                    {/* Footer */}
                    <div className="cm-mobile-card-footer">
                      <time className="cm-mobile-card-date" dateTime={item.rawUpdatedAt}>
                        更新 {shortDate(item.rawUpdatedAt)}
                      </time>
                    </div>
                  </div>
                )
              })}
            </div>

          </>)}

          {/* ── Pagination ──────────────────────────────────── */}
          <footer className="cm-case-pagination">
            {/* Desktop info */}
            <div className="cm-clv-pagination-info">
              {props.filteredCases.length ? (current - 1) * PAGE_SIZE + 1 : 0}–{Math.min(current * PAGE_SIZE, props.filteredCases.length)} / {props.filteredCases.length}件
            </div>

            <div className="cm-clv-pagination-controls">
              <nav className="cm-clv-pag-desktop" aria-label={t('cases.list.paginationAria')}>
                <button
                  type="button"
                  aria-label={t('cases.list.previousPage')}
                  disabled={current === 1 || props.loading}
                  onClick={() => setPage(current - 1)}
                  className="cm-clv-pag-btn"
                >
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: pages }, (_, index) => index + 1)
                  .filter(number => Math.abs(number - current) <= 2)
                  .map(number => (
                    <button
                      key={number}
                      type="button"
                      aria-current={number === current ? 'page' : undefined}
                      onClick={() => setPage(number)}
                      className={`cm-clv-pag-page ${number === current ? 'is-active' : ''}`}
                    >
                      {number}
                    </button>
                  ))}
                <button
                  type="button"
                  aria-label={t('cases.list.nextPage')}
                  disabled={current === pages || props.loading}
                  onClick={() => setPage(current + 1)}
                  className="cm-clv-pag-btn"
                >
                  <ChevronRight size={14} />
                </button>
              </nav>
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
      {assigningCase && createPortal(
        <div
          ref={assigneeMenuRef}
          id={`case-assignee-menu-${assigningCase.id}`}
          className="cm-clv-assignee-menu"
          role="menu"
          aria-label="担当者を変更"
          onClick={(event) => event.stopPropagation()}
          style={{
            top: assigneeMenuPosition?.top ?? -9999,
            left: assigneeMenuPosition?.left ?? -9999,
            maxHeight: assigneeMenuPosition?.maxHeight,
            visibility: assigneeMenuPosition ? 'visible' : 'hidden',
          }}
        >
          <div className="cm-clv-assignee-menu-title">担当者を変更</div>
          <button
            type="button"
            role="menuitem"
            onClick={() => { props.onAssign(assigningCase.id, null); setAssigningCaseId(null) }}
            className="cm-clv-assignee-menu-item"
          >
            <span>未割当</span>
            {!assigningCase.assignedEmployeeId && <Check size={14} className="text-indigo-600" />}
          </button>
          {props.assignees.map((employee) => (
            <button
              key={employee.id}
              type="button"
              role="menuitem"
              onClick={() => { props.onAssign(assigningCase.id, employee.id); setAssigningCaseId(null) }}
              className="cm-clv-assignee-menu-item"
            >
              <span className="cm-clv-assignee-menu-employee">
                <span>{employee.full_name}</span>
                <small>{employee.position_title || '担当者'}</small>
              </span>
              {assigningCase.assignedEmployeeId === employee.id && <Check size={14} className="text-indigo-600" />}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}

function presentCaseType(value: string, t: (key: string) => string) {
  const [parent, ...children] = value.split(' / ')
  const translationKey = parent === '労災' ? 'cases.caseTypes.laborAccident' : parent === '交通事故' ? 'cases.caseTypes.trafficAccident' : null
  return translationKey ? [t(translationKey), ...children].join(' / ') : value
}

export function CaseTypeBadge({ caseType, label, className = '' }: { caseType: string; label?: string; className?: string }) {
  const displayLabel = label ?? caseType
  const isLabor = caseType.startsWith('労災') || caseType.includes('労災')
  const isTraffic = caseType.startsWith('交通事故') || caseType.includes('交通事故')

  if (isLabor) {
    return (
      <span className={`cm-cc-type-badge cm-cc-type-badge--labor ${className}`}>
        <Briefcase size={12} className="cm-cc-type-icon" />
        <span>{displayLabel}</span>
      </span>
    )
  }

  if (isTraffic) {
    return (
      <span className={`cm-cc-type-badge cm-cc-type-badge--traffic ${className}`}>
        <Car size={12} className="cm-cc-type-icon" />
        <span>{displayLabel}</span>
      </span>
    )
  }

  return (
    <span className={`cm-cc-type-badge cm-cc-type-badge--other ${className}`}>
      <FileText size={12} className="cm-cc-type-icon" />
      <span>{displayLabel}</span>
    </span>
  )
}
