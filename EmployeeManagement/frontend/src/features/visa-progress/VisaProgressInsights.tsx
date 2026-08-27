import { AlertTriangle, ArrowRight, CircleHelp, FileWarning, MessageCircle } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import VisaStatusBadge from './VisaStatusBadge'
import VisaScrollReveal from './VisaScrollReveal'
import type { VisaOperationalDeadline, VisaProgressApplication } from './types'
import { deadlineText, formatDate, isAttentionDeadline } from './visaProgressUi'

type Props = {
  applications: VisaProgressApplication[]
  onShowAttention: () => void
}

type AttentionApplication = {
  application: VisaProgressApplication
  deadline: VisaOperationalDeadline
}

type AttentionCategory = 'residence' | 'supplement'

const statusChartColors = [
  { fill: 'fill-sky-500', marker: 'bg-sky-500', surface: 'bg-sky-50/60 hover:bg-sky-100/70 dark:bg-sky-400/10 dark:hover:bg-sky-400/15' },
  { fill: 'fill-emerald-500', marker: 'bg-emerald-500', surface: 'bg-emerald-50/60 hover:bg-emerald-100/70 dark:bg-emerald-400/10 dark:hover:bg-emerald-400/15' },
  { fill: 'fill-violet-500', marker: 'bg-violet-500', surface: 'bg-violet-50/60 hover:bg-violet-100/70 dark:bg-violet-400/10 dark:hover:bg-violet-400/15' },
  { fill: 'fill-orange-500', marker: 'bg-orange-500', surface: 'bg-orange-50/60 hover:bg-orange-100/70 dark:bg-orange-400/10 dark:hover:bg-orange-400/15' },
  { fill: 'fill-rose-500', marker: 'bg-rose-500', surface: 'bg-rose-50/60 hover:bg-rose-100/70 dark:bg-rose-400/10 dark:hover:bg-rose-400/15' },
  { fill: 'fill-slate-500', marker: 'bg-slate-500', surface: 'bg-slate-50/80 hover:bg-slate-100 dark:bg-slate-700/60 dark:hover:bg-slate-700' },
]

const MAX_VISIBLE_ATTENTION_CASES = 3

export default function VisaProgressInsights({ applications, onShowAttention }: Props) {
  const statusDistribution = buildStatusDistribution(applications)
  const residenceAttention = buildAttentionApplications(applications, 'residence_deadline')
  const supplementAttention = buildAttentionApplications(applications, 'supplement_deadline')
  const deadlineRisk = buildDeadlineRisk([...residenceAttention, ...supplementAttention])

  return (
    <section className="mt-6 space-y-5" aria-label="在留申請の対応状況">
      <div className="grid items-start gap-5 lg:items-stretch lg:grid-cols-2">
        <VisaScrollReveal className="h-full overflow-hidden rounded-xl border border-slate-200 bg-white transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-400/40">
          <StatusDistribution applications={applications} statusDistribution={statusDistribution} />
        </VisaScrollReveal>
        <VisaScrollReveal className="h-full overflow-hidden rounded-xl border border-slate-200 bg-white transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-400/40" delayMs={90}>
          <DeadlineRiskOverview deadlineRisk={deadlineRisk} />
        </VisaScrollReveal>
      </div>

      {(residenceAttention.length > 0 || supplementAttention.length > 0) && (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          {residenceAttention.length > 0 && (
            <VisaScrollReveal className={`min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-400/40 ${supplementAttention.length === 0 ? 'lg:col-span-2' : ''}`}>
              <AttentionPanel category="residence" attentionApplications={residenceAttention} onShowAttention={onShowAttention} />
            </VisaScrollReveal>
          )}
          {supplementAttention.length > 0 && (
            <VisaScrollReveal className={`min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-400/40 ${residenceAttention.length === 0 ? 'lg:col-span-2' : ''}`} delayMs={90}>
              <AttentionPanel category="supplement" attentionApplications={supplementAttention} onShowAttention={onShowAttention} />
            </VisaScrollReveal>
          )}
        </div>
      )}
    </section>
  )
}

