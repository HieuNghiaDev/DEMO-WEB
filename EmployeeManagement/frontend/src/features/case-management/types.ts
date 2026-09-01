import type { ApiCaseFile, ApiCaseStatus, ClientProfile } from '../../pages/business-quest/types'
import type { AuthUser } from '../../contexts/AuthContext'

export type CaseViewer = Pick<AuthUser, 'permission_names' | 'role_names'> | null

export type CasePriority = 'low' | 'normal' | 'high' | 'critical'
export type CaseTypeOption = { id: number; name: string; parent_id?: number | null; parent?: { id: number; name: string } | null; children?: CaseTypeOption[] }
export type CaseClient = ClientProfile & { notes?: string | null }
export type CaseEmployee = { id: number; full_name: string; full_name_kana: string | null; position_title: string | null; employee_status: string; department?: { id: number; name: string } | null }
export type EditableCase = ApiCaseFile & { client_id?: number; assigned_employee_id?: number | null; department_id?: number | null; department?: { id: number; name: string } | null; priority?: CasePriority; summary?: string | null; opened_at?: string | null; target_completion_at?: string | null }
export type ClientDraft = { name: string; name_kana: string; client_type: 'individual' | 'corporate'; phone: string; email: string; address: string; nationality: string; notes: string }
export type CaseDraft = {
  client_id: string
  title: string; case_type_id: string; case_type_other: string; status: ApiCaseStatus; priority: CasePriority; summary: string
  assigned_employee_id: string; department_id: string; opened_at: string; target_completion_at: string
}
export type CaseFieldErrors = Record<string, string>
