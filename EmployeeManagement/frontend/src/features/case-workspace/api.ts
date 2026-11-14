import api, { captureAuthSession } from '../../services/api'
import type { Communication, HistoryEntry, HistoryOptions, HistoryResponse } from './historyTypes'
import { assertTaskUploadFile } from './taskUpload'
import type { CaseActivity, CaseDeadline, CaseParty, CaseTask, CaseTaskOptionsResponse, CaseTaskSubmission, CreateCaseTaskBatchItem, WorkspaceDocument, WorkspaceResponse } from './types'

export type CommunicationUploadProgress = { phase: 'uploading'; percent: number } | { phase: 'saving' }

export const caseWorkspaceApi = {
  async history(caseId: number, params: Record<string, string | number>, signal?: AbortSignal) {
    return (await api.get<HistoryResponse>(`/case-files/${caseId}/history`, { params, signal })).data
  },
  async historyOptions(caseId: number, signal?: AbortSignal) {
    return (await api.get<HistoryOptions>(`/case-files/${caseId}/history/options`, { signal })).data
  },
  async saveCommunication(caseId: number, payload: Communication, id?: number, files: File[] = [], onProgress?: (progress: CommunicationUploadProgress) => void) {
    const path = `/case-files/${caseId}/communications`
    const stagedIds: string[] = []
    const uploadPath = `/case-files/${caseId}/history/uploads`
    const sameSession = files.length > 0 ? captureAuthSession() : undefined
    const ensureSession = () => {
      if (sameSession && !sameSession()) throw new Error('Session changed during attachment upload.')
    }
    try {
      if (files.length) {
        const chunkSize = 4 * 1024 * 1024
        const total = files.reduce((bytes, file) => bytes + file.size, 0)
        let sent = 0
        onProgress?.({ phase: 'uploading', percent: 0 })
        for (const file of files) {
          ensureSession()
          const start = await api.post<{ upload_id: string }>(uploadPath, { name: file.name, size: file.size, communication_id: id })
          const uploadId = encodeURIComponent(start.data.upload_id)
          stagedIds.push(start.data.upload_id)
          for (let offset = 0; offset < file.size; offset += chunkSize) {
            ensureSession()
            const chunk = file.slice(offset, offset + chunkSize)
            const body = new FormData()
            body.append('offset', String(offset))
            body.append('chunk', chunk, 'chunk.bin')
            const response = await api.post<{ next_offset: number }>(`${uploadPath}/${uploadId}`, body, {
              headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60_000,
            })
            if (response.data.next_offset !== offset + chunk.size) throw new Error('Attachment upload offset mismatch.')
            sent += chunk.size
            onProgress?.({ phase: 'uploading', percent: Math.round(100 * sent / total) })
          }
        }
        onProgress?.({ phase: 'saving' })
      }
      ensureSession()
      const data = stagedIds.length ? { ...payload, staged_attachment_ids: stagedIds } : payload
      const config = stagedIds.length ? { timeout: 600_000 } : undefined
      return (id ? await api.patch<{ entry: HistoryEntry }>(`${path}/${id}`, data, config) : await api.post<{ entry: HistoryEntry }>(path, data, config)).data.entry
    } catch (error) {
      if (stagedIds.length && sameSession?.()) {
        // Failed scratch cleanup is retried by the backend's expiry sweep.
        void Promise.allSettled(stagedIds.map(uploadId => api.delete(`${uploadPath}/${encodeURIComponent(uploadId)}`, { timeout: 5_000 })))
      }
      throw error
    }
  },
  async downloadCommunicationAttachment(caseId: number, communicationId: number, attachmentId: string) {
    return (await api.get<Blob>(`/case-files/${caseId}/communications/${communicationId}/attachments/${encodeURIComponent(attachmentId)}`, {
      responseType: 'blob', timeout: 300_000,
    })).data
  },
  async communicationTask(caseId: number, communicationId: number, payload: Record<string, unknown>) {
    return (await api.post<{ task: CaseTask | null }>(`/case-files/${caseId}/communications/${communicationId}/task`, payload)).data.task
  },
  async show(caseId: number) {
    return (await api.get<WorkspaceResponse>(`/case-files/${caseId}/workspace`)).data
  },
  async applyTemplate(caseId: number) {
    return (await api.post<{ message: string; created_count: number }>(`/case-files/${caseId}/apply-document-template`)).data
  },
  async createDocument(caseId: number, payload: Record<string, unknown>) {
    return (await api.post<{ document: WorkspaceDocument }>(`/case-files/${caseId}/documents`, payload)).data.document
  },
  async updateDocument(caseId: number, documentId: number, payload: Record<string, unknown>) {
    return (await api.patch<{ document: WorkspaceDocument }>(`/case-files/${caseId}/documents/${documentId}`, payload)).data.document
  },
  async deleteDocument(caseId: number, documentId: number) {
    await api.delete(`/case-files/${caseId}/documents/${documentId}`)
  },
  async createParty(caseId: number, payload: Record<string, unknown>) {
    return (await api.post<{ party: CaseParty }>(`/case-files/${caseId}/parties`, payload)).data.party
  },
  async updateParty(caseId: number, partyId: number, payload: Record<string, unknown>) {
    return (await api.patch<{ party: CaseParty }>(`/case-files/${caseId}/parties/${partyId}`, payload)).data.party
  },
  async updateIncident(caseId: number, payload: Record<string, unknown>) {
    return (await api.patch<{ case_file: WorkspaceResponse['case_file'] }>(`/case-files/${caseId}/incident`, payload)).data.case_file
  },
  // Update the client/requester basic information for a case
  async updateClient(clientId: number, payload: Record<string, unknown>) {
    return (await api.patch<{ client: Record<string, unknown> }>(`/clients/${clientId}`, payload)).data.client
  },
  async deleteParty(caseId: number, partyId: number) {
    await api.delete(`/case-files/${caseId}/parties/${partyId}`)
  },
  async createDeadline(caseId: number, payload: Record<string, unknown>) {
    return (await api.post<{ deadline: CaseDeadline }>(`/case-files/${caseId}/deadlines`, payload)).data.deadline
  },
  async updateDeadline(caseId: number, deadlineId: number, payload: Record<string, unknown>) {
    return (await api.patch<{ deadline: CaseDeadline }>(`/case-files/${caseId}/deadlines/${deadlineId}`, payload)).data.deadline
  },
  async deleteDeadline(caseId: number, deadlineId: number) {
    await api.delete(`/case-files/${caseId}/deadlines/${deadlineId}`)
  },
  async createTask(caseId: number, payload: Record<string, unknown>) {
    return (await api.post<{ task: CaseTask | null }>(`/case-files/${caseId}/case-tasks`, payload)).data.task
  },
  async taskOptions(caseId: number, signal?: AbortSignal) {
    return (await api.get<CaseTaskOptionsResponse>(`/case-files/${caseId}/case-tasks/options`, { signal })).data
  },
  async createTaskBatch(caseId: number, tasks: CreateCaseTaskBatchItem[]) {
    return (await api.post<{ message: string; tasks: CaseTask[] }>(`/case-files/${caseId}/case-tasks/batch`, { tasks })).data
  },
  async updateTask(caseId: number, taskId: number, payload: Record<string, unknown>) {
    return (await api.patch<{ task: CaseTask | null }>(`/case-files/${caseId}/case-tasks/${taskId}`, payload)).data.task
  },
  async deleteTask(caseId: number, taskId: number) {
    await api.delete(`/case-files/${caseId}/case-tasks/${taskId}`)
  },
  async acceptTask(caseId: number, taskId: number) {
    return (await api.post<{ task: CaseTask }>(`/case-files/${caseId}/case-tasks/${taskId}/accept`)).data.task
  },
  async submitTask(caseId: number, taskId: number, file: File) {
    assertTaskUploadFile(file)
    const form = new FormData()
    form.append('file', file, file.name)
    // Null suppresses both JSON and Axios's POST urlencoded fallback; the
    // browser/fetch transport supplies the multipart header and boundary.
    return (await api.post<{ task: CaseTask; submission: CaseTaskSubmission }>(`/case-files/${caseId}/case-tasks/${taskId}/submissions`, form, { headers: { 'Content-Type': null } })).data
  },
  async approveTaskSubmission(caseId: number, taskId: number, submissionId: number) {
    return (await api.post<{ task: CaseTask | null }>(`/case-files/${caseId}/case-tasks/${taskId}/submissions/${submissionId}/approve`)).data.task
  },
  async rejectTaskSubmission(caseId: number, taskId: number, submissionId: number, reason: string) {
    return (await api.post<{ task: CaseTask | null }>(`/case-files/${caseId}/case-tasks/${taskId}/submissions/${submissionId}/reject`, { reason })).data.task
  },
  async createActivity(caseId: number, payload: Record<string, unknown>) {
    return (await api.post<{ activity: CaseActivity }>(`/case-files/${caseId}/activities`, payload)).data.activity
  },
}
