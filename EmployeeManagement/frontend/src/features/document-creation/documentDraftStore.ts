import api from '../../services/api'
import type { DocumentDraft, DocumentFieldDefinition, DocumentRendererType, DocumentTemplateDefinition, DocumentWorkflowStatus } from './documentTemplates'
import type { C001State } from '../document-collection/types'
import { pdfFilename } from './documentPdf'

export type DocumentDraftRecord = {
  id: number | null
  version: number
  isCurrent: boolean
  status: DocumentWorkflowStatus
  draft: DocumentDraft
  approvedData: DocumentDraft | null
  approvedAt: string | null
  approvedBy: { id: number; name: string } | null
  updatedAt: string | null
}

export type DocumentDraftIdentity = { caseId: number; documentId: number; version?: number }

export type DocumentVersionSummary = {
  version: number
  status: DocumentWorkflowStatus
  isCurrent: boolean
  approvedAt: string | null
  approvedBy: { id: number; name: string } | null
  driveArtifact: DocumentDriveState['artifact']
}

export type DocumentCreationState = {
  supported: boolean
  template: DocumentTemplateDefinition | null
  record: DocumentDraftRecord | null
  drive: DocumentDriveState
  currentVersion: number | null
  versions: DocumentVersionSummary[]
  permissions: { canApprove: boolean }
  c001: C001State | null
}

export type DocumentDriveState = { available: boolean; artifact: { url: string; filename: string; uploaded_at: string } | null }

export type C001WorkbookPreview = {
  blob: Blob
  filename: string
  source: 'temporary_working_copy' | 'saved_working_copy'
}

export interface DocumentDraftStore {
  load(identity: DocumentDraftIdentity, signal?: AbortSignal): Promise<DocumentCreationState>
  saveDraft(identity: DocumentDraftIdentity, draft: DocumentDraft, successFeePercentage?: string): Promise<DocumentCreationState>
  moveToReview(identity: DocumentDraftIdentity, draft: DocumentDraft, successFeePercentage?: string): Promise<DocumentCreationState>
  approve(identity: DocumentDraftIdentity): Promise<DocumentCreationState>
  createRevision(identity: DocumentDraftIdentity): Promise<DocumentCreationState>
  previewC001(identity: DocumentDraftIdentity, official: boolean, signal?: AbortSignal): Promise<C001WorkbookPreview>
  syncC001(identity: DocumentDraftIdentity, percentage: string): Promise<DocumentCreationState>
  rejectC001(identity: DocumentDraftIdentity, reason: string): Promise<DocumentCreationState>
}

type ApiTemplate = {
  id: number; document_type_id: number; document_code: string; name: string; version: number
  renderer_type: DocumentRendererType; format: 'html'; template_body: string; field_schema: DocumentFieldDefinition[]
}
type ApiDocument = {
  id: number | null; version?: number; is_current?: boolean; workflow_status: DocumentWorkflowStatus; draft_data: DocumentDraft
  approved_data: DocumentDraft | null; approved_at: string | null
  approved_by: { id: number; name: string } | null; updated_at: string | null
}
type ApiVersionSummary = {
  version: number; workflow_status: DocumentWorkflowStatus; is_current: boolean
  approved_at: string | null; approved_by: { id: number; name: string } | null
  drive_artifact: DocumentDriveState['artifact']
}
type ApiCreationState = {
  supported: boolean; template: ApiTemplate | null; document: ApiDocument | null; drive?: DocumentDriveState
  current_version?: number | null; versions?: ApiVersionSummary[]
  permissions?: { can_approve?: boolean }
  c001?: C001State | null
}

const path = ({ caseId, documentId }: DocumentDraftIdentity) =>
  `/case-files/${caseId}/document-collection/${documentId}/creation`

