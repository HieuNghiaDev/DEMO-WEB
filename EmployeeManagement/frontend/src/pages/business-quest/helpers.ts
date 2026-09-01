import type { ApiCaseFile, BusinessCase, CaseStatus, InteractionType } from './types'

export const statusMap: Record<ApiCaseFile['status'], CaseStatus> = {
  intake: 'received',
  active: 'in_progress',
  waiting_documents: 'waiting',
  reviewing: 'reviewing',
  waiting_payment: 'waiting_payment',
  on_hold: 'waiting',
  closed: 'completed',
}

export const statusConfig: Record<CaseStatus, { label: string; dot: string; badge: string }> = {
  received: { label: '受付済み', dot: 'bg-cyan-500', badge: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-300' },
  reviewing: { label: '確認中', dot: 'bg-amber-500', badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300' },
  in_progress: { label: '対応中', dot: 'bg-sky-500', badge: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-300' },
  waiting: { label: '書類待ち', dot: 'bg-orange-500', badge: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-400/25 dark:bg-orange-400/10 dark:text-orange-300' },
  waiting_payment: { label: '支払待ち', dot: 'bg-violet-500', badge: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-300' },
  completed: { label: '完了', dot: 'bg-emerald-500', badge: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300' },
}

export const caseStatusOptions: Array<{ value: ApiCaseFile['status']; label: string }> = [
  { value: 'intake', label: '受付' },
  { value: 'active', label: '対応中' },
  { value: 'waiting_documents', label: '書類待ち' },
  { value: 'reviewing', label: '確認中' },
  { value: 'waiting_payment', label: '支払待ち' },
  { value: 'on_hold', label: '保留' },
  { value: 'closed', label: '完了' },
]

export const interactionLabels: Record<InteractionType, string> = {
  meeting: '打合せ', phone: '電話', email: 'メール', internal_note: '社内メモ',
}

export const safeProgress = (done: number, total: number) => total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0

export const formatDateTime = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date)
}

export const japanToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).formatToParts(new Date()).reduce((date, part) => {
  if (part.type === 'year' || part.type === 'month' || part.type === 'day') date[part.type] = part.value
  return date
}, {} as Record<'year' | 'month' | 'day', string>)

export const japanDateValue = () => {
  const value = japanToday()
  return `${value.year}-${value.month}-${value.day}`
}

export const mapCaseFile = (caseFile: ApiCaseFile, caseTypePath?: string): BusinessCase => {
  const total = caseFile.documents_count ?? 0
  const confirmed = caseFile.confirmed_documents_count ?? 0
  return {
    id: caseFile.id,
    code: caseFile.reference_number || `CASE-${String(caseFile.id).padStart(6, '0')}`,
    title: caseFile.title,
    customerName: caseFile.client.name,
    customerKana: caseFile.client.name_kana ?? '',
    caseType: caseFile.case_type === 'その他' && caseFile.case_type_other
      ? `その他：${caseFile.case_type_other}`
      : caseTypePath ?? caseFile.case_type ?? '未分類',
    assignee: caseFile.assigned_employee?.full_name ?? '未割当',
    assignedEmployeeId: caseFile.assigned_employee?.id ?? null,
    role: caseFile.assigned_employee?.position_title ?? '担当者',
    status: statusMap[caseFile.status],
    memo: total === 0 ? '資料を登録してください' : confirmed === total ? '資料確認済み' : `確認待ちの資料 ${Math.max(0, total - confirmed)}件`,
    documentsDone: confirmed,
    documentsTotal: total,
    updatedAt: formatDateTime(caseFile.updated_at),
    rawUpdatedAt: caseFile.updated_at,
    targetCompletionAt: caseFile.target_completion_at,
  }
}
