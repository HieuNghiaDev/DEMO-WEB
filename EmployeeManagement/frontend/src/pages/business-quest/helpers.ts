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
  received: { label: '受付済み', dot: 'bg-cyan-600', badge: 'border-cyan-400 bg-cyan-100 text-cyan-800 dark:border-cyan-400/45 dark:bg-cyan-400/20 dark:text-cyan-200' },
  reviewing: { label: '確認中', dot: 'bg-amber-600', badge: 'border-amber-400 bg-amber-100 text-amber-800 dark:border-amber-400/45 dark:bg-amber-400/20 dark:text-amber-200' },
  in_progress: { label: '対応中', dot: 'bg-sky-600', badge: 'border-sky-400 bg-sky-100 text-sky-800 dark:border-sky-400/45 dark:bg-sky-400/20 dark:text-sky-200' },
  waiting: { label: '書類待ち', dot: 'bg-orange-600', badge: 'border-orange-400 bg-orange-100 text-orange-800 dark:border-orange-400/45 dark:bg-orange-400/20 dark:text-orange-200' },
  waiting_payment: { label: '支払待ち', dot: 'bg-violet-600', badge: 'border-violet-400 bg-violet-100 text-violet-800 dark:border-violet-400/45 dark:bg-violet-400/20 dark:text-violet-200' },
  completed: { label: '完了', dot: 'bg-emerald-600', badge: 'border-emerald-400 bg-emerald-100 text-emerald-800 dark:border-emerald-400/45 dark:bg-emerald-400/20 dark:text-emerald-200' },
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
    customerId: caseFile.client.id,
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
