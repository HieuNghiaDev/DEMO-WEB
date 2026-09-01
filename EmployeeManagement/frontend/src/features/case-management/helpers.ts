import type { BusinessCase, CaseQuickFilter, CaseStatus } from '../../pages/business-quest/types'
import type { CaseDraft, CaseFieldErrors, CaseTypeOption, ClientDraft, EditableCase } from './types'

export const priorityLabels = { low: '低', normal: '通常', high: '高', critical: '最優先' }
export const dateValue = (date?: string | null) => date?.slice(0, 10) ?? ''
export function newDraft(): CaseDraft {
  return { client_id: '', title: '', case_type_id: '', case_type_other: '', status: 'intake', priority: 'normal', summary: '', assigned_employee_id: '', department_id: '', opened_at: '', target_completion_at: '' }
}
export const newClientDraft = (): ClientDraft => ({ name: '', name_kana: '', client_type: 'individual', phone: '', email: '', address: '', nationality: '', notes: '' })
export function validateClient(client: ClientDraft): CaseFieldErrors {
  const errors: CaseFieldErrors = {}
  if (!client.name.trim()) errors.name = '氏名を入力してください。'
  if (client.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email)) errors.email = 'メールアドレスの形式を確認してください。'
  for (const [key, value] of Object.entries(client)) {
    const max = key === 'phone' ? 30 : key === 'nationality' ? 50 : key === 'notes' ? Infinity : 255
    if (Array.from(value).length > max) errors[key] = `${max}文字以内で入力してください。`
  }
  return errors
}
export function generatedCaseTitle(clientName: string, typeName: string): string {
  if (!clientName.trim() || !typeName.trim()) return ''
  // Preserve both names within the existing 255-character title limit, including Unicode names.
  const type = Array.from(typeName.trim()).slice(0, 128).join('')
  const client = Array.from(clientName.trim()).slice(0, 255 - Array.from(type).length - 3).join('')
  return `${client} / ${type}`
}
export function caseDraft(item: EditableCase): CaseDraft {
  return { ...newDraft(), client_id: String(item.client.id), title: item.title, case_type_id: String(item.case_type_id ?? ''), case_type_other: item.case_type_other ?? '', status: item.status, priority: item.priority ?? 'normal', summary: item.summary ?? '', assigned_employee_id: String(item.assigned_employee_id ?? item.assigned_employee?.id ?? ''), department_id: String(item.department_id ?? item.department?.id ?? ''), opened_at: dateValue(item.opened_at), target_completion_at: dateValue(item.target_completion_at) }
}
export function caseTypeOptions(types: CaseTypeOption[]) {
  const all = new Map<number, CaseTypeOption>()
  types.forEach(type => { all.set(type.id, type); type.children?.forEach(child => all.set(child.id, { ...child, parent_id: type.id, parent: { id: type.id, name: type.name } })) })
  const path = (type: CaseTypeOption, seen = new Set<number>()): string => {
    if (seen.has(type.id)) return type.name
    seen.add(type.id)
    const parent = type.parent_id ? all.get(type.parent_id) : undefined
    return parent ? `${path(parent, seen)} / ${type.name}` : type.parent ? `${type.parent.name} / ${type.name}` : type.name
  }
  return [...all.values()].map(type => ({ ...type, label: path(type) }))
}
export function validateCase(draft: CaseDraft, types: CaseTypeOption[]): CaseFieldErrors {
  const errors: CaseFieldErrors = {}
  const required = (key: string, value: string) => { if (!value.trim()) errors[key] = '入力または選択してください。' }
  required('client_id', draft.client_id)
  required('case_type_id', draft.case_type_id)
  if (caseTypeOptions(types).find(type => String(type.id) === draft.case_type_id)?.name === 'その他') required('case_type_other', draft.case_type_other)
  required('title', draft.title)
  if (Array.from(draft.title).length > 255) errors.title = '255文字以内で入力してください。'
  if (draft.summary.length > 10000) errors.summary = '10000文字以内で入力してください。'
  return errors
}
export function casePayload(draft: CaseDraft, canAssign: boolean) {
  return { client_id: Number(draft.client_id),
    title: draft.title.trim(), case_type_id: Number(draft.case_type_id), case_type_other: draft.case_type_other || null, status: draft.status, priority: draft.priority, summary: draft.summary || null,
    opened_at: draft.opened_at || null, target_completion_at: draft.target_completion_at || null, department_id: draft.department_id ? Number(draft.department_id) : null,
    ...(canAssign ? { assigned_employee_id: draft.assigned_employee_id ? Number(draft.assigned_employee_id) : null } : {}) }
}
export function filterCases(cases: BusinessCase[], keyword: string, status: 'all' | CaseStatus, caseType: string, quick: CaseQuickFilter) {
  const search = keyword.trim().toLowerCase()
  return cases.filter(item => (!search || [item.customerName, item.customerKana, item.code, item.title, item.caseType, item.assignee].some(value => value.toLowerCase().includes(search)))
    && (status === 'all' || item.status === status) && (caseType === 'all' || item.caseType === caseType)
    && (quick === 'all' || (quick === 'documents_complete' ? item.documentsTotal > 0 && item.documentsDone === item.documentsTotal : item.status === quick)))
}
