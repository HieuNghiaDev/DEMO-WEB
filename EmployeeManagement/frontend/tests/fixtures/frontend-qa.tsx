// Dedicated origin and fail-closed fake adapter: no real API, Drive, users or mutations.
import { useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { AxiosError, AxiosHeaders } from 'axios'
import { AuthProvider } from '../../src/contexts/AuthContext'
import api from '../../src/services/api'
import ApprovalRoom from '../../src/pages/ApprovalRoom'
import DocumentDriveButton from '../../src/features/document-creation/components/DocumentDriveButton'
import type { DocumentDriveState } from '../../src/features/document-creation/documentDraftStore'
import DocumentPreviewViewer from '../../src/features/document-collection/components/DocumentPreviewViewer'
import type { DocumentPreviewTarget } from '../../src/features/document-collection/documentPreview'
import { fetchDocumentPdf } from '../../src/features/document-creation/documentPdf'
import syntheticPdf from './synthetic-preview.pdf?url'
import '../../src/i18n'
import '../../src/index.css'
import '../../src/features/document-collection/documentCollection.css'

if (!import.meta.env.DEV || location.hostname !== '127.0.0.1' || location.port !== '5181') throw new Error('Use isolated QA origin 127.0.0.1:5181')
let scenario = 'queue-error'
let events: string[] = []
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const snapshot = () => events
const log = (event: string) => { events = [...events, event]; listeners.forEach(listener => listener()) }
api.defaults.baseURL = '/__synthetic_only__'
api.defaults.adapter = async config => {
  const path = config.url ?? ''
  const method = config.method ?? 'get'
  const current = scenario
  let status = 503
  let data: unknown = { message: 'Synthetic failure' }
  if (method === 'get' && path === '/approvals') {
    await new Promise(resolve => setTimeout(resolve, 600))
    status = current === 'queue-error' ? 500 : 200
    data = { approvals: current === 'queue-pending' ? [{ id: 1, action_type: 'Synthetic legal review', status: 'pending', payload: null, created_at: null, executed_at: null,
      allowed_actions: { can_approve: false, can_reject: false, legal_approval_pending: true } }] : [], c001_documents: [] }
  } else if (method === 'get' && path.startsWith('/case-files/1/document-collection/2/creation/pdf')) {
    status = current === 'pdf-denied' ? 403 : 200
    data = status === 403 ? { message: 'Synthetic denial' } : current === 'pdf-invalid' ? new Blob(['not a PDF'], { type: 'application/pdf' }) : await fetch(syntheticPdf).then(response => response.blob())
  } else if (method === 'post' && path === '/case-files/1/document-collection/2/creation/google-drive?version=2') {
    await new Promise(resolve => setTimeout(resolve, 600))
    status = current === 'drive-denied' ? 403 : current === 'drive-conflict' ? 409 : 200
    data = { drive: { available: true, artifact: { url: current === 'drive-unsafe' ? 'https://example.test/not-drive' : 'https://drive.google.com/file/d/synthetic-only/view', filename: 'synthetic.pdf', uploaded_at: null } } }
  } else if (path === '/me') status = 401
  log(`${method.toUpperCase()} ${path} ${status}`)
  const response = { config, data, status, statusText: 'Synthetic', headers: new AxiosHeaders({ 'content-disposition': 'attachment; filename="synthetic.pdf"' }) }
  if (status >= 400) throw new AxiosError('Synthetic response', 'ERR_BAD_RESPONSE', config, undefined, response)
  return response
}

export function Harness() {
  const [mode, setMode] = useState(scenario)
  const [revision, setRevision] = useState(0)
  const [target, setTarget] = useState<DocumentPreviewTarget | null>(null)
  const [drive, setDrive] = useState<DocumentDriveState>({ available: true, artifact: null })
  const requests = useSyncExternalStore(subscribe, snapshot)
  const choose = (next: string) => { scenario = next; events = []; setMode(next); setTarget(null); setDrive({ available: next !== 'drive-unavailable', artifact: null }); setRevision(value => value + 1) }
  return <MemoryRouter><AuthProvider><main style={{ minHeight: '100vh', padding: 16, background: 'var(--tm-bg)', color: 'var(--tm-text-primary)' }}>
    <h1>THEMIS QA — synthetic only / no real API</h1>
    <label>Scenario <select aria-label="QA scenario" value={mode} onChange={event => choose(event.target.value)}>
      {['queue-error', 'queue-empty', 'queue-pending', 'pdf-valid', 'pdf-denied', 'pdf-invalid', 'drive-success', 'drive-denied', 'drive-conflict', 'drive-unsafe', 'drive-unavailable'].map(value => <option key={value}>{value}</option>)}
    </select></label>
    <button type="button" onClick={() => { scenario = 'queue-empty'; log('Retry response armed: empty success') }}>次の再試行を成功にする</button>
    <button type="button" onClick={() => document.documentElement.classList.toggle('dark')}>テーマ切替</button>
    <output aria-label="Synthetic requests" style={{ display: 'block', fontSize: 12 }}>{requests.join(' | ') || 'No requests'}</output>
    {mode.startsWith('queue-') && <ApprovalRoom key={revision}/>}
    {mode.startsWith('pdf-') && <button type="button" onClick={() => setTarget({ key: `qa:${revision}`, name: 'synthetic.pdf', versionLabel: 'v2', mimeType: 'application/pdf', kind: 'pdf', source: 'generated', externalUrl: 'https://drive.google.com/file/d/synthetic-only/view',
      load: signal => fetchDocumentPdf(1, 2, 2, signal).then(result => result.blob) })}>合成PDFをプレビュー</button>}
    {mode.startsWith('drive-') && <DocumentDriveButton key={revision} caseId={1} documentId={2} version={2} drive={drive} onSaved={setDrive}/>}
    <DocumentPreviewViewer target={target} onClose={() => setTarget(null)}/>
  </main></AuthProvider></MemoryRouter>
}
const root = createRoot(document.getElementById('root')!)
root.render(<Harness/> )
import.meta.hot?.dispose(() => root.unmount())
