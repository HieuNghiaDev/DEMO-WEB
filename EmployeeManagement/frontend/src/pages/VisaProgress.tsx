import axios from 'axios'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { getVisaProgress } from '../features/visa-progress/api'
import VisaProgressFilters from '../features/visa-progress/VisaProgressFilters'
import VisaProgressHeader from '../features/visa-progress/VisaProgressHeader'
import VisaProgressInsights from '../features/visa-progress/VisaProgressInsights'
import VisaProgressPagination from '../features/visa-progress/VisaProgressPagination'
import VisaProgressSummary from '../features/visa-progress/VisaProgressSummary'
import VisaProgressTable from '../features/visa-progress/VisaProgressTable'
import type { VisaDeadlineLevel, VisaProgressApplication, VisaProgressDashboard } from '../features/visa-progress/types'
import { isAttentionDeadline } from '../features/visa-progress/visaProgressUi'

const deadlineOrder: Record<VisaDeadlineLevel, number> = {
  overdue: 0,
  critical: 1,
  warning: 2,
  normal: 3,
  none: 4,
}

export default function VisaProgress() {
  const [dashboard, setDashboard] = useState<VisaProgressDashboard | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [statusesFilter, setStatusesFilter] = useState<string[]>([])
  const [responsiblePerson, setResponsiblePerson] = useState('all')
  const [deadlineLevel, setDeadlineLevel] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const loadDashboard = async (refresh = false) => {
    if (refresh) setIsRefreshing(true)
    else setIsLoading(true)

    setError(null)
    setRefreshError(null)

    try {
      setDashboard(await getVisaProgress(refresh))
    } catch (requestError) {
      const message = getErrorMessage(requestError)
      if (refresh && dashboard) setRefreshError(message)
      else setError(message)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    let isActive = true

    void getVisaProgress()
      .then((nextDashboard) => {
        if (isActive) setDashboard(nextDashboard)
      })
      .catch((requestError: unknown) => {
        if (isActive) setError(getErrorMessage(requestError))
      })
      .finally(() => {
        if (isActive) setIsLoading(false)
      })

    return () => {
      isActive = false
    }
  }, [])

  const applications = useMemo(() => dashboard?.applications ?? [], [dashboard])
  const statuses = useMemo(() => uniqueValues(applications, 'status'), [applications])
  const responsiblePeople = useMemo(() => uniqueValues(applications, 'responsible_person'), [applications])
  const filteredApplications = useMemo(
    () => filterApplications(applications, keyword, statusesFilter, responsiblePerson, deadlineLevel),
    [applications, keyword, statusesFilter, responsiblePerson, deadlineLevel],
  )
  const totalPages = Math.max(1, Math.ceil(filteredApplications.length / pageSize))
  const validCurrentPage = Math.min(currentPage, totalPages)
  const pageStartIndex = (validCurrentPage - 1) * pageSize
  const visibleApplications = filteredApplications.slice(pageStartIndex, pageStartIndex + pageSize)
  const hasActiveFilters = keyword.trim() !== '' || statusesFilter.length > 0 || responsiblePerson !== 'all' || deadlineLevel !== 'all'

  const updateKeyword = (value: string) => {
    setKeyword(value)
    setCurrentPage(1)
  }

  const updateStatuses = (values: string[]) => {
    setStatusesFilter(values)
    setCurrentPage(1)
  }

  const updateResponsiblePerson = (value: string) => {
    setResponsiblePerson(value)
    setCurrentPage(1)
  }

  const updateDeadlineLevel = (value: string) => {
    setDeadlineLevel(value)
    setCurrentPage(1)
  }

  const resetFilters = () => {
    setKeyword('')
    setStatusesFilter([])
    setResponsiblePerson('all')
    setDeadlineLevel('all')
    setCurrentPage(1)
  }

  const showAttentionApplications = () => {
    setDeadlineLevel('attention')
    setCurrentPage(1)
    window.requestAnimationFrame(() => {
      document.getElementById('visa-progress-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return (
    <div className="w-full min-w-0 max-w-full px-4 pb-10 pt-5 sm:px-5 lg:px-6 xl:px-8">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" aria-label="在留申請運用概要">
        <VisaProgressHeader
          source={dashboard?.source ?? null}
          refreshing={isRefreshing}
          onRefresh={() => void loadDashboard(true)}
        />
        {!isLoading && !error && dashboard && <VisaProgressSummary summary={dashboard.summary} />}
      </section>

      {isLoading && <LoadingState />}

      {!isLoading && error && <ErrorState message={error} onRetry={() => void loadDashboard(true)} />}

      {!isLoading && !error && dashboard && (
        <>
          {refreshError && <RefreshError message={refreshError} onRetry={() => void loadDashboard(true)} />}
          <VisaProgressInsights applications={applications} onShowAttention={showAttentionApplications} />

          <section id="visa-progress-workspace" className="mt-6 scroll-mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <VisaProgressFilters
              keyword={keyword}
              selectedStatuses={statusesFilter}
              responsiblePerson={responsiblePerson}
              deadlineLevel={deadlineLevel}
              statuses={statuses}
              responsiblePeople={responsiblePeople}
              totalCount={applications.length}
              filteredCount={filteredApplications.length}
              visibleStart={filteredApplications.length > 0 ? pageStartIndex + 1 : 0}
              visibleEnd={Math.min(pageStartIndex + pageSize, filteredApplications.length)}
              onKeywordChange={updateKeyword}
              onStatusesChange={updateStatuses}
              onResponsiblePersonChange={updateResponsiblePerson}
              onDeadlineLevelChange={updateDeadlineLevel}
              onReset={resetFilters}
            />
            <VisaProgressTable
              applications={visibleApplications}
              hasActiveFilters={hasActiveFilters}
              onResetFilters={resetFilters}
            />
            {filteredApplications.length > 0 && (
              <VisaProgressPagination
                currentPage={validCurrentPage}
                pageSize={pageSize}
                totalItems={filteredApplications.length}
                totalSourceItems={applications.length}
                onPageChange={setCurrentPage}
                onPageSizeChange={(size) => {
                  setPageSize(size)
                  setCurrentPage(1)
                }}
              />
            )}
          </section>
        </>
      )}
    </div>
  )
}

function filterApplications(applications: VisaProgressApplication[], keyword: string, selectedStatuses: string[], responsiblePerson: string, deadlineLevel: string): VisaProgressApplication[] {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase()

  return applications
    .filter((application) => {
      const matchesKeyword = !normalizedKeyword || [application.case_id, application.applicant_name]
        .some((value) => value?.toLocaleLowerCase().includes(normalizedKeyword))
      const matchesStatus = selectedStatuses.length === 0 || (application.status !== null && selectedStatuses.includes(application.status))
      const matchesResponsiblePerson = responsiblePerson === 'all' || application.responsible_person === responsiblePerson
      const matchesDeadline = deadlineLevel === 'all'
        || (deadlineLevel === 'attention' && isAttentionDeadline(application.deadline_level))
        || (deadlineLevel === 'has_deadline' && application.deadline_level !== 'none')
        || application.deadline_level === deadlineLevel

      return matchesKeyword && matchesStatus && matchesResponsiblePerson && matchesDeadline
    })
    .sort((left, right) => {
      const levelDifference = deadlineOrder[left.deadline_level] - deadlineOrder[right.deadline_level]

      if (levelDifference !== 0) return levelDifference
      if (!left.deadline) return 1
      if (!right.deadline) return -1

      return left.deadline.localeCompare(right.deadline)
    })
}

function uniqueValues(applications: VisaProgressApplication[], field: 'status' | 'responsible_person'): string[] {
  return Array.from(new Set(applications.map((application) => application[field]).filter((value): value is string => Boolean(value))))
    .sort((left, right) => left.localeCompare(right, 'ja'))
}

function getErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) return '在留申請データを取得できませんでした。しばらくしてから再試行してください。'

  const responseData = error.response?.data as { message?: string } | undefined
  return responseData?.message ?? '在留申請データを取得できませんでした。しばらくしてから再試行してください。'
}

function LoadingState() {
  return (
    <div className="animate-pulse" aria-label="在留申請データを読み込み中">
      <div className="mt-6 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 sm:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:border-b-0 sm:border-r sm:last:border-r-0">
            <div className="h-3 w-16 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="mt-3 h-7 w-10 rounded bg-slate-200 dark:bg-slate-700" />
          </div>
        ))}
      </div>
      <div className="mt-6 grid overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 lg:grid-cols-2">
        <div className="space-y-4 p-5 lg:border-r lg:border-slate-200 dark:lg:border-slate-700">
          <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-700" />
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-8 rounded bg-slate-100 dark:bg-slate-800" />)}
        </div>
        <div className="space-y-3 border-t border-slate-200 p-5 dark:border-slate-700 lg:border-t-0">
          <div className="h-4 w-44 rounded bg-slate-200 dark:bg-slate-700" />
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-11 rounded bg-slate-100 dark:bg-slate-800" />)}
        </div>
      </div>
      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="h-10 rounded-lg bg-slate-100 dark:bg-slate-800" />
        <div className="mt-5 space-y-2">
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-12 rounded bg-slate-100 dark:bg-slate-800" />)}
        </div>
      </div>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mt-6 flex flex-col gap-4 rounded-xl border border-amber-200 bg-amber-50/60 p-5 dark:border-amber-400/20 dark:bg-amber-500/[0.06] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">データを表示できません</p>
          <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{message}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-10 shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <RefreshCw size={15} aria-hidden="true" />
        再試行
      </button>
    </div>
  )
}

function RefreshError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-400/20 dark:bg-amber-500/[0.06]">
      <p className="min-w-0 text-amber-800 dark:text-amber-200">最新データを取得できませんでした。{message}</p>
      <button type="button" onClick={onRetry} className="shrink-0 font-medium text-amber-800 underline-offset-4 hover:underline dark:text-amber-200">再試行</button>
    </div>
  )
}
