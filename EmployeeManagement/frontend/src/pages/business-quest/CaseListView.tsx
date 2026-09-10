import { useEffect, useRef, useState } from 'react'
import {
  Briefcase,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  UserCheck,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CaseEmployee } from '../../features/case-management/types'
import { CasePageHeader } from '../../features/case-management/CasePrimitives'
import { safeProgress, statusConfig } from './helpers'
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
  assignees: CaseEmployee[]
  assigningCaseId: number | null
  onKeywordChange: (value: string) => void
  onStatusChange: (value: 'all' | CaseStatus) => void
  onCaseTypeChange: (value: string) => void
  onQuickFilterChange: (value: CaseQuickFilter) => void
  onRefresh: () => void
  onCreate: () => void
  onOpen: (id: number) => void
  onAssign: (id: number, employeeId: number | null) => void
}

const PAGE_SIZE = 10
const quickTabs: CaseQuickFilter[] = ['all', 'in_progress', 'waiting', 'reviewing', 'documents_complete']

export default function CaseListView(props: Props) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [activeMenuId, setActiveMenuId] = useState<number | null>(null)
  const [assigningCaseId, setAssigningCaseId] = useState<number | null>(null)
  const [isAdvancedFilterOpen, setIsAdvancedFilterOpen] = useState(false)
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
        setActiveMenuId(null)
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
    <div className="min-h-screen bg-[#F8FAFC] pb-16 text-slate-800 dark:bg-[#0B0F19] dark:text-slate-100" aria-label={t('cases.list.ariaLabel')}>
      <div className="mx-auto max-w-[1550px] px-6 pt-5 sm:px-8">
        <section className="cm-surface" aria-label={t('cases.list.ariaLabel')}>
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
      </div>

      {/* Main Workspace Area */}
      <main className="mx-auto max-w-[1550px] space-y-4 px-6 pt-5 sm:px-8">
        {/* 2. Compact KPI & Quick Status Filter Strip */}
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200/90 bg-white px-5 py-3 shadow-xs dark:border-slate-800 dark:bg-[#131B2E]">
          {/* Quick Filters */}
          <nav className="flex flex-wrap items-center gap-1 sm:gap-2" aria-label={t('cases.list.quickFiltersAria')}>
            {quickTabs.map((tab, index) => {
              const isSelected = tab === props.quickFilter
              return (
                <div key={tab} className="flex items-center">
                  {index > 0 && <div className="mx-2 h-4 w-px bg-slate-200 dark:bg-slate-700" />}
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => props.onQuickFilterChange(tab)}
                    className={`inline-flex items-center gap-1.5 py-1 px-1.5 text-xs font-medium transition ${
                      isSelected
                        ? 'font-bold text-[#2563EB] dark:text-blue-400'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    <span>{tabLabel(tab)}</span>
                    <span
                      className={`inline-flex h-4 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] tabular-nums ${
                        isSelected
                          ? 'bg-[#2563EB] font-bold text-white shadow-xs'
                          : 'bg-slate-100 font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {count(tab)}
                    </span>
                  </button>
                </div>
              )
            })}
          </nav>

          {/* Secondary KPI metric: Document Confirmation Rate */}
          <div className="flex items-center gap-3 self-end sm:self-auto">
            <div className="hidden h-5 w-px bg-slate-200 dark:bg-slate-700 lg:block" />
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">書類確認率</span>
            <span className="text-sm font-extrabold tabular-nums text-slate-900 dark:text-white">
              {docConfirmationRate}%
            </span>
            <div className="h-2.5 w-36 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-[#10B981] transition-all duration-500"
                style={{ width: `${docConfirmationRate}%` }}
              />
            </div>
          </div>
        </section>

        {/* 3. Search & Filter Bar */}
        <section className="flex flex-wrap items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative min-w-[280px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={props.keyword}
              onChange={event => props.onKeywordChange(event.target.value)}
              placeholder="依頼者・案件番号・担当者で検索..."
              className="h-10 w-full rounded-lg border border-slate-200/90 bg-white pl-10 pr-8 text-xs text-slate-800 shadow-2xs outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-[#131B2E] dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            {props.keyword && (
              <button
                type="button"
                onClick={() => props.onKeywordChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Dropdown Filters */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div className="relative">
              <select
                value={props.status}
                onChange={event => props.onStatusChange(event.target.value as 'all' | CaseStatus)}
                className="h-10 appearance-none rounded-lg border border-slate-200/90 bg-white pl-3.5 pr-8 text-xs font-medium text-slate-700 shadow-2xs outline-none transition focus:border-blue-500 dark:border-slate-800 dark:bg-[#131B2E] dark:text-slate-200 cursor-pointer"
              >
                <option value="all">{t('cases.list.allStatuses')}</option>
                {Object.keys(statusConfig).map(value => (
                  <option key={value} value={value}>{statusLabel(value as CaseStatus)}</option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>

            <div className="relative">
              <select
                value={props.caseType}
                onChange={event => props.onCaseTypeChange(event.target.value)}
                className="h-10 appearance-none rounded-lg border border-slate-200/90 bg-white pl-3.5 pr-8 text-xs font-medium text-slate-700 shadow-2xs outline-none transition focus:border-blue-500 dark:border-slate-800 dark:bg-[#131B2E] dark:text-slate-200 cursor-pointer"
              >
                <option value="all">{t('cases.list.allCaseTypes')}</option>
                {props.caseTypes.map(type => (
                  <option key={type} value={type}>{caseTypeLabel(type)}</option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>

            <button
              type="button"
              onClick={() => setIsAdvancedFilterOpen(!isAdvancedFilterOpen)}
              className={`inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200/90 bg-white px-4 text-xs font-medium text-slate-700 shadow-2xs transition hover:bg-slate-50 dark:border-slate-800 dark:bg-[#131B2E] dark:text-slate-200 dark:hover:bg-slate-800/60 ${
                isAdvancedFilterOpen ? 'border-blue-500 text-blue-600 bg-blue-50/40' : ''
              }`}
            >
              <SlidersHorizontal size={14} className={isAdvancedFilterOpen ? 'text-blue-500' : 'text-slate-400'} />
              <span>詳細条件</span>
            </button>
          </div>
        </section>

        {/* 4. Table / Customer Case List (Primary Visual Focus) */}
        <section className="relative overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xs dark:border-slate-800 dark:bg-[#131B2E]" ref={menuRef}>
          {props.loading && (
            <div className="p-8 text-center" role="status" aria-label={t('cases.list.loading')}>
              <RefreshCw size={24} className="mx-auto animate-spin text-indigo-500" />
              <p className="mt-2 text-xs text-slate-500">データを読み込み中...</p>
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
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200/80 bg-[#FAFBFD] text-xs font-bold text-slate-700 dark:border-slate-800 dark:bg-[#0F172A] dark:text-slate-300">
                  <tr>
                    <th scope="col" className="py-4 pl-6 pr-4">依頼者 / 案件</th>
                    <th scope="col" className="px-4 py-4">事件類型 / 目標完了日</th>
                    <th scope="col" className="px-4 py-4">担当者</th>
                    <th scope="col" className="px-4 py-4">状態</th>
                    <th scope="col" className="px-4 py-4">資料状況</th>
                    <th scope="col" className="px-4 py-4">更新日時</th>
                    <th scope="col" className="py-4 pl-4 pr-6 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {visible.map(item => {
                    const title = item.title === generatedCaseTitle(item.customerName, item.caseType.split(' / ').at(-1) ?? '') ? '案件名未設定' : item.title
                    const isAssigningThis = assigningCaseId === item.id
                    const isMenuActive = activeMenuId === item.id

                    return (
                      <tr
                        key={item.id}
                        data-status={item.status}
                        onClick={() => props.onOpen(item.id)}
                        className="group cursor-pointer transition hover:bg-[#F8FAFC] dark:hover:bg-white/[0.02]"
                      >
                        {/* 1. Client & Case */}
                        <td className="py-4 pl-6 pr-4">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-bold text-slate-900 transition-colors group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
                              {item.customerName}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                {item.code}
                              </span>
                              {item.customerKana && (
                                <span className="text-xs text-slate-400 dark:text-slate-500">
                                  {item.customerKana}
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-slate-400 dark:text-slate-500 leading-tight">
                              {title}
                            </span>
                          </div>
                        </td>

                        {/* 2. Type & Target Completion Date */}
                        <td className="px-4 py-4 align-middle">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                              {caseTypeLabel(item.caseType)}
                            </span>
                            {item.targetCompletionAt && (
                              <span className="text-xs text-slate-400 dark:text-slate-500">
                                {item.targetCompletionAt.slice(0, 10)}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 3. Assignee */}
                        <td className="relative px-4 py-4 align-middle" onClick={event => event.stopPropagation()}>
                          <div className="flex flex-col gap-0.5">
                            {props.canAssign ? (
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() => setAssigningCaseId(isAssigningThis ? null : item.id)}
                                  className="group/assign inline-flex items-center gap-1.5 text-left text-xs font-bold text-slate-800 transition hover:text-blue-600 dark:text-slate-200 dark:hover:text-blue-400"
                                >
                                  <span>{item.assignedEmployeeId ? item.assignee : '未割当'}</span>
                                  <ChevronDown size={12} className="text-slate-400 transition group-hover/assign:text-blue-600" />
                                </button>
                                <span className="block text-xs text-slate-400 dark:text-slate-500">
                                  {item.assignedEmployeeId ? item.role : '担当者'}
                                </span>

                                {/* Assignee Dropdown Popover */}
                                {isAssigningThis && (
                                  <div className="absolute left-0 top-full z-50 mt-1.5 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-[#1A2338]">
                                    <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 border-b border-slate-100 dark:border-slate-700/60">
                                      担当者を変更
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        props.onAssign(item.id, null)
                                        setAssigningCaseId(null)
                                      }}
                                      className="flex w-full items-center justify-between px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/50"
                                    >
                                      <span>未割当</span>
                                      {!item.assignedEmployeeId && <Check size={14} className="text-blue-600" />}
                                    </button>
                                    {props.assignees.map(emp => (
                                      <button
                                        key={emp.id}
                                        type="button"
                                        onClick={() => {
                                          props.onAssign(item.id, emp.id)
                                          setAssigningCaseId(null)
                                        }}
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
                                <span className="text-xs text-slate-400 dark:text-slate-500">
                                  {item.assignedEmployeeId ? item.role : '担当者'}
                                </span>
                              </>
                            )}
                          </div>
                        </td>

                        {/* 4. State Badge (Pixel-matched soft blue pill) */}
                        <td className="px-4 py-4 align-middle">
                          <span className="inline-flex items-center justify-center rounded-md bg-[#E0F2FE] px-3 py-1 text-xs font-semibold text-[#0284C7] dark:bg-sky-950/50 dark:text-sky-300">
                            {statusLabel(item.status)}
                          </span>
                        </td>

                        {/* 5. Document Progress */}
                        <td className="px-4 py-4 align-middle">
                          <div className="flex flex-col gap-1">
                            <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                              {item.documentsDone} / {item.documentsTotal}件
                            </div>
                            {item.documentsTotal > 0 ? (
                              <>
                                <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                  <div
                                    className="h-full rounded-full bg-sky-400 transition-all"
                                    style={{ width: `${safeProgress(item.documentsDone, item.documentsTotal)}%` }}
                                  />
                                </div>
                                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                  {item.documentsDone === item.documentsTotal
                                    ? '必要資料はすべて確認済み'
                                    : `未完了の必要資料 ${item.documentsTotal - item.documentsDone} 件`}
                                </span>
                              </>
                            ) : (
                              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                必要資料は未選択
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 6. Updated At */}
                        <td className="px-4 py-4 align-middle">
                          <time className="text-xs text-slate-600 dark:text-slate-400" dateTime={item.rawUpdatedAt}>
                            {dateTime(item.rawUpdatedAt)}
                          </time>
                        </td>

                        {/* 7. Action Button */}
                        <td className="relative py-4 pl-4 pr-6 text-right align-middle" onClick={event => event.stopPropagation()}>
                          <button
                            type="button"
                            aria-label="操作メニュー"
                            onClick={() => setActiveMenuId(isMenuActive ? null : item.id)}
                            className="inline-flex h-8 w-9 items-center justify-center rounded-lg border border-slate-200/90 bg-white text-slate-400 shadow-2xs transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-600 dark:border-slate-700 dark:bg-[#131B2E] dark:text-slate-400 dark:hover:bg-slate-800"
                          >
                            <MoreHorizontal size={16} />
                          </button>

                          {/* Action Dropdown Menu */}
                          {isMenuActive && (
                            <div className="absolute right-6 top-full z-50 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1.5 text-left shadow-lg dark:border-slate-700 dark:bg-[#1A2338]">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveMenuId(null)
                                  props.onOpen(item.id)
                                }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/50"
                              >
                                <ExternalLink size={13} className="text-slate-400" />
                                <span>詳細を見る</span>
                              </button>
                              {props.canAssign && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveMenuId(null)
                                    setAssigningCaseId(item.id)
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/50"
                                >
                                  <UserCheck size={13} className="text-slate-400" />
                                  <span>担当者を変更</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveMenuId(null)
                                  props.onOpen(item.id)
                                }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/50"
                              >
                                <Check size={13} className="text-emerald-500" />
                                <span>進捗を更新</span>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* 5. Pagination Footer */}
          <footer className="flex flex-col gap-3 border-t border-slate-100 bg-white px-6 py-3.5 text-xs text-slate-500 dark:border-slate-800 dark:bg-[#131B2E] dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
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
    </div>
  )
}

function presentCaseType(value: string, t: (key: string) => string) {
  const [parent, ...children] = value.split(' / ')
  const translationKey = parent === '労災' ? 'cases.caseTypes.laborAccident' : parent === '交通事故' ? 'cases.caseTypes.trafficAccident' : null
  return translationKey ? [t(translationKey), ...children].join(' / ') : value
}
