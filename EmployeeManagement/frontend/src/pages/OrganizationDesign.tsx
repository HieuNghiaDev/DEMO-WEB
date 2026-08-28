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
  Mail,
  MapPin,
  Plus,
  RefreshCw,
  Scale,
  ShieldCheck,
  UserCog,
  UserRound,
  Users,
  X,
  ListTodo,
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

type RoleOption = {
  id: number
  name: string
  display_name: string
}

type OrganizationResponse = {
  employees: OrganizationEmployee[]
  available_roles: RoleOption[]
}

const rolePresentation = {
  level_5: {
    icon: ShieldCheck,
    caption: 'SYSTEM ADMIN',
    iconClass: 'bg-rose-500/10 text-rose-500 dark:bg-rose-500/15 dark:text-rose-300',
    selectedClass: 'border-rose-400 bg-rose-50/70 dark:border-rose-400/50 dark:bg-rose-500/10',
    checkClass: 'bg-rose-500 text-white',
  },
  level_4: {
    icon: UserCog,
    caption: 'MANAGEMENT',
    iconClass: 'bg-violet-500/10 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
    selectedClass: 'border-violet-400 bg-violet-50/70 dark:border-violet-400/50 dark:bg-violet-500/10',
    checkClass: 'bg-violet-600 text-white',
  },
  level_3: {
    icon: Scale,
    caption: 'LEGAL PROFESSIONAL',
    iconClass: 'bg-sky-500/10 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
    selectedClass: 'border-sky-400 bg-sky-50/70 dark:border-sky-400/50 dark:bg-sky-500/10',
    checkClass: 'bg-sky-600 text-white',
  },
  level_2: {
    icon: BadgeCheck,
    caption: 'FULL-TIME STAFF',
    iconClass: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
    selectedClass: 'border-emerald-400 bg-emerald-50/70 dark:border-emerald-400/50 dark:bg-emerald-500/10',
    checkClass: 'bg-emerald-600 text-white',
  },
  level_1: {
    icon: Clock3,
    caption: 'PART-TIME STAFF',
    iconClass: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
    selectedClass: 'border-amber-400 bg-amber-50/70 dark:border-amber-400/50 dark:bg-amber-500/10',
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
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
  },
  break: {
    label: '休憩中',
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-700 ring-amber-600/10 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
  },
  outside: {
    label: '外出中',
    dot: 'bg-sky-500',
    badge: 'bg-sky-50 text-sky-700 ring-sky-600/10 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20',
  },
  offline: {
    label: 'オフライン',
    dot: 'bg-slate-300 dark:bg-slate-600',
    badge: 'bg-slate-100 text-slate-500 ring-slate-500/10 dark:bg-slate-800 dark:text-slate-400 dark:ring-white/10',
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
  const toParts = (date: Date) => Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>
  const today = toParts(new Date())
  const selectedAt = new Date(`${today.year}-${today.month}-${today.day}T${hour}:${minute}:00+09:00`)
  const deadline = selectedAt.getTime() <= Date.now()
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
  const [selectedOfficeId, setSelectedOfficeId] = useState<number | null>(null)
  const [selectedEmployee, setSelectedEmployee] = useState<OrganizationEmployee | null>(null)
  const [isEmployeeDetailClosing, setIsEmployeeDetailClosing] = useState(false)
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
    const initializeData = async () => {
      await loadOrganization()
    }

    void initializeData()

    const intervalId = window.setInterval(() => {
      void loadOrganization(true)
    }, 30_000)

    return () => window.clearInterval(intervalId)
  }, [loadOrganization])

  const offices = useMemo(() => {
    const map = new Map<number, NonNullable<OrganizationEmployee['office']>>()

    employees.forEach((employee) => {
      if (employee.office) map.set(employee.office.id, employee.office)
    })

    return [...map.values()]
  }, [employees])

  const visibleEmployees = useMemo(() => {
    const list =
      selectedOfficeId === null
        ? employees
        : employees.filter((employee) => employee.office?.id === selectedOfficeId)

    return [...list].sort((a, b) => {
      const officeCompare = (a.office?.name ?? '').localeCompare(b.office?.name ?? '', 'ja')
      return officeCompare || a.full_name.localeCompare(b.full_name, 'ja')
    })
  }, [employees, selectedOfficeId])

  const summary = useMemo(
    () => ({
      total: visibleEmployees.length,
      working: visibleEmployees.filter((e) => e.work_status === 'working').length,
      break: visibleEmployees.filter((e) => e.work_status === 'break').length,
      outside: visibleEmployees.filter((e) => e.work_status === 'outside').length,
      offline: visibleEmployees.filter((e) => e.work_status === 'offline').length,
    }),
    [visibleEmployees],
  )

  const selectOffice = (officeId: number) => {
    setSelectedOfficeId((current) => (current === officeId ? null : officeId))
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-[3px] border-slate-200 border-t-indigo-600 dark:border-slate-800 dark:border-t-indigo-400" />
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">組織情報を読み込んでいます...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 pb-10 pt-5 sm:px-5 lg:px-6 xl:px-8">

      {/* Header */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" aria-labelledby="organization-title">
        <header className="px-4 pb-4 pt-5 sm:px-5 lg:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 border-l-2 border-indigo-500 pl-4">
              <div className="flex items-center gap-2 text-xs font-medium text-indigo-600 dark:text-indigo-300"><Building2 size={15} aria-hidden="true" />社員管理</div>
              <h1 id="organization-title" className="mt-1.5 text-2xl font-semibold leading-tight tracking-tight text-slate-950 dark:text-slate-100 md:text-[28px]">組織設計</h1>
              <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">社員・所属・勤務状況・アクセスレベルを一元管理します。</p>
            </div>

            <div className="flex flex-wrap gap-2 sm:shrink-0">
            <button
              type="button"
              disabled={refreshing}
              onClick={() => void loadOrganization(true)}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors duration-150 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-400/50 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-200 sm:flex-none"
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin text-indigo-500' : 'text-indigo-500 dark:text-indigo-300'} />
              {refreshing ? '更新中…' : '最新データを取得'}
            </button>
            <button
              type="button"
              disabled={!user?.permission_names.includes('employee.create')}
              title={user?.permission_names.includes('employee.create') ? '新しい社員を登録' : '社員登録の権限がありません'}
              onClick={() => setIsCreateEmployeeOpen(true)}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-indigo-500 dark:hover:bg-indigo-400 dark:disabled:bg-slate-700 sm:flex-none"
            >
              <Plus size={15} /> 新規社員
            </button>
            </div>
          </div>
        </header>
        <div className="grid grid-cols-2 border-t border-slate-200 bg-slate-50/55 dark:border-slate-700 dark:bg-slate-950/25 sm:grid-cols-5">
          <SummaryCard title="全社員" value={summary.total} icon={<Users size={18} />} accentClass="bg-indigo-500" iconClass="bg-indigo-50 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-300" className="border-b border-r border-slate-100 dark:border-slate-800 sm:border-b-0" />
          <SummaryCard title="勤務中" value={summary.working} icon={<BriefcaseBusiness size={18} />} accentClass="bg-emerald-500" iconClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300" className="border-b border-slate-100 dark:border-slate-800 sm:border-b-0 sm:border-r" />
          <SummaryCard title="休憩中" value={summary.break} icon={<Coffee size={18} />} accentClass="bg-amber-500" iconClass="bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300" className="border-b border-r border-slate-100 dark:border-slate-800 sm:border-b-0" />
          <SummaryCard title="外出中" value={summary.outside} icon={<MapPin size={18} />} accentClass="bg-sky-500" iconClass="bg-sky-50 text-sky-600 dark:bg-sky-400/10 dark:text-sky-300" className="border-b border-slate-100 dark:border-slate-800 sm:border-b-0 sm:border-r" />
          <SummaryCard title="オフライン" value={summary.offline} icon={<UserRound size={18} />} accentClass="bg-slate-400" iconClass="bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300" className="col-span-2 sm:col-span-1" />
        </div>
      </section>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      {/* Office selector */}
      <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">

          <div className="flex min-w-0 flex-1 flex-col gap-2 md:flex-row">
            {offices.map((office, index) => {
              const selected = selectedOfficeId === office.id

              return (
                <div key={office.id} className="flex min-w-0 flex-1 items-center gap-2">
                  {index > 0 && <span className="hidden text-slate-300 dark:text-slate-700 md:block">×</span>}

                  <button
                    type="button"
                    onClick={() => selectOffice(office.id)}
                    className={`organization-office-card group flex min-w-0 flex-1 items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all ${selected ? 'is-selected' : ''} ${
                      selected
                        ? 'border-indigo-400 bg-indigo-50 shadow-sm ring-2 ring-indigo-500/10 dark:border-indigo-500/50 dark:bg-indigo-500/10'
                        : 'border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-white hover:shadow-sm dark:border-slate-800 dark:bg-slate-800/50 dark:hover:border-indigo-500/30 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold text-white ${index === 0 ? 'bg-indigo-600' : 'bg-blue-600'}`}>
                      {index === 0 ? 'T' : <Scale size={17} />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-bold text-slate-900 dark:text-white">{office.name}</div>

                        {selected && (
                          <span className="shrink-0 rounded-full bg-indigo-600 px-2 py-0.5 text-[9px] font-bold text-white">
                            表示中
                          </span>
                        )}
                      </div>

                      {office.address && <div className="mt-0.5 truncate text-[10px] text-slate-400 sm:text-[11px]">{office.address}</div>}
                    </div>
                  </button>
                </div>
              )
            })}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 pt-3 dark:border-slate-800 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
            <span className="text-[11px] text-slate-400">
              {selectedOfficeId === null ? '全事務所を表示中' : '選択した事務所を表示中'}
            </span>

            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {visibleEmployees.length}名
            </span>
          </div>
        </div>
      </section>

      {/* Access-level guide */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <button
          type="button"
          aria-expanded={isAccessGuideOpen}
          onClick={() => setIsAccessGuideOpen((current) => !current)}
          className="organization-tap flex w-full items-center justify-between gap-4 bg-slate-50/70 px-4 py-3 text-left transition-colors hover:bg-indigo-50/60 dark:bg-slate-900/70 dark:hover:bg-indigo-500/[0.08] sm:px-5"
        >
          <div>
            <span className="text-[10px] font-bold tracking-[0.14em] text-indigo-500">ACCESS LEVEL GUIDE</span>
            <h2 className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white">アクセスレベルの概要</h2>
          </div>
          <span className="flex shrink-0 items-center gap-2 text-[11px] font-bold text-indigo-600 dark:text-indigo-300">
            <ShieldCheck size={18} />
            <span className="hidden sm:inline">{isAccessGuideOpen ? '閉じる' : '確認する'}</span>
            <ChevronDown size={17} className={`transition-transform duration-300 ${isAccessGuideOpen ? 'rotate-180' : ''}`} />
          </span>
        </button>

        <div className={`access-level-expand ${isAccessGuideOpen ? 'is-open' : ''}`}>
          <div className="overflow-hidden">
            <div className="grid border-t border-indigo-50 divide-y divide-slate-100 dark:border-indigo-500/10 dark:divide-slate-800 sm:grid-cols-2 sm:divide-x sm:divide-y lg:grid-cols-5 lg:divide-y-0">
              {Object.entries(accessLevelGuide).map(([levelName, level]) => {
                const visual = rolePresentation[levelName as keyof typeof rolePresentation]
                const Icon = visual.icon

                return (
                  <div key={levelName} className="p-3 sm:p-3.5">
                    <div className="flex items-center gap-2">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${visual.iconClass}`}>
                        <Icon size={16} />
                      </span>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">{level.title}</p>
                    </div>
                    <p className="mt-2 min-h-8 text-[10px] leading-4 text-slate-500 dark:text-slate-400">{level.description}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {level.capabilities.map((capability) => (
                        <span key={capability} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {capability}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Employee list */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">

        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-4 py-3.5 dark:border-slate-700 dark:bg-slate-900/70 sm:px-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">社員一覧</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{visibleEmployees.length}名の社員を表示</p>
          </div>

          {selectedOfficeId !== null && (
            <button
              type="button"
              onClick={() => setSelectedOfficeId(null)}
              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
            >
              全事務所を表示
            </button>
          )}
        </div>

        {/* Desktop column names */}
        <div className="hidden grid-cols-[minmax(190px,1.15fr)_minmax(160px,1fr)_110px_minmax(175px,1.05fr)_120px_minmax(140px,0.8fr)_30px] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-950/40 lg:grid">
          <div>社員</div>
          <div>所属事務所</div>
          <div>役職</div>
          <div>アクセスレベル・権限</div>
          <div>勤務状況</div>
          <div>現在の作業</div>
          <div />
        </div>

        {visibleEmployees.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-2.5 bg-slate-50/40 p-2.5 dark:bg-slate-950/20 lg:space-y-0 lg:bg-transparent lg:p-0 dark:lg:bg-transparent">
            {visibleEmployees.map((employee) => (
              <EmployeeRow
                key={employee.id}
                employee={employee}
                onClick={() => {
                  setIsEmployeeDetailClosing(false)
                  setSelectedEmployee(employee)
                }}
              />
            ))}
          </div>
        )}
      </section>

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

      {selectedEmployee && (
        <EmployeeDetailModal
          key={selectedEmployee.id}
          employee={selectedEmployee}
          canAssignTasks={user?.permission_names.includes('task.assign') ?? false}
          canManageRoles={user?.permission_names.includes('employee.manage_roles') ?? false}
          canUpdateEmployment={user?.permission_names.includes('employee.update') ?? false}
          canResetPassword={user?.role_names.some((role) => role === 'level_4' || role === 'level_5') ?? false}
          canEditRoles={selectedEmployee.user_id !== user?.id}
          isClosing={isEmployeeDetailClosing}
          availableRoles={availableRoles}
          onRolesUpdated={(roles) => {
            setEmployees((current) => current.map((item) => (
              item.id === selectedEmployee.id ? { ...item, roles } : item
            )))
            setSelectedEmployee((current) => (
              current?.id === selectedEmployee.id ? { ...current, roles } : current
            ))
          }}
          onEmploymentUpdated={(employment) => {
            setEmployees((current) => current.map((item) => (
              item.id === selectedEmployee.id ? { ...item, ...employment } : item
            )))
            setSelectedEmployee((current) => (
              current?.id === selectedEmployee.id ? { ...current, ...employment } : current
            ))
          }}
          onClose={() => {
            if (isEmployeeDetailClosing) return
            setIsEmployeeDetailClosing(true)
            window.setTimeout(() => {
              setSelectedEmployee(null)
              setIsEmployeeDetailClosing(false)
            }, 380)
          }}
        />
      )}
    </div>
  )
}

function SummaryCard({
  title,
  value,
  icon,
  accentClass,
  iconClass,
  className = '',
}: {
  title: string
  value: number
  icon: ReactNode
  accentClass: string
  iconClass: string
  className?: string
}) {
  return (
    <div className={`${className} relative px-4 py-3.5 sm:px-5`}>
      <span className={`absolute inset-x-0 top-0 h-0.5 ${accentClass}`} aria-hidden="true" />
      <div className="flex items-center gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconClass}`} aria-hidden="true">
        {icon}
        </span>

        <div className="min-w-0">
          <p className="text-2xl font-semibold tracking-tight tabular-nums text-slate-950 dark:text-white">{value}</p>
          <p className="mt-0.5 truncate text-xs font-medium text-slate-500 dark:text-slate-400">{title}</p>
        </div>
      </div>
    </div>
  )
}

function CreateEmployeeModal({
  offices,
  onClose,
  onCreated,
}: {
  offices: Array<NonNullable<OrganizationEmployee['office']>>
  onClose: () => void
  onCreated: () => void
}) {
  const [employeeCode, setEmployeeCode] = useState('')
  const [fullName, setFullName] = useState('')
  const [fullNameKana, setFullNameKana] = useState('')
  const [officeId, setOfficeId] = useState('')
  const [positionTitle, setPositionTitle] = useState('')
  const [workEmail, setWorkEmail] = useState('')
  const [gender, setGender] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!officeId && offices[0]) setOfficeId(String(offices[0].id))
  }, [officeId, offices])

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return

    setSaving(true)
    setError('')

    try {
      await api.post('/employees', {
        employee_code: employeeCode.trim(),
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
        ? requestError.response?.data?.errors as Record<string, string[]> | undefined
        : undefined
      setError(responseError ? Object.values(responseError).flat()[0] : '社員を登録できませんでした。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={onClose}>
      <section onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.32)] dark:border-slate-700 dark:bg-[#111a2e]">
        <header className="relative overflow-hidden border-b border-slate-200 bg-slate-50/80 px-5 py-5 dark:border-slate-700 dark:bg-[#0c1527]">
          <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full border border-indigo-100 dark:border-indigo-400/10" />
          <div className="relative flex items-start justify-between gap-4"><div><p className="text-[10px] font-black tracking-[.16em] text-indigo-500">TEAM DIRECTORY</p><h2 className="mt-1 text-lg font-black text-slate-900 dark:text-white">新規社員を登録</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">社員プロフィールを作成します。ログインアカウントは作成されません。</p></div><button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"><X size={18}/></button></div>
        </header>
        <form onSubmit={submit} className="space-y-4 p-5">
          {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2"><CreateField label="社員コード *"><input required value={employeeCode} onChange={(event) => setEmployeeCode(event.target.value)} placeholder="例：TM005" className={createInputClass}/></CreateField><CreateField label="氏名 *"><input required value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="例：NGUYEN VAN A" className={createInputClass}/></CreateField></div>
          <div className="grid gap-4 sm:grid-cols-2"><CreateField label="フリガナ"><input value={fullNameKana} onChange={(event) => setFullNameKana(event.target.value)} placeholder="例：グエン・ヴァン・ア" className={createInputClass}/></CreateField><CreateField label="所属事務所 *"><select required value={officeId} onChange={(event) => setOfficeId(event.target.value)} className={createInputClass}><option value="" disabled>事務所を選択</option>{offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}</select></CreateField></div>
          <div className="grid gap-4 sm:grid-cols-2"><CreateField label="役職"><input value={positionTitle} onChange={(event) => setPositionTitle(event.target.value)} placeholder="例：社員" className={createInputClass}/></CreateField><CreateField label="性別"><select value={gender} onChange={(event) => setGender(event.target.value)} className={createInputClass}><option value="">選択しない</option><option value="male">男性</option><option value="female">女性</option><option value="other">その他</option></select></CreateField></div>
          <CreateField label="業務用メールアドレス"><input type="email" value={workEmail} onChange={(event) => setWorkEmail(event.target.value)} placeholder="name@themis.local" className={createInputClass}/></CreateField>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-700"><button type="button" disabled={saving} onClick={onClose} className="h-10 rounded-xl px-4 text-sm font-bold text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800">キャンセル</button><button type="submit" disabled={saving || offices.length === 0} className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 text-sm font-bold text-white shadow-md shadow-indigo-500/20 transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60"><Plus size={16}/>{saving ? '登録中…' : '社員を登録'}</button></div>
        </form>
      </section>
    </div>
  )
}

const createInputClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-[#111a2e] dark:text-slate-100 dark:focus:ring-indigo-500/20'

function CreateField({ label, children }: { label: string; children: ReactNode }) { return <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700 dark:text-slate-200">{label}</span>{children}</label> }

function EmployeeRow({
  employee,
  onClick,
}: {
  employee: OrganizationEmployee
  onClick: () => void
}) {
  const status = statusConfig[employee.work_status]

  return (
    <button
      type="button"
      onClick={onClick}
      className="organization-employee-card group relative w-full overflow-hidden rounded-xl border border-slate-300 bg-white px-3.5 py-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-500/40 sm:px-4 lg:rounded-none lg:border-x-0 lg:border-t-0 lg:border-b lg:border-slate-200 lg:px-5 lg:shadow-none lg:hover:translate-y-0 lg:hover:bg-indigo-50/40 lg:hover:shadow-none dark:lg:border-slate-800 dark:lg:hover:bg-indigo-500/[0.035] last:lg:border-b-0"
    >
      <div className="absolute bottom-2 left-0 top-2 w-[3px] scale-y-0 rounded-r-full bg-indigo-500 transition-transform group-hover:scale-y-100" />

      {/* Desktop */}
      <div className="hidden grid-cols-[minmax(190px,1.15fr)_minmax(160px,1fr)_110px_minmax(175px,1.05fr)_120px_minmax(140px,0.8fr)_30px] items-center gap-3 lg:grid">

        <div className="flex min-w-0 items-center gap-3">
          <EmployeeAvatar employee={employee} />

          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-slate-900 transition-colors group-hover:text-indigo-700 dark:text-slate-100 dark:group-hover:text-indigo-300">
              {employee.full_name}
            </div>

            {employee.full_name_kana && (
              <div className="mt-1 truncate text-[10px] text-slate-400">{employee.full_name_kana}</div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <Building2 size={14} className="shrink-0 text-slate-400" />
          <span className="truncate text-xs font-semibold text-slate-700 dark:text-slate-300">
            {employee.office?.name ?? '未登録'}
          </span>
        </div>

        <div className="truncate text-xs font-semibold text-slate-700 dark:text-slate-300">
          {employee.position_title ?? '役職未登録'}
        </div>

        <AccessLevelSummary roles={employee.roles} />

        <div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ring-inset ${status.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>

          {employee.attendance && (
            <div className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-400">
              <Clock3 size={11} />
              {formatTime(employee.attendance.clock_in)}
            </div>
          )}
        </div>

        <div className="min-w-0">
          {employee.attendance?.current_task ? (
            <>
              <div className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
                {employee.attendance.current_task.task_description}
              </div>

              <div className="mt-1 flex items-center gap-1.5 text-[10px] font-medium text-emerald-500">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                {questStatusLabel[employee.attendance.current_task.status]}
              </div>
            </>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </div>

        <ChevronRight size={17} className="text-slate-300 transition-all group-hover:translate-x-1 group-hover:text-indigo-500 dark:text-slate-700" />
      </div>

      {/* Mobile */}
      <div className="lg:hidden">
        <div className="flex items-start gap-3">

          <EmployeeAvatar employee={employee} />

          <div className="min-w-0 flex-1">

            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-bold text-slate-900 dark:text-white">{employee.full_name}</h3>

                {employee.full_name_kana && (
                  <p className="mt-1 truncate text-[10px] text-slate-400">{employee.full_name_kana}</p>
                )}
              </div>

              <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ring-1 ring-inset ${status.badge}`}>
                {status.label}
              </span>
            </div>

            <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">

              <div className="flex min-w-0 items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <Building2 size={13} className="shrink-0 text-slate-400" />
                <span className="truncate">{employee.office?.name ?? '未登録'}</span>
              </div>

              <div className="flex min-w-0 items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <BriefcaseBusiness size={13} className="shrink-0 text-slate-400" />
                <span className="truncate">{employee.position_title ?? '役職未登録'}</span>
              </div>

              <div className="flex min-w-0 items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <ShieldCheck size={13} className="shrink-0 text-indigo-400" />
                <AccessLevelSummary roles={employee.roles} compact />
              </div>

              {employee.attendance && (
                <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <Clock3 size={13} className="text-slate-400" />
                  勤務開始
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {formatTime(employee.attendance.clock_in)}
                  </span>
                </div>
              )}
            </div>

            {employee.attendance?.current_task && (
              <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2.5 dark:border-indigo-500/10 dark:bg-indigo-500/[0.07]">
                <div className="mb-1 flex items-center gap-1.5 text-[9px] font-bold text-indigo-500 dark:text-indigo-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  {questStatusLabel[employee.attendance.current_task.status]}
                </div>

                <div className="truncate text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                  {employee.attendance.current_task.task_description}
                </div>
              </div>
            )}

            <div className="mt-3 flex items-center justify-end gap-1 text-[10px] font-semibold text-slate-400 transition group-hover:text-indigo-500">
              詳細を見る
              <ChevronRight size={12} />
            </div>

          </div>
        </div>
      </div>
    </button>
  )
}

function EmployeeAvatar({
  employee,
}: {
  employee: OrganizationEmployee
}) {
  const status = statusConfig[employee.work_status]
  const initial = employee.full_name.trim().charAt(0).toUpperCase() || '?'

  return (
    <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-sm font-bold text-indigo-600 ring-1 ring-indigo-100 transition-transform group-hover:scale-105 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20">
      {initial}

      <span
        className={`absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-white dark:border-slate-900 ${status.dot}`}
      />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="py-14 text-center">
      <Users size={34} className="mx-auto text-slate-300 dark:text-slate-700" />
      <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">社員が登録されていません。</p>
    </div>
  )
}

function EmployeeDetailModal({
  employee,
  canAssignTasks,
  canManageRoles,
  canUpdateEmployment,
  canResetPassword,
  canEditRoles,
  isClosing,
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
  isClosing: boolean
  availableRoles: RoleOption[]
  onRolesUpdated: (roles: RoleOption[]) => void
  onEmploymentUpdated: (employment: Pick<OrganizationEmployee, 'position_title' | 'employment_type'>) => void
  onClose: () => void
}) {
  const [showEmail, setShowEmail] = useState(false)
  const [showAssignTask, setShowAssignTask] = useState(false)
  const [assignmentMessage, setAssignmentMessage] = useState('')
  const [roleIds, setRoleIds] = useState<number[]>(() => employee.roles.map((role) => role.id))
  const [savingRoles, setSavingRoles] = useState(false)
  const [rolesError, setRolesError] = useState('')
  const [rolesSuccess, setRolesSuccess] = useState('')
  const [employmentType, setEmploymentType] = useState(employee.employment_type ?? 'full_time')
  const [savingEmployment, setSavingEmployment] = useState(false)
  const [employmentError, setEmploymentError] = useState('')
  const [employmentSuccess, setEmploymentSuccess] = useState('')
  const [isLevelDetailOpen, setIsLevelDetailOpen] = useState(false)
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
      setRolesSuccess('権限を更新しました。')
    } catch (error) {
      if (!axios.isAxiosError(error)) {
        setRolesError('権限を更新できませんでした。')
      } else if (!error.response) {
        setRolesError(`APIサーバーに接続できませんでした。（${api.defaults.baseURL}）`)
      } else {
        const serverMessage = typeof error.response.data?.message === 'string'
          ? error.response.data.message
          : '権限を更新できませんでした。'
        setRolesError(`${serverMessage}（HTTP ${error.response.status}）`)
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
      setEmploymentSuccess('雇用区分を更新しました。')
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message ?? '雇用区分を更新できませんでした。'
        : '雇用区分を更新できませんでした。'
      setEmploymentError(message)
    } finally {
      setSavingEmployment(false)
    }
  }

  const resetPassword = async () => {
    if (resettingPassword || !employee.user_id) return
    try {
      setResettingPassword(true)
      setResetError('')
      setResetSuccess('')
      setTemporaryPassword('')
      const response = await api.put<{ message: string; temporary_password: string }>(`/employees/${employee.id}/password-reset`)
      setTemporaryPassword(response.data.temporary_password)
      setResetSuccess(response.data.message)
    } catch (error) { setResetError(axios.isAxiosError(error) ? error.response?.data?.message ?? 'パスワードをリセットできませんでした。' : 'パスワードをリセットできませんでした。') } finally { setResettingPassword(false) }
  }

  const copyTemporaryPassword = async () => {
    if (!temporaryPassword) return
    try {
      await navigator.clipboard.writeText(temporaryPassword)
      setResetError('')
      setResetSuccess('仮パスワードをコピーしました。安全な方法で本人へ共有してください。')
    } catch {
      setResetError('コピーできませんでした。仮パスワードを選択してコピーしてください。')
    }
  }

  return (
    <>
    <div
      className={`organization-modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4 ${isClosing ? 'is-closing' : ''}`}
      onMouseDown={onClose}
    >
      <div
        className={`organization-modal-panel organization-modal-scroll max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:max-w-2xl sm:rounded-3xl ${isClosing ? 'is-closing' : ''}`}
        onMouseDown={(event) => event.stopPropagation()}
      >

        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white/95 px-5 py-5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:px-6">

          <div className="flex min-w-0 items-center gap-4">
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-lg font-bold text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
              {initial}
              <span className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-[3px] border-white dark:border-slate-900 ${status.dot}`} />
            </div>

            <div className="min-w-0">
              <div className="text-[10px] font-bold tracking-widest text-indigo-500">EMPLOYEE PROFILE</div>
              <h2 className="mt-1 truncate text-lg font-bold text-slate-900 dark:text-white sm:text-xl">{employee.full_name}</h2>
              {employee.full_name_kana && <div className="mt-1 truncate text-xs text-slate-400">{employee.full_name_kana}</div>}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <X size={19} />
          </button>
        </div>

        <div className="space-y-6 p-5 sm:p-6">

          <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/50">
            <div>
              <div className="text-xs text-slate-400">現在の勤務状態</div>
              <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-white">{status.label}</div>
            </div>

            <span className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 ring-inset ${status.badge}`}>
              {status.label}
            </span>
          </div>

          {assignmentMessage && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
              {assignmentMessage}
            </div>
          )}

          {canAssignTasks && isEmployeeOnline && (
            <button
              type="button"
              onClick={() => {
                setAssignmentMessage('')
                setShowAssignTask(true)
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.99]"
            >
              <BriefcaseBusiness size={17} />
              業務を依頼
            </button>
          )}

          {canAssignTasks && isEmployeeOnline && (
            <p className="-mt-3 text-center text-[11px] text-slate-400 dark:text-slate-500">
              この社員にのみ業務を割り当てます。
            </p>
          )}

          {canAssignTasks && !isEmployeeOnline && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-400">
              この社員はオフラインのため、業務を依頼できません。勤務開始後に依頼してください。
            </div>
          )}

          <DetailSection title="権限 / Permissions">
            <div className="space-y-3 rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/70 p-3.5 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:to-slate-800/40 sm:p-4">
              <AccessLevelDetail
                roles={employee.roles}
                open={isLevelDetailOpen}
                onToggle={() => setIsLevelDetailOpen((current) => !current)}
              />

              {canManageRoles && !canEditRoles && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">
                  自分自身の権限は変更できません。別のシステム管理者に依頼してください。
                </p>
              )}

              {canManageRoles && canEditRoles && availableRoles.length > 0 && (
                <>
                  <div className="pt-1">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-200">付与する役割</p>
                      <span className="text-[10px] font-medium text-slate-400">1つ選択</span>
                    </div>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {availableRoles.map((role) => (
                        <RoleSelectionCard
                          key={role.id}
                          role={role}
                          selected={roleIds.includes(role.id)}
                          onToggle={() => toggleRole(role.id)}
                        />
                      ))}
                    </div>
                  </div>

                  {rolesError && (
                    <p className="text-xs font-medium text-rose-600 dark:text-rose-300">{rolesError}</p>
                  )}

                  {rolesSuccess && (
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-300">{rolesSuccess}</p>
                  )}

                  <button
                    type="button"
                    disabled={savingRoles || roleIds.length === 0}
                    onClick={() => void saveRoles()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:from-indigo-500 hover:to-violet-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ShieldCheck size={17} />
                    {savingRoles ? '更新中...' : '権限を更新'}
                  </button>
                </>
              )}
            </div>
          </DetailSection>

          <DetailSection title="基本情報">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

              {employee.department && <InfoItem label="部署" value={employee.department.name} />}

              {canUpdateEmployment ? (
                <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50 sm:col-span-2">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <label className="min-w-0 flex-1">
                      <span className="text-[11px] font-medium text-slate-400">雇用区分</span>
                      <select
                        value={employmentType}
                        disabled={savingEmployment}
                        onChange={(event) => {
                          setEmploymentType(event.target.value)
                          setEmploymentError('')
                          setEmploymentSuccess('')
                        }}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      >
                        {employmentTypeOptions.map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={savingEmployment || employmentType === employee.employment_type}
                      onClick={() => void saveEmployment()}
                      className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {savingEmployment ? '更新中...' : '変更を保存'}
                    </button>
                  </div>
                  {employmentError && (
                    <p className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-300">{employmentError}</p>
                  )}
                  {employmentSuccess && (
                    <p className="mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-300">{employmentSuccess}</p>
                  )}
                </div>
              ) : (
                <InfoItem
                  label="雇用区分"
                  value={employmentTypeLabels[employee.employment_type ?? ''] ?? employee.position_title ?? '未登録'}
                />
              )}
              <InfoItem label="入社日" value={formatDate(employee.hire_date)} />
              <InfoItem label="在籍状態" value={employee.employee_status} />

            </div>
          </DetailSection>

          <DetailSection title="所属事務所">
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <div className="flex items-start gap-3">

                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                  <Building2 size={17} />
                </div>

                <div>
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {employee.office?.name ?? '未登録'}
                  </div>

                  {employee.office?.address && (
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">{employee.office.address}</p>
                  )}
                </div>

              </div>
            </div>
          </DetailSection>

          {employee.work_email && (
            <DetailSection title="連絡先">
              <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/50">

                <Mail size={16} className="shrink-0 text-slate-400" />

                <span className="min-w-0 flex-1 truncate text-sm text-slate-600 dark:text-slate-300">
                  {showEmail ? employee.work_email : maskEmail(employee.work_email)}
                </span>

                <button
                  type="button"
                  onClick={() => setShowEmail((current) => !current)}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-indigo-500 transition hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
                >
                  {showEmail ? '隠す' : '表示'}
                </button>

              </div>
            </DetailSection>
          )}

          {employee.attendance && (
            <DetailSection title="本日の勤務">

              <div className="grid gap-3 sm:grid-cols-2">
                <InfoItem label="勤務開始" value={formatTime(employee.attendance.clock_in)} />

                {employee.work_status === 'outside' && (
                  <InfoItem label="外出先" value={employee.attendance.outside_destination ?? '未登録'} />
                )}
              </div>

              {employee.attendance.current_task && (
                <div className="mt-3 rounded-xl bg-indigo-50 p-4 dark:bg-indigo-500/[0.08]">
                  <div className="text-[10px] font-bold text-indigo-500">{questStatusLabel[employee.attendance.current_task.status]}</div>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-slate-700 dark:text-slate-200">
                    {employee.attendance.current_task.task_description}
                  </p>
                </div>
              )}

            </DetailSection>
          )}

          {canResetPassword && employee.user_id && (
            <section className="border-t border-slate-200 pt-5 dark:border-slate-800">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/35">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">ログインパスワードをリセット</p>
                    <p className="mt-1 max-w-lg text-xs leading-5 text-slate-500 dark:text-slate-400">新しい仮パスワードを自動生成します。現在のログイン状態は終了し、本人は次回ログイン後に必ず変更します。</p>
                  </div>
                  <button
                    type="button"
                    disabled={resettingPassword}
                    onClick={() => void resetPassword()}
                    className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-800 transition hover:border-amber-400 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
                  >
                    {resettingPassword ? '生成中…' : '仮パスワードを生成'}
                  </button>
                </div>

                {temporaryPassword && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-white p-3 dark:border-amber-500/25 dark:bg-slate-900">
                    <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">仮パスワード（この画面でのみ表示）</p>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="min-w-0 flex-1 select-all overflow-x-auto rounded-md bg-slate-100 px-3 py-2 font-mono text-sm font-bold tracking-wide text-slate-800 dark:bg-slate-800 dark:text-slate-100">{temporaryPassword}</code>
                      <button type="button" onClick={() => void copyTemporaryPassword()} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                        <Copy size={14} /> コピー
                      </button>
                    </div>
                  </div>
                )}
                {resetError && <p className="mt-3 text-xs font-medium text-rose-600 dark:text-rose-300">{resetError}</p>}
                {resetSuccess && <p className="mt-3 text-xs font-medium text-emerald-700 dark:text-emerald-300">{resetSuccess}</p>}
              </div>
            </section>
          )}

        </div>
      </div>
    </div>

    {showAssignTask && (
      <AssignTaskModal
        employee={employee}
        onClose={() => setShowAssignTask(false)}
        onAssigned={() => {
          setShowAssignTask(false)
          setAssignmentMessage('業務を依頼しました。')
        }}
      />
    )}
    </>
  )
}

function AccessLevelDetail({
  roles,
  open,
  onToggle,
}: {
  roles: RoleOption[]
  open: boolean
  onToggle: () => void
}) {
  const role = roles[0]
  const level = role ? accessLevelGuide[role.name as keyof typeof accessLevelGuide] : undefined
  const visual = role ? rolePresentation[role.name as keyof typeof rolePresentation] : undefined
  const Icon = visual?.icon ?? ShieldCheck

  if (!role || !level) {
    return <span className="text-xs text-slate-400">権限が設定されていません。</span>
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="organization-tap flex w-full items-center justify-between gap-3 rounded-xl px-1 py-0.5 text-left"
      >
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
          <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${visual?.iconClass ?? 'bg-slate-100 text-slate-500'}`}>
            <Icon size={14} />
          </span>
          {level.title}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-300">
          詳細
          <ChevronDown size={15} className={`transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      <div className={`access-level-expand ${open ? 'is-open' : ''}`}>
        <div className="overflow-hidden">
          <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 dark:border-indigo-500/20 dark:bg-indigo-500/[0.06]">
            <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">{level.description}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {level.capabilities.map((capability) => (
                <span key={capability} className="rounded-md bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-200">
                  {capability}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AccessLevelSummary({
  roles,
  compact = false,
}: {
  roles: RoleOption[]
  compact?: boolean
}) {
  const role = roles[0]
  const level = role ? accessLevelGuide[role.name as keyof typeof accessLevelGuide] : undefined
  const visual = role ? rolePresentation[role.name as keyof typeof rolePresentation] : undefined
  const Icon = visual?.icon ?? ShieldCheck

  if (!role || !level) {
    return <span className="text-[11px] text-slate-400">未設定</span>
  }

  if (compact) {
    return (
      <span className="min-w-0 truncate font-semibold text-slate-700 dark:text-slate-300">
        {level.title}
      </span>
    )
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${visual?.iconClass ?? 'bg-slate-100 text-slate-500'}`}>
          <Icon size={12} />
        </span>
        <span className="truncate text-[11px] font-bold text-slate-800 dark:text-slate-100">{level.title}</span>
      </div>
    </div>
  )
}

function RoleSelectionCard({
  role,
  selected,
  onToggle,
}: {
  role: RoleOption
  selected: boolean
  onToggle: () => void
}) {
  const visual = rolePresentation[role.name as keyof typeof rolePresentation]
  const Icon = visual?.icon ?? UserRound
  const selectedClass = selected
    ? visual?.selectedClass ?? 'border-indigo-400 bg-indigo-50 dark:border-indigo-400/50 dark:bg-indigo-500/10'
    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600 dark:hover:bg-slate-800'
  const checkClass = selected
    ? visual?.checkClass ?? 'border-indigo-600 bg-indigo-600 text-white'
    : 'border-slate-300 bg-white text-transparent dark:border-slate-600 dark:bg-slate-900'

  return (
    <label className={`group flex cursor-pointer items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-all ${selectedClass}`}>
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="sr-only"
      />
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${visual?.iconClass ?? 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'}`}>
        <Icon size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold text-slate-800 dark:text-slate-100">{role.display_name}</span>
      </span>
      <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition ${checkClass}`}>
        <Check size={12} strokeWidth={3} />
      </span>
    </label>
  )
}

function AssignTaskModal({
  employee,
  onClose,
  onAssigned,
}: {
  employee: OrganizationEmployee
  onClose: () => void
  onAssigned: () => void
}) {
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [duration, setDuration] = useState<AssignDuration>(60)
  const [deadlineHour, setDeadlineHour] = useState('')
  const [deadlineMinute, setDeadlineMinute] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const handleSubmit = async () => {
    if (!title.trim() || submitting) return

    try {
      setSubmitting(true)
      setErrorMessage('')

      await api.post(`/employees/${employee.id}/tasks`, {
        title: title.trim(),
        description: note.trim() || null,
        duration_minutes: duration === 'custom' ? 60 : duration,
        due_at: duration === 'custom'
          ? buildClosestTokyoDeadline(deadlineHour, deadlineMinute)
          : null,
      })

      onAssigned()
    } catch (error) {
      setErrorMessage(
        axios.isAxiosError(error)
          ? error.response?.data?.message ?? '業務の依頼に失敗しました。'
          : 'サーバーとの通信に失敗しました。',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
        className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl dark:bg-slate-900 sm:p-6"
      >
        {/* Icon */}
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
          <BriefcaseBusiness size={25} />
        </div>

        {/* Title */}
        <div className="text-center">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white">
            業務を依頼
          </h3>

          <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-slate-400">
            <span className="font-bold text-indigo-600 dark:text-indigo-400">
              {employee.full_name}
            </span>
            さん（{employee.employee_code}）専用の業務を登録します。
          </p>

          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-[11px] font-bold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
            <UserRound size={13} />
            送信先：{employee.full_name}
          </div>
        </div>

        <div className="mt-5 space-y-4 text-left">

          {/* Task */}
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-gray-600 dark:text-slate-300">
              作業内容
            </span>

            <span className="relative block">
              <ListTodo
                size={17}
                className="pointer-events-none absolute left-3 top-3 text-indigo-500"
              />

              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={255}
                autoFocus
                placeholder="例：契約書の確認"
                className="h-11 w-full rounded-xl border border-indigo-200 bg-white pl-10 pr-3 text-sm text-gray-800 outline-none transition placeholder:text-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 dark:focus:ring-indigo-500/10"
              />
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-gray-600 dark:text-slate-300">
              Note・依頼メモ
            </span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              maxLength={5000}
              placeholder="例：機能A・B・Cを実装し、確認結果を報告してください。"
              className="w-full resize-none rounded-xl border border-indigo-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition placeholder:text-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 dark:focus:ring-indigo-500/10"
            />
          </label>

          <div>
            <span className="mb-1.5 block text-xs font-bold text-gray-600 dark:text-slate-300">
              作業時間
            </span>
            <span className="mb-3 block text-[11px] text-slate-400 dark:text-slate-500">
              社員が業務を確認した時点から、タイマーが開始されます。
            </span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([30, 60, 120] as const).map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => setDuration(minutes)}
                  className={`rounded-xl border px-2 py-3 text-sm font-bold transition ${
                    duration === minutes
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-600 ring-2 ring-indigo-100 dark:bg-indigo-500/10 dark:ring-indigo-500/20'
                      : 'border-gray-200 text-gray-500 hover:border-indigo-200 hover:bg-indigo-50/50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
                  }`}
                >
                  {formatTaskDuration(minutes)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setDuration('custom')}
                className={`rounded-xl border px-2 py-3 text-sm font-bold transition ${
                  duration === 'custom'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-600 ring-2 ring-indigo-100 dark:bg-indigo-500/10 dark:ring-indigo-500/20'
                    : 'border-gray-200 text-gray-500 hover:border-indigo-200 hover:bg-indigo-50/50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                時刻指定
              </button>
            </div>
            {duration === 'custom' && (
              <div className="mt-3">
                <span className="mb-1.5 block text-xs font-bold text-gray-600 dark:text-slate-300">完了予定時刻</span>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <select value={deadlineHour} onChange={(event) => setDeadlineHour(event.target.value)} className="h-12 rounded-xl border border-indigo-200 bg-white px-3 text-center text-sm font-bold text-gray-800 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-indigo-500/10"><option value="" disabled>時</option>{taskHours.map((hour) => <option key={hour} value={String(hour).padStart(2, '0')}>{String(hour).padStart(2, '0')}</option>)}</select>
                  <span className="text-lg font-bold text-slate-400">:</span>
                  <select value={deadlineMinute} onChange={(event) => setDeadlineMinute(event.target.value)} className="h-12 rounded-xl border border-indigo-200 bg-white px-3 text-center text-sm font-bold text-gray-800 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-indigo-500/10"><option value="" disabled>分</option>{taskMinutes.map((minute) => <option key={minute} value={String(minute).padStart(2, '0')}>{String(minute).padStart(2, '0')}</option>)}</select>
                </div>
                <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">今日の時刻を過ぎている場合は、翌日の完了予定として登録されます。</p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50 px-4 py-3.5 dark:border-indigo-500/20 dark:from-indigo-500/[0.12] dark:to-violet-500/[0.08]">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-300">
                <Clock3 size={17} />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold tracking-wider text-indigo-500 dark:text-indigo-300">TASK DURATION</div>
                <p className="mt-1 text-sm font-bold leading-relaxed text-slate-700 dark:text-slate-100">
                  {duration === 'custom'
                    ? '指定した完了予定時刻までタイマーが進みます。'
                    : <>作業時間は <span className="text-indigo-600 dark:text-indigo-300">{formatTaskDuration(duration)}</span> です。社員が確認するとタイマーが始まります。</>}
                </p>
              </div>
            </div>
          </div>

          {/* Error */}
          {errorMessage && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
              {errorMessage}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            キャンセル
          </button>

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || !title.trim() || (duration === 'custom' && (!deadlineHour || !deadlineMinute))}
            className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-indigo-600 px-3 py-3 text-sm font-bold text-white shadow-md shadow-indigo-500/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none dark:disabled:bg-slate-700"
          >
            <Play size={16} />

            {submitting
              ? '依頼中...'
              : '業務を依頼'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h3 className="shrink-0 text-xs font-bold text-slate-500 dark:text-slate-400">{title}</h3>
        <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
      </div>

      {children}
    </section>
  )
}

function InfoItem({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
      <div className="text-[10px] font-medium text-slate-400">{label}</div>
      <div className="mt-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">{value}</div>
    </div>
  )
}
