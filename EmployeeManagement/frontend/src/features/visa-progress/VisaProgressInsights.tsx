import { AlertTriangle, ArrowRight, CalendarClock, CircleHelp, FileWarning, MessageCircle, PieChart } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { UserAvatar } from '../../components/ui'
import VisaStatusBadge from './VisaStatusBadge'
import type { VisaOperationalDeadline, VisaProgressApplication } from './types'
import { deadlineText, formatDate, getVisaStatusTone, isAttentionDeadline } from './visaProgressUi'

type Props = {
  applications: VisaProgressApplication[]
  onShowAttention: () => void
  onSelectStatus?: (status: string) => void
  onSelectDeadlineLevel?: (level: string) => void
}

type AttentionApplication = {
  application: VisaProgressApplication
  deadline: VisaOperationalDeadline
}

type AttentionCategory = 'residence' | 'supplement'

type StatusChartTone = {
  fill: string
  dot: string
  bar: string
}

const MAX_VISIBLE_ATTENTION_CASES = 3

const panelClass = 'min-w-0 overflow-hidden rounded-[var(--tm-radius-panel)] border border-[var(--tm-border)] bg-[var(--tm-surface)]'

export default function VisaProgressInsights({
  applications,
  onShowAttention,
  onSelectStatus,
  onSelectDeadlineLevel,
}: Props) {
  const statusDistribution = buildStatusDistribution(applications)
  const residenceAttention = buildAttentionApplications(applications, 'residence_deadline')
  const supplementAttention = buildAttentionApplications(applications, 'supplement_deadline')
  const deadlineRisk = buildDeadlineRisk([...residenceAttention, ...supplementAttention])

  return (
    <section className="space-y-3.5" aria-label="在留申請の対応状況">
      <div className="grid items-start gap-3.5 lg:items-stretch lg:grid-cols-2">
        <div className={`${panelClass} h-full`}>
          <StatusDistribution
            applications={applications}
            statusDistribution={statusDistribution}
            onSelectStatus={onSelectStatus}
          />
        </div>
        <div className={`${panelClass} h-full`}>
          <DeadlineRiskOverview
            deadlineRisk={deadlineRisk}
            onSelectDeadlineLevel={onSelectDeadlineLevel}
          />
        </div>
      </div>

      {(residenceAttention.length > 0 || supplementAttention.length > 0) && (
        <div className="grid items-start gap-3.5 lg:grid-cols-2">
          {residenceAttention.length > 0 && (
            <div className={`${panelClass} ${supplementAttention.length === 0 ? 'lg:col-span-2' : ''}`}>
              <AttentionPanel
                category="residence"
                attentionApplications={residenceAttention}
                isFullWidth={supplementAttention.length === 0}
                onShowAttention={onShowAttention}
              />
            </div>
          )}
          {supplementAttention.length > 0 && (
            <div className={`${panelClass} ${residenceAttention.length === 0 ? 'lg:col-span-2' : ''}`}>
              <AttentionPanel
                category="supplement"
                attentionApplications={supplementAttention}
                isFullWidth={residenceAttention.length === 0}
                onShowAttention={onShowAttention}
              />
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function DeadlineRiskOverview({
  deadlineRisk,
  onSelectDeadlineLevel,
}: {
  deadlineRisk: ReturnType<typeof buildDeadlineRisk>
  onSelectDeadlineLevel?: (level: string) => void
}) {
  const totalRisk = deadlineRisk.find((item) => item.filterKey === 'attention')?.count ?? 0
  const overdueCount = deadlineRisk.find((item) => item.filterKey === 'overdue')?.count ?? 0
  const upcomingWithin30Count = Math.max(0, totalRisk - overdueCount)
  const barSegments = deadlineRisk.filter((item) => item.filterKey !== 'attention' && item.count > 0)
  const hasUrgent = overdueCount > 0 || (deadlineRisk.find((item) => item.filterKey === 'critical')?.count ?? 0) > 0

  return (
    <section className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--tm-border-subtle)] px-4 py-3.5">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              hasUrgent
                ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/12 dark:text-rose-300'
                : 'bg-amber-50 text-amber-600 dark:bg-amber-400/12 dark:text-amber-300'
            }`}
            aria-hidden="true"
          >
            <AlertTriangle size={16} />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--tm-text-primary)]">期限リスク</h2>
            <p className="mt-0.5 text-xs text-[var(--tm-text-muted)]">在留期限・追完期限を30日以内で集計</p>
          </div>
        </div>

        <span
          className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums ${
            totalRisk === 0
              ? 'border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] text-[var(--tm-text-muted)]'
              : hasUrgent
                ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/12 dark:text-rose-300'
                : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/12 dark:text-amber-300'
          }`}
        >
          要対応 {totalRisk}件
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-between gap-3.5 p-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-[var(--tm-text-muted)]">
            <span>緊急度内訳</span>
            <span className="tabular-nums">
              {totalRisk > 0
                ? `期限超過 ${overdueCount}件 · 30日以内 ${upcomingWithin30Count}件`
                : '30日以内の対応対象なし'}
            </span>
          </div>
          <div
            className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--tm-surface-hover)]"
            role="img"
            aria-label={`期限リスク内訳: 要対応合計 ${totalRisk}件`}
          >
            {totalRisk > 0 && barSegments.map((segment) => (
              <div
                key={segment.label}
                style={{ width: `${(segment.count / totalRisk) * 100}%` }}
                className={`${segment.bar} h-full transition-all duration-300 first:rounded-l-full last:rounded-r-full`}
                title={`${segment.label}: ${segment.count}件`}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--tm-radius-control)] border border-[var(--tm-border)] bg-[var(--tm-border-subtle)] sm:grid-cols-3">
          {deadlineRisk.map((risk) => {
            const isTotal = risk.filterKey === 'attention'
            const isZero = risk.count === 0
            const isInteractive = Boolean(onSelectDeadlineLevel && risk.count > 0)
            const content = (
              <>
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--tm-text-muted)]">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      isZero ? 'bg-[var(--tm-border-strong)]' : risk.dot
                    }`}
                    aria-hidden="true"
                  />
                  <span className="truncate">{risk.label}</span>
                </span>
                <span
                  className={`mt-1.5 block text-xl font-bold leading-none tabular-nums ${
                    isZero ? 'text-[var(--tm-text-dim)]' : risk.tone
                  }`}
                >
                  {risk.count}
                  <span className="ml-1 text-[11px] font-normal text-[var(--tm-text-muted)]">件</span>
                </span>
              </>
            )

            const cellBase = `px-3.5 py-3 text-left transition-colors ${
              isTotal ? 'bg-[var(--tm-surface-elevated)]' : 'bg-[var(--tm-surface)]'
            }`

            if (isInteractive) {
              return (
                <button
                  key={risk.label}
                  type="button"
                  onClick={() => onSelectDeadlineLevel?.(risk.filterKey)}
                  className={`${cellBase} cursor-pointer hover:bg-[var(--tm-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--tm-border-focus)]`}
                  title={`${risk.label}（${risk.count}件）で一覧を絞り込む`}
                >
                  {content}
                </button>
              )
            }

            return (
              <div key={risk.label} className={cellBase}>
                {content}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function AttentionPanel({ category, attentionApplications, isFullWidth, onShowAttention }: {
  category: AttentionCategory
  attentionApplications: AttentionApplication[]
  isFullWidth: boolean
  onShowAttention: () => void
}) {
  const content = category === 'residence'
    ? {
        icon: <AlertTriangle size={16} aria-hidden="true" />,
        title: '在留期限の確認が必要な案件',
        description: '新規受付・申請準備完了の在留期限（期限超過・30日以内）',
      }
    : {
        icon: <FileWarning size={16} aria-hidden="true" />,
        title: '追完期限の対応が必要な案件',
        description: '審査中・追加資料依頼①〜③の追完期限 1〜3回目（期限超過・30日以内）',
      }

  return (
    <DeadlineAttentionSection
      {...content}
      attentionApplications={attentionApplications}
      isFullWidth={isFullWidth}
      onShowAttention={onShowAttention}
    />
  )
}

function StatusDistribution({
  applications,
  statusDistribution,
  onSelectStatus,
}: {
  applications: VisaProgressApplication[]
  statusDistribution: ReturnType<typeof buildStatusDistribution>
  onSelectStatus?: (status: string) => void
}) {
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null)
  const activeStatus = hoveredSegment !== null ? statusDistribution[hoveredSegment] ?? null : null

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--tm-border-subtle)] px-4 py-3.5">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--tm-primary-muted)] text-[var(--tm-primary)]" aria-hidden="true">
            <PieChart size={16} />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--tm-text-primary)]">ステータス分布</h2>
            <p className="mt-0.5 text-xs text-[var(--tm-text-muted)]">現在の申請状況を件数順に表示</p>
          </div>
        </div>
        <span className="shrink-0 rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--tm-text-secondary)]">
          全 {applications.length}件
        </span>
      </div>

      {statusDistribution.length > 0 ? (
        <div className="grid flex-1 items-center gap-5 p-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
          <StatusDonut
            applicationsCount={applications.length}
            statusDistribution={statusDistribution}
            hoveredSegment={hoveredSegment}
            activeStatus={activeStatus}
            onHoverSegment={setHoveredSegment}
            onSelectStatus={onSelectStatus}
          />
          <ul className="min-w-0 space-y-1" aria-label="ステータス別件数">
            {statusDistribution.map((status, index) => {
              const isHighlighted = hoveredSegment === index
              const isDimmed = hoveredSegment !== null && !isHighlighted
              const canFilter = Boolean(onSelectStatus && status.details.length === 0 && status.label !== '未設定')

              const rowInner = (
                <>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${status.tone.dot}`} aria-hidden="true" />
                  <span
                    className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--tm-text-primary)]"
                    title={status.label}
                  >
                    {status.label}
                  </span>
                  {status.details.length > 0 && <OtherStatusDetails details={status.details} />}
                  <span className="hidden h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-[var(--tm-surface-hover)] xl:block" aria-hidden="true">
                    <span
                      className={`block h-full rounded-full ${status.tone.bar}`}
                      style={{ width: `${Math.max(status.percentage, 4)}%` }}
                    />
                  </span>
                  <span className="w-11 shrink-0 text-right text-xs font-semibold tabular-nums text-[var(--tm-text-primary)]">
                    {status.count}
                    <span className="ml-0.5 text-[10px] font-normal text-[var(--tm-text-muted)]">件</span>
                  </span>
                  <span className="w-9 shrink-0 text-right text-[11px] font-medium tabular-nums text-[var(--tm-text-muted)]">
                    {status.percentage}%
                  </span>
                </>
              )

              const rowClass = `flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-all duration-150 ${
                isHighlighted ? 'bg-[var(--tm-surface-hover)]' : 'hover:bg-[var(--tm-surface-hover)]'
              } ${isDimmed ? 'opacity-55' : 'opacity-100'}`

              return (
                <li
                  key={status.label}
                  onPointerEnter={() => setHoveredSegment(index)}
                  onPointerLeave={() => setHoveredSegment(null)}
                >
                  {canFilter ? (
                    <button
                      type="button"
                      onClick={() => onSelectStatus?.(status.label)}
                      className={`${rowClass} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-border-focus)]`}
                      title={`${status.label}（${status.count}件）で一覧を絞り込む`}
                    >
                      {rowInner}
                    </button>
                  ) : (
                    <div className={rowClass}>{rowInner}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <p className="p-4 text-sm text-[var(--tm-text-muted)]">ステータス情報はまだありません。</p>
      )}
    </div>
  )
}

