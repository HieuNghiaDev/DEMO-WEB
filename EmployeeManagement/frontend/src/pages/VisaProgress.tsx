import axios from 'axios'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { getVisaProgress } from '../features/visa-progress/api'
import VisaProgressFilters, { type VisaQuickCounts } from '../features/visa-progress/VisaProgressFilters'
import VisaProgressHeader from '../features/visa-progress/VisaProgressHeader'
import VisaProgressInsights from '../features/visa-progress/VisaProgressInsights'
import VisaProgressPagination from '../features/visa-progress/VisaProgressPagination'
import VisaProgressSummary from '../features/visa-progress/VisaProgressSummary'
import VisaProgressTable from '../features/visa-progress/VisaProgressTable'
import type { VisaDeadlineLevel, VisaProgressApplication, VisaProgressDashboard } from '../features/visa-progress/types'
import { isAttentionDeadline } from '../features/visa-progress/visaProgressUi'
import { MobileCardSkeleton, Skeleton, TableSkeleton } from '../components/loading'

const deadlineOrder: Record<VisaDeadlineLevel, number> = {
  overdue: 0,
  critical: 1,
  warning: 2,
  notice: 3,
  upcoming: 4,
  normal: 5,
  none: 6,
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
  const quickCounts = useMemo<VisaQuickCounts>(
    () => ({
      all: applications.length,
      attention: applications.filter((item) => isAttentionDeadline(item.deadline_level)).length,
      overdue: applications.filter((item) => item.deadline_level === 'overdue').length,
      has_deadline: applications.filter((item) => item.deadline_level !== 'none').length,
      none: applications.filter((item) => item.deadline_level === 'none').length,
    }),
    [applications],
  )
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

  const scrollToWorkspace = () => {
    window.requestAnimationFrame(() => {
      document.getElementById('visa-progress-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const showAttentionApplications = () => {
    setDeadlineLevel('attention')
    setCurrentPage(1)
    scrollToWorkspace()
  }

  const selectStatusFromInsights = (status: string) => {
    setStatusesFilter([status])
    setDeadlineLevel('all')
    setCurrentPage(1)
    scrollToWorkspace()
  }

  const selectDeadlineLevelFromInsights = (level: string) => {
    setDeadlineLevel(level)
    setStatusesFilter([])
    setCurrentPage(1)
    scrollToWorkspace()
  }

  return (
    <div className="cm-case-list-page">
      <div className="cm-case-list-shell">
        <VisaProgressHeader
          source={dashboard?.source ?? null}
          refreshing={isRefreshing}
          onRefresh={() => void loadDashboard(true)}
        />
        {isLoading ? (
          <VisaProgressSummary loading />
        ) : (
          !error && dashboard && <VisaProgressSummary summary={dashboard.summary} />
        )}
      </div>

      <main className="cm-case-list-shell cm-case-list-workspace">
        {isLoading && <LoadingState />}

        {!isLoading && error && <ErrorState message={error} onRetry={() => void loadDashboard(true)} />}

        {!isLoading && !error && dashboard && (
          <>
            {refreshError && <RefreshError message={refreshError} onRetry={() => void loadDashboard(true)} />}

            <VisaProgressInsights
              applications={applications}
              onShowAttention={showAttentionApplications}
              onSelectStatus={selectStatusFromInsights}
              onSelectDeadlineLevel={selectDeadlineLevelFromInsights}
            />

            <div id="visa-progress-workspace" className="grid min-w-0 gap-3.5 scroll-mt-5">
              <VisaProgressFilters
                keyword={keyword}
                selectedStatuses={statusesFilter}
                responsiblePerson={responsiblePerson}
                deadlineLevel={deadlineLevel}
                statuses={statuses}
                responsiblePeople={responsiblePeople}
                totalCount={applications.length}
                filteredCount={filteredApplications.length}
                quickCounts={quickCounts}
                onKeywordChange={updateKeyword}
                onStatusesChange={updateStatuses}
                onResponsiblePersonChange={updateResponsiblePerson}
                onDeadlineLevelChange={updateDeadlineLevel}
                onReset={resetFilters}
              />

              <section className="cm-case-table">
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
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function filterApplications(
  applications: VisaProgressApplication[],
  keyword: string,
  selectedStatuses: string[],
  responsiblePerson: string,
  deadlineLevel: string,
): VisaProgressApplication[] {
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
    <div className="grid min-w-0 gap-3.5" role="status" aria-label="在留申請データを読み込み中…" aria-busy="true">
      <div className="grid gap-3.5 lg:grid-cols-2">
        <Skeleton className="h-44 rounded-[var(--tm-radius-panel)] border border-[var(--tm-border)]" />
        <Skeleton className="h-44 rounded-[var(--tm-radius-panel)] border border-[var(--tm-border)]" />
      </div>
      <section className="cm-case-table p-4">
        <div className="cm-clv-desktop-only">
          <TableSkeleton rows={8} columns={7} className="border-0 shadow-none dark:bg-transparent" />
        </div>
        <MobileCardSkeleton className="cm-clv-mobile-only" rows={5} label="在留申請カードを読み込み中…" />
      </section>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-4 rounded-[var(--tm-radius-panel)] border border-amber-200 bg-amber-50/60 p-5 dark:border-amber-400/20 dark:bg-amber-500/[0.06] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-[var(--tm-text-primary)]">データを表示できません</p>
          <p className="mt-1 text-sm leading-6 text-[var(--tm-text-secondary)]">{message}</p>
        </div>
      </div>
      <button type="button" onClick={onRetry} className="dc-button shrink-0 self-start">
        <RefreshCw size={14} aria-hidden="true" />
        再試行
      </button>
    </div>
  )
}

function RefreshError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--tm-radius-panel)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-400/20 dark:bg-amber-500/[0.06]">
      <p className="min-w-0 text-amber-800 dark:text-amber-200">最新データを取得できませんでした。{message}</p>
      <button type="button" onClick={onRetry} className="shrink-0 font-medium text-amber-800 underline-offset-4 hover:underline dark:text-amber-200">
        再試行
      </button>
    </div>
  )
}
