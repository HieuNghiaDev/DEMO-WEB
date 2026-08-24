import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FolderOpen,
  LockKeyhole,
  Plus,
  RefreshCw,
  Scale,
  Search,
  UserRoundCheck,
} from 'lucide-react'
import { safeProgress, statusConfig } from './helpers'
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
  { id: 'all', label: 'すべて' },
  { id: 'in_progress', label: '対応中' },
  { id: 'waiting', label: '書類待ち' },
  { id: 'reviewing', label: '確認中' },
  { id: 'documents_complete', label: '資料確認済み' },
]

export default function CaseListView(props: Props) {
  const [page, setPage] = useState(1)
  const activeCases = props.cases.filter((item) => item.status === 'in_progress').length
  const attentionCases = props.cases.filter((item) => item.status === 'waiting' || item.status === 'reviewing').length
  const completedCases = props.cases.filter((item) => item.status === 'completed').length
  const documentProgress = props.cases.reduce((total, item) => total + item.documentsTotal, 0)
  const confirmedDocuments = props.cases.reduce((total, item) => total + item.documentsDone, 0)
  const documentRate = safeProgress(confirmedDocuments, documentProgress)
  const counts: Record<CaseQuickFilter, number> = {
    all: props.cases.length,
    in_progress: props.cases.filter((item) => item.status === 'in_progress').length,
    waiting: props.cases.filter((item) => item.status === 'waiting').length,
    reviewing: props.cases.filter((item) => item.status === 'reviewing').length,
    documents_complete: props.cases.filter(
      (item) => item.documentsTotal > 0 && item.documentsDone === item.documentsTotal,
    ).length,
  }
  const pageCount = Math.max(1, Math.ceil(props.filteredCases.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const visibleCases = useMemo(
    () => props.filteredCases.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [currentPage, props.filteredCases],
  )

  useEffect(() => {
    const resetPage = window.setTimeout(() => setPage(1), 0)
    return () => window.clearTimeout(resetPage)
  }, [props.keyword, props.status, props.caseType, props.quickFilter])

  const rangeStart = props.filteredCases.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, props.filteredCases.length)

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden px-3 pb-10 pt-3 sm:px-4 lg:px-6 lg:pt-5">
      <header className="case-command-header relative mb-4 overflow-hidden rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_16px_42px_rgba(15,23,42,0.07)] dark:border-slate-700 dark:bg-[#111a2e] sm:mb-5 sm:rounded-[26px] sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full border border-indigo-100 dark:border-indigo-400/10" />
        <div className="pointer-events-none absolute right-16 top-7 h-24 w-24 rounded-full bg-indigo-100/55 blur-2xl dark:bg-indigo-500/10" />
        <div className="pointer-events-none absolute bottom-0 left-0 top-0 w-1.5 bg-gradient-to-b from-indigo-500 via-violet-500 to-sky-400" />
        <div className="relative flex flex-col gap-4 sm:gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-black tracking-[0.18em] text-indigo-600 dark:text-indigo-300">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-indigo-100 bg-indigo-50 text-indigo-600 shadow-sm dark:border-indigo-400/20 dark:bg-indigo-500/10 dark:text-indigo-300"><Scale size={13} /></span>
              THEMIS LEGAL OPERATIONS
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-x-2.5 gap-y-1 sm:mt-4 sm:gap-x-3">
              <h1 className="text-xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">案件コマンドセンター</h1>
              <span className="mb-0.5 rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[9px] font-extrabold text-indigo-600 dark:border-indigo-400/20 dark:bg-indigo-500/10 dark:text-indigo-300 sm:mb-1 sm:px-2.5 sm:py-1 sm:text-[10px]">CASE DESK</span>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400 sm:mt-2 sm:text-sm">顧客案件の状況、書類の進捗、次に必要な対応を一つの画面で把握します。</p>
          </div>
          <div className="flex gap-2 lg:pt-1">
            <button type="button" onClick={props.onRefresh} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 shadow-sm transition hover:-translate-y-px hover:border-indigo-200 hover:bg-indigo-50 active:scale-[.98] dark:border-slate-700 dark:bg-[#111a2e] dark:text-slate-300 dark:hover:bg-indigo-500/10 sm:flex-none">
              <RefreshCw size={15} /> 更新
            </button>
            <button type="button" disabled={!props.canCreate} onClick={props.onCreate} title={props.canCreate ? '新しい案件を登録' : 'レベル3以上の権限が必要です'} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 bg-[length:180%_100%] px-4 text-xs font-bold text-white shadow-md shadow-indigo-500/25 transition hover:-translate-y-px hover:bg-right hover:shadow-lg active:scale-[.98] disabled:cursor-not-allowed disabled:from-slate-300 disabled:via-slate-300 disabled:to-slate-300 disabled:shadow-none dark:disabled:from-slate-700 dark:disabled:via-slate-700 dark:disabled:to-slate-700 sm:flex-none">
              {props.canCreate ? <Plus size={16} /> : <LockKeyhole size={15} />} 新規案件
            </button>
          </div>
        </div>
        <div className="relative mt-4 grid grid-cols-2 gap-2 sm:mt-6 lg:grid-cols-4">
          <CommandMetric icon={<ClipboardList size={16}/>} label="管理中の案件" value={`${props.cases.length}`} note="現在のポートフォリオ" tone="indigo" />
          <CommandMetric icon={<Activity size={16}/>} label="対応中" value={`${activeCases}`} note="いま進行している案件" tone="sky" />
          <CommandMetric icon={<AlertTriangle size={16}/>} label="要確認" value={`${attentionCases}`} note="書類待ち・確認中" tone="amber" />
          <CommandMetric icon={<CheckCircle2 size={16}/>} label="書類の確認率" value={`${documentRate}%`} note={`${completedCases}件の案件を完了`} tone="emerald" />
        </div>
      </header>

      <section className="min-w-0 overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_16px_42px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-[#111a2e]">
        <div className="border-b border-slate-200 bg-slate-50/70 px-3 py-3 dark:border-slate-700 dark:bg-[#0c1527] sm:px-4">
          <div className="mb-2 flex items-center justify-between gap-3 px-1"><span className="text-[10px] font-black tracking-[0.15em] text-slate-400 dark:text-slate-500">CASE CONTROL</span><span className="text-[10px] font-bold text-indigo-500 dark:text-indigo-300">{props.filteredCases.length}件を表示</span></div>
          <div className="flex flex-wrap gap-2">
          <label className="relative basis-full sm:min-w-[260px] sm:flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={props.keyword} onChange={(event) => props.onKeywordChange(event.target.value)} placeholder="顧客名・案件番号・担当者を検索" className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-xs text-slate-700 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-[#111a2e] dark:text-slate-200 dark:focus:ring-indigo-500/20" />
          </label>
          <div className="grid basis-full grid-cols-2 gap-2 sm:min-w-[280px] sm:flex-1 lg:max-w-[430px]">
            <Select value={props.status} onChange={(value) => props.onStatusChange(value as 'all' | CaseStatus)}>
              <option value="all">すべてのステータス</option>
              {Object.entries(statusConfig).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}
            </Select>
            <Select value={props.caseType} onChange={props.onCaseTypeChange}>
              <option value="all">すべての案件種別</option>
              {props.caseTypes.map((type) => <option key={type}>{type}</option>)}
            </Select>
          </div>
          </div>
        </div>

        <div className="overflow-x-auto border-b border-slate-200 bg-white px-2 py-2 dark:border-slate-700 dark:bg-[#111a2e] sm:px-3">
          <div className="flex min-w-max gap-1 sm:min-w-0">
            {quickTabs.map((tab) => (
              <button key={tab.id} type="button" onClick={() => props.onQuickFilterChange(tab.id)} className={`relative min-w-28 flex-1 rounded-xl px-4 py-2.5 text-xs font-bold transition sm:min-w-0 ${props.quickFilter === tab.id ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20' : 'text-slate-500 hover:bg-indigo-50 hover:text-indigo-700 dark:text-slate-400 dark:hover:bg-indigo-500/[.08] dark:hover:text-indigo-300'}`}>
                {tab.label} <span className={`ml-1.5 ${props.quickFilter === tab.id ? 'text-white/80' : 'text-slate-400'}`}>({counts[tab.id]})</span>
              </button>
            ))}
          </div>
        </div>

        {props.loading && <StateBlock text="案件を読み込んでいます…" />}
        {props.error && <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{props.error}</div>}
        {!props.loading && !props.error && props.filteredCases.length === 0 && <EmptyState onCreate={props.canCreate ? props.onCreate : undefined} />}

        {!props.loading && !props.error && visibleCases.length > 0 && (
          <>
            <div className="hidden overflow-x-auto md:block">
              <div className="min-w-[1080px]">
                <div className="grid gap-3 border-b border-slate-200 bg-white px-5 py-3 text-[10px] font-bold text-slate-400 dark:border-slate-800 dark:bg-[#111a2e]" style={{ gridTemplateColumns: 'minmax(210px,1.25fr) minmax(130px,.7fr) minmax(150px,.8fr) minmax(155px,.9fr) 110px minmax(150px,.85fr) 110px 30px' }}>
                  <span>顧客名 / 案件番号</span><span>案件種別</span><span>担当者</span><span>必要書類の進捗</span><span>ステータス</span><span>メモ（最新）</span><span>最終更新</span><span />
                </div>
                <div>{visibleCases.map((item) => <CaseRow key={item.id} item={item} canAssign={props.canAssign} assignees={props.assignees} assigning={props.assigningCaseId === item.id} onOpen={props.onOpen} onAssign={props.onAssign} />)}</div>
              </div>
            </div>
            <div className="grid gap-3 p-3 md:hidden">{visibleCases.map((item) => <CaseCard key={item.id} item={item} onOpen={props.onOpen} />)}</div>
          </>
        )}

        <footer className="flex flex-col gap-3 border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-[#111a2e] sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[10px] font-semibold text-slate-400">1ページあたり <span className="ml-1 rounded-lg border border-slate-200 px-2 py-1 text-slate-600 dark:border-slate-700 dark:text-slate-300">{PAGE_SIZE}件</span></div>
          <div className="flex items-center justify-center gap-1.5">
            <PageButton disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={14} /></PageButton>
            {Array.from({ length: pageCount }, (_, index) => index + 1).slice(Math.max(0, currentPage - 3), Math.max(5, currentPage + 2)).map((number) => (
              <button key={number} type="button" onClick={() => setPage(number)} className={`h-8 min-w-8 rounded-lg px-2 text-[11px] font-bold transition ${currentPage === number ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/30' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}>{number}</button>
            ))}
            <PageButton disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}><ChevronRight size={14} /></PageButton>
          </div>
          <p className="text-right text-[10px] font-semibold text-slate-400">{rangeStart}-{rangeEnd} / {props.filteredCases.length}件</p>
        </footer>
      </section>
    </div>
  )
}

function CaseRow({ item, canAssign, assignees, assigning, onOpen, onAssign }: { item: BusinessCase; canAssign: boolean; assignees: AssigneeOption[]; assigning: boolean; onOpen: (id: number) => void; onAssign: (caseId: number, employeeId: number | null) => void }) {
  const progress = safeProgress(item.documentsDone, item.documentsTotal)
  return (
    <div role="button" tabIndex={0} onClick={() => onOpen(item.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(item.id) } }} className="case-file-card group relative grid w-full cursor-pointer items-center gap-3 overflow-hidden border-b border-slate-100 px-5 py-3 text-left outline-none last:border-b-0 hover:bg-indigo-50/40 focus-visible:bg-indigo-50/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400 dark:border-slate-800 dark:hover:bg-indigo-500/[0.035] dark:focus-visible:bg-indigo-500/[0.07]" style={{ gridTemplateColumns: 'minmax(210px,1.25fr) minmax(130px,.7fr) minmax(150px,.8fr) minmax(155px,.9fr) 110px minmax(150px,.85fr) 110px 30px' }}>
      <span className="absolute bottom-2 left-0 top-2 w-[3px] scale-y-0 rounded-r-full bg-indigo-500 transition-transform duration-300 group-hover:scale-y-100" />
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-sm font-black text-indigo-600 ring-1 ring-indigo-100 transition-transform duration-300 group-hover:scale-105 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20">{item.customerName.charAt(0)}</span>
        <span className="min-w-0"><span className="block truncate text-xs font-bold text-slate-900 group-hover:text-indigo-700 dark:text-white dark:group-hover:text-indigo-300">{item.customerName}</span>{item.customerKana && <span className="mt-0.5 block truncate text-[9px] text-slate-400">{item.customerKana}</span>}<span className="mt-0.5 block truncate text-[9px] font-semibold text-slate-400">{item.code}</span></span>
      </div>
      <div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{item.caseType}</p></div>
      <Assignee item={item} canAssign={canAssign} assignees={assignees} assigning={assigning} onAssign={onAssign} />
      <Progress done={item.documentsDone} total={item.documentsTotal} progress={progress} />
      <Status status={item.status} />
      <span className="truncate text-[11px] text-slate-500 dark:text-slate-400">{item.memo}</span>
      <span className="text-[9px] text-slate-400">{item.updatedAt}</span>
      <ChevronRight size={17} className="text-slate-300 transition-all duration-300 group-hover:translate-x-1 group-hover:text-indigo-500 dark:text-slate-700" />
    </div>
  )
}

function Assignee({ item, canAssign, assignees, assigning, onAssign }: { item: BusinessCase; canAssign: boolean; assignees: AssigneeOption[]; assigning: boolean; onAssign: (caseId: number, employeeId: number | null) => void }) {
  if (!canAssign) return <span className="flex min-w-0 items-center gap-2"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-300">{item.assignee.charAt(0)}</span><span className="min-w-0"><span className="block truncate text-[10px] font-bold text-slate-700 dark:text-slate-200">{item.assignee}</span><span className="block truncate text-[9px] text-slate-400">{item.role}</span></span></span>

  return <label className="relative block" onClick={(event) => event.stopPropagation()}><span className="sr-only">{item.customerName}の担当者</span><UserRoundCheck size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-indigo-400"/><select disabled={assigning} value={item.assignedEmployeeId ?? ''} onChange={(event) => onAssign(item.id, event.target.value ? Number(event.target.value) : null)} className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-7 pr-2 text-[10px] font-bold text-slate-600 outline-none transition hover:border-indigo-300 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-[#0c1527] dark:text-slate-200 dark:focus:ring-indigo-500/20"><option value="">未割当</option>{assignees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</select></label>
}

function CommandMetric({ icon, label, value, note, tone }: { icon: React.ReactNode; label: string; value: string; note: string; tone: 'indigo' | 'sky' | 'amber' | 'emerald' }) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20',
    sky: 'bg-sky-50 text-sky-600 ring-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/20',
    amber: 'bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20',
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20',
  } as const

  return <div className="group flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-100 bg-white/80 px-3 py-2.5 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md dark:border-slate-700/80 dark:bg-slate-950/20 dark:hover:border-indigo-500/35 sm:gap-3 sm:rounded-2xl sm:px-3.5 sm:py-3">
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 sm:h-9 sm:w-9 sm:rounded-xl ${tones[tone]}`}>{icon}</span>
    <span className="min-w-0"><span className="block truncate text-[9px] font-bold text-slate-400 dark:text-slate-500 sm:text-[10px]">{label}</span><span className="mt-0.5 block text-lg font-black tracking-tight text-slate-900 dark:text-white sm:text-xl">{value}</span><span className="mt-0.5 hidden truncate text-[9px] font-medium text-slate-400 dark:text-slate-500 sm:block">{note}</span></span>
  </div>
}

function CaseCard({ item, onOpen }: { item: BusinessCase; onOpen: (id: number) => void }) {
  const progress = safeProgress(item.documentsDone, item.documentsTotal)
  return (
    <button type="button" onClick={() => onOpen(item.id)} className="case-file-card group relative w-full overflow-hidden rounded-2xl border border-slate-300 bg-white p-4 text-left shadow-sm hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-500/40">
      <span className="absolute bottom-3 left-0 top-3 w-[3px] scale-y-0 rounded-r-full bg-indigo-500 transition-transform duration-300 group-hover:scale-y-100" />
      <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-sm font-black text-indigo-600 transition-transform duration-300 group-hover:scale-105 dark:bg-indigo-500/10 dark:text-indigo-300">{item.customerName.charAt(0)}</span><div className="min-w-0"><p className="truncate font-bold text-slate-900 transition-colors duration-300 group-hover:text-indigo-700 dark:text-white dark:group-hover:text-indigo-300">{item.customerName}</p><p className="mt-1 text-[10px] font-semibold text-indigo-500">{item.code}</p></div></div><Status status={item.status} /></div>
      <p className="mt-3 truncate text-xs font-semibold text-slate-600 dark:text-slate-300">{item.title}</p>
      <div className="mt-3 text-[10px]"><Info label="案件種別" value={item.caseType} /></div>
      <div className="mt-3"><Progress done={item.documentsDone} total={item.documentsTotal} progress={progress} /></div>
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-[10px] text-slate-400 dark:border-slate-800"><span className="truncate">{item.memo}</span><span className="shrink-0">{item.updatedAt}</span></div>
    </button>
  )
}

function Progress({ done, total, progress }: { done: number; total: number; progress: number }) {
  return <div><div className="flex items-center justify-between text-[9px]"><span className="font-bold text-slate-600 dark:text-slate-300">{done} / {total}</span><span className="text-slate-400">{progress}%</span></div><div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-violet-500 transition-all duration-500" style={{ width: `${progress}%` }} /></div></div>
}

function Status({ status }: { status: CaseStatus }) {
  const config = statusConfig[status]
  return <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-bold ${config.badge}`}><span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />{config.label}</span>
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-slate-400">{label}</p><p className="mt-1 truncate font-semibold text-slate-700 dark:text-slate-200">{value}</p></div>
}

function StateBlock({ text }: { text: string }) {
  return <div className="flex min-h-56 items-center justify-center px-4 text-center text-sm text-slate-500 dark:text-slate-400">{text}</div>
}

function EmptyState({ onCreate }: { onCreate?: () => void }) {
  return <div className="flex min-h-60 flex-col items-center justify-center px-4 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500 dark:bg-indigo-500/10"><FolderOpen size={26} /></span><p className="mt-4 text-sm font-bold text-slate-700 dark:text-slate-200">条件に一致する案件はありません。</p><p className="mt-1 text-xs text-slate-400">検索条件を変更するか、新しい案件を登録してください。</p>{onCreate && <button type="button" onClick={onCreate} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white"><Plus size={14} />新規案件</button>}</div>
}

function Select({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <label className="relative"><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-9 text-xs font-semibold text-slate-600 outline-none transition focus:border-indigo-400 dark:border-slate-700 dark:bg-[#111a2e] dark:text-slate-300">{children}</select><ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" /></label>
}

function PageButton({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-800">{children}</button>
}
