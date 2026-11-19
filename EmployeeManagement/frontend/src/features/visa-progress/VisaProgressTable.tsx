import { CalendarClock, FileSpreadsheet, MessageCircle, RotateCcw } from 'lucide-react'
import { UserAvatar } from '../../components/ui'
import VisaStatusBadge from './VisaStatusBadge'
import type { VisaDeadlineLevel, VisaProgressApplication } from './types'
import { deadlineText, formatDate, getVisaStatusTone } from './visaProgressUi'

type Props = {
  applications: VisaProgressApplication[]
  hasActiveFilters: boolean
  onResetFilters: () => void
}

export default function VisaProgressTable({ applications, hasActiveFilters, onResetFilters }: Props) {
  if (applications.length === 0) {
    return (
      <div className="flex min-h-60 flex-col items-center justify-center px-6 py-14 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] text-[var(--tm-text-muted)]">
          <FileSpreadsheet size={20} aria-hidden="true" />
        </span>
        <p className="mt-4 text-sm font-semibold text-[var(--tm-text-primary)]">
          {hasActiveFilters ? '条件に一致する在留申請がありません。' : '表示できる在留申請データがありません。'}
        </p>
        <p className="mt-1 text-xs leading-5 text-[var(--tm-text-muted)]">
          {hasActiveFilters ? '検索条件またはフィルターを変更してください。' : 'Excelファイルの内容を確認してください。'}
        </p>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            className="dc-button mt-4"
          >
            <RotateCcw size={14} aria-hidden="true" />
            条件をクリア
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      {/* Desktop card-row list — mirrors CaseListView (.cm-cc-*) */}
      <div className="cm-clv-desktop-only cm-cc-scroll">
        <div className="cm-cc-grid cm-cc-header">
          <div>申請者</div>
          <div>全体ステータス</div>
          <div>担当者</div>
          <div>申請日</div>
          <div>期限</div>
          <div>残り日数</div>
          <div />
        </div>

        <div className="cm-cc-list" role="list" aria-label="在留申請一覧">
          {applications.map((application) => (
            <ApplicationCardRow key={application.id} application={application} />
          ))}
        </div>
      </div>

      {/* Mobile card stack — mirrors CaseListView (.cm-mobile-*) */}
      <div className="cm-clv-mobile-only cm-mobile-list" role="list" aria-label="在留申請一覧">
        {applications.map((application) => (
          <ApplicationMobileCard key={application.id} application={application} />
        ))}
      </div>
    </>
  )
}

function ApplicationCardRow({ application }: { application: VisaProgressApplication }) {
  const applicantName = application.applicant_name ?? '申請者名未登録'
  const caseCode = application.case_id ?? `ROW-${application.source_row}`

  return (
    <div role="listitem" className="cm-cc-card group !cursor-default">
      <div className={`cm-cc-accent ${accentBarClass(application)}`} aria-hidden="true" />
      <div className="cm-cc-body cm-cc-grid">
        {/* 1. Applicant identity + case code + case type */}
        <div className="cm-cc-client">
          <UserAvatar
            name={applicantName}
            stableKey={application.case_id ?? application.id}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <span className="cm-cc-client-name" title={applicantName}>
              {applicantName}
            </span>
            <div className="cm-cc-client-sub">
              <span className="cm-cc-client-code">{caseCode}</span>
              {application.source_sheet && (
                <span className="cm-cc-client-kana">· {application.source_sheet}</span>
              )}
            </div>
            {application.case_type ? (
              <span className="cm-cc-client-title is-real" title={application.case_type}>
                {application.case_type}
              </span>
            ) : (
              <span className="cm-cc-client-title">申請種別未設定</span>
            )}
          </div>
        </div>

        {/* 2. Overall status */}
        <div className="min-w-0">
          <VisaStatusBadge status={application.status} />
        </div>

        {/* 3. Responsible person */}
        <div className="min-w-0">
          <span
            className={`block truncate text-xs font-bold ${
              application.responsible_person
                ? 'text-[var(--tm-text-primary)]'
                : 'text-[var(--tm-text-muted)]'
            }`}
            title={application.responsible_person ?? undefined}
          >
            {application.responsible_person ?? '未設定'}
          </span>
          <span className="block text-[11px] text-[var(--tm-text-muted)]">担当者</span>
        </div>

        {/* 4. Application date */}
        <div className="min-w-0">
          {application.application_date ? (
            <time
              className="cm-cc-date font-medium text-[var(--tm-text-secondary)]"
              dateTime={application.application_date}
            >
              {formatDate(application.application_date)}
            </time>
          ) : (
            <span className="text-[11px] text-[var(--tm-text-dim)]">未申請</span>
          )}
        </div>

        {/* 5. Deadline date + label */}
        <div className="min-w-0">
          {application.deadline ? (
            <>
              <time
                className="block whitespace-nowrap text-xs font-bold tabular-nums text-[var(--tm-text-primary)]"
                dateTime={application.deadline}
              >
                {formatDate(application.deadline)}
              </time>
              <span
                className="mt-0.5 block truncate text-[11px] text-[var(--tm-text-muted)]"
                title={application.deadline_label ?? undefined}
              >
                {application.deadline_label ?? '期限'}
              </span>
            </>
          ) : (
            <span className="text-[11px] text-[var(--tm-text-dim)]">期限なし</span>
          )}
        </div>

        {/* 6. Remaining days / risk pill */}
        <div className="min-w-0">
          <DeadlineRiskBadge application={application} />
        </div>

        {/* 7. Quick action (message link) */}
        <div className="flex justify-end">
          {application.message_link && (
            <a
              href={application.message_link}
              target="_blank"
              rel="noreferrer"
              aria-label={`${applicantName}のメッセージを開く`}
              title="メッセージを開く"
              className="cm-clv-row-action-btn"
            >
              <MessageCircle size={15} aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

function ApplicationMobileCard({ application }: { application: VisaProgressApplication }) {
  const applicantName = application.applicant_name ?? '申請者名未登録'
  const caseCode = application.case_id ?? `ROW-${application.source_row}`

  return (
    <article
      role="listitem"
      className={`cm-mobile-card !cursor-default border-l-4 ${mobileAccentClass(application)}`}
    >
      <div className="cm-mobile-card-top">
        <div className="cm-mobile-card-identity">
          <UserAvatar
            name={applicantName}
            stableKey={application.case_id ?? application.id}
            size="md"
          />
          <div className="cm-mobile-card-name-block">
            <p className="cm-mobile-client-name">{applicantName}</p>
            <p className="cm-mobile-case-code">{caseCode}</p>
          </div>
        </div>
        {application.message_link && (
          <a
            href={application.message_link}
            target="_blank"
            rel="noreferrer"
            aria-label={`${applicantName}のメッセージを開く`}
            title="メッセージを開く"
            className="cm-mobile-action-btn"
          >
            <MessageCircle size={15} aria-hidden="true" />
          </a>
        )}
      </div>

      <div className="cm-mobile-card-meta">
        <VisaStatusBadge status={application.status} />
        <DeadlineRiskBadge application={application} />
      </div>

      {application.case_type && (
        <p className="mt-2 truncate text-xs text-[var(--tm-text-secondary)]">
          {application.case_type}
        </p>
      )}

      <dl className="mt-2.5 grid grid-cols-3 gap-2 border-t border-[var(--tm-border-subtle)] pt-2.5 text-[11px]">
        <div className="min-w-0">
          <dt className="text-[var(--tm-text-muted)]">担当者</dt>
          <dd className="mt-0.5 truncate font-semibold text-[var(--tm-text-primary)]">
            {application.responsible_person ?? '未設定'}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[var(--tm-text-muted)]">申請日</dt>
          <dd className="mt-0.5 truncate font-medium tabular-nums text-[var(--tm-text-secondary)]">
            {application.application_date ? formatDate(application.application_date) : '未申請'}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="truncate text-[var(--tm-text-muted)]">
            {application.deadline_label ?? '期限'}
          </dt>
          <dd className="mt-0.5 truncate font-semibold tabular-nums text-[var(--tm-text-primary)]">
            {application.deadline ? formatDate(application.deadline) : '期限なし'}
          </dd>
        </div>
      </dl>
    </article>
  )
}

function DeadlineRiskBadge({ application }: { application: VisaProgressApplication }) {
  const label = deadlineText(application.days_remaining, application.deadline_level)

  if (application.deadline_level === 'none') {
    return <span className="text-[11px] text-[var(--tm-text-dim)]">{label}</span>
  }

  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1 text-[11px] font-semibold tabular-nums ${deadlineBadgeClass(application.deadline_level)}`}
    >
      {(application.deadline_level === 'overdue' || application.deadline_level === 'critical') && (
        <CalendarClock size={12} aria-hidden="true" className="shrink-0" />
      )}
      {label}
    </span>
  )
}

function accentBarClass(application: VisaProgressApplication) {
  if (application.deadline_level === 'overdue') return 'bg-rose-500'
  if (application.deadline_level === 'critical') return 'bg-rose-400'
  if (application.deadline_level === 'warning' || application.deadline_level === 'notice') return 'bg-amber-500'
  if (application.deadline_level === 'upcoming') return 'bg-sky-500'
  if (application.deadline_level === 'normal') return 'bg-emerald-500'

  const statusTone = getVisaStatusTone(application.status)
  if (statusTone === 'success') return 'bg-emerald-500'
  if (statusTone === 'info') return 'bg-sky-500'
  if (statusTone === 'warning') return 'bg-amber-500'
  if (statusTone === 'danger') return 'bg-rose-500'
  return 'bg-slate-300 dark:bg-slate-600'
}

function mobileAccentClass(application: VisaProgressApplication) {
  if (application.deadline_level === 'overdue') return 'border-l-rose-500'
  if (application.deadline_level === 'critical') return 'border-l-rose-400'
  if (application.deadline_level === 'warning' || application.deadline_level === 'notice') return 'border-l-amber-500'
  if (application.deadline_level === 'upcoming') return 'border-l-sky-500'
  if (application.deadline_level === 'normal') return 'border-l-emerald-500'

  const statusTone = getVisaStatusTone(application.status)
  if (statusTone === 'success') return 'border-l-emerald-500'
  if (statusTone === 'info') return 'border-l-sky-500'
  if (statusTone === 'warning') return 'border-l-amber-500'
  if (statusTone === 'danger') return 'border-l-rose-500'
  return 'border-l-slate-300 dark:border-l-slate-600'
}

function deadlineBadgeClass(level: VisaDeadlineLevel) {
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