function mapState(data: ApiCreationState): DocumentCreationState {
  if (data.document?.workflow_status === 'approved' && !data.document.approved_data) {
    throw new Error('承認済み文書の保存内容を取得できませんでした。再読み込みしてください。')
  }
  return {
    supported: data.supported,
    drive: data.drive ?? { available: false, artifact: null },
    currentVersion: data.current_version ?? (data.document?.id ? data.document.version ?? 1 : null),
    versions: (data.versions ?? []).map(version => ({
      version: version.version, status: version.workflow_status, isCurrent: version.is_current,
      approvedAt: version.approved_at, approvedBy: version.approved_by, driveArtifact: version.drive_artifact,
    })),
    permissions: { canApprove: data.permissions?.can_approve ?? false },
    c001: data.c001 ?? null,
    template: data.template ? {
      id: data.template.id, documentTypeId: data.template.document_type_id,
      documentCode: data.template.document_code, name: data.template.name,
      version: data.template.version, rendererType: data.template.renderer_type,
      format: data.template.format, templateBody: data.template.template_body,
      fields: data.template.field_schema,
    } : null,
    record: data.document ? {
      id: data.document.id, version: data.document.version ?? 1, isCurrent: data.document.is_current ?? true,
      status: data.document.workflow_status, draft: data.document.draft_data,
      approvedData: data.document.approved_data, approvedAt: data.document.approved_at,
      approvedBy: data.document.approved_by, updatedAt: data.document.updated_at,
    } : null,
  }
}

export const apiDocumentDraftStore: DocumentDraftStore = {
  async load(identity, signal) {
    const query = identity.version ? `?version=${identity.version}` : ''
    return mapState((await api.get<ApiCreationState>(`${path(identity)}${query}`, { signal })).data)
  },
  async saveDraft(identity, draft, successFeePercentage) {
    return mapState((await api.patch<ApiCreationState>(`${path(identity)}/draft`, {
      draft_data: draft,
      ...(successFeePercentage ? { success_fee_percentage: successFeePercentage } : {}),
    })).data)
  },
  async moveToReview(identity, draft, successFeePercentage) {
    return mapState((await api.post<ApiCreationState>(`${path(identity)}/review`, {
      draft_data: draft,
      ...(successFeePercentage ? { success_fee_percentage: successFeePercentage } : {}),
    })).data)
  },
  async approve(identity) {
    return mapState((await api.post<ApiCreationState>(`${path(identity)}/approve`)).data)
  },
  async createRevision(identity) {
    return mapState((await api.post<ApiCreationState>(`${path(identity)}/revision`)).data)
  },
  async previewC001(identity, official, signal) {
    const query = identity.version ? `?version=${identity.version}` : ''
    const endpoint = official ? 'pdf' : 'preview'
    const response = await api.get<Blob>(`${path(identity)}/c001/${endpoint}${query}`, { signal, responseType: 'blob' })
    if (!response.data.type.toLowerCase().startsWith('application/pdf') || await response.data.slice(0, 5).text() !== '%PDF-') {
      throw new Error('C-001 PDFを取得できませんでした。')
    }
    return {
      blob: response.data,
      filename: pdfFilename(response.headers['content-disposition']),
      source: official || response.headers['x-c001-preview-source'] === 'saved_working_copy'
        ? 'saved_working_copy'
        : 'temporary_working_copy',
    }
  },
  async syncC001(identity, percentage) {
    return mapState((await api.post<ApiCreationState>(`${path(identity)}/c001/sync`, { success_fee_percentage: percentage })).data)
  },
  async rejectC001(identity, reason) {
    return mapState((await api.post<ApiCreationState>(`${path(identity)}/c001/reject`, { reason })).data)
  },
}

export const documentDraftStore: DocumentDraftStore = apiDocumentDraftStore

export async function saveDocumentToDrive(identity: DocumentDraftIdentity, version?: number): Promise<DocumentDriveState> {
  const query = version ? `?version=${version}` : ''
  return (await api.post<{ drive: DocumentDriveState }>(`${path(identity)}/google-drive${query}`)).data.drive
}

// Approved views must never fall back to editable or live case/client values.
export function documentDisplayData(record: DocumentDraftRecord): DocumentDraft {
  if (record.status !== 'approved') return record.draft
  if (!record.approvedData) throw new Error('承認済み文書の保存内容がありません。')
  return record.approvedData
}
