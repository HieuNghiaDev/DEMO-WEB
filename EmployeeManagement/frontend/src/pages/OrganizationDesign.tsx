import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import axios from 'axios'
import {
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coffee,
  Copy,
  LayoutGrid,
  LayoutList,
  MapPin,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Scale,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { ButtonSpinner, KpiSkeletonValue, LoadingOverlay, MobileCardSkeleton, Skeleton, TableSkeleton } from '../components/loading'
import { CasePageHeader } from '../features/case-management/CasePrimitives'
import '../features/case-management/caseManagement.css'

type WorkStatus = 'working' | 'break' | 'outside' | 'offline'

type CurrentTask = {
  id: number
  task_description: string
  status: 'pending' | 'accepted' | 'in_progress'
  started_at: string
  expected_end_at: string | null
}

type AttendanceInfo = {
  id: number
  clock_in: string
  outside_destination: string | null
  status: WorkStatus
  current_task: CurrentTask | null
}

type RoleOption = {
  id: number
  name: string
  display_name: string
}

type OrganizationEmployee = {
  id: number
  employee_code: string
  full_name: string
  full_name_kana: string | null
  position_title: string | null
  employment_type: string | null
  work_email: string | null
  avatar_path: string | null
  employee_status: string
  hire_date: string | null
  user_id: number | null
  roles: RoleOption[]

  office: {
    id: number
    office_code: string
    name: string
    address: string | null
  } | null

  department: {
    id: number
    department_code: string
    name: string
  } | null

  work_status: WorkStatus
  attendance: AttendanceInfo | null
}

type OrganizationResponse = {
  employees: OrganizationEmployee[]
  available_roles: RoleOption[]
}

const rolePresentation = {
  level_5: {
    icon: ShieldCheck,
    caption: 'SYSTEM ADMIN',
    iconClass: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300',
    selectedClass: 'border-rose-400 bg-rose-50/70 dark:border-rose-400/50 dark:bg-rose-500/10',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/25',
    checkClass: 'bg-rose-500 text-white',
  },
  level_4: {
    icon: UserCog,
    caption: 'MANAGEMENT',
    iconClass: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300',
    selectedClass: 'border-indigo-400 bg-indigo-50/70 dark:border-indigo-400/50 dark:bg-indigo-500/10',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/25',
    checkClass: 'bg-indigo-600 text-white',
  },
  level_3: {
    icon: Scale,
    caption: 'LEGAL PROFESSIONAL',
    iconClass: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300',
    selectedClass: 'border-blue-400 bg-blue-50/70 dark:border-blue-400/50 dark:bg-blue-500/10',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/25',
    checkClass: 'bg-blue-600 text-white',
  },
  level_2: {
    icon: BadgeCheck,
    caption: 'FULL-TIME STAFF',
    iconClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
    selectedClass: 'border-emerald-400 bg-emerald-50/70 dark:border-emerald-400/50 dark:bg-emerald-500/10',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/25',
    checkClass: 'bg-emerald-600 text-white',
  },
  level_1: {
    icon: Clock3,
    caption: 'PART-TIME STAFF',
    iconClass: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
    selectedClass: 'border-amber-400 bg-amber-50/70 dark:border-amber-400/50 dark:bg-amber-500/10',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/25',
    checkClass: 'bg-amber-500 text-white',
  },
} as const

const accessLevelGuide = {
  level_1: {
    title: 'レベル 1',
    summary: '基本業務',
    description: '自分の勤怠と割り当て業務を扱えます。',
    capabilities: ['自分の勤怠', '自分の業務', '資料の閲覧'],
  },
  level_2: {
    title: 'レベル 2',
    summary: '通常業務',
    description: '日常業務の記録・更新とAI利用ができます。',
    capabilities: ['勤怠表の出力', '資料の更新', 'AIの利用'],
  },
  level_3: {
    title: 'レベル 3',
    summary: '専門業務',
    description: '案件・資料を作成し、業務を依頼できます。',
    capabilities: ['案件の管理', '資料の作成', '業務の依頼'],
  },
  level_4: {
    title: 'レベル 4',
    summary: '運営管理',
    description: '社員・勤怠・承認を含む事務所運営を管理します。',
    capabilities: ['社員の管理', '全勤怠の管理', '承認の実行'],
  },
  level_5: {
    title: 'レベル 5',
    summary: 'システム管理',
    description: 'すべての機能とアクセス設定を管理できます。',
    capabilities: ['全機能へのアクセス', '権限の付与', '設定の管理'],
  },
} as const

const statusConfig: Record<
  WorkStatus,
  {
    label: string
    dot: string
    badge: string
  }
> = {
  working: {
    label: '勤務中',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50',
  },
  break: {
    label: '休憩中',
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50',
  },
  outside: {
    label: '外出中',
    dot: 'bg-blue-500',
    badge: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/50',
  },
  offline: {
    label: 'オフライン',
    dot: 'bg-slate-400 dark:bg-slate-500',
    badge: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  },
}

const statusAccentMap: Record<WorkStatus, string> = {
  working: 'bg-emerald-500',
  break: 'bg-amber-500',
  outside: 'bg-blue-500',
  offline: 'bg-slate-400',
}

const mobileAccentMap: Record<WorkStatus, string> = {
  working: 'border-l-emerald-500',
  break: 'border-l-amber-500',
  outside: 'border-l-blue-500',
  offline: 'border-l-slate-400',
}

const avatarMap: Record<WorkStatus, string> = {
  working: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  break: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  outside: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  offline: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

function formatTime(value?: string | null) {
  if (!value) return '--:--'
  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tokyo',
  }).format(new Date(value))
}

function formatDate(value?: string | null) {
  if (!value) return '未登録'
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(`${value}T00:00:00`))
}

function maskEmail(email: string) {
  const [name, domain] = email.split('@')
  if (!name || !domain) return email
  return `${name[0]}${'*'.repeat(Math.max(name.length - 1, 5))}@${domain}`
}

type AssignDuration = 30 | 60 | 120 | 'custom'

function formatTaskDuration(minutes: Exclude<AssignDuration, 'custom'>) {
  return minutes < 60 ? `${minutes}分` : `${minutes / 60}時間`
}

const questStatusLabel: Record<CurrentTask['status'], string> = {
  pending: '未確認',
  accepted: '受付済み',
  in_progress: '作業中',
}

const employmentTypeLabels: Record<string, string> = {
  full_time: '正社員',
  part_time: 'アルバイト',
  contract: '契約社員',
  intern: 'インターン',
}

const employmentTypeOptions = Object.entries(employmentTypeLabels)

const taskHours = Array.from({ length: 24 }, (_, hour) => hour)
const taskMinutes = Array.from({ length: 60 }, (_, minute) => minute)

const buildClosestTokyoDeadline = (hour: string, minute: string) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const toParts = (date: Date) =>
    Object.fromEntries(
      formatter
        .formatToParts(date)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    ) as Record<string, string>
  const today = toParts(new Date())
  const selectedAt = new Date(`${today.year}-${today.month}-${today.day}T${hour}:${minute}:00+09:00`)
  const deadline =
    selectedAt.getTime() <= Date.now()
      ? new Date(selectedAt.getTime() + 24 * 60 * 60 * 1000)
      : selectedAt
  const date = toParts(deadline)

  return `${date.year}-${date.month}-${date.day}T${hour}:${minute}:00`
}

const PAGE_SIZE = 10

