import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

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
  Search,
  UserRound,
  Users,
  X,
} from 'lucide-react'

import api from '../services/api'

type WorkStatus =
  | 'working'
  | 'break'
  | 'outside'
  | 'offline'

type CurrentTask = {
  id: number
  task_description: string
  started_at: string
  expected_end_at: string | null
}

type AttendanceInfo = {
  id: number
  clock_in: string
  break_start: string | null
  break_end: string | null
  outside_destination: string | null
  outside_start: string | null
  outside_expected_end: string | null
  status: WorkStatus
  current_task: CurrentTask | null
}

type OrganizationEmployee = {
  id: number
  employee_code: string
  full_name: string
  full_name_kana: string | null
  gender: string | null

  position_title: string | null
  employment_type: string | null

  work_email: string | null
  avatar_path: string | null

  employee_status: string
  hire_date: string | null

  phone: string | null
  date_of_birth: string | null
  nationality_code: string | null

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
  summary: {
    total: number
    working: number
    break: number
    outside: number
    offline: number
  }

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
    badge:
      'bg-emerald-50 text-emerald-700 ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
  },

  break: {
    label: '休憩中',
    dot: 'bg-amber-500',
    badge:
      'bg-amber-50 text-amber-700 ring-amber-600/10 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
  },

  outside: {
    label: '外出中',
    dot: 'bg-sky-500',
    badge:
      'bg-sky-50 text-sky-700 ring-sky-600/10 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20',
  },

  offline: {
    label: 'オフライン',
    dot: 'bg-slate-300 dark:bg-slate-600',
    badge:
      'bg-slate-100 text-slate-500 ring-slate-500/10 dark:bg-slate-800 dark:text-slate-400 dark:ring-white/10',
  },
}

function formatTime(
  value: string | null | undefined,
) {
  if (!value) return '--:--'

  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tokyo',
  }).format(new Date(value))
}

function formatDate(
  value: string | null | undefined,
) {
  if (!value) return '未登録'

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(
    new Date(`${value}T00:00:00`),
  )
}

function maskEmail(email: string) {
  const [name, domain] = email.split('@')

  if (!name || !domain) {
    return email
  }

  const visibleStart = name.charAt(0)

  return `${visibleStart}${'*'.repeat(
    Math.max(name.length - 1, 5),
  )}@${domain}`
}

