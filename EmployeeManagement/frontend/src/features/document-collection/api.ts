import api from '../../services/api'
import type { CollectionDetail, CollectionListResponse, CollectionPatch, CollectionQuery, EmployeeOption, InitializationPreview, InitializationResponse } from './types'

const collectionPath = (caseId: number) => `/case-files/${caseId}/document-collection`
export const documentCollectionApi = {
  async preview(caseId: number, signal?: AbortSignal) {
    return (await api.get<InitializationPreview>(`${collectionPath(caseId)}/initialization-preview`, { signal })).data
  },
  async initialize(caseId: number) {
    return (await api.post<InitializationResponse>(`${collectionPath(caseId)}/initialize`)).data
  },
  async list(caseId: number, params: CollectionQuery, signal?: AbortSignal) {
    return (await api.get<CollectionListResponse>(collectionPath(caseId), { params, signal })).data
  },
  async detail(caseId: number, itemId: number, signal?: AbortSignal) {
    return (await api.get<{ document: CollectionDetail }>(`${collectionPath(caseId)}/${itemId}`, { signal })).data.document
  },
  async update(caseId: number, itemId: number, payload: CollectionPatch) {
    return (await api.patch<{ document: CollectionDetail }>(`${collectionPath(caseId)}/${itemId}`, payload)).data.document
  },
  async employees(signal?: AbortSignal): Promise<EmployeeOption[]> {
    const { data } = await api.get<{ employees: Array<{ id: number; full_name: string }> }>('/organization', { signal })
    return data.employees.map(employee => ({ id: employee.id, display_name: employee.full_name }))
  },
}
