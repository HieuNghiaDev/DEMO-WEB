import api from '../../services/api'
import type { InterpretationHistory, InterpretationItem, InterpretationOptions, InterpretationPayload, InterpretationResponse, InterpretationStatus, Interpreter } from './types'

const path = (caseId: number) => `/case-files/${caseId}/interpretation-requests`
export const interpretationApi = {
  async list(caseId: number, page = 1, signal?: AbortSignal) {
    return (await api.get<InterpretationResponse>(path(caseId), { params: { page }, signal })).data
  },
  async options(caseId: number, signal?: AbortSignal) {
    return (await api.get<InterpretationOptions>(`${path(caseId)}/options`, { signal })).data
  },
  async show(caseId: number, id: number) {
    return (await api.get<{ item: InterpretationItem; capabilities: InterpretationResponse['capabilities'] }>(`${path(caseId)}/${id}`)).data
  },
  async save(caseId: number, payload: InterpretationPayload, id?: number) {
    const response = id
      ? await api.patch<{ item: InterpretationItem }>(`${path(caseId)}/${id}`, payload)
      : await api.post<{ item: InterpretationItem }>(path(caseId), payload)
    return response.data.item
  },
  async assign(caseId: number, item: InterpretationItem, interpreterId: number | null) {
    return (await api.patch<{ item: InterpretationItem }>(`${path(caseId)}/${item.id}/assignment`, { revision: item.revision, interpreter_id: interpreterId })).data.item
  },
  async transition(caseId: number, item: InterpretationItem, status: InterpretationStatus, reason?: string) {
    return (await api.post<{ item: InterpretationItem }>(`${path(caseId)}/${item.id}/status`, { revision: item.revision, status, cancellation_reason: reason })).data.item
  },
  async register(caseId: number, payload: { kind: 'employee' | 'external'; display_name?: string; employee_id?: number; registration_key: string }) {
    return (await api.post<{ interpreter: Interpreter }>(`${path(caseId)}/interpreters`, payload)).data.interpreter
  },
  async conflicts(caseId: number, payload: InterpretationPayload) {
    return (await api.post<{ has_conflict: boolean }>(`${path(caseId)}/conflicts`, payload)).data
  },
  async history(caseId: number, id: number, page = 1) {
    return (await api.get<InterpretationHistory>(`${path(caseId)}/${id}/history`, { params: { page } })).data
  },
}