function OrganizationDesign() {
  const [employees, setEmployees] = useState<
    OrganizationEmployee[]
  >([])

  const [loading, setLoading] =
    useState(true)

  const [refreshing, setRefreshing] =
    useState(false)

  const [errorMessage, setErrorMessage] =
    useState('')

  const [searchText, setSearchText] =
    useState('')

  const [
    officeFilter,
    setOfficeFilter,
  ] = useState('all')

  const [statusFilter, setStatusFilter] =
    useState<WorkStatus | 'all'>(
      'all',
    )

  const [
    selectedEmployee,
    setSelectedEmployee,
  ] = useState<OrganizationEmployee | null>(
    null,
  )

  const loadOrganization =
    useCallback(
      async (manual = false) => {
        if (manual) {
          setRefreshing(true)
        } else {
          setLoading(true)
        }

        setErrorMessage('')

        try {
          const response =
            await api.get<OrganizationResponse>(
              '/organization',
            )

          setEmployees(
            response.data.employees,
          )
        } catch (error) {
          if (axios.isAxiosError(error)) {
            setErrorMessage(
              error.response?.data
                ?.message ??
                '組織情報を取得できませんでした。',
            )
          } else {
            setErrorMessage(
              '組織情報を取得できませんでした。',
            )
          }
        } finally {
          setLoading(false)
          setRefreshing(false)
        }
      },
      [],
    )

  useEffect(() => {
    const initialLoadId = window.setTimeout(
      () => {
        void loadOrganization()
      },
      0,
    )

    const id = window.setInterval(
      () => {
        void loadOrganization(true)
      },
      30_000,
    )

    return () => {
      window.clearTimeout(initialLoadId)
      window.clearInterval(id)
    }
  }, [loadOrganization])

  const summary = useMemo(() => {
    return {
      total: employees.length,

      working: employees.filter(
        (employee) =>
          employee.work_status ===
          'working',
      ).length,

      break: employees.filter(
        (employee) =>
          employee.work_status ===
          'break',
      ).length,

      outside: employees.filter(
        (employee) =>
          employee.work_status ===
          'outside',
      ).length,

      offline: employees.filter(
        (employee) =>
          employee.work_status ===
          'offline',
      ).length,
    }
  }, [employees])

  const officeOptions =
  useMemo(() => {
    const map = new Map<
      string,
      string
    >()

    employees.forEach(
      (employee) => {
        if (employee.office) {
          map.set(
            String(
              employee.office.id,
            ),
            employee.office.name,
          )
        }
      },
    )

    return Array.from(
      map.entries(),
    ).sort((a, b) =>
      a[1].localeCompare(
        b[1],
        'ja',
      ),
    )
  }, [employees])

  const filteredEmployees =
  useMemo(() => {
    const keyword =
      searchText
        .trim()
        .toLowerCase()

    return employees.filter(
      (employee) => {
        const officeId =
          employee.office
            ? String(
                employee.office.id,
              )
            : 'unassigned'

        const officeMatch =
          officeFilter === 'all' ||
          officeFilter === officeId

        const statusMatch =
          statusFilter === 'all' ||
          employee.work_status ===
            statusFilter

        const searchMatch =
          !keyword ||
          employee.full_name
            .toLowerCase()
            .includes(keyword) ||
          employee.employee_code
            .toLowerCase()
            .includes(keyword) ||
          employee.full_name_kana
            ?.toLowerCase()
            .includes(keyword) ||
          employee.position_title
            ?.toLowerCase()
            .includes(keyword) ||
          employee.department
            ?.name
            .toLowerCase()
            .includes(keyword) ||
          employee.office
            ?.name
            .toLowerCase()
            .includes(keyword)

        return (
          officeMatch &&
          statusMatch &&
          searchMatch
        )
      },
    )
  }, [
    employees,
    searchText,
    officeFilter,
    statusFilter,
  ])

  const departments =
    useMemo(() => {
      const map = new Map<
        string,
        {
          id: string
          name: string
          code: string | null
          employees: OrganizationEmployee[]
        }
      >()

      filteredEmployees.forEach(
        (employee) => {
          const id =
            employee.department
              ? String(
                  employee
                    .department.id,
                )
              : 'unassigned'

          if (!map.has(id)) {
            map.set(id, {
              id,

              name:
                employee.department
                  ?.name ?? '未所属',

              code:
                employee.department
                  ?.department_code ??
                null,

              employees: [],
            })
          }

          map
            .get(id)
            ?.employees.push(
              employee,
            )
        },
      )

      return Array.from(
        map.values(),
      )
    }, [filteredEmployees])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-[3px] border-slate-200 border-t-indigo-600 dark:border-slate-800 dark:border-t-indigo-400" />

          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            組織情報を読み込んでいます...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 px-3 pb-10 sm:px-4 lg:space-y-6 lg:px-6">

      {/* Header */}

      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-7 lg:py-6">

        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold tracking-[0.15em] text-indigo-600 dark:text-indigo-400">
            <Building2 size={15} />
            THEMIS ORGANIZATION
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            組織設計
          </h1>

          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            社員・部署・勤務状況をリアルタイムで確認
          </p>
        </div>

        <button
          type="button"
          disabled={refreshing}
          onClick={() =>
            void loadOrganization(true)
          }
          className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 lg:self-auto"
        >
          <RefreshCw
            size={16}
            className={
              refreshing
                ? 'animate-spin'
                : ''
            }
          />

          更新
        </button>

      </header>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      {/* Summary */}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">

        <SummaryCard
          title="全社員"
          subtitle="登録社員"
          value={summary.total}
          icon={<Users size={20} />}
          iconClass="bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
        />

        <SummaryCard
          title="勤務中"
          subtitle="現在勤務中"
          value={summary.working}
          icon={
            <BriefcaseBusiness
              size={20}
            />
          }
          iconClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
        />

        <SummaryCard
          title="休憩中"
          subtitle="休憩しています"
          value={summary.break}
          icon={<Coffee size={20} />}
          iconClass="bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
        />

        <SummaryCard
          title="外出中"
          subtitle="社外にいます"
          value={summary.outside}
          icon={<MapPin size={20} />}
          iconClass="bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400"
        />

        <SummaryCard
          title="オフライン"
          subtitle="勤務時間外"
          value={summary.offline}
          icon={<UserRound size={20} />}
          iconClass="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
        />

      </section>

      {/* Search */}

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-4">

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px]">

          <div className="relative">
            <Search
              size={18}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              type="text"
              value={searchText}
              onChange={(event) =>
                setSearchText(
                  event.target.value,
                )
              }
              placeholder="社員名・社員コード・役職で検索"
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-600 dark:focus:border-indigo-500"
            />
          </div>

          <select
            value={officeFilter}
            onChange={(event) =>
              setOfficeFilter(
                event.target.value,
              )
            }
            className="
              h-11 min-w-0 cursor-pointer
              rounded-xl
              border border-slate-200
              bg-white
              px-3
              text-sm font-medium
              text-slate-700
              outline-none

              transition-all
              duration-200

              hover:border-indigo-300
              hover:bg-indigo-50/40

              focus:border-indigo-400
              focus:ring-4
              focus:ring-indigo-500/10

              dark:border-slate-700
              dark:bg-slate-950
              dark:text-slate-300

              dark:hover:border-indigo-500/40
              dark:hover:bg-indigo-500/[0.05]
            "
          >
            <option value="all">
              全事務所
            </option>

            {officeOptions.map(
              ([id, name]) => (
                <option
                  key={id}
                  value={id}
                >
                  {name}
                </option>
              ),
            )}
          </select>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target
                  .value as
                  | WorkStatus
                  | 'all',
              )
            }
            className="h-11 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
          >
            <option value="all">
              全ステータス
            </option>

            <option value="working">
              勤務中
            </option>

            <option value="break">
              休憩中
            </option>

            <option value="outside">
              外出中
            </option>

            <option value="offline">
              オフライン
            </option>
          </select>

        </div>
      </section>

      {/* Departments */}

      {departments.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-5">
          {departments.map(
            (department) => {
              const onlineCount =
                department.employees.filter(
                  (employee) =>
                    employee.work_status !==
                    'offline',
                ).length

              return (
                <section
                  key={department.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >

                  {/* Department header */}

                  <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between sm:px-6">

                    <div className="flex items-center gap-3">

                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                        <Building2
                          size={19}
                        />
                      </div>

                      <div>
                        <div className="flex flex-wrap items-center gap-2">

                          <h2 className="font-bold text-slate-900 dark:text-white">
                            {department.name}
                          </h2>

                          {department.code && (
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              {department.code}
                            </span>
                          )}

                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">

                          <span>
                            {
                              department
                                .employees
                                .length
                            }
                            名所属
                          </span>

                          <span>•</span>

                          <span>
                            {onlineCount}
                            名オンライン
                          </span>

                        </div>
                      </div>

                    </div>

                    <div className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      {
                        department
                          .employees
                          .length
                      }{' '}
                      社員
                    </div>

                  </div>

                  {/* Employee cards */}

                  <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">

                    {department.employees.map(
                      (employee) => (
                        <EmployeeCard
                          key={employee.id}
                          employee={employee}
                          onClick={() =>
                            setSelectedEmployee(
                              employee,
                            )
                          }
                        />
                      ),
                    )}

                  </div>

                </section>
              )
            },
          )}
        </div>
      )}

      {selectedEmployee && (
        <EmployeeDetailModal
          employee={
            selectedEmployee
          }
          onClose={() =>
            setSelectedEmployee(
              null,
            )
          }
        />
      )}

    </div>
  )
}

