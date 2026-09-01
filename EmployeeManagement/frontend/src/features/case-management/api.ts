import axios from 'axios'
import api from '../../services/api'
import type { ApiCaseFile } from '../../pages/business-quest/types'
import type { CaseClient, CaseEmployee, CaseFieldErrors, CaseTypeOption, ClientDraft, EditableCase } from './types'

export const caseApi = {
  list: async () => (await api.get<{ case_files: ApiCaseFile[] }>('/case-files')).data.case_files,
  get: async (id: number) => (await api.get<{ case_file: EditableCase }>(`/case-files/${id}`)).data.case_file,
  clients: async () => (await api.get<{ clients: CaseClient[] }>('/clients')).data.clients,
  createClient: async (draft: ClientDraft) => (await api.post<{ client: CaseClient }>('/clients', Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim() || null])))).data.client,
  types: async () => (await api.get<{ case_types: CaseTypeOption[] }>('/case-types')).data.case_types,
  employees: async () => (await api.get<{ employees: CaseEmployee[] }>('/organization')).data.employees,
  create: async (payload: object) => (await api.post<{ case_file: EditableCase }>('/case-files', payload)).data.case_file,
  update: async (id: number, payload: object) => (await api.put<{ case_file: EditableCase }>(`/case-files/${id}`, payload)).data.case_file,
  assign: async (id: number, employeeId: number | null) => (await api.patch<{ case_file: ApiCaseFile }>(`/case-files/${id}/assignee`, { assigned_employee_id: employeeId })).data.case_file,
}
export function caseError(error: unknown): { message: string; fields: CaseFieldErrors } {
  const fields: CaseFieldErrors = {}
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 422) {
      for (const [key, messages] of Object.entries(error.response.data?.errors ?? {})) if (Array.isArray(messages) && typeof messages[0] === 'string') fields[key] = messages[0]
      return { message: '入力内容を確認してください。', fields }
    }
    if (error.response?.status === 403) return { message: 'この操作を行う権限がありません。', fields }
    if (error.response?.status === 404) return { message: '案件が見つかりません。一覧へ戻って確認してください。', fields }
    if (error.response?.status === 401) return { message: 'ログイン状態を確認してください。', fields }
  }
  return { message: '通信を完了できませんでした。入力内容は保持されています。もう一度お試しください。', fields }
}
