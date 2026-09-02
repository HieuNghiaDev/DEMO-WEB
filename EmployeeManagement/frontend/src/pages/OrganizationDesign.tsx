import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import axios from 'axios'
import {
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Coffee,
  Copy,
  Eye,
  EyeOff,
  LayoutGrid,
  LayoutList,
  MapPin,
  Plus,
  RefreshCw,
  RotateCcw,
  Scale,
  Search,
  ShieldCheck,
  UserCog,
  UserRound,
  Users,
  X,
  Play,
} from 'lucide-react'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'

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
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20',
    checkClass: 'bg-rose-500 text-white',
  },
  level_4: {
    icon: UserCog,
    caption: 'MANAGEMENT',
    iconClass: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300',
    selectedClass: 'border-violet-400 bg-violet-50/70 dark:border-violet-400/50 dark:bg-violet-500/10',
    badgeClass: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/20',
    checkClass: 'bg-violet-600 text-white',
  },
  level_3: {
    icon: Scale,
    caption: 'LEGAL PROFESSIONAL',
    iconClass: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300',
    selectedClass: 'border-sky-400 bg-sky-50/70 dark:border-sky-400/50 dark:bg-sky-500/10',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/20',
    checkClass: 'bg-sky-600 text-white',
  },
  level_2: {
    icon: BadgeCheck,
    caption: 'FULL-TIME STAFF',
    iconClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
    selectedClass: 'border-emerald-400 bg-emerald-50/70 dark:border-emerald-400/50 dark:bg-emerald-500/10',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20',
    checkClass: 'bg-emerald-600 text-white',
  },
  level_1: {
    icon: Clock3,
    caption: 'PART-TIME STAFF',
    iconClass: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
    selectedClass: 'border-amber-400 bg-amber-50/70 dark:border-amber-400/50 dark:bg-amber-500/10',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20',
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
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20',
  },
  break: {
    label: '休憩中',
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20',
  },
  outside: {
    label: '外出中',
    dot: 'bg-sky-500',
    badge: 'bg-sky-50 text-sky-700 border-sky-200/80 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/20',
  },
  offline: {
    label: 'オフライン',
    dot: 'bg-slate-400 dark:bg-slate-500',
    badge: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  },
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

  // Modals & Panels
  const [selectedEmployee, setSelectedEmployee] = useState<OrganizationEmployee | null>(null)
  const [isAccessGuideOpen, setIsAccessGuideOpen] = useState(false)
  const [isCreateEmployeeOpen, setIsCreateEmployeeOpen] = useState(false)

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
    // Initial loading is scheduled after the effect completes to avoid a synchronous
    // state update during effect setup; the initial `loading` state remains true.
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
          const query = searchQuery.toLowerCase().trim()
          const nameMatch = employee.full_name?.toLowerCase().includes(query)
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

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedOfficeId !== null ||
    statusFilter !== 'all' ||
    roleFilter !== 'all'

  const resetAllFilters = () => {
    setSearchQuery('')
    setSelectedOfficeId(null)
    setStatusFilter('all')
    setRoleFilter('all')
  }

  const handleKpiStatusClick = (status: WorkStatus) => {
    setStatusFilter((current) => (current === status ? 'all' : status))
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600 dark:border-slate-800 dark:border-t-indigo-400" />
          <p className="mt-3 text-xs font-medium text-slate-500 dark:text-slate-400">組織データを読み込んでいます...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 pb-12 pt-4 sm:px-6 lg:px-8">
      {/* 1. Header Area */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-labelledby="organization-title">
        <header className="flex flex-col justify-between gap-4 border-b border-slate-100 p-4 dark:border-slate-800/80 sm:flex-row sm:items-center sm:p-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              <Building2 size={15} />
              <span>THEMIS 人事・組織マネジメント</span>
            </div>
            <h1 id="organization-title" className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
              組織設計・社員管理
            </h1>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              社員名簿、所属先、出勤状態、システムアクセス権限を一元的に管理・設定します。
            </p>
          </div>

          <div className="flex items-center gap-2.5 sm:shrink-0">
            <button
              type="button"
              disabled={refreshing}
              onClick={() => void loadOrganization(true)}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin text-indigo-500' : 'text-slate-500'} />
              <span>{refreshing ? '更新中...' : '最新取得'}</span>
            </button>

            <button
              type="button"
              disabled={!user?.permission_names.includes('employee.create')}
              title={user?.permission_names.includes('employee.create') ? '新規社員を登録' : '社員登録の権限がありません'}
              onClick={() => setIsCreateEmployeeOpen(true)}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-xs font-medium text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-indigo-600 dark:hover:bg-indigo-500 dark:disabled:bg-slate-800"
            >
              <Plus size={15} />
              <span>新規社員登録</span>
            </button>
          </div>
        </header>

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 divide-y divide-slate-100 bg-slate-50/50 dark:divide-slate-800 dark:bg-slate-950/20 sm:grid-cols-5 sm:divide-x sm:divide-y-0">
          <KpiSummaryCard
            title="全社員"
            value={summary.total}
            icon={<Users size={16} />}
            isActive={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
            dotClass="bg-slate-400"
          />
          <KpiSummaryCard
            title="勤務中"
            value={summary.working}
            icon={<BriefcaseBusiness size={16} />}
            isActive={statusFilter === 'working'}
            onClick={() => handleKpiStatusClick('working')}
            dotClass="bg-emerald-500"
            badgeClass="text-emerald-600 dark:text-emerald-400"
          />
          <KpiSummaryCard
            title="休憩中"
            value={summary.break}
            icon={<Coffee size={16} />}
            isActive={statusFilter === 'break'}
            onClick={() => handleKpiStatusClick('break')}
            dotClass="bg-amber-500"
            badgeClass="text-amber-600 dark:text-amber-400"
          />
          <KpiSummaryCard
            title="外出中"
            value={summary.outside}
            icon={<MapPin size={16} />}
            isActive={statusFilter === 'outside'}
            onClick={() => handleKpiStatusClick('outside')}
            dotClass="bg-sky-500"
            badgeClass="text-sky-600 dark:text-sky-400"
          />
          <KpiSummaryCard
            title="オフライン"
            value={summary.offline}
            icon={<UserRound size={16} />}
            isActive={statusFilter === 'offline'}
            onClick={() => handleKpiStatusClick('offline')}
            dotClass="bg-slate-400"
            className="col-span-2 sm:col-span-1"
          />
        </div>
      </section>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      {/* 2. Search, Filter Toolbar & Office Selector */}
      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {/* Office Segmented Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-semibold text-slate-500 dark:text-slate-400">所属事務所:</span>
            <button
              type="button"
              onClick={() => setSelectedOfficeId(null)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                selectedOfficeId === null
                  ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              全事務所 ({employees.length})
            </button>
            {offices.map((office) => {
              const isSelected = selectedOfficeId === office.id
              const count = employees.filter((e) => e.office?.id === office.id).length
              return (
                <button
                  key={office.id}
                  type="button"
                  onClick={() => setSelectedOfficeId(isSelected ? null : office.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    isSelected
                      ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  <Building2 size={13} className={isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'} />
                  <span>{office.name}</span>
                  <span className="rounded-full bg-slate-200/60 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800/60">
            <button
              type="button"
              aria-label="テーブル表示"
              title="テーブル表示"
              onClick={() => setViewMode('table')}
              className={`rounded-md p-1.5 transition ${
                viewMode === 'table'
                  ? 'bg-white text-indigo-600 shadow-xs dark:bg-slate-700 dark:text-indigo-300'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <LayoutList size={15} />
            </button>
            <button
              type="button"
              aria-label="カード表示"
              title="カード表示"
              onClick={() => setViewMode('grid')}
              className={`rounded-md p-1.5 transition ${
                viewMode === 'grid'
                  ? 'bg-white text-indigo-600 shadow-xs dark:bg-slate-700 dark:text-indigo-300'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <LayoutGrid size={15} />
            </button>
          </div>
        </div>

        {/* Toolbar Inputs */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          {/* Search Box */}
          <div className="relative min-w-0 flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="社員名・フリガナ・社員コード・役職・メールで検索..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-xs text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as WorkStatus | 'all')}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="all">すべての勤務状態</option>
              <option value="working">勤務中</option>
              <option value="break">休憩中</option>
              <option value="outside">外出中</option>
              <option value="offline">オフライン</option>
            </select>

            {/* Role Filter */}
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="all">すべてのアクセスレベル</option>
              <option value="level_5">レベル 5 (システム管理)</option>
              <option value="level_4">レベル 4 (運営管理)</option>
              <option value="level_3">レベル 3 (専門業務)</option>
              <option value="level_2">レベル 2 (通常業務)</option>
              <option value="level_1">レベル 1 (基本業務)</option>
            </select>

            {/* Reset Button */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                title="条件をクリア"
              >
                <RotateCcw size={13} />
                <span className="hidden md:inline">リセット</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 3. Access-Level Guide Collapsible */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          aria-expanded={isAccessGuideOpen}
          onClick={() => setIsAccessGuideOpen((c) => !c)}
          className="flex w-full items-center justify-between gap-3 bg-slate-50/70 px-4 py-2.5 text-left transition hover:bg-indigo-50/50 dark:bg-slate-950/30 dark:hover:bg-slate-800/40 sm:px-5"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-indigo-600 dark:text-indigo-400" />
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              アクセスレベル権限表（権限一覧の確認）
            </span>
          </div>
          <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <span>{isAccessGuideOpen ? '閉じる' : '詳細を見る'}</span>
            <ChevronDown size={14} className={`transition-transform duration-200 ${isAccessGuideOpen ? 'rotate-180' : ''}`} />
          </span>
        </button>

        {isAccessGuideOpen && (
          <div className="border-t border-slate-100 p-4 dark:border-slate-800">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {Object.entries(accessLevelGuide).map(([levelKey, level]) => {
                const visual = rolePresentation[levelKey as keyof typeof rolePresentation]
                const Icon = visual.icon
                return (
                  <div
                    key={levelKey}
                    className="rounded-lg border border-slate-200/70 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40"
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
                          className="rounded bg-white px-1.5 py-0.5 text-[9px] font-medium text-slate-600 shadow-xs dark:bg-slate-900 dark:text-slate-300"
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

      {/* 4. Employee List (Table or Grid) */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/20 sm:px-5">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              社員一覧 ({filteredEmployees.length}名)
            </h2>
            {hasActiveFilters && (
              <span className="rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                絞り込み適用中
              </span>
            )}
          </div>

          <p className="text-[11px] text-slate-400">
            行をクリックすると詳細情報・権限設定・業務依頼が開きます
          </p>
        </header>

        {filteredEmployees.length === 0 ? (
          <EmptyEmployeeState hasFilters={hasActiveFilters} onReset={resetAllFilters} />
        ) : viewMode === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-400">
                <tr>
                  <th scope="col" className="py-2.5 pl-4 pr-3 sm:pl-5">社員情報</th>
                  <th scope="col" className="px-3 py-2.5">所属事務所</th>
                  <th scope="col" className="px-3 py-2.5">役職・雇用区分</th>
                  <th scope="col" className="px-3 py-2.5">アクセス権限</th>
                  <th scope="col" className="px-3 py-2.5">勤務状況</th>
                  <th scope="col" className="px-3 py-2.5">現在の作業</th>
                  <th scope="col" className="py-2.5 pl-3 pr-4 text-right sm:pr-5">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredEmployees.map((employee) => (
                  <EmployeeTableRow
                    key={employee.id}
                    employee={employee}
                    onClick={() => setSelectedEmployee(employee)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-3.5 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:p-5">
            {filteredEmployees.map((employee) => (
              <EmployeeGridCard
                key={employee.id}
                employee={employee}
                onClick={() => setSelectedEmployee(employee)}
              />
            ))}
          </div>
        )}
      </section>

      {/* 5. Create Employee Modal */}
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

      {/* 6. Employee Detail Modal */}
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
            setEmployees((current) =>
              current.map((item) => (item.id === selectedEmployee.id ? { ...item, roles } : item)),
            )
            setSelectedEmployee((current) => (current?.id === selectedEmployee.id ? { ...current, roles } : current))
          }}
          onEmploymentUpdated={(employment) => {
            setEmployees((current) =>
              current.map((item) => (item.id === selectedEmployee.id ? { ...item, ...employment } : item)),
            )
            setSelectedEmployee((current) =>
              current?.id === selectedEmployee.id ? { ...current, ...employment } : current,
            )
          }}
          onClose={() => setSelectedEmployee(null)}
        />
      )}
    </div>
  )
}

/* ========================================================================= */
/* Subcomponents                                                             */
/* ========================================================================= */

function KpiSummaryCard({
  title,
  value,
  icon,
  isActive = false,
  onClick,
  dotClass = 'bg-slate-400',
  badgeClass = 'text-slate-900 dark:text-white',
  className = '',
}: {
  title: string
  value: number
  icon: ReactNode
  isActive?: boolean
  onClick?: () => void
  dotClass?: string
  badgeClass?: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex items-center gap-3 p-3.5 text-left transition hover:bg-slate-100/60 dark:hover:bg-slate-800/40 sm:p-4 ${className} ${
        isActive ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : ''
      }`}
    >
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-2xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{title}</span>
        </div>
        <p className={`mt-0.5 text-xl font-semibold tabular-nums ${badgeClass}`}>{value}</p>
      </div>
      {isActive && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400" />
      )}
    </button>
  )
}

function EmployeeTableRow({
  employee,
  onClick,
}: {
  employee: OrganizationEmployee
  onClick: () => void
}) {
  const status = statusConfig[employee.work_status]
  const initial = employee.full_name.trim().charAt(0).toUpperCase() || '?'

  return (
    <tr
      onClick={onClick}
      className="cursor-pointer transition-colors hover:bg-indigo-50/40 dark:hover:bg-indigo-950/15"
    >
      {/* 1. Employee identity */}
      <td className="py-3 pl-4 pr-3 sm:pl-5">
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-xs font-bold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
            {initial}
            <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-slate-900 ${status.dot}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-900 dark:text-slate-100">{employee.full_name}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.2 font-mono text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {employee.employee_code}
              </span>
            </div>
            {employee.full_name_kana && (
              <p className="truncate text-[10px] text-slate-400">{employee.full_name_kana}</p>
            )}
          </div>
        </div>
      </td>

      {/* 2. Office & Dept */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5">
          <Building2 size={13} className="shrink-0 text-slate-400" />
          <span className="truncate font-medium text-slate-800 dark:text-slate-200">
            {employee.office?.name ?? '未登録'}
          </span>
        </div>
      </td>

      {/* 3. Position & Employment */}
      <td className="px-3 py-3">
        <div className="font-medium text-slate-800 dark:text-slate-200">
          {employee.position_title ?? '役職未登録'}
        </div>
        <div className="text-[10px] text-slate-400">
          {employmentTypeLabels[employee.employment_type ?? ''] ?? '雇用区分未登録'}
        </div>
      </td>

      {/* 4. Access Level */}
      <td className="px-3 py-3">
        <AccessLevelBadge roles={employee.roles} />
      </td>

      {/* 5. Work Status */}
      <td className="px-3 py-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${status.badge}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
          <span>{status.label}</span>
        </span>
        {employee.attendance?.clock_in && (
          <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
            <Clock3 size={11} />
            <span>{formatTime(employee.attendance.clock_in)} 入室</span>
          </div>
        )}
      </td>

      {/* 6. Current Task */}
      <td className="max-w-[200px] px-3 py-3">
        {employee.attendance?.current_task ? (
          <div>
            <p className="truncate font-medium text-slate-800 dark:text-slate-200">
              {employee.attendance.current_task.task_description}
            </p>
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              {questStatusLabel[employee.attendance.current_task.status]}
            </span>
          </div>
        ) : (
          <span className="text-slate-300 dark:text-slate-600">—</span>
        )}
      </td>

      {/* 7. Action Button */}
      <td className="py-3 pl-3 pr-4 text-right sm:pr-5">
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600 transition group-hover:bg-indigo-50 group-hover:text-indigo-600 dark:bg-slate-800 dark:text-slate-300">
          <span>詳細</span>
          <ChevronRight size={13} />
        </span>
      </td>
    </tr>
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

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 text-left shadow-2xs transition hover:border-indigo-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500/40"
    >
      <div>
        {/* Top bar: Avatar & Status */}
        <div className="flex items-start justify-between gap-2">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-sm font-bold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
            {initial}
            <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-slate-900 ${status.dot}`} />
          </div>

          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${status.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            <span>{status.label}</span>
          </span>
        </div>

        {/* Employee name & code */}
        <div className="mt-3">
          <div className="flex items-baseline gap-1.5">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">{employee.full_name}</h3>
            <span className="font-mono text-[10px] text-slate-400">({employee.employee_code})</span>
          </div>
          {employee.full_name_kana && (
            <p className="text-[10px] text-slate-400">{employee.full_name_kana}</p>
          )}
        </div>

        {/* Metadata */}
        <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <Building2 size={13} className="text-slate-400" />
            <span className="truncate">{employee.office?.name ?? '未登録'}</span>
          </div>

          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <BriefcaseBusiness size={13} className="text-slate-400" />
            <span className="truncate">{employee.position_title ?? '役職未登録'}</span>
            <span className="text-[10px] text-slate-400">({employmentTypeLabels[employee.employment_type ?? ''] ?? '—'})</span>
          </div>

          <div className="pt-1">
            <AccessLevelBadge roles={employee.roles} />
          </div>
        </div>

        {/* Current Task if any */}
        {employee.attendance?.current_task && (
          <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-800/40">
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

      <div className="mt-4 flex items-center justify-end border-t border-slate-100 pt-2.5 text-[11px] font-medium text-indigo-600 dark:border-slate-800 dark:text-indigo-400">
        <span>プロフィールを開く</span>
        <ChevronRight size={13} />
      </div>
    </button>
  )
}

function AccessLevelBadge({ roles }: { roles: RoleOption[] }) {
  const role = roles[0]
  if (!role) {
    return <span className="text-[10px] text-slate-400">権限未設定</span>
  }

  const level = accessLevelGuide[role.name as keyof typeof accessLevelGuide]
  const visual = rolePresentation[role.name as keyof typeof rolePresentation]
  const Icon = visual?.icon ?? ShieldCheck

  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium ${visual?.badgeClass ?? 'bg-slate-100 text-slate-700 border-slate-200'}`}>
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
    <div className="py-12 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800">
        <Users size={20} />
      </div>
      <p className="mt-3 text-xs font-semibold text-slate-700 dark:text-slate-200">
        {hasFilters ? '条件に一致する社員が見つかりません' : '社員が登録されていません'}
      </p>
      <p className="mt-1 text-xs text-slate-400">
        {hasFilters ? '検索キーワードまたは絞り込み条件を変更してください。' : '「新規社員登録」から新しい社員を追加してください。'}
      </p>
      {hasFilters && (
        <button
          type="button"
          onClick={onReset}
          className="mt-3 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-indigo-400"
        >
          <RotateCcw size={12} />
          <span>絞り込み条件をリセット</span>
        </button>
      )}
    </div>
  )
}

/* ========================================================================= */
/* Employee Detail Modal (Tabbed Layout)                                     */
/* ========================================================================= */

type DetailTab = 'profile' | 'roles' | 'task' | 'account'

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-xs sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"
      >
        {/* Header */}
        <header className="flex items-start justify-between border-b border-slate-100 p-4 dark:border-slate-800 sm:p-5">
          <div className="flex items-center gap-3.5">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-base font-bold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
              {initial}
              <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-slate-900 ${status.dot}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{employee.full_name}</h2>
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
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={18} />
          </button>
        </header>

        {/* Tab Navigation */}
        <nav className="flex border-b border-slate-100 bg-slate-50/70 px-4 dark:border-slate-800 dark:bg-slate-950/20 sm:px-5">
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
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
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

                {employee.work_status === 'outside' && employee.attendance?.outside_destination && (
                  <div className="text-right">
                    <span className="text-[10px] font-medium text-slate-400">外出先</span>
                    <p className="text-xs font-semibold text-sky-600 dark:text-sky-400">
                      {employee.attendance.outside_destination}
                    </p>
                  </div>
                )}
              </div>

              {/* Grid of details */}
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailItem label="社員コード" value={employee.employee_code} />
                <DetailItem label="氏名（フリガナ）" value={employee.full_name_kana || '—'} />
                <DetailItem label="所属事務所" value={employee.office?.name || '未登録'} />
                <DetailItem label="部署" value={employee.department?.name || '未登録'} />
                <DetailItem label="入社日" value={formatDate(employee.hire_date)} />
                <DetailItem label="在籍ステータス" value={employee.employee_status || '在籍'} />
              </div>

              {/* Email */}
              {employee.work_email && (
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <span className="text-[10px] font-medium text-slate-400">業務用メールアドレス</span>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-slate-700 dark:text-slate-200">
                      {showEmail ? employee.work_email : maskEmail(employee.work_email)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowEmail((c) => !c)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                    >
                      {showEmail ? <EyeOff size={13} /> : <Eye size={13} />}
                      <span>{showEmail ? '隠す' : '表示'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Employment Type Update Form */}
              {canUpdateEmployment && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-800/20">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">雇用区分の変更</span>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select
                      value={employmentType}
                      disabled={savingEmployment}
                      onChange={(e) => {
                        setEmploymentType(e.target.value)
                        setEmploymentError('')
                        setEmploymentSuccess('')
                      }}
                      className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      {employmentTypeOptions.map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={savingEmployment || employmentType === employee.employment_type}
                      onClick={() => void saveEmployment()}
                      className="inline-flex h-9 items-center justify-center rounded-lg bg-indigo-600 px-4 text-xs font-medium text-white transition hover:bg-indigo-700 disabled:opacity-40 dark:bg-indigo-600 dark:hover:bg-indigo-500"
                    >
                      {savingEmployment ? '保存中...' : '変更を保存'}
                    </button>
                  </div>
                  {employmentError && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{employmentError}</p>}
                  {employmentSuccess && <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">{employmentSuccess}</p>}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Roles & Permissions */}
          {activeTab === 'roles' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">アクセスレベルの割り当て</h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  社員に付与する権限レベルを1つ選択してください。
                </p>
              </div>

              {canManageRoles && !canEditRoles && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                  ご自身のアカウント権限は変更できません。別の管理者に依頼してください。
                </div>
              )}

              <div className="space-y-2">
                {availableRoles.map((role) => {
                  const isSelected = roleIds.includes(role.id)
                  const visual = rolePresentation[role.name as keyof typeof rolePresentation]
                  const level = accessLevelGuide[role.name as keyof typeof accessLevelGuide]
                  const Icon = visual?.icon ?? ShieldCheck

                  return (
                    <label
                      key={role.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-2.5 transition duration-150 ${
                        isSelected
                          ? `${visual?.selectedClass ?? 'border-indigo-500 bg-indigo-50/50'} ring-1 ring-inset ${visual?.selectedClass?.split(' ')[0].replace('border', 'ring') ?? 'ring-indigo-500'}`
                          : 'border-slate-200 bg-white hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/80'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={!canManageRoles || !canEditRoles}
                        checked={isSelected}
                        onChange={() => toggleRole(role.id)}
                        className="sr-only"
                      />
                      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${visual?.iconClass ?? 'bg-slate-100 text-slate-500'}`}>
                        <Icon size={13} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-baseline gap-2">
                            <p className="text-xs font-bold text-slate-900 dark:text-white">
                              {role.display_name}
                            </p>
                            {level && <span className="text-[10px] font-medium text-slate-500">{level.summary}</span>}
                          </div>
                          <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                            isSelected
                              ? (visual?.checkClass ?? 'border-indigo-600 bg-indigo-600 text-white')
                              : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800'
                          }`}>
                            {isSelected && <Check size={8} strokeWidth={4} />}
                          </span>
                        </div>
                        {level && (
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <p className="text-[11px] text-slate-600 dark:text-slate-400">
                              {level.description}
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {level.capabilities.map((cap) => (
                                <span
                                  key={cap}
                                  className={`rounded-[4px] border px-1.5 py-0 text-[9px] font-medium tracking-wide ${
                                    isSelected
                                      ? (visual?.badgeClass ?? 'bg-white text-slate-600')
                                      : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400'
                                  }`}
                                >
                                  {cap}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>

              {rolesError && <p className="text-xs text-rose-600 dark:text-rose-400">{rolesError}</p>}
              {rolesSuccess && <p className="text-xs text-emerald-600 dark:text-emerald-400">{rolesSuccess}</p>}

              {canManageRoles && canEditRoles && (
                <div className="pt-2">
                  <button
                    type="button"
                    disabled={savingRoles || roleIds.length === 0}
                    onClick={() => void saveRoles()}
                    className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-xs font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-500"
                  >
                    <ShieldCheck size={14} />
                    <span>{savingRoles ? '更新中...' : '権限設定を保存'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Assign Task */}
          {activeTab === 'task' && canAssignTasks && (
            <div className="space-y-4">
              {!isEmployeeOnline ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center dark:border-slate-800 dark:bg-slate-800/40">
                  <Clock3 size={20} className="mx-auto text-slate-400" />
                  <p className="mt-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    現在オフラインのため業務を依頼できません
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    社員が出勤（オンライン）になると、ここからリアルタイムに業務を依頼できます。
                  </p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {employee.full_name} さんへの業務依頼
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      依頼内容は社員画面の「MY QUEST」に届き、タイマーで進捗管理されます。
                    </p>
                  </div>

                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      業務タイトル <span className="text-rose-500">*</span>
                    </span>
                    <input
                      type="text"
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      placeholder="例：契約書第3条の法務チェック"
                      className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      依頼メモ・指示事項
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
                      <Play size={14} />
                      <span>{submittingTask ? '送信中...' : '業務を依頼する'}</span>
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
    </div>
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
      onClick={onClick}
      className={`border-b-2 px-3.5 py-2 text-xs font-medium transition ${
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-xs sm:p-6"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"
      >
        <header className="flex items-start justify-between border-b border-slate-100 p-4 dark:border-slate-800 sm:p-5">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              <Building2 size={13} />
              <span>社員台帳</span>
            </div>
            <h2 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
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
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={18} />
          </button>
        </header>

        <form onSubmit={submit} className="space-y-3.5 p-4 sm:p-5">
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
              <Plus size={14} />
              <span>{saving ? '登録中...' : '社員を登録'}</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