export default function OrganizationDesign() {
  const { user } = useAuth()
  const [employees, setEmployees] = useState<OrganizationEmployee[]>([])
  const [availableRoles, setAvailableRoles] = useState<RoleOption[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedOfficeId, setSelectedOfficeId] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState<WorkStatus | 'all'>('all')
  const [roleFilter, setRoleFilter] = useState<string | 'all'>('all')
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table')
  const [page, setPage] = useState(1)

  // Modals & Panels
  const [selectedEmployee, setSelectedEmployee] = useState<OrganizationEmployee | null>(null)
  const [isAccessGuideOpen, setIsAccessGuideOpen] = useState(false)
  const [isCreateEmployeeOpen, setIsCreateEmployeeOpen] = useState(false)
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false)

  const loadOrganization = useCallback(async (manual = false) => {
    if (manual) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setErrorMessage('')

    try {
      const response = await api.get<OrganizationResponse>('/organization')
      setEmployees(response.data.employees)
      setAvailableRoles(response.data.available_roles)
    } catch (error) {
      setErrorMessage(
        axios.isAxiosError(error)
          ? error.response?.data?.message ?? '組織情報を取得できませんでした。'
          : '組織情報を取得できませんでした。',
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const initialLoadId = window.setTimeout(() => {
      void loadOrganization()
    }, 0)
    const intervalId = window.setInterval(() => {
      void loadOrganization(true)
    }, 30_000)
    return () => {
      window.clearTimeout(initialLoadId)
      window.clearInterval(intervalId)
    }
  }, [loadOrganization])

  const offices = useMemo(() => {
    const map = new Map<number, NonNullable<OrganizationEmployee['office']>>()
    employees.forEach((employee) => {
      if (employee.office) map.set(employee.office.id, employee.office)
    })
    return [...map.values()]
  }, [employees])

  // Summary counts based on office filter only
  const officeScopedEmployees = useMemo(() => {
    if (selectedOfficeId === null) return employees
    return employees.filter((e) => e.office?.id === selectedOfficeId)
  }, [employees, selectedOfficeId])

  const summary = useMemo(
    () => ({
      total: officeScopedEmployees.length,
      working: officeScopedEmployees.filter((e) => e.work_status === 'working').length,
      break: officeScopedEmployees.filter((e) => e.work_status === 'break').length,
      outside: officeScopedEmployees.filter((e) => e.work_status === 'outside').length,
      offline: officeScopedEmployees.filter((e) => e.work_status === 'offline').length,
    }),
    [officeScopedEmployees],
  )

  // Full filtered list
  const filteredEmployees = useMemo(() => {
    return employees
      .filter((employee) => {
        // Office filter
        if (selectedOfficeId !== null && employee.office?.id !== selectedOfficeId) {
          return false
        }
        // Status filter
        if (statusFilter !== 'all' && employee.work_status !== statusFilter) {
          return false
        }
        // Role filter
        if (roleFilter !== 'all') {
          const hasRole = employee.roles.some((r) => r.name === roleFilter)
          if (!hasRole) return false
        }
        // Search query
        if (searchQuery.trim()) {
          const query = searchQuery.trim().toLowerCase()
          const nameMatch = employee.full_name.toLowerCase().includes(query)
          const kanaMatch = employee.full_name_kana?.toLowerCase().includes(query)
          const codeMatch = employee.employee_code?.toLowerCase().includes(query)
          const titleMatch = employee.position_title?.toLowerCase().includes(query)
          const emailMatch = employee.work_email?.toLowerCase().includes(query)
          const officeMatch = employee.office?.name?.toLowerCase().includes(query)
          if (!nameMatch && !kanaMatch && !codeMatch && !titleMatch && !emailMatch && !officeMatch) {
            return false
          }
        }
        return true
      })
      .sort((a, b) => {
        const officeCompare = (a.office?.name ?? '').localeCompare(b.office?.name ?? '', 'ja')
        return officeCompare || a.full_name.localeCompare(b.full_name, 'ja')
      })
  }, [employees, selectedOfficeId, statusFilter, roleFilter, searchQuery])

  // Pagination calculation
  const pages = Math.max(1, Math.ceil(filteredEmployees.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const visibleEmployees = filteredEmployees.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  useEffect(() => {
    const timer = window.setTimeout(() => setPage(1), 0)
    return () => window.clearTimeout(timer)
  }, [searchQuery, selectedOfficeId, statusFilter, roleFilter])

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedOfficeId !== null ||
    statusFilter !== 'all' ||
    roleFilter !== 'all'

  const mobileFilterCount = Number(statusFilter !== 'all') + Number(roleFilter !== 'all')

  const resetAllFilters = () => {
    setSearchQuery('')
    setSelectedOfficeId(null)
    setStatusFilter('all')
    setRoleFilter('all')
  }

  const handleKpiStatusClick = (status: WorkStatus) => {
    setStatusFilter((curr) => (curr === status ? 'all' : status))
  }

  const metricValue = (value: number) => loading
    ? <KpiSkeletonValue />
    : <><span className="cm-clv-kpi-num">{value}</span><span className="cm-clv-kpi-unit">名</span></>

  return (
    <div className="cm-case-list-page cm-org-page min-h-screen pb-24 text-slate-800 sm:pb-20 xl:pb-16 dark:text-slate-100" aria-busy={loading || refreshing} aria-label="組織設計・社員管理">
      <LoadingOverlay isVisible={refreshing} label="組織データを更新しています…" className="rounded-xl" />

      {/* ── Page Header + KPI Strip ───────────────────────────── */}
      <div className="cm-case-list-shell">
        <section className="cm-clv-hero" aria-label="組織設計・社員管理">
          <CasePageHeader
            title="組織設計・社員管理"
            description="社員名簿、所属先、出勤状態、システムアクセス権限を一元的に管理・設定します。"
            kicker={<><Building2 size={12} /><span className="cm-org-kicker-short">人事・組織</span><span className="cm-org-kicker-full">THEMIS 人事・組織マネジメント</span></>}
            showIllustration={false}
            actions={<>
              <button
                type="button"
                className="dc-button"
                disabled={refreshing}
                aria-label={refreshing ? '組織データを更新中' : '最新取得'}
                title={refreshing ? '組織データを更新中' : '最新取得'}
                onClick={() => void loadOrganization(true)}
              >
                {refreshing ? <ButtonSpinner size={14} className="text-indigo-500" /> : <RefreshCw size={14} />}
                <span>{refreshing ? '更新中…' : '最新取得'}</span>
              </button>
              <button
                type="button"
                className="dc-button dc-primary"
                disabled={!user?.permission_names.includes('employee.create')}
                title={user?.permission_names.includes('employee.create') ? '新規社員を登録' : '社員登録の権限がありません'}
                onClick={() => setIsCreateEmployeeOpen(true)}
              >
                <Plus size={14} />
                <span>新規社員登録</span>
              </button>
            </>}
          />
        </section>

        {/* ── Compact 5-Card KPI Strip ─────────────────────────── */}
        <div className="cm-clv-kpi-strip is-5-cols" role="region" aria-label="勤務サマリー">
          {/* 全社員 */}
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`cm-clv-kpi-card cm-clv-kpi-indigo is-clickable ${statusFilter === 'all' ? 'is-active' : ''}`}
          >
            <div className="cm-clv-kpi-icon">
              <Users size={14} />
            </div>
            <div className="cm-clv-kpi-body">
              <span className="cm-clv-kpi-label">全社員</span>
              <div className="cm-clv-kpi-value-row">
                {metricValue(summary.total)}
              </div>
            </div>
          </button>

          {/* 勤務中 */}
          <button
            type="button"
            onClick={() => handleKpiStatusClick('working')}
            className={`cm-clv-kpi-card cm-clv-kpi-emerald is-clickable ${statusFilter === 'working' ? 'is-active' : ''}`}
          >
            <div className="cm-clv-kpi-icon">
              <BriefcaseBusiness size={14} />
            </div>
            <div className="cm-clv-kpi-body">
              <span className="cm-clv-kpi-label">勤務中</span>
              <div className="cm-clv-kpi-value-row">
                {metricValue(summary.working)}
              </div>
            </div>
          </button>

          {/* 休憩中 */}
          <button
            type="button"
            onClick={() => handleKpiStatusClick('break')}
            className={`cm-clv-kpi-card cm-clv-kpi-amber is-clickable ${statusFilter === 'break' ? 'is-active' : ''}`}
          >
            <div className="cm-clv-kpi-icon">
              <Coffee size={14} />
            </div>
            <div className="cm-clv-kpi-body">
              <span className="cm-clv-kpi-label">休憩中</span>
              <div className="cm-clv-kpi-value-row">
                {metricValue(summary.break)}
              </div>
            </div>
          </button>

          {/* 外出中 */}
          <button
            type="button"
            onClick={() => handleKpiStatusClick('outside')}
            className={`cm-clv-kpi-card cm-clv-kpi-blue is-clickable ${statusFilter === 'outside' ? 'is-active' : ''}`}
          >
            <div className="cm-clv-kpi-icon">
              <MapPin size={14} />
            </div>
            <div className="cm-clv-kpi-body">
              <span className="cm-clv-kpi-label">外出中</span>
              <div className="cm-clv-kpi-value-row">
                {metricValue(summary.outside)}
              </div>
            </div>
          </button>

          {/* オフライン */}
          <button
            type="button"
            onClick={() => handleKpiStatusClick('offline')}
            className={`cm-clv-kpi-card cm-clv-kpi-slate is-clickable ${statusFilter === 'offline' ? 'is-active' : ''}`}
          >
            <div className="cm-clv-kpi-icon">
              <UserRound size={14} />
            </div>
            <div className="cm-clv-kpi-body">
              <span className="cm-clv-kpi-label">オフライン</span>
              <div className="cm-clv-kpi-value-row">
                {metricValue(summary.offline)}
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* ── Main Workspace ──────────────────────────────────────── */}
      <main className="cm-case-list-shell cm-case-list-workspace">

        {/* Error message if any */}
        {errorMessage && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            {errorMessage}
          </div>
        )}

        {/* ── Access Level Guide (Compact Strip) ────────────────── */}
        <section className="cm-org-access-strip">
          <button
            type="button"
            aria-expanded={isAccessGuideOpen}
            onClick={() => setIsAccessGuideOpen((c) => !c)}
            className="cm-org-access-toggle"
          >
            <div className="flex items-center gap-2.5">
              <ShieldCheck size={16} className="text-indigo-600 dark:text-indigo-400" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                アクセスレベル権限表
              </span>
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                — 権限一覧を確認できます
              </span>
            </div>
            <span className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
              <span>{isAccessGuideOpen ? '閉じる' : '詳細を見る'}</span>
              <ChevronDown size={14} className={`transition-transform duration-200 ${isAccessGuideOpen ? 'rotate-180' : ''}`} />
            </span>
          </button>

          {isAccessGuideOpen && (
            <div className="border-t border-[var(--tm-border)] p-4 bg-[var(--tm-surface-elevated)]">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {Object.entries(accessLevelGuide).map(([levelKey, level]) => {
                  const visual = rolePresentation[levelKey as keyof typeof rolePresentation]
                  const Icon = visual.icon
                  return (
                    <div
                      key={levelKey}
                      className="rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface)] p-3 shadow-2xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${visual.iconClass}`}>
                          <Icon size={14} />
                        </span>
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{level.title}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">{level.summary}</p>
                        </div>
                      </div>
                      <p className="mt-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                        {level.description}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {level.capabilities.map((cap) => (
                          <span
                            key={cap}
                            className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                          >
                            {cap}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        {/* ── Search + Filter Toolbar ───────────────────────────── */}
        <section className="cm-case-toolbar">
          <div className="cm-case-toolbar-primary">
            {/* Search Box */}
            <div className="relative min-w-0 flex-1">
              <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="社員名・フリガナ・社員コード・役職・メールで検索..."
                className="cm-case-control w-full pl-10 pr-9"
              />
              <span className="cm-org-mobile-search-placeholder" aria-hidden="true">
                社員名・コードで検索
              </span>
              {searchQuery && (
                <button
                  type="button"
                  aria-label="検索語をクリア"
                  onClick={() => setSearchQuery('')}
                  className="cm-case-clear"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Filter controls */}
            <div className="cm-case-filter-controls">
              {/* Status filter select */}
              <div className="relative min-w-0 cm-case-select-status">
                <select
                  aria-label="勤務状態"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as WorkStatus | 'all')}
                  className="cm-case-control cm-case-select w-full"
                >
                  <option value="all">すべての勤務状態</option>
                  <option value="working">勤務中</option>
                  <option value="break">休憩中</option>
                  <option value="outside">外出中</option>
                  <option value="offline">オフライン</option>
                </select>
                <ChevronDown size={14} className="cm-case-select-icon" />
              </div>

              {/* Role filter select */}
              <div className="relative min-w-0 cm-case-select-role">
                <select
                  aria-label="アクセスレベル"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="cm-case-control cm-case-select w-full"
                >
                  <option value="all">すべてのアクセスレベル</option>
                  <option value="level_5">レベル 5 (システム管理)</option>
                  <option value="level_4">レベル 4 (運営管理)</option>
                  <option value="level_3">レベル 3 (専門業務)</option>
                  <option value="level_2">レベル 2 (通常業務)</option>
                  <option value="level_1">レベル 1 (基本業務)</option>
                </select>
                <ChevronDown size={14} className="cm-case-select-icon" />
              </div>

              {/* View Mode Toggle (Table / Grid) */}
              <div className="cm-view-toggle-group" role="group" aria-label="表示切り替え">
                <button
                  type="button"
                  aria-label="テーブル表示"
                  title="テーブル表示"
                  onClick={() => setViewMode('table')}
                  className={`cm-view-toggle-btn ${viewMode === 'table' ? 'is-active' : ''}`}
                >
                  <LayoutList size={14} />
                </button>
                <button
                  type="button"
                  aria-label="カード表示"
                  title="カード表示"
                  onClick={() => setViewMode('grid')}
                  className={`cm-view-toggle-btn ${viewMode === 'grid' ? 'is-active' : ''}`}
                >
                  <LayoutGrid size={14} />
                </button>
              </div>
            </div>
          </div>

          <div className="cm-org-mobile-filter-bar">
            <button
              type="button"
              className="cm-org-mobile-filter-trigger"
              aria-label="絞り込みを開く"
              aria-expanded={isMobileFilterOpen}
              onClick={() => setIsMobileFilterOpen(true)}
            >
              <SlidersHorizontal size={16} aria-hidden="true" />
              <span>フィルター</span>
              {mobileFilterCount > 0 && <span className="cm-org-mobile-filter-count">{mobileFilterCount}</span>}
              <ChevronDown size={15} aria-hidden="true" />
            </button>
          </div>

          {/* Secondary row: Office Tabs + Result Count */}
          <div className="cm-case-toolbar-secondary">
            <nav className="cm-case-quick-filters" aria-label="所属事務所フィルター">
              <button
                type="button"
                aria-pressed={selectedOfficeId === null}
                onClick={() => setSelectedOfficeId(null)}
                className={`cm-case-quick-filter ${selectedOfficeId === null ? 'is-active' : ''}`}
              >
                <span>全事務所</span>
                {loading ? <Skeleton className="h-4 w-5 rounded-full" /> : <span className="cm-case-quick-count">{employees.length}</span>}
              </button>

              {offices.map((office) => {
                const isSelected = selectedOfficeId === office.id
                const count = employees.filter((e) => e.office?.id === office.id).length
                return (
                  <button
                    key={office.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedOfficeId(isSelected ? null : office.id)}
                    className={`cm-case-quick-filter ${isSelected ? 'is-active' : ''}`}
                  >
                    <span>{office.name}</span>
                    <span className="cm-case-quick-count">{count}</span>
                  </button>
                )
              })}
            </nav>

            <span className="cm-case-result-count" aria-live="polite">
              {loading ? <Skeleton className="inline-block h-4 w-16 align-middle" /> : <>表示中 <strong>{filteredEmployees.length}</strong> / {employees.length}名</>}
            </span>
          </div>
        </section>

        {/* ── Employee List (Table / Cards) ─────────────────────── */}
        <section className="cm-case-table">
          {loading ? (
            <div className="p-4">
              <div className="cm-clv-desktop-only"><TableSkeleton rows={8} columns={7} className="border-0 shadow-none dark:bg-transparent" /></div>
              <MobileCardSkeleton className="cm-clv-mobile-only" rows={6} label="社員カードを読み込み中…" />
            </div>
          ) : filteredEmployees.length === 0 ? (
            <EmptyEmployeeState hasFilters={hasActiveFilters} onReset={resetAllFilters} />
          ) : viewMode === 'grid' ? (
            /* Grid View Mode */
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:p-5">
              {visibleEmployees.map((employee) => (
                <EmployeeGridCard
                  key={employee.id}
                  employee={employee}
                  onClick={() => setSelectedEmployee(employee)}
                />
              ))}
            </div>
          ) : (
            <>
              {/* ══ DESKTOP TABLE — hidden below sm (640px) ═══════ */}
              <div className="cm-clv-desktop-only cm-cc-scroll">
                {/* Column Headers */}
                <div className="cm-org-grid cm-cc-header">
                  <div>社員情報</div>
                  <div>所属事務所</div>
                  <div>役職・雇用区分</div>
                  <div>アクセス権限</div>
                  <div>勤務状況</div>
                  <div>現在の作業</div>
                  <div />
                </div>

                {/* Card Rows */}
                <div className="cm-cc-list">
                  {visibleEmployees.map((employee) => (
                    <EmployeeTableRow
                      key={employee.id}
                      employee={employee}
                      onClick={() => setSelectedEmployee(employee)}
                    />
                  ))}
                </div>
              </div>

              {/* ══ MOBILE CARD STACK — hidden at sm (640px) and above ═ */}
              <div className="cm-clv-mobile-only cm-mobile-list">
                {visibleEmployees.map((employee) => (
                  <EmployeeMobileCard
                    key={employee.id}
                    employee={employee}
                    onClick={() => setSelectedEmployee(employee)}
                  />
                ))}
              </div>
            </>
          )}

          {/* ── Pagination Footer ─────────────────────────────── */}
          {filteredEmployees.length > 0 && (
            <footer className="cm-case-pagination">
              <div className="cm-clv-pagination-info">
                {filteredEmployees.length ? (current - 1) * PAGE_SIZE + 1 : 0}–{Math.min(current * PAGE_SIZE, filteredEmployees.length)} / {filteredEmployees.length}名
              </div>

              <div className="cm-clv-pagination-controls">
                {/* Mobile compact pagination */}
                <nav className="cm-clv-mobile-only cm-clv-pag-mobile" aria-label="社員ページネーション">
                  <button
                    type="button"
                    aria-label="前のページ"
                    disabled={current === 1}
                    onClick={() => setPage(current - 1)}
                    className="cm-clv-pag-btn"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="cm-clv-pag-label">{current} / {pages}</span>
                  <button
                    type="button"
                    aria-label="次のページ"
                    disabled={current === pages}
                    onClick={() => setPage(current + 1)}
                    className="cm-clv-pag-btn"
                  >
                    <ChevronRight size={16} />
                  </button>
                </nav>

                {/* Desktop full pagination */}
                <nav className="cm-clv-desktop-only cm-clv-pag-desktop" aria-label="社員ページネーション">
                  <button
                    type="button"
                    aria-label="前のページ"
                    disabled={current === 1}
                    onClick={() => setPage(current - 1)}
                    className="cm-clv-pag-btn"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  {Array.from({ length: pages }, (_, index) => index + 1)
                    .filter((number) => Math.abs(number - current) <= 2)
                    .map((number) => (
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
                    aria-label="次のページ"
                    disabled={current === pages}
                    onClick={() => setPage(current + 1)}
                    className="cm-clv-pag-btn"
                  >
                    <ChevronRight size={14} />
                  </button>
                </nav>
              </div>
            </footer>
          )}
        </section>
      </main>

      {/* ── Create Employee Modal ──────────────────────────────── */}
      {isCreateEmployeeOpen && (
        <CreateEmployeeModal
          offices={offices}
          onClose={() => setIsCreateEmployeeOpen(false)}
          onCreated={() => {
            setIsCreateEmployeeOpen(false)
            void loadOrganization(true)
          }}
        />
      )}

      {/* ── Employee Detail Modal ──────────────────────────────── */}
      {selectedEmployee && (
        <EmployeeDetailModal
          key={selectedEmployee.id}
          employee={selectedEmployee}
          canAssignTasks={
            (user?.permission_names.includes('task.assign') ?? false)
            && selectedEmployee.id !== user?.employee_id
          }
          canManageRoles={user?.permission_names.includes('employee.manage_roles') ?? false}
          canUpdateEmployment={user?.permission_names.includes('employee.update') ?? false}
          canResetPassword={
            user?.role_names.some((role) => role === 'level_4' || role === 'level_5') ?? false
          }
          canEditRoles={selectedEmployee.user_id !== user?.id}
          availableRoles={availableRoles}
          onRolesUpdated={(roles) => {
            setEmployees((curr) =>
              curr.map((item) => (item.id === selectedEmployee.id ? { ...item, roles } : item)),
            )
            setSelectedEmployee((curr) => (curr?.id === selectedEmployee.id ? { ...curr, roles } : curr))
          }}
          onEmploymentUpdated={(employment) => {
            setEmployees((curr) =>
              curr.map((item) => (item.id === selectedEmployee.id ? { ...item, ...employment } : item)),
            )
            setSelectedEmployee((curr) =>
              curr?.id === selectedEmployee.id ? { ...curr, ...employment } : curr,
            )
          }}
          onClose={() => setSelectedEmployee(null)}
        />
      )}

      {isMobileFilterOpen && (
        <MobileFilterSheet
          roleFilter={roleFilter}
          statusFilter={statusFilter}
          onClear={() => {
            setStatusFilter('all')
            setRoleFilter('all')
          }}
          onClose={() => setIsMobileFilterOpen(false)}
          onRoleFilterChange={setRoleFilter}
          onStatusFilterChange={setStatusFilter}
        />
      )}
    </div>
  )
}

/* ========================================================================= */
/* Subcomponents                                                             */
/* ========================================================================= */

function EmployeeTableRow({
  employee,
  onClick,
}: {
  employee: OrganizationEmployee
  onClick: () => void
}) {
  const status = statusConfig[employee.work_status]
  const initial = employee.full_name.trim().charAt(0).toUpperCase() || '?'
  const isActive = employee.work_status === 'working'

  return (
    <div
      onClick={onClick}
      className="cm-cc-card group"
      data-status={employee.work_status}
    >
      {/* Accent bar */}
      <div className={`cm-cc-accent ${statusAccentMap[employee.work_status] ?? 'bg-slate-400'}`} />

      {/* Grid body */}
      <div className="cm-cc-body cm-org-grid">
        {/* 1. Identity */}
        <div className="cm-cc-client">
          <div className={`cm-cc-avatar relative ${avatarMap[employee.work_status]}`}>
            {initial}
            <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-slate-900 ${status.dot}`} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="cm-cc-client-name">{employee.full_name}</span>
            <div className="cm-cc-client-sub">
              <span className="cm-cc-client-code">{employee.employee_code}</span>
              {employee.full_name_kana && <span className="cm-cc-client-kana">· {employee.full_name_kana}</span>}
            </div>
          </div>
        </div>

        {/* 2. Office */}
        <div className="min-w-0">
          <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs truncate block">
            {employee.office?.name ?? '未登録'}
          </span>
          {employee.department?.name && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate block">
              {employee.department.name}
            </span>
          )}
        </div>

        {/* 3. Position & Employment */}
        <div className="min-w-0">
          <span className="cm-cc-type-tag truncate block max-w-fit">
            {employee.position_title ?? '役職未登録'}
          </span>
          <span className="block text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
            {employmentTypeLabels[employee.employment_type ?? ''] ?? '—'}
          </span>
        </div>

        {/* 4. Access Level */}
        <div>
          <AccessLevelBadge roles={employee.roles} />
        </div>

        {/* 5. Work Status */}
        <div>
          <span className={`cm-cc-status ${status.badge}`}>
            <span className={`cm-cc-dot ${status.dot} ${isActive ? 'animate-pulse' : ''}`} />
            {status.label}
          </span>
          {employee.attendance?.clock_in && (
            <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-400 font-medium">
              <Clock3 size={11} />
              <span>{formatTime(employee.attendance.clock_in)} 入室</span>
            </div>
          )}
        </div>

        {/* 6. Current Task */}
        <div className="min-w-0 pr-2">
          {employee.attendance?.current_task ? (
            <div>
              <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                {employee.attendance.current_task.task_description}
              </p>
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 mt-0.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                {questStatusLabel[employee.attendance.current_task.status] ?? '進行中'}
              </span>
            </div>
          ) : (
            <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
          )}
        </div>

        {/* 7. Action */}
        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            aria-label={`${employee.full_name}の詳細を表示`}
            onClick={onClick}
            className="cm-clv-row-action-btn"
            title="詳細を表示"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

function EmployeeMobileCard({
  employee,
  onClick,
}: {
  employee: OrganizationEmployee
  onClick: () => void
}) {
  const status = statusConfig[employee.work_status]
  const initial = employee.full_name.trim().charAt(0).toUpperCase() || '?'
  const isActive = employee.work_status === 'working'

  return (
    <div
      onClick={onClick}
      className={`cm-mobile-card border-l-4 ${mobileAccentMap[employee.work_status] ?? 'border-l-slate-400'}`}
    >
      {/* Top row: Identity + Action */}
      <div className="cm-mobile-card-top">
        <div className="cm-mobile-card-identity">
          <div className={`cm-mobile-avatar relative ${avatarMap[employee.work_status]}`}>
            {initial}
            <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-slate-900 ${status.dot}`} />
          </div>
          <div className="cm-mobile-card-name-block">
            <p className="cm-mobile-client-name">{employee.full_name}</p>
            <p className="cm-mobile-case-code">{employee.employee_code}</p>
            {employee.full_name_kana && <p className="cm-org-mobile-kana">{employee.full_name_kana}</p>}
          </div>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            aria-label={`${employee.full_name}の詳細を表示`}
            onClick={onClick}
            className="cm-mobile-action-btn"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div className="cm-org-mobile-office">
        <div className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
          <Building2 size={13} className="text-slate-400 shrink-0" />
          <span className="truncate">{employee.office?.name ?? '所属未登録'}</span>
        </div>
      </div>

      <div className="cm-org-mobile-badges">
        <span className="cm-cc-type-tag">{employmentTypeLabels[employee.employment_type ?? ''] ?? '雇用区分未登録'}</span>
        {employee.position_title && <span className="cm-org-mobile-position">{employee.position_title}</span>}
        <AccessLevelBadge roles={employee.roles} />
      </div>

      <div className="cm-org-mobile-status-row">
        <span className={`cm-cc-status ${status.badge}`}>
          <span className={`cm-cc-dot ${status.dot} ${isActive ? 'animate-pulse' : ''}`} />
          {status.label}
        </span>
        {employee.attendance?.clock_in && (
          <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-slate-400">
            <Clock3 size={12} />
            <span>{formatTime(employee.attendance.clock_in)} 入室</span>
          </span>
        )}
      </div>

      {/* Keep the card dense: an empty task must not reserve a meaningless row. */}
      {employee.attendance?.current_task && (
        <div className="mt-2.5 flex items-center justify-between border-t border-[var(--tm-border-subtle)] pt-2 text-xs">
          <span className="shrink-0 text-[11px] text-slate-400">現在の作業:</span>
          <span className="ml-3 truncate text-right text-[11px] font-semibold text-slate-700 dark:text-slate-300">
            {employee.attendance.current_task.task_description}
          </span>
        </div>
      )}
    </div>
  )
}

function EmployeeGridCard({
  employee,
  onClick,
}: {
  employee: OrganizationEmployee
  onClick: () => void
}) {
  const status = statusConfig[employee.work_status]
  const initial = employee.full_name.trim().charAt(0).toUpperCase() || '?'
  const isActive = employee.work_status === 'working'

  return (
    <div
      onClick={onClick}
      className={`cm-cc-card border-l-4 ${mobileAccentMap[employee.work_status] ?? 'border-l-slate-400'} flex flex-col justify-between p-4 cursor-pointer`}
    >
      <div>
        {/* Top bar: Avatar & Status */}
        <div className="flex items-start justify-between gap-2">
          <div className={`cm-cc-avatar relative ${avatarMap[employee.work_status]}`}>
            {initial}
            <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-slate-900 ${status.dot}`} />
          </div>

          <span className={`cm-cc-status ${status.badge}`}>
            <span className={`cm-cc-dot ${status.dot} ${isActive ? 'animate-pulse' : ''}`} />
            {status.label}
          </span>
        </div>

        {/* Employee name & code */}
        <div className="mt-3">
          <h3 className="cm-cc-client-name">{employee.full_name}</h3>
          <div className="cm-cc-client-sub mt-0.5">
            <span className="cm-cc-client-code">{employee.employee_code}</span>
            {employee.full_name_kana && <span className="cm-cc-client-kana">· {employee.full_name_kana}</span>}
          </div>
        </div>

        {/* Metadata */}
        <div className="mt-3 space-y-1.5 border-t border-[var(--tm-border-subtle)] pt-3 text-xs">
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <Building2 size={13} className="text-slate-400 shrink-0" />
            <span className="truncate font-medium">{employee.office?.name ?? '未登録'}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="cm-cc-type-tag truncate">
              {employee.position_title ?? '役職未登録'}
            </span>
            <span className="text-[10px] text-slate-400">
              ({employmentTypeLabels[employee.employment_type ?? ''] ?? '—'})
            </span>
          </div>

          <div className="pt-1">
            <AccessLevelBadge roles={employee.roles} />
          </div>
        </div>

        {/* Current Task if any */}
        {employee.attendance?.current_task && (
          <div className="mt-3 rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] p-2.5">
            <div className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              <span>{questStatusLabel[employee.attendance.current_task.status]}</span>
            </div>
            <p className="mt-0.5 truncate text-[11px] font-medium text-slate-700 dark:text-slate-200">
              {employee.attendance.current_task.task_description}
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-end border-t border-[var(--tm-border-subtle)] pt-2.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
        <span>プロフィールを開く</span>
        <ChevronRight size={13} />
      </div>
    </div>
  )
}

function AccessLevelBadge({ roles }: { roles: RoleOption[] }) {
  const role = roles[0]
  if (!role) {
    return <span className="text-[10px] font-medium text-slate-400">権限未設定</span>
  }

  const level = accessLevelGuide[role.name as keyof typeof accessLevelGuide]
  const visual = rolePresentation[role.name as keyof typeof rolePresentation]
  const Icon = visual?.icon ?? ShieldCheck

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${visual?.badgeClass ?? 'bg-slate-100 text-slate-700 border-slate-200'}`}>
      <Icon size={11} />
      <span>{level?.title ?? role.display_name}</span>
    </span>
  )
}

function EmptyEmployeeState({
  hasFilters,
  onReset,
}: {
  hasFilters: boolean
  onReset: () => void
}) {
  return (
    <div className="p-12 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800">
        <Users size={20} />
      </div>
      <h2 className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
        {hasFilters ? '条件に一致する社員が見つかりません' : '社員が登録されていません'}
      </h2>
      <p className="mt-1 text-xs text-slate-400">
        {hasFilters ? '検索キーワードまたは絞り込み条件を変更してください。' : '「新規社員登録」から新しい社員を追加してください。'}
      </p>
      {hasFilters && (
        <button
          type="button"
          onClick={onReset}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--tm-primary)] hover:bg-[var(--tm-surface-hover)] transition"
        >
          <RotateCcw size={13} />
          <span>絞り込み条件をリセット</span>
        </button>
      )}
    </div>
  )
}

function MobileFilterSheet({
  statusFilter,
  roleFilter,
  onStatusFilterChange,
  onRoleFilterChange,
  onClear,
  onClose,
}: {
  statusFilter: WorkStatus | 'all'
  roleFilter: string | 'all'
  onStatusFilterChange: (value: WorkStatus | 'all') => void
  onRoleFilterChange: (value: string | 'all') => void
  onClear: () => void
  onClose: () => void
}) {
  useOrganizationDialog(onClose)

  return createPortal(
    <div className="cm-org-mobile-filter-sheet" onClick={onClose}>
      <section
        aria-labelledby="mobile-filter-sheet-title"
        aria-modal="true"
        className="cm-org-mobile-filter-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="flex items-center justify-between border-b border-[var(--tm-border)] px-4 py-3">
          <div>
            <p className="text-[10px] font-bold tracking-[0.12em] text-[var(--tm-primary)]">EMPLOYEE DIRECTORY</p>
            <h2 className="mt-0.5 text-base font-bold text-[var(--tm-text-primary)]" id="mobile-filter-sheet-title">絞り込み</h2>
          </div>
          <button aria-label="絞り込みを閉じる" className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--tm-text-muted)] transition-colors hover:bg-[var(--tm-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </header>

        <div className="space-y-4 overflow-y-auto px-4 py-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-[var(--tm-text-secondary)]">勤務状態</span>
            <select aria-label="勤務状態" className="cm-org-mobile-filter-select" onChange={(event) => onStatusFilterChange(event.target.value as WorkStatus | 'all')} value={statusFilter}>
              <option value="all">すべての勤務状態</option>
              <option value="working">勤務中</option>
              <option value="break">休憩中</option>
              <option value="outside">外出中</option>
              <option value="offline">オフライン</option>
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-[var(--tm-text-secondary)]">アクセスレベル</span>
            <select aria-label="アクセスレベル" className="cm-org-mobile-filter-select" onChange={(event) => onRoleFilterChange(event.target.value)} value={roleFilter}>
              <option value="all">すべてのアクセスレベル</option>
              <option value="level_5">レベル 5 (システム管理)</option>
              <option value="level_4">レベル 4 (運営管理)</option>
              <option value="level_3">レベル 3 (専門業務)</option>
              <option value="level_2">レベル 2 (通常業務)</option>
              <option value="level_1">レベル 1 (基本業務)</option>
            </select>
          </label>
        </div>

        <footer className="flex gap-2 border-t border-[var(--tm-border)] px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3">
          <button className="flex h-11 flex-1 items-center justify-center rounded-lg border border-[var(--tm-border-strong)] bg-[var(--tm-surface)] text-sm font-semibold text-[var(--tm-text-secondary)] transition-colors hover:bg-[var(--tm-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" onClick={onClear} type="button">クリア</button>
          <button className="flex h-11 flex-1 items-center justify-center rounded-lg bg-[var(--tm-primary)] text-sm font-semibold text-white transition-colors hover:bg-[var(--tm-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2" onClick={onClose} type="button">適用する</button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}

/* ========================================================================= */
/* Employee Detail Modal (Tabbed Layout)                                     */
/* ========================================================================= */

type DetailTab = 'profile' | 'roles' | 'task' | 'account'

function useOrganizationDialog(onClose: () => void) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])
}

function EmployeeDetailModal({
  employee,
  canAssignTasks,
  canManageRoles,
  canUpdateEmployment,
  canResetPassword,
  canEditRoles,
  availableRoles,
  onRolesUpdated,
  onEmploymentUpdated,
  onClose,
}: {
  employee: OrganizationEmployee
  canAssignTasks: boolean
  canManageRoles: boolean
  canUpdateEmployment: boolean
  canResetPassword: boolean
  canEditRoles: boolean
  availableRoles: RoleOption[]
  onRolesUpdated: (roles: RoleOption[]) => void
  onEmploymentUpdated: (employment: Pick<OrganizationEmployee, 'position_title' | 'employment_type'>) => void
  onClose: () => void
}) {
  useOrganizationDialog(onClose)

  const [activeTab, setActiveTab] = useState<DetailTab>('profile')
  const [showEmail, setShowEmail] = useState(false)

  // Roles state
  const [roleIds, setRoleIds] = useState<number[]>(() => employee.roles.map((role) => role.id))
  const [savingRoles, setSavingRoles] = useState(false)
  const [rolesError, setRolesError] = useState('')
  const [rolesSuccess, setRolesSuccess] = useState('')

  // Employment state
  const [employmentType, setEmploymentType] = useState(employee.employment_type ?? 'full_time')
  const [savingEmployment, setSavingEmployment] = useState(false)
  const [employmentError, setEmploymentError] = useState('')
  const [employmentSuccess, setEmploymentSuccess] = useState('')

  // Task assignment state
  const [taskTitle, setTaskTitle] = useState('')
  const [taskNote, setTaskNote] = useState('')
  const [taskDuration, setTaskDuration] = useState<AssignDuration>(60)
  const [taskDeadlineHour, setTaskDeadlineHour] = useState('')
  const [taskDeadlineMinute, setTaskDeadlineMinute] = useState('')
  const [submittingTask, setSubmittingTask] = useState(false)
  const [taskError, setTaskError] = useState('')
  const [taskSuccess, setTaskSuccess] = useState('')

  // Password reset state
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetSuccess, setResetSuccess] = useState('')
  const [resettingPassword, setResettingPassword] = useState(false)

  const status = statusConfig[employee.work_status]
  const initial = employee.full_name.trim().charAt(0).toUpperCase() || '?'
  const isEmployeeOnline = employee.work_status !== 'offline' && employee.attendance !== null

  const toggleRole = (roleId: number) => {
    setRolesError('')
    setRolesSuccess('')
    setRoleIds([roleId])
  }

  const saveRoles = async () => {
    if (roleIds.length === 0 || savingRoles) return
    try {
      setSavingRoles(true)
      setRolesError('')
      setRolesSuccess('')
      const response = await api.put<{ roles: RoleOption[] }>(`/employees/${employee.id}/roles`, {
        role_ids: roleIds,
      })
      onRolesUpdated(response.data.roles)
      setRolesSuccess('アクセス権限を正常に更新しました。')
    } catch (error) {
      if (!axios.isAxiosError(error)) {
        setRolesError('権限を更新できませんでした。')
      } else {
        const msg = error.response?.data?.message ?? '権限を更新できませんでした。'
        setRolesError(typeof msg === 'string' ? msg : '権限更新に失敗しました。')
      }
    } finally {
      setSavingRoles(false)
    }
  }

  const saveEmployment = async () => {
    if (savingEmployment || employmentType === employee.employment_type) return
    try {
      setSavingEmployment(true)
      setEmploymentError('')
      setEmploymentSuccess('')
      const response = await api.put<{
        employee: Pick<OrganizationEmployee, 'position_title' | 'employment_type'>
      }>(`/employees/${employee.id}/employment`, {
        employment_type: employmentType,
      })
      onEmploymentUpdated(response.data.employee)
      setEmploymentSuccess('雇用区分を正常に更新しました。')
    } catch (error) {
      setEmploymentError(
        axios.isAxiosError(error)
          ? error.response?.data?.message ?? '雇用区分の更新に失敗しました。'
          : '雇用区分の更新に失敗しました。',
      )
    } finally {
      setSavingEmployment(false)
    }
  }

  const handleAssignTask = async () => {
    if (!taskTitle.trim() || submittingTask) return
    try {
      setSubmittingTask(true)
      setTaskError('')
      setTaskSuccess('')
      await api.post(`/employees/${employee.id}/tasks`, {
        title: taskTitle.trim(),
        description: taskNote.trim() || null,
        duration_minutes: taskDuration === 'custom' ? 60 : taskDuration,
        due_at: taskDuration === 'custom' ? buildClosestTokyoDeadline(taskDeadlineHour, taskDeadlineMinute) : null,
      })
      setTaskSuccess('業務を依頼しました。社員の画面へ即時通知されます。')
      setTaskTitle('')
      setTaskNote('')
    } catch (error) {
      setTaskError(
        axios.isAxiosError(error)
          ? error.response?.data?.message ?? '業務の依頼に失敗しました。'
          : 'サーバーとの通信に失敗しました。',
      )
    } finally {
      setSubmittingTask(false)
    }
  }

  const resetPassword = async () => {
    if (resettingPassword || !employee.user_id) return
    try {
      setResettingPassword(true)
      setResetError('')
      setResetSuccess('')
      setTemporaryPassword('')
      const response = await api.put<{ message: string; temporary_password: string }>(
        `/employees/${employee.id}/password-reset`,
      )
      setTemporaryPassword(response.data.temporary_password)
      setResetSuccess(response.data.message)
    } catch (error) {
      setResetError(
        axios.isAxiosError(error)
          ? error.response?.data?.message ?? 'パスワードのリセットに失敗しました。'
          : 'パスワードのリセットに失敗しました。',
      )
    } finally {
      setResettingPassword(false)
    }
  }

  const copyTemporaryPassword = async () => {
    if (!temporaryPassword) return
    try {
      await navigator.clipboard.writeText(temporaryPassword)
      setResetSuccess('仮パスワードをクリップボードにコピーしました。')
    } catch {
      setResetError('コピーに失敗しました。文字列を選択してコピーしてください。')
    }
  }

  return createPortal(
    <div
      className="organization-modal-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="organization-employee-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className="organization-modal-panel flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:max-h-[calc(100dvh-3rem)]"
      >
        {/* Header */}
        <header className="organization-dialog-header flex items-start justify-between border-b border-slate-100 p-4 dark:border-slate-800 sm:p-5">
          <div className="flex items-center gap-3.5">
            <div className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${avatarMap[employee.work_status]} text-base font-bold`}>
              {initial}
              <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-slate-900 ${status.dot}`} />
            </div>
            <div className="min-w-0">
              <div className="organization-dialog-title-line flex items-center gap-2">
                <h2 id="organization-employee-dialog-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">{employee.full_name}</h2>
                <span className="font-mono text-xs text-slate-400">({employee.employee_code})</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {employee.office?.name ?? '所属未登録'} ・ {employee.position_title ?? '役職未登録'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            autoFocus
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={18} />
          </button>
        </header>

        {/* Tab Navigation */}
        <nav role="tablist" aria-label="社員詳細" className="organization-dialog-tabs flex shrink-0 overflow-x-auto border-b border-slate-100 bg-slate-50/70 px-4 dark:border-slate-800 dark:bg-slate-950/20 sm:px-5">
          <TabButton
            label="基本情報"
            isActive={activeTab === 'profile'}
            onClick={() => setActiveTab('profile')}
          />
          <TabButton
            label="権限設定"
            isActive={activeTab === 'roles'}
            onClick={() => setActiveTab('roles')}
          />
          {canAssignTasks && (
            <TabButton
              label="業務依頼"
              isActive={activeTab === 'task'}
              onClick={() => setActiveTab('task')}
            />
          )}
          {canResetPassword && employee.user_id && (
            <TabButton
              label="アカウント管理"
              isActive={activeTab === 'account'}
              onClick={() => setActiveTab('account')}
            />
          )}
        </nav>

        {/* Body Content */}
        <div className="organization-modal-scroll flex-1 overflow-y-auto p-4 sm:p-5">
          {/* TAB 1: Profile & Employment */}
          {activeTab === 'profile' && (
            <div className="space-y-4">
              {/* Live Attendance Banner */}
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                <div>
                  <span className="text-[10px] font-medium text-slate-400">本日の勤務状況</span>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${status.badge}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                      <span>{status.label}</span>
                    </span>
                    {employee.attendance?.clock_in && (
                      <span className="text-xs text-slate-600 dark:text-slate-300">
                        {formatTime(employee.attendance.clock_in)} 入室
                      </span>
                    )}
                  </div>
                </div>

                {employee.attendance?.outside_destination && (
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400">外出先</span>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {employee.attendance.outside_destination}
                    </p>
                  </div>
                )}
              </div>

              {/* Profile Details Grid */}
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailItem label="社員氏名（カナ）" value={employee.full_name_kana || '未登録'} />
                <DetailItem label="社員コード" value={employee.employee_code} />
                <DetailItem label="所属事務所" value={employee.office?.name || '未登録'} />
                <DetailItem label="所属部署" value={employee.department?.name || '未登録'} />
                <DetailItem label="役職" value={employee.position_title || '未登録'} />
                <DetailItem label="入社日" value={formatDate(employee.hire_date)} />
              </div>

              {/* Contact Information */}
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <span className="text-[10px] font-medium text-slate-400">業務用メールアドレス</span>
                <div className="mt-1 flex items-center justify-between">
                  <p className="font-mono text-xs text-slate-700 dark:text-slate-300">
                    {employee.work_email
                      ? showEmail
                        ? employee.work_email
                        : maskEmail(employee.work_email)
                      : '未登録'}
                  </p>
                  {employee.work_email && (
                    <button
                      type="button"
                      onClick={() => setShowEmail((c) => !c)}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                    >
                      {showEmail ? '隠す' : '表示'}
                    </button>
                  )}
                </div>
              </div>

              {/* Employment Type Editor (if permitted) */}
              {canUpdateEmployment ? (
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">雇用区分の設定</h4>
                      <p className="text-[10px] text-slate-400">契約形態・勤務体系の区分を更新します</p>
                    </div>
                    <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                      {employmentTypeLabels[employee.employment_type ?? ''] ?? '未登録'}
                    </span>
                  </div>

                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {employmentTypeOptions.map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setEmploymentType(key)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                          employmentType === key
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500/20 dark:bg-indigo-950/30 dark:text-indigo-300'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {employmentError && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{employmentError}</p>}
                  {employmentSuccess && <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">{employmentSuccess}</p>}

                  {employmentType !== employee.employment_type && (
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        disabled={savingEmployment}
                        onClick={() => void saveEmployment()}
                        className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {savingEmployment ? <ButtonSpinner size={12} /> : <Check size={12} />}
                        <span>雇用区分を保存</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <DetailItem
                  label="雇用区分"
                  value={employmentTypeLabels[employee.employment_type ?? ''] ?? '未登録'}
                />
              )}
            </div>
          )}

          {/* TAB 2: Roles & Permissions */}
          {activeTab === 'roles' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  システムアクセス権限（ロール）
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  社員に割り当てる権限レベルを選択します。職責に応じた最小限の権限を設定してください。
                </p>
              </div>

              {!canEditRoles && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300">
                  自分自身の権限は変更できません。
                </div>
              )}

              <div className="space-y-2">
                {availableRoles.map((role) => {
                  const levelKey = role.name as keyof typeof accessLevelGuide
                  const guide = accessLevelGuide[levelKey]
                  const visual = rolePresentation[levelKey as keyof typeof rolePresentation]
                  const Icon = visual?.icon ?? ShieldCheck
                  const isChecked = roleIds.includes(role.id)

                  return (
                    <div
                      key={role.id}
                      onClick={() => canManageRoles && canEditRoles && toggleRole(role.id)}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                        isChecked
                          ? visual?.selectedClass ?? 'border-indigo-400 bg-indigo-50/70 dark:border-indigo-400/50 dark:bg-indigo-500/10'
                          : 'border-slate-200 bg-white hover:bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/40'
                      } ${!canManageRoles || !canEditRoles ? 'cursor-not-allowed opacity-75' : ''}`}
                    >
                      <div className="pt-0.5">
                        <div
                          className={`flex h-4 w-4 items-center justify-center rounded-full border transition ${
                            isChecked
                              ? visual?.checkClass ?? 'border-indigo-600 bg-indigo-600 text-white'
                              : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800'
                          }`}
                        >
                          {isChecked && <Check size={10} strokeWidth={3} />}
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`flex h-6 w-6 items-center justify-center rounded-md ${visual?.iconClass ?? 'bg-slate-100 text-slate-600'}`}>
                            <Icon size={13} />
                          </span>
                          <span className="font-semibold text-slate-900 dark:text-slate-100 text-xs">
                            {guide?.title ?? role.display_name}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">({visual?.caption ?? role.name})</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                          {guide?.description ?? '業務権限'}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {guide?.capabilities.map((cap) => (
                            <span
                              key={cap}
                              className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            >
                              {cap}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {rolesError && <p className="text-xs text-rose-600 dark:text-rose-400">{rolesError}</p>}
              {rolesSuccess && <p className="text-xs text-emerald-600 dark:text-emerald-400">{rolesSuccess}</p>}

              {canManageRoles && canEditRoles && (
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={savingRoles}
                    onClick={() => void saveRoles()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-500"
                  >
                    {savingRoles ? <ButtonSpinner size={14} /> : <Check size={14} />}
                    <span>{savingRoles ? '保存中…' : '権限設定を保存'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Assign Task */}
          {activeTab === 'task' && canAssignTasks && (
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  業務（クエスト）の依頼
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  勤務中の社員に新しい業務を即座に割り当てます。
                </p>
              </div>

              {!isEmployeeOnline ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300">
                  現在オフラインのため、業務を依頼できません。社員の入室をお待ちください。
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      業務タイトル <span className="text-rose-500">*</span>
                    </span>
                    <input
                      type="text"
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      placeholder="例：A社様契約書の修正案作成"
                      className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      業務詳細・指示事項
                    </span>
                    <textarea
                      value={taskNote}
                      onChange={(e) => setTaskNote(e.target.value)}
                      rows={3}
                      placeholder="例：修正点を赤字でマークし、完了後に報告をお願いします。"
                      className="w-full rounded-lg border border-slate-200 p-2.5 text-xs text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </label>

                  {/* Task Duration Presets */}
                  <div>
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      想定作業時間
                    </span>
                    <div className="mt-1.5 grid grid-cols-4 gap-2">
                      {([30, 60, 120] as const).map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => setTaskDuration(mins)}
                          className={`rounded-lg border px-2 py-2 text-xs font-medium transition ${
                            taskDuration === mins
                              ? 'border-indigo-500 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500/20 dark:bg-indigo-950/20 dark:text-indigo-300'
                              : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400'
                          }`}
                        >
                          {formatTaskDuration(mins)}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setTaskDuration('custom')}
                        className={`rounded-lg border px-2 py-2 text-xs font-medium transition ${
                          taskDuration === 'custom'
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500/20 dark:bg-indigo-950/20 dark:text-indigo-300'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400'
                        }`}
                      >
                        時刻指定
                      </button>
                    </div>

                    {taskDuration === 'custom' && (
                      <div className="mt-2 flex items-center gap-2">
                        <select
                          value={taskDeadlineHour}
                          onChange={(e) => setTaskDeadlineHour(e.target.value)}
                          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-800"
                        >
                          <option value="">時</option>
                          {taskHours.map((h) => (
                            <option key={h} value={String(h).padStart(2, '0')}>{String(h).padStart(2, '0')}</option>
                          ))}
                        </select>
                        <span>:</span>
                        <select
                          value={taskDeadlineMinute}
                          onChange={(e) => setTaskDeadlineMinute(e.target.value)}
                          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-800"
                        >
                          <option value="">分</option>
                          {taskMinutes.map((m) => (
                            <option key={m} value={String(m).padStart(2, '0')}>{String(m).padStart(2, '0')}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {taskError && <p className="text-xs text-rose-600 dark:text-rose-400">{taskError}</p>}
                  {taskSuccess && <p className="text-xs text-emerald-600 dark:text-emerald-400">{taskSuccess}</p>}

                  <div className="pt-2">
                    <button
                      type="button"
                      disabled={submittingTask || !taskTitle.trim()}
                      onClick={() => void handleAssignTask()}
                      className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-xs font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-500"
                    >
                      {submittingTask ? <ButtonSpinner size={14} /> : <Play size={14} />}
                      <span>{submittingTask ? '送信中…' : '業務を依頼する'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Account & Security */}
          {activeTab === 'account' && canResetPassword && employee.user_id && (
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  ログインアカウントのパスワード再設定
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  社員がパスワードを忘れた場合、新しい仮パスワードを発行します。
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/30">
                <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  仮パスワードを発行すると現在のセッションは終了し、本人は次回ログイン時に必ずパスワードを変更するよう要求されます。
                </p>
                <div className="mt-3">
                  <button
                    type="button"
                    disabled={resettingPassword}
                    onClick={() => void resetPassword()}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
                  >
                    {resettingPassword ? '発行中...' : '仮パスワードを生成'}
                  </button>
                </div>

                {temporaryPassword && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-white p-3 dark:border-amber-500/20 dark:bg-slate-900">
                    <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                      発行された仮パスワード（再表示されません）
                    </span>
                    <div className="mt-1.5 flex items-center gap-2">
                      <code className="min-w-0 flex-1 rounded bg-slate-100 px-2.5 py-1.5 font-mono text-sm font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                        {temporaryPassword}
                      </code>
                      <button
                        type="button"
                        onClick={() => void copyTemporaryPassword()}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        <Copy size={13} />
                        <span>コピー</span>
                      </button>
                    </div>
                  </div>
                )}

                {resetError && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{resetError}</p>}
                {resetSuccess && <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">{resetSuccess}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex justify-end border-t border-slate-100 bg-slate-50/50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/20 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            閉じる
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

function TabButton({
  label,
  isActive,
  onClick,
}: {
  label: string
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      className={`min-h-10 shrink-0 border-b-2 px-3.5 py-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 ${
        isActive
          ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-300'
          : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  )
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-2.5 dark:border-slate-800 dark:bg-slate-800/30">
      <span className="text-[10px] font-medium text-slate-400">{label}</span>
      <p className="mt-0.5 text-xs font-semibold text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  )
}

/* ========================================================================= */
/* Create Employee Modal                                                     */
/* ========================================================================= */

function CreateEmployeeModal({
  offices,
  onClose,
  onCreated,
}: {
  offices: Array<NonNullable<OrganizationEmployee['office']>>
  onClose: () => void
  onCreated: () => void
}) {
  useOrganizationDialog(onClose)

  const [fullName, setFullName] = useState('')
  const [fullNameKana, setFullNameKana] = useState('')
  const [officeId, setOfficeId] = useState(() => String(offices[0]?.id ?? ''))
  const [positionTitle, setPositionTitle] = useState('')
  const [workEmail, setWorkEmail] = useState('')
  const [gender, setGender] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (saving) return

    setSaving(true)
    setError('')

    try {
      await api.post('/employees', {
        full_name: fullName.trim(),
        full_name_kana: fullNameKana.trim() || null,
        office_id: Number(officeId),
        position_title: positionTitle.trim() || null,
        work_email: workEmail.trim() || null,
        gender: gender || null,
        hire_date: new Date().toISOString().slice(0, 10),
      })
      onCreated()
    } catch (requestError) {
      const responseError = axios.isAxiosError(requestError)
        ? (requestError.response?.data?.errors as Record<string, string[]> | undefined)
        : undefined
      setError(
        responseError
          ? Object.values(responseError).flat()[0]
          : '社員の登録に失敗しました。',
      )
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white'

  return createPortal(
    <div
      className="organization-modal-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="organization-create-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className="organization-modal-panel flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:max-h-[calc(100dvh-3rem)]"
      >
        <header className="organization-dialog-header flex items-start justify-between border-b border-slate-100 p-4 dark:border-slate-800 sm:p-5">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              <Building2 size={13} />
              <span>社員台帳</span>
            </div>
            <h2 id="organization-create-dialog-title" className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
              新規社員の登録
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              基本プロフィールを作成します（ログインアカウントは別途作成されます）。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            autoFocus
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={18} />
          </button>
        </header>

        <form onSubmit={submit} className="organization-modal-scroll min-h-0 space-y-3.5 overflow-y-auto p-4 sm:p-5">
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-300">
              {error}
            </div>
          )}

          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
            社員コードは登録時に自動発行されます。
          </p>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              氏名 <span className="text-rose-500">*</span>
            </span>
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="例：山田 太郎"
              className={inputClass}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                フリガナ
              </span>
              <input
                value={fullNameKana}
                onChange={(e) => setFullNameKana(e.target.value)}
                placeholder="例：ヤマダ タロウ"
                className={inputClass}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                所属事務所 <span className="text-rose-500">*</span>
              </span>
              <select
                required
                value={officeId}
                onChange={(e) => setOfficeId(e.target.value)}
                className={inputClass}
              >
                <option value="" disabled>事務所を選択</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                役職
              </span>
              <input
                value={positionTitle}
                onChange={(e) => setPositionTitle(e.target.value)}
                placeholder="例：弁護士、行政書士、事務員"
                className={inputClass}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                性別
              </span>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className={inputClass}
              >
                <option value="">選択しない</option>
                <option value="male">男性</option>
                <option value="female">女性</option>
                <option value="other">その他</option>
              </select>
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              業務用メールアドレス
            </span>
            <input
              type="email"
              value={workEmail}
              onChange={(e) => setWorkEmail(e.target.value)}
              placeholder="name@themis.local"
              className={inputClass}
            />
          </label>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={saving || offices.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-500"
            >
              {saving ? <ButtonSpinner size={14} /> : <Plus size={14} />}
              <span>{saving ? '登録中…' : '社員を登録'}</span>
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  )
}