function SummaryCard({
  title,
  subtitle,
  value,
  icon,
  iconClass,
}: {
  title: string
  subtitle: string
  value: number
  icon: ReactNode
  iconClass: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 sm:p-5">

      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconClass}`}
      >
        {icon}
      </div>

      <div className="mt-4 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
        {value}
      </div>

      <div className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
        {title}
      </div>

      <div className="mt-0.5 hidden text-[11px] text-slate-400 sm:block">
        {subtitle}
      </div>

    </div>
  )
}

function EmployeeCard({
  employee,
  onClick,
}: {
  employee: OrganizationEmployee
  onClick: () => void
}) {
  const status =
    statusConfig[
      employee.work_status
    ]

  const initial =
    employee.full_name
      .trim()
      .charAt(0)
      .toUpperCase() || '?'

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg hover:shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-950/50 dark:hover:border-indigo-500/30 dark:hover:shadow-black/20 sm:p-5"
    >

      <div className="flex min-w-0 items-start gap-3">

        {/* Avatar */}

        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 font-bold text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20">

          {initial}

          <span
            className={`absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-[2.5px] border-white dark:border-slate-950 ${status.dot}`}
          />

        </div>

        {/* Name */}

        <div className="min-w-0 flex-1">

          <div className="flex items-start gap-2">

            <div className="min-w-0 flex-1">

              <h3 className="truncate text-sm font-bold text-slate-900 dark:text-slate-100 sm:text-[15px]">
                {employee.full_name}
              </h3>

              {employee.full_name_kana && (
                <p className="mt-0.5 truncate text-[11px] text-slate-400">
                  {
                    employee
                      .full_name_kana
                  }
                </p>
              )}

              <p className="mt-1 text-[11px] font-semibold text-indigo-500 dark:text-indigo-400">
                {
                  employee
                    .employee_code
                }
              </p>

            </div>

            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ring-inset ${status.badge}`}
            >
              {status.label}
            </span>

          </div>
        </div>

      </div>

      <div className="my-4 border-t border-slate-100 dark:border-slate-800" />

      <div className="space-y-2.5">

        <div className="flex min-w-0 items-center gap-2 text-xs text-slate-500 dark:text-slate-400">

          <BriefcaseBusiness
            size={14}
            className="shrink-0 text-slate-400 dark:text-slate-600"
          />

          <span className="truncate">
            {employee.position_title ??
              '役職未登録'}
          </span>

        </div>

        {employee.attendance && (
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">

            <Clock3
              size={14}
              className="shrink-0 text-slate-400 dark:text-slate-600"
            />

            <span>
              勤務開始
            </span>

            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {formatTime(
                employee.attendance
                  .clock_in,
              )}
            </span>

          </div>
        )}

        {employee.work_status ===
          'outside' &&
          employee.attendance
            ?.outside_destination && (
            <div className="flex min-w-0 items-center gap-2 text-xs text-sky-600 dark:text-sky-400">

              <MapPin
                size={14}
                className="shrink-0"
              />

              <span className="truncate">
                {
                  employee
                    .attendance
                    .outside_destination
                }
              </span>

            </div>
          )}

      </div>

      {employee.attendance
        ?.current_task && (
        <div className="mt-4 rounded-xl bg-indigo-50 px-3 py-3 dark:bg-indigo-500/[0.08]">

          <div className="flex items-center gap-2 text-[10px] font-bold text-indigo-500 dark:text-indigo-400">

            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />

            現在の作業

          </div>

          <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-relaxed text-slate-700 dark:text-slate-200">
            {
              employee
                .attendance
                .current_task
                .task_description
            }
          </p>

        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-1 text-[11px] font-semibold text-slate-400 opacity-0 transition group-hover:text-indigo-500 group-hover:opacity-100 sm:flex">

        詳細を見る

        <ChevronRight size={13} />

      </div>

    </button>
  )
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center dark:border-slate-700 dark:bg-slate-900">

      <Users
        size={38}
        className="mx-auto text-slate-300 dark:text-slate-700"
      />

      <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
        条件に一致する社員はいません。
      </p>

    </div>
  )
}

