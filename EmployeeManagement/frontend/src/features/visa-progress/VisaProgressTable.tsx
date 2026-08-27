import { FileSpreadsheet, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import VisaStatusBadge from './VisaStatusBadge'
import type { VisaDeadlineLevel, VisaProgressApplication } from './types'
import { deadlineText, formatDate } from './visaProgressUi'

type Props = {
  applications: VisaProgressApplication[]
  hasActiveFilters: boolean
  onResetFilters: () => void
}

export default function VisaProgressTable({ applications, hasActiveFilters, onResetFilters }: Props) {
  if (applications.length === 0) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center px-5 py-10 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
          <FileSpreadsheet size={21} aria-hidden="true" />
        </span>
        <p className="mt-4 text-sm font-semibold text-slate-800 dark:text-slate-100">
          {hasActiveFilters ? '条件に一致する在留申請がありません。' : '表示できる在留申請データがありません。'}
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
          {hasActiveFilters ? '検索条件またはフィルターを変更してください。' : 'Excelファイルの内容を確認してください。'}
        </p>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
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
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1080px] border-collapse text-left">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">案件ID</th>
              <th className="px-3 py-3">申請者氏名</th>
              <th className="px-3 py-3">申請種別</th>
              <th className="px-3 py-3">全体ステータス</th>
              <th className="px-3 py-3">担当者</th>
              <th className="px-3 py-3">申請日</th>
              <th className="px-3 py-3">期限</th>
              <th className="px-3 py-3">残り日数</th>
            </tr>
          </thead>
          <tbody>
            {applications.map((application, index) => <ApplicationTableRow key={application.id} application={application} index={index} />)}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-slate-200 dark:divide-slate-800 md:hidden">
        {applications.map((application, index) => <ApplicationMobileRow key={application.id} application={application} index={index} />)}
      </div>
    </>
  )
}

function ApplicationTableRow({ application, index }: { application: VisaProgressApplication; index: number }) {
  return (
    <RevealTableRow index={index} className="group border-t border-slate-100 transition-colors duration-150 first:border-t-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/45">
      <td className={`border-l-2 px-4 py-3 ${priorityBorder(application.deadline_level)}`}>
        <span className="text-xs font-medium tabular-nums text-slate-600 dark:text-slate-300">{application.case_id ?? `Excel 行 ${application.source_row}`}</span>
      </td>
      <td className="max-w-48 px-3 py-3">
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100" title={application.applicant_name ?? undefined}>
          {application.applicant_name ?? '申請者名未登録'}
        </p>
      </td>
      <td className="max-w-48 px-3 py-3 text-xs text-slate-600 dark:text-slate-300">
        <span className="line-clamp-2">{application.case_type ?? '—'}</span>
      </td>
      <td className="px-3 py-3"><VisaStatusBadge status={application.status} /></td>
      <td className={`max-w-40 truncate px-3 py-3 text-xs ${application.responsible_person ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}`} title={application.responsible_person ?? undefined}>
        {application.responsible_person ?? '未設定'}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-xs tabular-nums text-slate-500 dark:text-slate-400">{formatDate(application.application_date)}</td>
      <td className="px-3 py-3">
        <p className="whitespace-nowrap text-xs font-medium tabular-nums text-slate-700 dark:text-slate-200">{formatDate(application.deadline)}</p>
        {application.deadline_label && <p className="mt-0.5 max-w-36 truncate text-[11px] text-slate-500 dark:text-slate-400" title={application.deadline_label}>{application.deadline_label}</p>}
      </td>
      <td className="whitespace-nowrap px-3 py-3">
        <DeadlineRisk application={application} />
      </td>
    </RevealTableRow>
  )
}

function ApplicationMobileRow({ application, index }: { application: VisaProgressApplication; index: number }) {
  return (
    <RevealMobileRow index={index} className={`border-l-2 px-4 py-4 ${priorityBorder(application.deadline_level)}`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{application.applicant_name ?? '申請者名未登録'}</p>
          <p className="mt-0.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">{application.case_id ?? `Excel 行 ${application.source_row}`}</p>
        </div>
        <VisaStatusBadge status={application.status} />
      </div>

      <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">{application.case_type ?? '申請種別未登録'}</p>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
        <Info label="担当者" value={application.responsible_person ?? '未設定'} />
        <Info label="申請日" value={formatDate(application.application_date)} />
        <Info label={application.deadline_label ?? '期限'} value={formatDate(application.deadline)} />
        <div>
          <dt className="text-[11px] text-slate-400 dark:text-slate-500">期限状況</dt>
          <dd className="mt-1"><DeadlineRisk application={application} /></dd>
        </div>
      </dl>
    </RevealMobileRow>
  )
}

function RevealTableRow({ children, className, index }: { children: ReactNode; className: string; index: number }) {
  const rowRef = useRef<HTMLTableRowElement>(null)
  const isVisible = useRevealOnScroll(rowRef)

  return (
    <tr
      ref={rowRef}
      style={{ transitionDelay: `${Math.min(index, 6) * 55}ms` }}
      className={`${className} transition-[opacity,transform,background-color] duration-500 ease-out motion-reduce:transition-none ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
    >
      {children}
    </tr>
  )
}

function RevealMobileRow({ children, className, index }: { children: ReactNode; className: string; index: number }) {
  const rowRef = useRef<HTMLElement>(null)
  const isVisible = useRevealOnScroll(rowRef)

  return (
    <article
      ref={rowRef}
      style={{ transitionDelay: `${Math.min(index, 6) * 55}ms` }}
      className={`${className} transition-[opacity,transform,background-color] duration-500 ease-out motion-reduce:transition-none ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
    >
      {children}
    </article>
  )
}

function useRevealOnScroll<T extends Element>(elementRef: RefObject<T | null>): boolean {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const element = elementRef.current

    if (!element || !('IntersectionObserver' in window)) {
      setIsVisible(true)
      return undefined
    }

    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting)
    }, { threshold: 0.08, rootMargin: '0px 0px -4% 0px' })

    observer.observe(element)
    return () => observer.disconnect()
  }, [elementRef])

  return isVisible
}

function DeadlineRisk({ application }: { application: VisaProgressApplication }) {
  return (
    <span className={`text-xs font-semibold ${deadlineTone(application.deadline_level)}`}>
      {deadlineText(application.days_remaining, application.deadline_level)}
    </span>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-slate-400 dark:text-slate-500">{label}</dt>
      <dd className="mt-1 truncate font-medium text-slate-700 dark:text-slate-200">{value}</dd>
    </div>
  )
}

function priorityBorder(level: VisaDeadlineLevel) {
  if (level === 'overdue') return 'border-l-rose-500'
  if (level === 'critical') return 'border-l-rose-300 dark:border-l-rose-400/70'
  if (level === 'warning' || level === 'notice') return 'border-l-amber-400'
  if (level === 'upcoming') return 'border-l-sky-400'
  return 'border-l-transparent'
}

function deadlineTone(level: VisaDeadlineLevel) {
  if (level === 'overdue' || level === 'critical') return 'text-rose-600 dark:text-rose-300'
  if (level === 'warning' || level === 'notice') return 'text-amber-600 dark:text-amber-300'
  if (level === 'upcoming') return 'text-sky-600 dark:text-sky-300'
  if (level === 'normal') return 'text-slate-700 dark:text-slate-200'
  return 'font-normal text-slate-400 dark:text-slate-500'
}
