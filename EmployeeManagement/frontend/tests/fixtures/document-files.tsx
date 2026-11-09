// Dev-only verification of production file components; all review data stays in memory.
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ChevronRight, History } from 'lucide-react'
import '../../src/i18n'
import '../../src/index.css'
import '../../src/features/document-collection/documentCollection.css'
import DocumentFilesHeader from '../../src/features/document-collection/components/DocumentFilesHeader'
import DocumentVersionList from '../../src/features/document-collection/components/DocumentVersionList'
import ReceivedDocumentRegistration from '../../src/features/document-collection/components/ReceivedDocumentRegistration'
import FileReviewActions from '../../src/features/document-collection/components/FileReviewActions'
import { documentCollectionApi } from '../../src/features/document-collection/api'
import type { CollectionDetail, FileReview } from '../../src/features/document-collection/types'
import { mergePreviewVersions } from '../../src/features/document-collection/documentPreview'

if (!import.meta.env.DEV) throw new Error('Development-only file presentation verification')
documentCollectionApi.registerReceivedDocument = async () => { throw new Error('Uploads are disabled in this fixture') }
const initial = {
  id: 824, title: '委任状（民事）', document_type: { id: 2, code: 'C-002', name_ja: '委任状（民事）', description: null },
  file_review: { source: 'task_submission', id: 1, version: 1, status: 'pending_review', reason: null, detail: null, reviewed_by: null, reviewed_at: null },
  task_submissions: [{ id: 1, version: 1, filename: 'CASE-49_DOC-824_v1_LE_HIEU_NGHIA.pdf', source_type: 'manual_upload', mime_type: 'application/pdf', submitted_at: '2026-10-08T03:30:00Z', submitted_by: { id: 1, name: 'LE HIEU NGHIA' }, review_status: 'pending_review' }],
} as CollectionDetail

export function Harness() {
  const [detail, setDetail] = useState(initial)
  const [role, setRole] = useState('reviewer')
  const [simulateFailure, setSimulateFailure] = useState(false)
  const [history, setHistory] = useState(false)
  const [opened, setOpened] = useState('')
  const [reviewRequests, setReviewRequests] = useState(0)
  const capabilities = { can_upload: role !== 'viewer', can_review: role === 'reviewer', can_return: role === 'reviewer', can_edit: false, can_change_assignee: false, can_change_deadline: false }
  const rendered = { ...detail, capabilities }
  useEffect(() => {
    documentCollectionApi.reviewFile = async (_caseId, _documentId, request) => {
      setReviewRequests(value => value + 1)
      if (simulateFailure) throw new Error('Simulated save failure')
      const status: FileReview['status'] = request.action === 'return' ? 'rejected' : 'approved'
      return { ...detail, capabilities: { can_upload: role !== 'viewer', can_review: role === 'reviewer', can_return: role === 'reviewer', can_edit: false, can_change_assignee: false, can_change_deadline: false }, file_review: { ...detail.file_review!, status, reason: request.reason ?? null, detail: request.detail ?? null }, task_submissions: detail.task_submissions?.map(file => ({ ...file, review_status: status! })) }
    }
  }, [detail, role, simulateFailure])
  return <main style={{ minHeight: '100vh', padding: 16, background: 'var(--tm-bg)', color: 'var(--tm-text-primary)' }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20, fontSize: 12 }}>
      <button onClick={() => document.documentElement.classList.toggle('dark')}>テーマ切替</button>
      <label>権限 <select value={role} onChange={event => setRole(event.target.value)}><option value="reviewer">Reviewer</option><option value="viewer">Viewer</option><option value="uploader">Uploader</option></select></label>
      <label><input type="checkbox" checked={simulateFailure} onChange={event => setSimulateFailure(event.target.checked)}/>保存エラーを再現</label>
      <button onClick={() => { setDetail(initial); setReviewRequests(0) }}>サンプルをリセット</button>
    </div>
    <p style={{ fontSize: 11, marginBottom: 12 }}>Dev fixture: production components, no API/data mutations. File size is unavailable from the existing API.</p>
    <p role="status" style={{ fontSize: 11, marginBottom: 12 }}>レビュー送信回数: {reviewRequests}</p>
    <div className="dc-preview dc-required-inspector" style={{ maxWidth: 576 }}>
      <section className="dc-required-drawer-card is-files dc-compact-files">
        <DocumentFilesHeader count={1}>{capabilities.can_upload && <ReceivedDocumentRegistration caseId={49} itemId={824} canUpdate documentName={detail.title} triggerLabel="アップロード" triggerClassName="dc-primary" onRegistered={() => { throw new Error('Fixture must not upload') }}/>}</DocumentFilesHeader>
        <DocumentVersionList compact caseId={49} documentId={824} versions={mergePreviewVersions([], detail.task_submissions ?? [])} onPreview={target => setOpened(target.name)}/>
        <FileReviewActions compact key={role} caseId={49} detail={rendered} onChanged={setDetail}/>
        <button type="button" className="dc-required-show-all dc-compact-file-history" onClick={() => setHistory(value => !value)}><History size={16}/>バージョン履歴を見る (1件)<ChevronRight size={15}/></button>
        {history && <p role="status">v1 · 2026/10/08 · LE HIEU NGHIA</p>}
      </section>
      {opened && <p role="status">プレビュー対象: {opened}</p>}
    </div>
  </main>
}
const root = createRoot(document.getElementById('root')!)
root.render(<Harness/>)
import.meta.hot?.dispose(() => root.unmount())
