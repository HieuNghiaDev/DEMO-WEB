// Dedicated-origin, development-only verification. No adapter delegates to a real transport.
import { useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { AxiosError, AxiosHeaders } from 'axios'
import { AuthProvider } from '../../src/contexts/AuthContext'
import api from '../../src/services/api'
import ApprovalRoom from '../../src/pages/ApprovalRoom'
import TaskDetailDrawer from '../../src/features/case-workspace/TaskDetailDrawer'
import C001DocumentReviewDrawer from '../../src/features/document-creation/components/C001DocumentReviewDrawer'
import type { CaseTask } from '../../src/features/case-workspace/types'
import '../../src/i18n'
import '../../src/index.css'
import '../../src/features/case-workspace/taskUI.css'
if (!import.meta.env.DEV || location.port !== '5178') throw new Error('Use dedicated synthetic origin :5178 only')

let scenario = 'pending'
let events: string[] = []
let processed = false
const subscribers = new Set<() => void>()
const subscribe = (listener: () => void) => { subscribers.add(listener); return () => { subscribers.delete(listener) } }
const snapshot = () => events
const log = (message: string) => { events = [...events, message]; subscribers.forEach(listener => listener()) }
api.defaults.baseURL = '/__synthetic_only__'
api.defaults.adapter = async config => {
  const path = config.url ?? ''
  const method = config.method ?? 'get'
  let status = 200
  let data: unknown = null
  if (method === 'get' && path === '/approvals') {
    data = { approvals: [{ id: 1, action_type: 'Synthetic review', payload: null, tool_name: null,
      status: processed ? 'approved' : 'pending', created_at: null, requested_by: null,
      approved_by: null, approved_at: null, rejected_by: null, rejected_at: null, executed_by: null, executed_at: null,
      allowed_actions: scenario === 'missing' ? undefined : { can_approve: scenario !== 'pending', can_reject: scenario !== 'pending', legal_approval_pending: scenario === 'pending' },
    }], c001_documents: [] }
  } else if (method === 'patch' && /^\/approvals\/1\/(approve|reject)$/.test(path)) {
    await new Promise(resolve => setTimeout(resolve, 250))
    status = scenario === 'stale403' ? 403 : scenario === 'stale409' ? 409 : 200
    if (status === 409) data = { code: 'legal_authority_policy_pending' }
    if (status === 200) { processed = true; data = { approval: { id: 1, action_type: 'Synthetic review', status: 'approved', payload: null, created_at: null, executed_at: null } } }
  } else if (method === 'get' && path.includes('/creation')) {
    data = { supported: true, template: { id: 1, document_type_id: 1, document_code: 'C-001', name: 'Synthetic C001', version: 1, renderer_type: 'generic_legal_document', format: 'html', template_body: '<article>synthetic</article>', field_schema: [] },
      document: { id: 1, version: 1, is_current: true, workflow_status: 'review', draft_data: {}, approved_data: null, approved_at: null, approved_by: null, updated_at: null }, current_version: 1,
      versions: [{ version: 1, workflow_status: 'review', is_current: true, approved_at: null, approved_by: null, drive_artifact: null }],
      permissions: { can_approve: false, legal_approval_pending: true }, c001: { status: 'pending_approval', success_fee_percentage: '20', artifact: null, latest_version: 1 } }
  } else if (path === '/me') { status = 401 }
  else { status = 503 }
  log(`${method.toUpperCase()} ${path.split('?')[0]} ${status}`)
  const response = { config, data, status, statusText: 'Synthetic', headers: new AxiosHeaders() }
  if (status >= 400) throw new AxiosError('Synthetic response', 'ERR_BAD_RESPONSE', config, undefined, response)
  return response
}
const file: CaseTask['submissions'][number] = { id: 1, version: 1, filename: 'synthetic.pdf', source_type: 'manual_upload', review_status: 'pending_review', external_url: '', mime_type: 'application/pdf', submitted_at: '2026-10-23T03:00:00Z', reviewed_at: null, review_note: null, submitted_by: { id: 1, name: 'Synthetic employee' }, reviewed_by: null }
export function Harness() {
  const [mode, setMode] = useState('pending')
  const [open, setOpen] = useState(true)
  const [revision, setRevision] = useState(0)
  const requests = useSyncExternalStore(subscribe, snapshot)
  const manual = mode === 'manual'
  const task: CaseTask = { id: 1, case_document_id: 1, title: 'Synthetic task', description: 'Synthetic data only', status: 'pending_review', priority: 'normal', assigned_employee: null, due_at: null, accepted_at: null, completed_at: null, is_overdue: false,
    case_document: { id: 1, title: 'Synthetic document', document_type: { id: 1, code: 'C-001', name_ja: 'Synthetic document' } },
    allowed_actions: { can_accept: false, can_submit: false, can_reassign: false, can_change_deadline: false, can_cancel: false, can_approve: manual, can_reject: manual, legal_approval_pending: !manual }, submissions: [file], latest_submission: file }
  return <MemoryRouter><AuthProvider><main style={{ minHeight: '100vh', background: 'var(--tm-bg)', color: 'var(--tm-text-primary)' }}>
    <header style={{ padding: 12 }}><h1>Synthetic legal approval verification — NO REAL API</h1>
      <label>Scenario <select aria-label="Scenario" value={mode} onChange={event => { scenario = event.target.value; processed = false; events = []; setMode(scenario); setOpen(true); setRevision(value => value + 1) }}>
        {['pending', 'missing', 'ordinary', 'stale403', 'stale409', 'generated-task', 'manual', 'c001'].map(value => <option key={value}>{value}</option>)}
      </select></label><button onClick={() => document.documentElement.classList.toggle('dark')}>テーマ切替</button><button onClick={() => setOpen(true)}>Inspectorを開く</button>
      <output aria-label="Synthetic requests" style={{ display: 'block' }}>{requests.join(' | ') || 'No requests'}</output>
    </header>
    {['generated-task', 'manual'].includes(mode) ? open && <TaskDetailDrawer key={revision} task={task} caseId={1} activities={[]} canManage={false} canReview working={false} onClose={() => setOpen(false)} onApprove={async () => { log('INTERNAL APPROVE callback'); return true }} onReject={async () => { log('INTERNAL REJECT callback'); return true }} onUpdate={async () => false} onAccept={async () => false} onCancel={async () => false} onSubmit={async () => false} onGenerate={() => {}}/> : mode === 'c001' ? open && <C001DocumentReviewDrawer key={revision} caseId={1} documentId={1} canUpdate onClose={() => setOpen(false)}/> : <ApprovalRoom key={revision}/>}
  </main></AuthProvider></MemoryRouter>
}
const root = createRoot(document.getElementById('root')!)
root.render(<Harness/>)
import.meta.hot?.dispose(() => root.unmount())
