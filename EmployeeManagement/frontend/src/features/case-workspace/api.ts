import api from '../../services/api'
import type { Communication, HistoryEntry, HistoryOptions, HistoryResponse } from './historyTypes'
import { assertTaskUploadFile } from './taskUpload'
import type { CaseActivity, CaseDeadline, CaseParty, CaseTask, CaseTaskOptionsResponse, CaseTaskSubmission, CreateCaseTaskBatchItem, WorkspaceDocument, WorkspaceResponse } from './types'

export const caseWorkspaceApi = {
  async history(caseId: number, params: Record<string, string | number>, signal?: AbortSignal) {
    return (await api.get<HistoryResponse>(`/case-files/${caseId}/history`, { params, signal })).data
  },
  async historyOptions(caseId: number, signal?: AbortSignal) {
    return (await api.get<HistoryOptions>(`/case-files/${caseId}/history/options`, { signal })).data
  },
  async saveCommunication(caseId: number, payload: Communication, id?: number) {
    const path = `/case-files/${caseId}/communications`
    return (id ? await api.patch<{ entry: HistoryEntry }>(`${path}/${id}`, payload) : await api.post<{ entry: HistoryEntry }>(path, payload)).data.entry
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