function EmployeeDetailModal({
  employee,
  onClose,
}: {
  employee: OrganizationEmployee
  onClose: () => void
}) {
  const [showEmail, setShowEmail] =
  useState(false)

  const status =
    statusConfig[
      employee.work_status
    ]

  const initial =
    employee.full_name
      .trim()
      .charAt(0)
      .toUpperCase() || '?'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={onClose}
    >

      <div
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:max-w-2xl sm:rounded-3xl"
        onMouseDown={(event) =>
          event.stopPropagation()
        }
      >

        {/* modal header */}

        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white/95 px-5 py-5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:px-6">

          <div className="flex min-w-0 items-center gap-4">

            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-lg font-bold text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">

              {initial}

              <span
                className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-[3px] border-white dark:border-slate-900 ${status.dot}`}
              />

            </div>

            <div className="min-w-0">
              <div className="text-[10px] font-bold tracking-widest text-indigo-500">
                EMPLOYEE PROFILE
              </div>

              <h2 className="mt-1 truncate text-lg font-bold text-slate-900 dark:text-white sm:text-xl">
                {employee.full_name}
              </h2>

              <div className="mt-1 text-xs text-slate-400">
                {
                  employee
                    .employee_code
                }
              </div>
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
              <div className="text-xs text-slate-400">
                現在の勤務状態
              </div>

              <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-white">
                {status.label}
              </div>
            </div>

            <span
              className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 ring-inset ${status.badge}`}
            >
              {status.label}
            </span>

          </div>

          <DetailSection
            title="基本情報"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

              <InfoItem
                label="社員コード"
                value={
                  employee
                    .employee_code
                }
              />

              <InfoItem
                label="部署"
                value={
                  employee.department
                    ?.name ??
                  '未所属'
                }
              />

              <InfoItem
                label="役職"
                value={
                  employee
                    .position_title ??
                  '未登録'
                }
              />

              <InfoItem
                label="雇用形態"
                value={
                  employee
                    .employment_type ??
                  '未登録'
                }
              />

              <InfoItem
                label="入社日"
                value={formatDate(
                  employee.hire_date,
                )}
              />

              <InfoItem
                label="在籍状態"
                value={
                  employee
                    .employee_status
                }
              />

            </div>
          </DetailSection>

          <DetailSection
            title="所属事務所"
          >
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">

              <div className="flex items-start gap-3">

                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                  <Building2
                    size={17}
                  />
                </div>

                <div>
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {employee.office
                      ?.name ??
                      '未登録'}
                  </div>

                  {employee.office
                    ?.address && (
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">
                      {
                        employee
                          .office
                          .address
                      }
                    </p>
                  )}
                </div>

              </div>
            </div>
          </DetailSection>

          {employee.work_email && (
            <DetailSection title="連絡先">
              <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/50">

                <Mail
                  size={16}
                  className="shrink-0 text-slate-400"
                />

                <span className="min-w-0 flex-1 truncate text-sm text-slate-600 dark:text-slate-300">
                  {showEmail
                    ? employee.work_email
                    : maskEmail(
                        employee.work_email,
                      )}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setShowEmail(
                      (current) => !current,
                    )
                  }
                  className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-indigo-500 transition hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
                >
                  {showEmail ? '隠す' : '表示'}
                </button>

              </div>
            </DetailSection>
          )}

          {employee.attendance && (
            <DetailSection
              title="本日の勤務"
            >
              <div className="grid gap-3 sm:grid-cols-2">

                <InfoItem
                  label="勤務開始"
                  value={formatTime(
                    employee
                      .attendance
                      .clock_in,
                  )}
                />

                {employee.work_status ===
                  'outside' && (
                  <InfoItem
                    label="外出先"
                    value={
                      employee
                        .attendance
                        .outside_destination ??
                      '未登録'
                    }
                  />
                )}

              </div>

              {employee.attendance
                .current_task && (
                <div className="mt-3 rounded-xl bg-indigo-50 p-4 dark:bg-indigo-500/[0.08]">

                  <div className="text-[10px] font-bold text-indigo-500">
                    現在の作業
                  </div>

                  <p className="mt-2 text-sm font-medium leading-relaxed text-slate-700 dark:text-slate-200">
                    {
                      employee
                        .attendance
                        .current_task
                        .task_description
                    }
                  </p>

                </div>
              )}

            </DetailSection>
          )}

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

        <h3 className="shrink-0 text-xs font-bold text-slate-500 dark:text-slate-400">
          {title}
        </h3>

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

      <div className="text-[10px] font-medium text-slate-400">
        {label}
      </div>

      <div className="mt-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
        {value}
      </div>

    </div>
  )
}

export default OrganizationDesign