function StatusDonut({
  applicationsCount,
  statusDistribution,
  hoveredSegment,
  activeStatus,
  onHoverSegment,
  onSelectStatus,
}: {
  applicationsCount: number
  statusDistribution: ReturnType<typeof buildStatusDistribution>
  hoveredSegment: number | null
  activeStatus: ReturnType<typeof buildStatusDistribution>[number] | null
  onHoverSegment: (index: number | null) => void
  onSelectStatus?: (status: string) => void
}) {
  return (
    <div className="relative mx-auto h-36 w-36 shrink-0" role="img" aria-label={`ステータス分布: 合計${applicationsCount}件`}>
      <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible" aria-hidden="true">
        <circle cx="50" cy="50" r="46" className="fill-[var(--tm-surface-hover)]" />
        <circle cx="50" cy="50" r="29" className="fill-[var(--tm-surface)]" />
        {statusDistribution.map((status, index) => {
          const previousCount = statusDistribution
            .slice(0, index)
            .reduce((total, previousStatus) => total + previousStatus.count, 0)
          const offset = applicationsCount > 0 ? (previousCount / applicationsCount) * 100 : 0
          const segmentPercentage = applicationsCount > 0 ? (status.count / applicationsCount) * 100 : 0
          const isHovered = hoveredSegment === index
          const isDimmed = hoveredSegment !== null && !isHovered
          const gap = segmentPercentage > 1.5 ? Math.min(0.45, segmentPercentage / 5) : 0.15
          const path = describeDonutSegment(offset + gap, offset + segmentPercentage - gap, 46, 29)
          const canFilter = Boolean(onSelectStatus && status.details.length === 0 && status.label !== '未設定')

          return (
            <g
              key={status.label}
              style={{
                transform: `scale(${isHovered ? 1.04 : 1})`,
                transformOrigin: '50px 50px',
                opacity: isDimmed ? 0.4 : 1,
                transition: 'transform 180ms ease, opacity 180ms ease',
              }}
            >
              <path
                d={path}
                className={`${status.tone.fill} ${canFilter ? 'cursor-pointer' : ''}`}
                onPointerEnter={() => onHoverSegment(index)}
                onPointerLeave={() => onHoverSegment(null)}
                onClick={() => {
                  if (canFilter) onSelectStatus?.(status.label)
                }}
              >
                <title>{`${status.label}: ${status.count}件 (${status.percentage}%)`}</title>
              </path>
            </g>
          )
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
        <span className="text-xl font-bold leading-none tabular-nums text-[var(--tm-text-primary)]">
          {activeStatus ? activeStatus.count : applicationsCount}
        </span>
        <span className="mt-1 max-w-[5rem] truncate text-[10px] font-medium text-[var(--tm-text-muted)]">
          {activeStatus ? `${activeStatus.percentage}%` : '全案件'}
        </span>
      </div>
    </div>
  )
}

function OtherStatusDetails({ details }: { details: Array<{ label: string; count: number }> }) {
  return (
    <span className="group/details relative shrink-0">
      <button
        type="button"
        aria-label="その他の内訳を表示"
        className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--tm-text-muted)] transition-colors hover:bg-[var(--tm-surface-hover)] hover:text-[var(--tm-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-border-focus)]"
      >
        <CircleHelp size={13} aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full right-0 z-20 mb-2 w-56 rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface)] p-3 opacity-0 shadow-lg transition-[opacity,visibility] duration-150 group-hover/details:visible group-hover/details:opacity-100 group-focus-within/details:visible group-focus-within/details:opacity-100"
      >
        <span className="mb-2 block text-[11px] font-semibold text-[var(--tm-text-primary)]">その他の内訳</span>
        <span className="block space-y-1.5">
          {details.map((detail) => (
            <span key={detail.label} className="flex items-center justify-between gap-3 text-[11px]">
              <span className="min-w-0 truncate text-[var(--tm-text-secondary)]">{detail.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-[var(--tm-text-primary)]">{detail.count}件</span>
            </span>
          ))}
        </span>
      </span>
    </span>
  )
}