function DeadlineRiskOverview({ deadlineRisk }: { deadlineRisk: ReturnType<typeof buildDeadlineRisk> }) {
  return (
    <section className="flex h-full flex-col p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300" aria-hidden="true"><AlertTriangle size={18} /></span>
        <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">期限リスク</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">在留期限・追完期限を30日以内で集計</p>
        </div>
      </div>
      <div className="mt-auto pt-4">
        <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 sm:grid-cols-3">
          {deadlineRisk.map((risk, index) => (
            <div key={risk.label} className={`px-3 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 ${index % 2 === 0 ? 'border-r border-slate-200 dark:border-slate-700 sm:border-r-0 sm:[&:nth-child(3n+1)]:border-r sm:[&:nth-child(3n+2)]:border-r' : ''} ${index < 4 ? 'border-b border-slate-200 dark:border-slate-700 sm:[&:nth-child(-n+3)]:border-b' : ''}`}>
              <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{risk.label}</dt>
              <dd className={`mt-1 text-lg font-semibold tabular-nums ${risk.tone}`}>{risk.count}<span className="ml-1 text-[11px] font-normal text-slate-400">件</span></dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

function AttentionPanel({ category, attentionApplications, onShowAttention }: {
  category: AttentionCategory
  attentionApplications: AttentionApplication[]
  onShowAttention: () => void
}) {
  const content = category === 'residence'
    ? {
        icon: <AlertTriangle size={17} aria-hidden="true" />,
        title: '在留期限の確認が必要な案件',
        description: '新規受付・申請準備完了の在留期限（期限超過・30日以内）',
      }
    : {
        icon: <FileWarning size={17} aria-hidden="true" />,
        title: '追完期限の対応が必要な案件',
        description: '審査中・追加資料依頼①〜③の追完期限 1〜3回目（期限超過・30日以内）',
      }

  return <DeadlineAttentionSection {...content} attentionApplications={attentionApplications} onShowAttention={onShowAttention} />
}

function StatusDistribution({ applications, statusDistribution }: {
  applications: VisaProgressApplication[]
  statusDistribution: ReturnType<typeof buildStatusDistribution>
}) {
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null)

  return (
    <div className="min-w-0 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-300" aria-hidden="true"><FileWarning size={18} /></span>
          <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">ステータス分布</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">現在の申請状況を件数順に表示</p>
          </div>
        </div>
        <span className="shrink-0 text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400">{applications.length}件</span>
      </div>

      {statusDistribution.length > 0 ? (
        <div className="mt-5 grid items-center gap-5 sm:grid-cols-[10.5rem_minmax(0,1fr)]">
          <StatusDonut
            applicationsCount={applications.length}
            statusDistribution={statusDistribution}
            hoveredSegment={hoveredSegment}
            onHoverSegment={setHoveredSegment}
          />
          <ul className="grid min-w-0 gap-x-4 gap-y-1 sm:grid-cols-2" aria-label="ステータス別件数">
            {statusDistribution.map((status, index) => {
              const color = statusChartColors[index % statusChartColors.length]

              return (
                <li
                  key={status.label}
                  className={`group relative flex min-w-0 items-center gap-2 rounded-md border border-slate-200 px-2.5 py-2 transition-[background-color,border-color,transform] duration-200 hover:-translate-y-px dark:border-slate-700 ${color.surface}`}
                  onPointerEnter={() => setHoveredSegment(index)}
                  onPointerLeave={() => setHoveredSegment(null)}
                >
                  <span className={`absolute inset-y-0 left-0 w-1 ${color.marker}`} aria-hidden="true" />
                  <span className="min-w-0 truncate text-xs font-medium text-slate-700 dark:text-slate-200" title={status.label}>{status.label}</span>
                  {status.details.length > 0 && <OtherStatusDetails details={status.details} />}
                  <span className="ml-auto shrink-0 text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">{status.count}<span className="ml-0.5 text-[10px] font-normal text-slate-400">件</span></span>
                  <span className="min-w-8 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-center text-[10px] font-medium tabular-nums text-slate-500 dark:bg-slate-800 dark:text-slate-300">{status.percentage}%</span>
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">ステータス情報はまだありません。</p>
      )}
    </div>
  )
}

function StatusDonut({
  applicationsCount,
  statusDistribution,
  hoveredSegment,
  onHoverSegment,
}: {
  applicationsCount: number
  statusDistribution: ReturnType<typeof buildStatusDistribution>
  hoveredSegment: number | null
  onHoverSegment: (index: number | null) => void
}) {
  return (
    <div className="relative mx-auto h-40 w-40 shrink-0" role="img" aria-label={`ステータス分布: 合計${applicationsCount}件`}>
      <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible" aria-hidden="true">
        <circle cx="50" cy="50" r="46" className="fill-slate-100 dark:fill-slate-800" />
        <circle cx="50" cy="50" r="21" className="fill-white dark:fill-slate-900" />
        {statusDistribution.map((status, index) => {
          const previousCount = statusDistribution
            .slice(0, index)
            .reduce((total, previousStatus) => total + previousStatus.count, 0)
          const offset = applicationsCount > 0 ? (previousCount / applicationsCount) * 100 : 0
          const segmentPercentage = applicationsCount > 0 ? (status.count / applicationsCount) * 100 : 0
          const color = statusChartColors[index % statusChartColors.length]
          const angle = ((offset + (segmentPercentage / 2)) / 100) * Math.PI * 2 - (Math.PI / 2)
          const labelRadius = 33.5
          const labelX = 50 + (Math.cos(angle) * labelRadius)
          const labelY = 50 + (Math.sin(angle) * labelRadius)
          const isHovered = hoveredSegment === index
          const gap = Math.min(0.4, segmentPercentage / 5)
          const path = describeDonutSegment(offset + gap, offset + segmentPercentage - gap, 46, 21)
          const hoverDistance = isHovered ? 3.5 : 0
          const translateX = Math.cos(angle) * hoverDistance
          const translateY = Math.sin(angle) * hoverDistance

          return (
            <g
              key={status.label}
              style={{
                transform: `translate(${translateX}px, ${translateY}px) scale(${isHovered ? 1.1 : 1})`,
                transformOrigin: '50px 50px',
                transition: 'transform 340ms cubic-bezier(0.22, 1, 0.36, 1), filter 340ms ease',
                filter: isHovered ? 'drop-shadow(0 3px 4px rgb(15 23 42 / 0.22))' : 'none',
              }}
            >
              <path
                d={path}
                className={`${color.fill} cursor-pointer transition-opacity duration-300 ease-out hover:opacity-95`}
                onPointerEnter={() => onHoverSegment(index)}
                onPointerLeave={() => onHoverSegment(null)}
              >
                <title>{`${status.label}: ${status.count}件 (${status.percentage}%)`}</title>
              </path>
              {status.percentage >= 8 && (
                <text x={labelX} y={labelY} textAnchor="middle" dominantBaseline="central" pointerEvents="none" className="fill-white text-[7px] font-semibold tabular-nums">
                  {status.percentage}%
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{applicationsCount}</span>
        <span className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">全案件</span>
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
        className="inline-flex h-5 w-5 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-700 dark:hover:text-slate-100"
      >
        <CircleHelp size={13} aria-hidden="true" />
      </button>
      <span role="tooltip" className="pointer-events-none invisible absolute bottom-full right-0 z-20 mb-2 w-56 translate-y-1 rounded-lg border border-slate-200 bg-white p-3 opacity-0 shadow-lg transition-[opacity,transform,visibility] duration-200 group-hover/details:visible group-hover/details:translate-y-0 group-hover/details:opacity-100 group-focus-within/details:visible group-focus-within/details:translate-y-0 group-focus-within/details:opacity-100 dark:border-slate-700 dark:bg-slate-800">
        <span className="mb-2 block text-[11px] font-semibold text-slate-800 dark:text-slate-100">その他の内訳</span>
        <span className="block space-y-1.5">
          {details.map((detail) => (
            <span key={detail.label} className="flex items-center justify-between gap-3 text-[11px]">
              <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">{detail.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-900 dark:text-slate-100">{detail.count}件</span>
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
  onShowAttention,
}: {
  icon: ReactNode
  title: string
  description: string
  attentionApplications: AttentionApplication[]
  onShowAttention: () => void
}) {
  const visibleApplications = attentionApplications.slice(0, MAX_VISIBLE_ATTENTION_CASES)
  const remainingApplications = attentionApplications.length - visibleApplications.length

  return (
    <section className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
            <span className="text-amber-500">{icon}</span>
            {title}
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        <span className={`shrink-0 text-xs font-semibold tabular-nums ${attentionApplications.length > 0 ? 'text-rose-600 dark:text-rose-300' : 'text-slate-500 dark:text-slate-400'}`}>
          {attentionApplications.length}件
        </span>
      </div>

      <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
        {visibleApplications.map(({ application, deadline }) => (
          <div key={`${application.id}-${deadline.category}`} className="group grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{application.applicant_name ?? '申請者名未登録'}</p>
                <VisaStatusBadge status={application.status} />
                {application.message_link && (
                  <a
                    href={application.message_link}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${application.applicant_name ?? '申請者'}のメッセージを開く`}
                    title="メッセージを開く"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-indigo-200 text-indigo-600 opacity-100 transition-colors hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-indigo-400/30 dark:text-indigo-300 dark:hover:bg-indigo-500/10 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                  >
                    <MessageCircle size={15} aria-hidden="true" />
                  </a>
                )}
              </div>
              <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                {application.case_id ?? '案件ID未登録'} · {deadline.label} · 担当：{application.responsible_person ?? '未設定'}
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
              <p className={`text-xs font-semibold ${deadlineTone(deadline.deadline_level)}`}>
                {deadlineText(deadline.days_remaining, deadline.deadline_level)}
              </p>
              <p className="mt-0.5 text-[11px] tabular-nums text-slate-400 dark:text-slate-500">{formatDate(deadline.date)}</p>
            </div>
          </div>
        ))}
      </div>

      {remainingApplications > 0 && (
        <button
          type="button"
          onClick={onShowAttention}
          className="mt-2 inline-flex h-9 items-center gap-2 rounded-md px-2 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
        >
          残り{remainingApplications}件を一覧で確認
          <ArrowRight size={14} aria-hidden="true" />
        </button>
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
    { label: '期限超過', count: countLevel('overdue'), tone: 'text-rose-600 dark:text-rose-300' },
    { label: '5日以内', count: countLevel('critical'), tone: 'text-rose-600 dark:text-rose-300' },
    { label: '6〜10日', count: countLevel('warning'), tone: 'text-amber-600 dark:text-amber-300' },
    { label: '11〜15日', count: countLevel('notice'), tone: 'text-amber-600 dark:text-amber-300' },
    { label: '16〜30日', count: countLevel('upcoming'), tone: 'text-sky-600 dark:text-sky-300' },
    { label: '要対応合計', count: attentionApplications.length, tone: 'text-slate-900 dark:text-slate-100' },
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
  }))
}

function compareDeadlineRisk(left: AttentionApplication, right: AttentionApplication) {
  const leftDays = left.deadline.days_remaining ?? Number.POSITIVE_INFINITY
  const rightDays = right.deadline.days_remaining ?? Number.POSITIVE_INFINITY
  return leftDays - rightDays || left.deadline.date.localeCompare(right.deadline.date)
}

function deadlineTone(level: VisaOperationalDeadline['deadline_level']) {
  if (level === 'overdue' || level === 'critical') return 'text-rose-600 dark:text-rose-300'
  if (level === 'warning' || level === 'notice') return 'text-amber-600 dark:text-amber-300'
  if (level === 'upcoming') return 'text-sky-600 dark:text-sky-300'
  return 'text-slate-600 dark:text-slate-300'
}
