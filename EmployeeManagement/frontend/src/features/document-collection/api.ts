import api from '../../services/api'
import type { BulkNecessityPayload, BulkNecessityResponse, CollectionDetail, CollectionListResponse, CollectionPatch, CollectionQuery, EmployeeOption, InitializationPreview, InitializationResponse } from './types'

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
    const document = (await api.get<{ document: CollectionDetail }>(`${collectionPath(caseId)}/${itemId}`, { signal })).data.document
    // Fail through the existing drawer feedback instead of mounting with an
    // incomplete list/detail contract (for example an older deployed API).
    if (!document?.workflow_state || !Array.isArray(document.generated_versions) || !Array.isArray(document.received_documents)) {
      throw new Error('必要資料の詳細を取得できませんでした。再読み込みしてください。')
    }
    return document
  },
  async update(caseId: number, itemId: number, payload: CollectionPatch) {
    return (await api.patch<{ document: CollectionDetail }>(`${collectionPath(caseId)}/${itemId}`, payload)).data.document
  },
  async bulkNecessity(caseId: number, payload: BulkNecessityPayload) {
    return (await api.patch<BulkNecessityResponse>(`${collectionPath(caseId)}/bulk-necessity`, payload)).data
  },
  async registerReceivedDocument(caseId: number, itemId: number, formData: FormData) {
    // Suppress the shared JSON default so the browser sends the file binary
    // with its own multipart boundary, as in the Task upload path.
    return (await api.post<{ document: CollectionDetail }>(`${collectionPath(caseId)}/${itemId}/received-documents`, formData, { headers: { 'Content-Type': null } })).data.document
  },
  async reviewFile(caseId: number, itemId: number, payload: { source: 'received' | 'task_submission'; file_id: number; action: 'confirm' | 'return'; reason?: string; detail?: string }) {
    return (await api.post<{ document: CollectionDetail }>(`${collectionPath(caseId)}/${itemId}/file-review`, payload)).data.document
  },
  async downloadReceivedDocument(caseId: number, itemId: number, receivedDocumentId: number, signal?: AbortSignal) {
    return (await api.get<Blob>(`${collectionPath(caseId)}/${itemId}/received-documents/${receivedDocumentId}/download`, { responseType: 'blob', signal })).data
  },
  async employees(signal?: AbortSignal): Promise<EmployeeOption[]> {
    const { data } = await api.get<{ employees: Array<{ id: number; full_name: string }> }>('/organization', { signal })
    return data.employees.map(employee => ({ id: employee.id, display_name: employee.full_name }))
  },
}
