import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
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
    <div className="w-full min-w-0 max-w-full overflow-x-hidden px-4 pb-10 pt-5 sm:px-5 lg:px-6 xl:px-8">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" aria-labelledby="business-quest-title">
        <header className="px-4 pb-4 pt-5 sm:px-5 lg:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 border-l-2 border-indigo-500 pl-4">
              <div className="flex items-center gap-2 text-xs font-medium text-indigo-600 dark:text-indigo-300">
                <Scale size={15} aria-hidden="true" />
                案件管理
              </div>
              <h1 id="business-quest-title" className="mt-1.5 text-2xl font-semibold leading-tight tracking-tight text-slate-950 dark:text-slate-100 md:text-[28px]">業務クエスト</h1>
              <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">顧客案件の状況、必要書類、次に必要な対応を一元管理します。</p>
            </div>
            <div className="flex gap-2 sm:shrink-0">
              <button type="button" onClick={props.onRefresh} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors duration-150 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-400/50 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-200 sm:flex-none">
                <RefreshCw size={15} className="text-indigo-500 dark:text-indigo-300" aria-hidden="true" /> 最新データを取得
              </button>
              <button type="button" disabled={!props.canCreate} onClick={props.onCreate} title={props.canCreate ? '新しい案件を登録' : 'レベル3以上の権限が必要です'} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-indigo-500 dark:hover:bg-indigo-400 dark:disabled:bg-slate-700 sm:flex-none">
                {props.canCreate ? <Plus size={16} /> : <LockKeyhole size={15} />} 新規案件
              </button>
            </div>
          </div>
        </header>
        <div className="grid grid-cols-2 border-t border-slate-200 bg-slate-50/55 dark:border-slate-700 dark:bg-slate-950/25 sm:grid-cols-4 sm:divide-x sm:divide-slate-100 dark:sm:divide-slate-800">
          <CommandMetric icon={<ClipboardList size={18} />} label="管理中の案件" value={`${props.cases.length}`} tone="indigo" />
          <CommandMetric icon={<Activity size={18} />} label="対応中" value={`${activeCases}`} tone="sky" />
          <CommandMetric icon={<AlertTriangle size={18} />} label="要確認" value={`${attentionCases}`} tone="amber" />
          <CommandMetric icon={<CheckCircle2 size={18} />} label="書類の確認率" value={`${documentRate}%`} detail={`${completedCases}件完了`} tone="emerald" />
        </div>
      </section>

      <section className="mt-6 min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" aria-labelledby="case-data-title">
        <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-4 dark:border-slate-700 dark:bg-slate-900/70 sm:px-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div><h2 id="case-data-title" className="text-sm font-semibold text-slate-900 dark:text-slate-100">案件データ</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">全{props.cases.length}件中 {props.filteredCases.length}件を表示</p></div>
          </div>
          <div className="flex flex-wrap gap-2">
          <label className="relative basis-full sm:min-w-[260px] sm:flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={props.keyword} onChange={(event) => props.onKeywordChange(event.target.value)} placeholder="顧客名・案件番号・担当者を検索" className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500" />
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

        <div className="overflow-x-auto border-b border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900 sm:px-4">
          <div className="flex min-w-max gap-1 sm:min-w-0">
            {quickTabs.map((tab) => (
              <button key={tab.id} type="button" onClick={() => props.onQuickFilterChange(tab.id)} className={`relative min-w-28 flex-1 rounded-lg px-4 py-2.5 text-xs font-medium transition-colors duration-150 sm:min-w-0 ${props.quickFilter === tab.id ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-indigo-50 hover:text-indigo-700 dark:text-slate-400 dark:hover:bg-indigo-500/[.08] dark:hover:text-indigo-300'}`}>
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
                <div className="grid gap-3 border-b border-slate-200 bg-slate-50/45 px-5 py-3 text-[10px] font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950/20 dark:text-slate-400" style={{ gridTemplateColumns: 'minmax(210px,1.25fr) minmax(130px,.7fr) minmax(150px,.8fr) minmax(155px,.9fr) 110px minmax(150px,.85fr) 110px 30px' }}>
                  <span>顧客名 / 案件番号</span><span>案件種別</span><span>担当者</span><span>必要書類の進捗</span><span>ステータス</span><span>メモ（最新）</span><span>最終更新</span><span />
                </div>
                <div>{visibleCases.map((item) => <CaseRow key={item.id} item={item} canAssign={props.canAssign} assignees={props.assignees} assigning={props.assigningCaseId === item.id} onOpen={props.onOpen} onAssign={props.onAssign} />)}</div>
              </div>
            </div>
            <div className="grid gap-3 p-3 md:hidden">{visibleCases.map((item) => <CaseCard key={item.id} item={item} onOpen={props.onOpen} />)}</div>
          </>
        )}

        <footer className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/45 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/20 sm:flex-row sm:items-center sm:justify-between">
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
    <div role="button" tabIndex={0} onClick={() => onOpen(item.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(item.id) } }} className="group relative grid w-full cursor-pointer items-center gap-3 overflow-hidden border-b border-slate-100 px-5 py-3 text-left outline-none transition-colors duration-150 last:border-b-0 hover:bg-slate-50 focus-visible:bg-indigo-50/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400 dark:border-slate-800 dark:hover:bg-slate-800/35 dark:focus-visible:bg-indigo-500/[0.07]" style={{ gridTemplateColumns: 'minmax(210px,1.25fr) minmax(130px,.7fr) minmax(150px,.8fr) minmax(155px,.9fr) 110px minmax(150px,.85fr) 110px 30px' }}>
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

function CommandMetric({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string; detail?: string; tone: 'indigo' | 'sky' | 'amber' | 'emerald' }) {
  const tones = {
    indigo: { accent: 'bg-indigo-500', icon: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-300' },
    sky: { accent: 'bg-sky-500', icon: 'bg-sky-50 text-sky-600 dark:bg-sky-400/10 dark:text-sky-300' },
    amber: { accent: 'bg-amber-500', icon: 'bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300' },
    emerald: { accent: 'bg-emerald-500', icon: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300' },
  } as const

  return <div className="relative px-4 py-3.5 sm:px-5">
    <span className={`absolute inset-x-0 top-0 h-0.5 ${tones[tone].accent}`} aria-hidden="true" />
    <div className="flex items-center gap-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tones[tone].icon}`} aria-hidden="true">{icon}</span>
      <div className="min-w-0"><p className="text-2xl font-semibold tracking-tight tabular-nums text-slate-950 dark:text-white">{value}{detail && <span className="ml-1.5 text-xs font-medium text-slate-400 dark:text-slate-500">{detail}</span>}</p><p className="mt-0.5 truncate text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p></div>
    </div>
  </div>
}

function CaseCard({ item, onOpen }: { item: BusinessCase; onOpen: (id: number) => void }) {
  const progress = safeProgress(item.documentsDone, item.documentsTotal)
  return (
    <button type="button" onClick={() => onOpen(item.id)} className="group relative w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors duration-150 hover:border-indigo-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-500/40 dark:hover:bg-slate-800/35">
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

function Select({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <label className="relative"><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 pr-9 text-sm font-medium text-slate-700 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{children}</select><ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" /></label>
}

function PageButton({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-800">{children}</button>
}
