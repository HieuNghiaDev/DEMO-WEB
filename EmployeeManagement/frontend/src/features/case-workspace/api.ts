import api from '../../services/api'
import type { CaseActivity, CaseDeadline, CaseParty, CaseTask, WorkspaceDocument, WorkspaceResponse } from './types'

export const caseWorkspaceApi = {
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
    return (await api.post<{ task: CaseTask }>(`/case-files/${caseId}/case-tasks`, payload)).data.task
  },
  async updateTask(caseId: number, taskId: number, payload: Record<string, unknown>) {
    return (await api.patch<{ task: CaseTask }>(`/case-files/${caseId}/case-tasks/${taskId}`, payload)).data.task
  },
  async deleteTask(caseId: number, taskId: number) {
    await api.delete(`/case-files/${caseId}/case-tasks/${taskId}`)
  },
  async createActivity(caseId: number, payload: Record<string, unknown>) {
    return (await api.post<{ activity: CaseActivity }>(`/case-files/${caseId}/activities`, payload)).data.activity
  },
}
