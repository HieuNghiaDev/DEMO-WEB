import { fetchDocumentPdf } from '../document-creation/documentPdf'
import { documentDraftStore } from '../document-creation/documentDraftStore'
import { isAxiosError } from 'axios'
import type { CaseTaskSubmission } from '../case-workspace/types'
import { documentCollectionApi } from './api'
import type { GeneratedDocumentVersion, ReceivedDocument, TaskSubmission } from './types'
import { safeExternalUrl } from './utils'

export type DocumentPreviewKind = 'pdf' | 'image' | 'auto' | 'external' | 'unavailable'
export type DocumentPreviewSource = 'c001' | 'generated' | 'submission' | 'received_upload' | 'google_drive' | 'external_link'

export type DocumentPreviewTarget = {
  key: string
  name: string
  versionLabel?: string
  mimeType: string | null
  kind: DocumentPreviewKind
  source: DocumentPreviewSource
  externalUrl: string | null
  load?: (signal: AbortSignal) => Promise<Blob>
  download?: (signal: AbortSignal) => Promise<Blob>
  unavailableMessage?: string
}

export type PreviewDocumentVersion = GeneratedDocumentVersion & { previewSubmission?: TaskSubmission | CaseTaskSubmission }

export function mergePreviewVersions(versions: GeneratedDocumentVersion[], submissions: Array<TaskSubmission | CaseTaskSubmission>): PreviewDocumentVersion[] {
  const byVersion = new Map<number, PreviewDocumentVersion>(versions.map(version => [version.version, version]))
  for (const submission of submissions) {
    const existing = byVersion.get(submission.version)
    if (existing) { byVersion.set(submission.version, { ...existing, previewSubmission: submission }); continue }
    byVersion.set(submission.version, {
      id: -submission.id, version: submission.version, workflow_status: submission.review_status,
      created_at: submission.submitted_at, updated_at: submission.submitted_at,
      created_by: submission.submitted_by?.name ? { id: submission.submitted_by.id, name: submission.submitted_by.name } : null,
      approved_by: null, artifacts: [{
        id: submission.id, artifact_type: 'submission', filename: submission.filename, mime_type: submission.mime_type,
        url: 'external_url' in submission ? submission.external_url : submission.url,
        uploaded_at: submission.submitted_at, uploaded_by: null,
      }], previewSubmission: submission,
    })
  }
  return [...byVersion.values()].sort((a, b) => b.version - a.version)
}

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

export function inferPreviewMimeType(name: string, mimeType?: string | null): string | null {
  const normalized = mimeType?.split(';', 1)[0]?.trim().toLowerCase()
  if (normalized && normalized !== 'application/octet-stream') return normalized
  const extension = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  return extension ? MIME_BY_EXTENSION[extension] ?? null : null
}

export function previewKindFor(name: string, mimeType?: string | null): Exclude<DocumentPreviewKind, 'auto'> {
  const resolvedMime = inferPreviewMimeType(name, mimeType)
  if (resolvedMime === 'application/pdf') return 'pdf'
  if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(resolvedMime ?? '')) return 'image'
  return 'unavailable'
}

export function resolveC001PreviewTarget(caseId: number, documentId: number, version: number, filename: string, externalUrl?: string | null): DocumentPreviewTarget {
  return {
    key: `c001:${caseId}:${documentId}:${version}`, name: filename.trim() || `C-001_v${version}.pdf`,
    versionLabel: `v${version}`, mimeType: 'application/pdf', kind: 'pdf', source: 'c001',
    externalUrl: safeExternalUrl(externalUrl ?? null),
    load: signal => documentDraftStore.previewC001({ caseId, documentId, version }, true, signal).then(result => result.blob),
  }
}

export function resolveSubmissionPreviewTarget(caseId: number, documentId: number | null, submission: TaskSubmission | CaseTaskSubmission, code?: string | null): DocumentPreviewTarget {
  const externalUrl = safeExternalUrl('external_url' in submission ? submission.external_url : submission.url)
  if (documentId && submission.received_document_id && submission.storage_provider === 'upload') {
    const download = (signal: AbortSignal) => documentCollectionApi.downloadReceivedDocument(caseId, documentId, submission.received_document_id!, signal)
    return {
      key: `received:${caseId}:${documentId}:${submission.received_document_id}:${submission.version}`,
      name: submission.filename, versionLabel: `v${submission.version}`,
      mimeType: inferPreviewMimeType(submission.filename, submission.mime_type), kind: 'auto',
      source: 'received_upload', externalUrl: null, load: download, download,
    }
  }
  if (submission.source_type === 'auto_generated' && code === 'C-001' && documentId) {
    return resolveC001PreviewTarget(caseId, documentId, submission.version, submission.filename, externalUrl)
  }
  // The submission API exposes metadata and a Drive link, not an authenticated
  // file endpoint. Never render a regenerated template instead of an uploaded file.
  return {
    key: `submission:${caseId}:${submission.id}:${submission.version}`, name: submission.filename?.trim() || `提出ファイル_v${submission.version}`,
    versionLabel: `v${submission.version}`, mimeType: inferPreviewMimeType(submission.filename, submission.mime_type),
    kind: externalUrl ? 'external' : 'unavailable', source: 'submission', externalUrl,
    unavailableMessage: externalUrl ? 'このファイルはアプリ内でプレビューできません。外部で開いてください。' : 'プレビューできるファイルがありません。',
  }
}