function describeDonutSegment(startPercentage: number, endPercentage: number, outerRadius: number, innerRadius: number) {
  const startOuter = donutPoint(startPercentage, outerRadius)
  const endOuter = donutPoint(endPercentage, outerRadius)
  const endInner = donutPoint(endPercentage, innerRadius)
  const startInner = donutPoint(startPercentage, innerRadius)
  const largeArc = endPercentage - startPercentage > 50 ? 1 : 0

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${startInner.x} ${startInner.y}`,
    'Z',
  ].join(' ')
}

function donutPoint(percentage: number, radius: number) {
  const angle = (percentage / 100) * Math.PI * 2 - (Math.PI / 2)

  return {
    x: 50 + (Math.cos(angle) * radius),
    y: 50 + (Math.sin(angle) * radius),
  }
}

function DeadlineAttentionSection({
  icon,
  title,
  description,
  attentionApplications,
  isFullWidth,
  onShowAttention,
}: {
  icon: ReactNode
  title: string
  description: string
  attentionApplications: AttentionApplication[]
  isFullWidth: boolean
  onShowAttention: () => void
}) {
  const visibleApplications = attentionApplications.slice(0, MAX_VISIBLE_ATTENTION_CASES)
  const remainingApplications = attentionApplications.length - visibleApplications.length
  const hasUrgent = attentionApplications.some(
    (item) => item.deadline.deadline_level === 'overdue' || item.deadline.deadline_level === 'critical',
  )
  const gridColsClass = visibleApplications.length === 1
    ? 'md:grid-cols-1'
    : visibleApplications.length === 2
      ? 'md:grid-cols-2'
      : 'md:grid-cols-3'

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--tm-border-subtle)] px-4 py-3.5">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              hasUrgent
                ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/12 dark:text-rose-300'
                : 'bg-amber-50 text-amber-600 dark:bg-amber-400/12 dark:text-amber-300'
            }`}
            aria-hidden="true"
          >
            {icon}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-[var(--tm-text-primary)]">{title}</h2>
              <span
                className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                  hasUrgent
                    ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/12 dark:text-rose-300'
                    : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/12 dark:text-amber-300'
                }`}
              >
                {attentionApplications.length}件
              </span>
            </div>
            <p className="mt-0.5 text-xs leading-5 text-[var(--tm-text-muted)]">{description}</p>
          </div>
        </div>

        {remainingApplications > 0 && (
          <button
            type="button"
            onClick={onShowAttention}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] px-2.5 text-xs font-semibold text-[var(--tm-primary)] transition-colors hover:border-[var(--tm-border-focus)] hover:bg-[var(--tm-primary-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-border-focus)]"
          >
            残り{remainingApplications}件を一覧で確認
            <ArrowRight size={13} aria-hidden="true" />
          </button>
        )}
      </div>

      {isFullWidth ? (
        <div className={`grid grid-cols-1 divide-y divide-[var(--tm-border-subtle)] md:divide-x md:divide-y-0 ${gridColsClass}`}>
          {visibleApplications.map(({ application, deadline }) => {
            const applicantName = application.applicant_name ?? '申請者名未登録'
            const caseCode = application.case_id ?? `ROW-${application.source_row}`

            return (
              <div
                key={`${application.id}-${deadline.category}`}
                className="group relative flex min-w-0 flex-col justify-between gap-3 py-3.5 pl-5 pr-4 transition-colors hover:bg-[var(--tm-surface-hover)]"
              >
                <span
                  className={`absolute bottom-3 left-0 top-3 w-[3px] rounded-r-full ${attentionAccentBar(deadline.deadline_level)}`}
                  aria-hidden="true"
                />

                <div className="flex min-w-0 items-start justify-between gap-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <UserAvatar name={applicantName} stableKey={application.case_id ?? application.id} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold text-[var(--tm-text-primary)]" title={applicantName}>
                        {applicantName}
                      </p>
                      <p className="mt-0.5 font-mono text-[10.5px] font-semibold text-[var(--tm-text-muted)]">
                        {caseCode}
                      </p>
                    </div>
                  </div>

                  {application.message_link && (
                    <a
                      href={application.message_link}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`${applicantName}のメッセージを開く`}
                      title="メッセージを開く"
                      className="cm-clv-row-action-btn shrink-0"
                    >
                      <MessageCircle size={14} aria-hidden="true" />
                    </a>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <VisaStatusBadge status={application.status} />
                  <span
                    className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${attentionDeadlineBadge(deadline.deadline_level)}`}
                  >
                    {(deadline.deadline_level === 'overdue' || deadline.deadline_level === 'critical') && (
                      <CalendarClock size={11} aria-hidden="true" className="shrink-0" />
                    )}
                    {deadlineText(deadline.days_remaining, deadline.deadline_level)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-[var(--tm-border-subtle)] pt-2 text-[11px]">
                  <span className="min-w-0 truncate text-[var(--tm-text-muted)]">
                    {deadline.label}{' '}
                    <span className="font-semibold tabular-nums text-[var(--tm-text-primary)]">
                      {formatDate(deadline.date)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[var(--tm-text-muted)]">
                    担当:{' '}
                    <span className={application.responsible_person ? 'font-medium text-[var(--tm-text-primary)]' : ''}>
                      {application.responsible_person ?? '未設定'}
                    </span>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="divide-y divide-[var(--tm-border-subtle)]">
          {visibleApplications.map(({ application, deadline }) => {
            const applicantName = application.applicant_name ?? '申請者名未登録'
            const caseCode = application.case_id ?? `ROW-${application.source_row}`

            return (
              <div
                key={`${application.id}-${deadline.category}`}
                className="group relative flex flex-col gap-2 py-3 pl-5 pr-4 transition-colors hover:bg-[var(--tm-surface-hover)] sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <span
                  className={`absolute bottom-2.5 left-0 top-2.5 w-[3px] rounded-r-full ${attentionAccentBar(deadline.deadline_level)}`}
                  aria-hidden="true"
                />

                <div className="flex min-w-0 items-center gap-2.5">
                  <UserAvatar name={applicantName} stableKey={application.case_id ?? application.id} size="sm" />
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p className="truncate text-[13px] font-bold text-[var(--tm-text-primary)]" title={applicantName}>
                        {applicantName}
                      </p>
                      <VisaStatusBadge status={application.status} />
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-[var(--tm-text-muted)]">
                      <span className="font-mono font-semibold">{caseCode}</span> · {deadline.label} · 担当：{application.responsible_person ?? '未設定'}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center justify-between gap-2.5 sm:justify-end">
                  <div className="flex items-center gap-2 sm:flex-col sm:items-end sm:gap-0.5">
                    <span
                      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${attentionDeadlineBadge(deadline.deadline_level)}`}
                    >
                      {(deadline.deadline_level === 'overdue' || deadline.deadline_level === 'critical') && (
                        <CalendarClock size={11} aria-hidden="true" className="shrink-0" />
                      )}
                      {deadlineText(deadline.days_remaining, deadline.deadline_level)}
                    </span>
                    <span className="text-[11px] tabular-nums text-[var(--tm-text-muted)]">
                      {formatDate(deadline.date)}
                    </span>
                  </div>
                  {application.message_link && (
                    <a
                      href={application.message_link}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`${applicantName}のメッセージを開く`}
                      title="メッセージを開く"
                      className="cm-clv-row-action-btn shrink-0"
                    >
                      <MessageCircle size={14} aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function buildAttentionApplications(
  applications: VisaProgressApplication[],
  deadlineField: 'residence_deadline' | 'supplement_deadline',
): AttentionApplication[] {
  return applications
    .flatMap((application) => {
      const deadline = resolveOperationalDeadline(application, deadlineField)
      return deadline && isAttentionDeadline(deadline.deadline_level) ? [{ application, deadline }] : []
    })
    .sort(compareDeadlineRisk)
}

function buildDeadlineRisk(attentionApplications: AttentionApplication[]) {
  const countLevel = (level: VisaOperationalDeadline['deadline_level']) => (
    attentionApplications.filter((item) => item.deadline.deadline_level === level).length
  )

  return [
    {
      label: '期限超過',
      filterKey: 'overdue',
      count: countLevel('overdue'),
      tone: 'text-rose-600 dark:text-rose-400',
      dot: 'bg-rose-500',
      bar: 'bg-rose-500',
    },
    {
      label: '5日以内',
      filterKey: 'critical',
      count: countLevel('critical'),
      tone: 'text-rose-600 dark:text-rose-400',
      dot: 'bg-rose-400',
      bar: 'bg-rose-400',
    },
    {
      label: '6〜10日',
      filterKey: 'warning',
      count: countLevel('warning'),
      tone: 'text-amber-600 dark:text-amber-300',
      dot: 'bg-amber-500',
      bar: 'bg-amber-500',
    },
    {
      label: '11〜15日',
      filterKey: 'notice',
      count: countLevel('notice'),
      tone: 'text-amber-600 dark:text-amber-300',
      dot: 'bg-amber-400',
      bar: 'bg-amber-400',
    },
    {
      label: '16〜30日',
      filterKey: 'upcoming',
      count: countLevel('upcoming'),
      tone: 'text-sky-600 dark:text-sky-400',
      dot: 'bg-sky-500',
      bar: 'bg-sky-500',
    },
    {
      label: '要対応合計',
      filterKey: 'attention',
      count: attentionApplications.length,
      tone: 'text-[var(--tm-text-primary)]',
      dot: 'bg-[var(--tm-primary)]',
      bar: 'bg-[var(--tm-primary)]',
    },
  ]
}

function resolveOperationalDeadline(
  application: VisaProgressApplication,
  deadlineField: 'residence_deadline' | 'supplement_deadline',
): VisaOperationalDeadline | null {
  const groupedDeadline = application[deadlineField]

  if (groupedDeadline !== undefined) return groupedDeadline

  const category = deadlineField === 'residence_deadline' ? 'residence' : 'supplement'

  if (!application.deadline || application.deadline_category !== category) return null

  return {
    label: application.deadline_label ?? '期限',
    date: application.deadline,
    category,
    days_remaining: application.days_remaining,
    deadline_level: application.deadline_level,
  }
}

function buildStatusDistribution(applications: VisaProgressApplication[]) {
  const counts = new Map<string, number>()

  applications.forEach((application) => {
    const label = application.status ?? '未設定'
    counts.set(label, (counts.get(label) ?? 0) + 1)
  })

  const sorted = Array.from(counts, ([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'ja'))
  const visible = sorted.slice(0, 5).map((status) => ({ ...status, details: [] as Array<{ label: string; count: number }> }))
  const remainingStatuses = sorted.slice(5)
  const remainingCount = remainingStatuses.reduce((total, status) => total + status.count, 0)

  if (remainingCount > 0) visible.push({ label: 'その他', count: remainingCount, details: remainingStatuses })

  return visible.map((status) => ({
    ...status,
    percentage: applications.length > 0 ? Math.round((status.count / applications.length) * 100) : 0,
    tone: resolveStatusChartTone(status.label, status.details.length > 0),
  }))
}

function resolveStatusChartTone(label: string, isOtherBucket: boolean): StatusChartTone {
  if (isOtherBucket || label === '未設定') {
    return {
      fill: 'fill-slate-400 dark:fill-slate-500',
      dot: 'bg-slate-400 dark:bg-slate-500',
      bar: 'bg-slate-400 dark:bg-slate-500',
    }
  }
  if (/準備完了/.test(label)) {
    return { fill: 'fill-teal-500', dot: 'bg-teal-500', bar: 'bg-teal-500' }
  }
  if (/再審査/.test(label)) {
    return { fill: 'fill-amber-500', dot: 'bg-amber-500', bar: 'bg-amber-500' }
  }
  if (/新規|受付/.test(label)) {
    return { fill: 'fill-sky-500', dot: 'bg-sky-500', bar: 'bg-sky-500' }
  }

  const tone = getVisaStatusTone(label)
  if (tone === 'success') return { fill: 'fill-emerald-500', dot: 'bg-emerald-500', bar: 'bg-emerald-500' }
  if (tone === 'info') return { fill: 'fill-indigo-500', dot: 'bg-indigo-500', bar: 'bg-indigo-500' }
  if (tone === 'warning') return { fill: 'fill-amber-500', dot: 'bg-amber-500', bar: 'bg-amber-500' }
  if (tone === 'danger') return { fill: 'fill-rose-500', dot: 'bg-rose-500', bar: 'bg-rose-500' }
  return {
    fill: 'fill-slate-400 dark:fill-slate-500',
    dot: 'bg-slate-400 dark:bg-slate-500',
    bar: 'bg-slate-400 dark:bg-slate-500',
  }
}

function compareDeadlineRisk(left: AttentionApplication, right: AttentionApplication) {
  const leftDays = left.deadline.days_remaining ?? Number.POSITIVE_INFINITY
  const rightDays = right.deadline.days_remaining ?? Number.POSITIVE_INFINITY
  return leftDays - rightDays || left.deadline.date.localeCompare(right.deadline.date)
}

function attentionAccentBar(level: VisaOperationalDeadline['deadline_level']) {
  if (level === 'overdue') return 'bg-rose-500'
  if (level === 'critical') return 'bg-rose-400'
  if (level === 'warning' || level === 'notice') return 'bg-amber-500'
  if (level === 'upcoming') return 'bg-sky-500'
  return 'bg-slate-300 dark:bg-slate-600'
}

function attentionDeadlineBadge(level: VisaOperationalDeadline['deadline_level']) {
  if (level === 'overdue' || level === 'critical') {
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/12 dark:text-rose-300'
  }
  if (level === 'warning' || level === 'notice') {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/12 dark:text-amber-300'
  }
  if (level === 'upcoming') {
    return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/25 dark:bg-sky-500/12 dark:text-sky-300'
  }
  return 'border-[var(--tm-border)] bg-[var(--tm-surface-hover)] text-[var(--tm-text-secondary)]'
}
