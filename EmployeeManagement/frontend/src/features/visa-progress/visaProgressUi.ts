import type { VisaDeadlineLevel } from './types'

export type VisaStatusTone = 'info' | 'warning' | 'success' | 'danger' | 'neutral'

export const formatDate = (value: string | null): string => {
  if (!value) return '—'

  const [year, month, day] = value.split('-')
  return year && month && day ? `${year}/${month}/${day}` : value
}

export const formatDateTime = (value: string | null): string => {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export const getVisaStatusTone = (status: string | null): VisaStatusTone => {
  if (!status) return 'neutral'
  if (/不許可|却下|取消|失効/.test(status)) return 'danger'
  if (/許可|承認|完了|交付/.test(status)) return 'success'
  if (/追加資料|補正|待ち|保留/.test(status)) return 'warning'
  if (/審査|確認|申請|受付|対応中/.test(status)) return 'info'

  return 'neutral'
}

export const deadlineText = (days: number | null, level: VisaDeadlineLevel): string => {
  if (days === null) return '期限なし'
  if (level === 'overdue') return `期限超過 ${Math.abs(days)}日`
  if (days === 0) return '本日期限'
  return `残り${days}日`
}

export const isAttentionDeadline = (level: VisaDeadlineLevel): boolean => (
  level === 'overdue' || level === 'critical' || level === 'warning' || level === 'notice' || level === 'upcoming'
)