export function resolveGeneratedVersionPreviewTarget(caseId: number, documentId: number, version: GeneratedDocumentVersion, submission?: TaskSubmission | CaseTaskSubmission): DocumentPreviewTarget {
  if (submission?.version === version.version) return resolveSubmissionPreviewTarget(caseId, documentId, submission)
  const artifact = version.artifacts.find(item => previewKindFor(item.filename, item.mime_type) === 'pdf') ?? version.artifacts[0]
  const name = artifact?.filename ?? `生成資料_v${version.version}.pdf`
  const mimeType = inferPreviewMimeType(name, artifact?.mime_type)
  const externalUrl = safeExternalUrl(artifact?.url ?? null)
  const kind = artifact ? previewKindFor(name, mimeType) : 'unavailable'
  if (kind !== 'pdf') return {
    key: `generated:${caseId}:${documentId}:${version.version}`, name, versionLabel: `v${version.version}`, mimeType,
    kind: externalUrl ? 'external' : 'unavailable', source: 'generated', externalUrl,
    unavailableMessage: externalUrl ? 'このファイルはアプリ内でプレビューできません。外部で開いてください。' : 'プレビューできるファイルがありません。',
  }
  return {
    key: `generated:${caseId}:${documentId}:${version.version}`,
    name,
    versionLabel: `v${version.version}`,
    mimeType: 'application/pdf',
    kind: 'pdf',
    source: 'generated',
    externalUrl,
    load: signal => fetchDocumentPdf(caseId, documentId, version.version, signal).then(result => result.blob),
  }
}

export function resolveReceivedDocumentPreviewTarget(caseId: number, documentId: number, file: ReceivedDocument): DocumentPreviewTarget {
  const name = file.original_filename?.trim() || file.title
  const mimeType = inferPreviewMimeType(name)
  const externalUrl = safeExternalUrl(file.external_url)

  if (file.storage_type === 'upload') {
    const download = (signal: AbortSignal) => documentCollectionApi.downloadReceivedDocument(caseId, documentId, file.id, signal)
    if (!Number.isInteger(file.id) || file.id < 1) return {
      key: `received:${caseId}:${documentId}:missing`, name, mimeType, kind: 'unavailable', source: 'received_upload', externalUrl: null,
      unavailableMessage: 'プレビューできるファイルがありません。',
    }
    return {
      key: `received:${caseId}:${documentId}:${file.id}:${file.version}`,
      name,
      versionLabel: `v${file.version}`,
      mimeType,
      kind: 'auto',
      source: 'received_upload',
      externalUrl: null,
      load: download,
      download,
    }
  }

  if (externalUrl) {
    return {
      key: `received:${file.id}:${file.version}`,
      name,
      versionLabel: `v${file.version}`,
      mimeType,
      kind: 'external',
      source: file.storage_type,
      externalUrl,
      unavailableMessage: 'このファイルはアプリ内でプレビューできません。外部で開いてください。',
    }
  }

  return {
    key: `received:${file.id}:${file.version}`,
    name,
    versionLabel: `v${file.version}`,
    mimeType,
    kind: 'unavailable',
    source: file.storage_type,
    externalUrl: null,
    unavailableMessage: 'プレビューできるファイルがありません。',
  }
}

export function previewAuthorizationFailed(error: unknown): boolean {
  return isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)
}

export async function resolvePreviewBlob(target: DocumentPreviewTarget, blob: Blob, signal: AbortSignal): Promise<{ kind: 'pdf' | 'image'; blob: Blob } | null> {
  if (signal.aborted) return null
  const mimeType = inferPreviewMimeType(target.name, blob.type || target.mimeType)
  const kind = previewKindFor(target.name, mimeType)
  if (kind !== 'pdf' && kind !== 'image') throw new Error('unsupported-preview-type')
  if (kind === 'pdf' && await blob.slice(0, 5).text() !== '%PDF-') throw new Error('invalid-pdf')
  if (signal.aborted) return null
  // Older download responses may be generic octet-stream; the Blob URL needs a
  // concrete MIME for the browser PDF/image viewer after safe normalization.
  return { kind, blob: new Blob([blob], { type: mimeType ?? blob.type }) }
}
