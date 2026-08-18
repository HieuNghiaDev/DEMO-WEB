import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import axios from 'axios'
import {
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  Clock3,
  Coffee,
  Mail,
  MapPin,
  RefreshCw,
  Scale,
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
}

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

type AssignDuration = 30 | 60 | 120

function formatTaskDuration(minutes: AssignDuration) {
  return minutes < 60 ? `${minutes}分` : `${minutes / 60}時間`
}

export default function OrganizationDesign() {
  const { user } = useAuth()
  const [employees, setEmployees] = useState<OrganizationEmployee[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedOfficeId, setSelectedOfficeId] = useState<number | null>(null)
  const [selectedEmployee, setSelectedEmployee] = useState<OrganizationEmployee | null>(null)

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
    <div className="mx-auto w-full max-w-[1600px] space-y-4 px-2.5 pb-10 sm:px-4 lg:px-6">

      {/* Header */}
      <header className="flex flex-col gap-3 rounded-2xl border border-slate-300 bg-white py-4 pl-16 pr-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-[9px] font-bold tracking-[0.16em] text-indigo-600 dark:text-indigo-400 sm:text-[10px]">
            <Building2 size={13} />
            THEMIS ORGANIZATION
          </div>

          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">組織設計</h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">社員・所属・勤務状況を確認</p>
        </div>

        <button
          type="button"
          disabled={refreshing}
          onClick={() => void loadOrganization(true)}
          className="inline-flex h-9 w-fit items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-600 transition-all hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/10"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          更新
        </button>
      </header>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      {/* Summary */}
      <section className="grid grid-cols-6 gap-2 sm:grid-cols-5 sm:gap-3">
        <SummaryCard
          title="全社員"
          value={summary.total}
          icon={<Users size={16} />}
          iconClass="bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
          className="col-span-2 sm:col-span-1"
        />

        <SummaryCard
          title="勤務中"
          value={summary.working}
          icon={<BriefcaseBusiness size={16} />}
          iconClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
          className="col-span-2 sm:col-span-1"
        />

        <SummaryCard
          title="休憩中"
          value={summary.break}
          icon={<Coffee size={16} />}
          iconClass="bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
          className="col-span-2 sm:col-span-1"
        />

        <SummaryCard
          title="外出中"
          value={summary.outside}
          icon={<MapPin size={16} />}
          iconClass="bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400"
          className="col-span-3 sm:col-span-1"
        />

        <SummaryCard
          title="オフライン"
          value={summary.offline}
          icon={<UserRound size={16} />}
          iconClass="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          className="col-span-3 sm:col-span-1"
        />
      </section>

      {/* Office selector */}
      <section className="rounded-2xl border border-slate-300 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
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
                    className={`group flex min-w-0 flex-1 items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all ${
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

      {/* Employee list */}
      <section className="overflow-hidden rounded-2xl border-[1.5px] border-slate-300 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">

        <div className="flex items-center justify-between border-b border-slate-300 bg-slate-50/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/30 sm:px-5">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">社員一覧</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">{visibleEmployees.length}名の社員</p>
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
        <div className="hidden grid-cols-[minmax(220px,1.4fr)_minmax(200px,1.2fr)_minmax(150px,0.9fr)_130px_minmax(180px,1fr)_30px] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-950/40 lg:grid">
          <div>社員</div>
          <div>所属事務所</div>
          <div>役職</div>
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
                onClick={() => setSelectedEmployee(employee)}
              />
            ))}
          </div>
        )}
      </section>

      {selectedEmployee && (
        <EmployeeDetailModal
          employee={selectedEmployee}
          canAssignTasks={user?.role === 'manager' || user?.role === 'admin'}
          onClose={() => setSelectedEmployee(null)}
        />
      )}
    </div>
  )
}

function SummaryCard({
  title,
  value,
  icon,
  iconClass,
  className = '',
}: {
  title: string
  value: number
  icon: ReactNode
  iconClass: string
  className?: string
}) {
  return (
    <div className={`${className} flex min-h-[70px] items-center gap-2.5 rounded-xl border border-slate-300 bg-white px-2.5 py-2.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-500/30 sm:min-h-[78px] sm:gap-3 sm:px-4`}>
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 ${iconClass}`}>
        {icon}
      </div>

      <div className="min-w-0">
        <div className="text-lg font-bold leading-none text-slate-900 dark:text-white sm:text-xl">{value}</div>
        <div className="mt-1.5 truncate text-[10px] font-semibold text-slate-500 dark:text-slate-300 sm:text-xs">{title}</div>
      </div>
    </div>
  )
}

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
      className="group relative w-full overflow-hidden rounded-xl border border-slate-300 bg-white px-3.5 py-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-500/40 sm:px-4 lg:rounded-none lg:border-x-0 lg:border-t-0 lg:border-b lg:border-slate-200 lg:px-5 lg:shadow-none lg:hover:translate-y-0 lg:hover:bg-indigo-50/40 lg:hover:shadow-none dark:lg:border-slate-800 dark:lg:hover:bg-indigo-500/[0.035] last:lg:border-b-0"
    >
      <div className="absolute bottom-2 left-0 top-2 w-[3px] scale-y-0 rounded-r-full bg-indigo-500 transition-transform group-hover:scale-y-100" />

      {/* Desktop */}
      <div className="hidden grid-cols-[minmax(220px,1.4fr)_minmax(200px,1.2fr)_minmax(150px,0.9fr)_130px_minmax(180px,1fr)_30px] items-center gap-4 lg:grid">

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
                作業中
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
                  現在の作業
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
  onClose,
}: {
  employee: OrganizationEmployee
  canAssignTasks: boolean
  onClose: () => void
}) {
  const [showEmail, setShowEmail] = useState(false)
  const [showAssignTask, setShowAssignTask] = useState(false)
  const [assignmentMessage, setAssignmentMessage] = useState('')
  const status = statusConfig[employee.work_status]
  const initial = employee.full_name.trim().charAt(0).toUpperCase() || '?'

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={onClose}
    >
      <div
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:max-w-2xl sm:rounded-3xl"
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

          {canAssignTasks && (
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

          {canAssignTasks && (
            <p className="-mt-3 text-center text-[11px] text-slate-400 dark:text-slate-500">
              この社員にのみ業務を割り当てます。
            </p>
          )}

          <DetailSection title="基本情報">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

              {employee.department && <InfoItem label="部署" value={employee.department.name} />}

              <InfoItem label="役職" value={employee.position_title ?? '未登録'} />
              <InfoItem label="雇用形態" value={employee.employment_type ?? '未登録'} />
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
                  <div className="text-[10px] font-bold text-indigo-500">現在の作業</div>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-slate-700 dark:text-slate-200">
                    {employee.attendance.current_task.task_description}
                  </p>
                </div>
              )}

            </DetailSection>
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
  const [duration, setDuration] = useState<AssignDuration>(60)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const handleSubmit = async () => {
    if (!title.trim() || submitting) return

    try {
      setSubmitting(true)
      setErrorMessage('')

      await api.post(`/employees/${employee.id}/tasks`, {
        title: title.trim(),
        description: null,
        duration_minutes: duration,
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

          <div>
            <span className="mb-1.5 block text-xs font-bold text-gray-600 dark:text-slate-300">
              作業時間
            </span>
            <span className="mb-3 block text-[11px] text-slate-400 dark:text-slate-500">
              社員が業務を確認した時点から、タイマーが開始されます。
            </span>
            <div className="grid grid-cols-3 gap-2">
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
            </div>
          </div>

          <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50 px-4 py-3.5 dark:border-indigo-500/20 dark:from-indigo-500/[0.12] dark:to-violet-500/[0.08]">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-300">
                <Clock3 size={17} />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold tracking-wider text-indigo-500 dark:text-indigo-300">TASK DURATION</div>
                <p className="mt-1 text-sm font-bold leading-relaxed text-slate-700 dark:text-slate-100">
                  作業時間は <span className="text-indigo-600 dark:text-indigo-300">{formatTaskDuration(duration)}</span> です。社員が確認するとタイマーが始まります。
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
            disabled={submitting || !title.trim()}
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
