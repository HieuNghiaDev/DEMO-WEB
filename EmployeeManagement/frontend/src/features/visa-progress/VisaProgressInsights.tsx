import { AlertTriangle, ArrowRight, Clock3, MessageCircle } from 'lucide-react'
import VisaStatusBadge from './VisaStatusBadge'
import type { VisaProgressApplication } from './types'
import { deadlineText, formatDate, getVisaStatusTone, isAttentionDeadline } from './visaProgressUi'

type Props = {
  applications: VisaProgressApplication[]
  onShowAttention: () => void
}

const barToneClasses = {
  info: 'bg-sky-500',
  warning: 'bg-amber-500',
  success: 'bg-emerald-500',
  danger: 'bg-rose-500',
  neutral: 'bg-slate-400',
}

export default function VisaProgressInsights({ applications, onShowAttention }: Props) {
  const statusDistribution = buildStatusDistribution(applications)
  const deadlineRisk = buildDeadlineRisk(applications)
  const attentionApplications = applications
    .filter((application) => isAttentionDeadline(application.deadline_level))
    .sort(compareDeadlineRisk)
  const visibleAttentionApplications = attentionApplications.slice(0, 6)

  return (
    <section className="mt-6 grid overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 lg:grid-cols-12" aria-label="運用インサイト">
      <div className="order-2 flex min-w-0 flex-col border-t border-slate-200 dark:border-slate-700 lg:order-1 lg:col-span-5 lg:border-r lg:border-t-0">
        <div className="order-2 border-t border-slate-200 p-4 dark:border-slate-700 lg:order-1 lg:border-t-0 lg:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">ステータス分布</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">現在の申請状況を件数順に表示</p>
            </div>
            <span className="text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400">{applications.length}件</span>
          </div>

          {statusDistribution.length > 0 ? (
            <div className="mt-4 space-y-3">
              {statusDistribution.map((status) => (
                <div key={status.label}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                    <span className="truncate font-medium text-slate-700 dark:text-slate-200">{status.label}</span>
                    <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">{status.count}件 · {status.percentage}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={`h-full rounded-full ${barToneClasses[getVisaStatusTone(status.label)]}`}
                      style={{ width: `${Math.max(status.percentage, 2)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">ステータス情報はまだありません。</p>
          )}
        </div>

        <div className="order-1 p-4 lg:order-2 lg:border-t lg:border-slate-200 lg:p-5 dark:lg:border-slate-700">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">期限リスク</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">登録済み期限を緊急度別に集計</p>
            </div>
            <Clock3 size={17} className="text-slate-400 dark:text-slate-500" aria-hidden="true" />
          </div>
          <dl className="mt-4 grid grid-cols-2 border-y border-slate-200 dark:border-slate-700 sm:grid-cols-4 lg:grid-cols-2">
            {deadlineRisk.map((risk, index) => (
              <div
                key={risk.label}
                className={`px-3 py-3 ${index % 2 === 0 ? 'border-r border-slate-200 dark:border-slate-700' : ''} ${index < 2 ? 'border-b border-slate-200 dark:border-slate-700' : ''} sm:border-b-0 sm:border-r sm:last:border-r-0 lg:[&:nth-child(-n+2)]:border-b lg:[&:nth-child(2)]:border-r-0`}
              >
                <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{risk.label}</dt>
                <dd className={`mt-1 text-lg font-semibold tabular-nums ${risk.tone}`}>{risk.count}<span className="ml-1 text-[11px] font-normal text-slate-400">件</span></dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="order-1 min-w-0 p-4 lg:order-2 lg:col-span-7 lg:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
              <AlertTriangle size={17} className="text-amber-500" aria-hidden="true" />
              期限・対応が必要な案件
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">期限超過と10日以内の案件を優先</p>
          </div>
          <span className="shrink-0 text-xs font-medium tabular-nums text-rose-600 dark:text-rose-300">{attentionApplications.length}件</span>
        </div>

        {visibleAttentionApplications.length > 0 ? (
          <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
            {visibleAttentionApplications.map((application) => (
              <div key={application.id} className="group grid gap-2 py-3 first:pt-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
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
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-indigo-200 text-indigo-600 opacity-100 transition-colors hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-indigo-400/30 dark:text-indigo-300 dark:hover:bg-indigo-500/10 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                      >
                        <MessageCircle size={15} aria-hidden="true" />
                      </a>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                    {application.case_type ?? '申請種別未登録'} · 担当：{application.responsible_person ?? '未設定'}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
                  <div>
                    {application.deadline_label && <p className="text-[11px] text-slate-500 dark:text-slate-400">{application.deadline_label}</p>}
                    <p className={`text-xs font-semibold ${deadlineTone(application.deadline_level)}`}>{deadlineText(application.days_remaining, application.deadline_level)}</p>
                  </div>
                  <p className="mt-0.5 text-[11px] tabular-nums text-slate-400 dark:text-slate-500">{formatDate(application.deadline)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-3 border-t border-slate-100 py-5 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <Clock3 size={17} className="text-emerald-500" aria-hidden="true" />
            現在、期限対応が必要な案件はありません。
          </div>
        )}

        {attentionApplications.length > visibleAttentionApplications.length && (
          <button
            type="button"
            onClick={onShowAttention}
            className="mt-2 inline-flex h-9 items-center gap-2 rounded-md px-2 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
          >
            期限案件をすべて表示
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  )
}

function buildStatusDistribution(applications: VisaProgressApplication[]) {
  const counts = new Map<string, number>()

  applications.forEach((application) => {
    const label = application.status ?? '未設定'
    counts.set(label, (counts.get(label) ?? 0) + 1)
  })

  const sorted = Array.from(counts, ([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'ja'))
  const visible = sorted.slice(0, 5)
  const remainingCount = sorted.slice(5).reduce((total, status) => total + status.count, 0)

  if (remainingCount > 0) visible.push({ label: 'その他', count: remainingCount })

  return visible.map((status) => ({
    ...status,
    percentage: applications.length > 0 ? Math.round((status.count / applications.length) * 100) : 0,
  }))
}

function compareDeadlineRisk(left: VisaProgressApplication, right: VisaProgressApplication) {
  const leftDays = left.days_remaining ?? Number.POSITIVE_INFINITY
  const rightDays = right.days_remaining ?? Number.POSITIVE_INFINITY
  return leftDays - rightDays || (left.deadline ?? '').localeCompare(right.deadline ?? '')
}

function buildDeadlineRisk(applications: VisaProgressApplication[]) {
  return [
    {
      label: '期限超過',
      count: applications.filter((application) => application.deadline_level === 'overdue').length,
      tone: 'text-rose-600 dark:text-rose-300',
    },
    {
      label: '5日以内',
      count: applications.filter((application) => application.deadline_level === 'critical').length,
      tone: 'text-rose-600 dark:text-rose-300',
    },
    {
      label: '6〜10日',
      count: applications.filter((application) => application.deadline_level === 'warning').length,
      tone: 'text-amber-600 dark:text-amber-300',
    },
    {
      label: '期限なし',
      count: applications.filter((application) => application.deadline_level === 'none').length,
      tone: 'text-slate-700 dark:text-slate-200',
    },
  ]
}

function deadlineTone(level: VisaProgressApplication['deadline_level']) {
  if (level === 'overdue' || level === 'critical') return 'text-rose-600 dark:text-rose-300'
  if (level === 'warning') return 'text-amber-600 dark:text-amber-300'
  return 'text-slate-600 dark:text-slate-300'
}
