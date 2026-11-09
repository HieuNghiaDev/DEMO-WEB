// Dev-only production drawer demo. All action callbacks stay in memory.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../src/i18n'
import '../../src/index.css'
import '../../src/features/document-collection/documentCollection.css'
import '../../src/features/case-workspace/taskUI.css'
import TaskDetailDrawer from '../../src/features/case-workspace/TaskDetailDrawer'
import type { CaseTask } from '../../src/features/case-workspace/types'

if (!import.meta.env.DEV) throw new Error('Development-only task drawer verification')
const flags = { can_accept: true, can_submit: false, can_reassign: false, can_change_deadline: false, can_approve: false, can_reject: false, can_cancel: false }
const initial: CaseTask = {
  id: 8, case_document_id: 825, title: '本人確認資料の取得', description: '依頼者から資料を取得します。', status: 'unaccepted', status_label: '未受領', priority: 'normal',
  created_at: '2026-10-08T03:30:00Z', updated_at: '2026-10-08T03:30:00Z', due_at: '2026-10-22T03:30:00Z', accepted_at: null, completed_at: null, is_overdue: false,
  assigned_employee: { id: 1, full_name: 'LE HIEU NGHIA' }, allowed_actions: flags,
  case_document: { id: 825, title: '本人確認資料', document_type: { id: 3, code: 'C-003', name_ja: '本人確認資料', handling_type: 'collected' } }, submissions: [], latest_submission: null,
}
export function Harness() {
  const [task, setTask] = useState(initial)
  const [state, setState] = useState('default')
  const [open, setOpen] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const changeState = (value: string) => {
    setState(value); setError(''); setWorking(value === 'loading')
    const started = value === 'success' || value === 'files'
    const file: CaseTask['submissions'][number] = { id: 1, version: 1, filename: 'CASE-49_DOC-825_v1_LE_HIEU_NGHIA.pdf', source_type: 'manual_upload', review_status: 'pending_review', external_url: '', mime_type: 'application/pdf', submitted_at: initial.created_at!, reviewed_at: null, review_note: null, submitted_by: { id: 1, name: 'LE HIEU NGHIA' }, reviewed_by: null }
    setTask({ ...initial, status: started ? 'in_progress' : 'unaccepted', accepted_at: started ? '2026-10-09T02:20:00Z' : null, allowed_actions: { ...flags, can_accept: !started && value !== 'disabled' }, submissions: value === 'files' ? [file] : [], latest_submission: value === 'files' ? file : null })
    if (value === 'error') setError('対応を開始できませんでした。接続を確認して再試行してください。')
    setOpen(true)
  }
  return <main data-demo-state={state} style={{ minHeight: '100vh', padding: 16, background: 'var(--tm-bg)', color: 'var(--tm-text-primary)' }}>
    <style>{`
      body:has([data-demo-state="hover"]) .cm-task-start-button { background: var(--tm-primary-hover); }
      body:has([data-demo-state="focus"]) .cm-task-start-button { outline: 2px solid var(--tm-focus-ring); outline-offset: 2px; }
      body:has([data-demo-state="active"]) .cm-task-start-button { transform: scale(.98); opacity: .95; }
    `}</style>
    <h1 style={{ fontSize: 16 }}>Task Drawer — development verification</h1>
    <p>Production UI; no API or case data mutations.</p>
    <button onClick={() => document.documentElement.classList.toggle('dark')}>テーマ切替</button>
    <label>State <select aria-label="Demo state" value={state} onChange={event => changeState(event.target.value)}>{['default', 'hover', 'focus', 'active', 'disabled', 'loading', 'error', 'success', 'files'].map(value => <option key={value}>{value}</option>)}</select></label>
    <button onClick={() => setOpen(true)}>Drawerを開く</button>
    {open && <TaskDetailDrawer task={task} caseId={49} activities={[]} canManage={false} canReview={false} working={working} error={error} onClose={() => setOpen(false)} onAccept={async () => {
      setWorking(true); setError(''); await new Promise(resolve => setTimeout(resolve, 500))
      if (state === 'error') { setError('対応を開始できませんでした。接続を確認して再試行してください。'); setWorking(false); return false }
      setTask(row => ({ ...row, status: 'in_progress', accepted_at: new Date().toISOString(), allowed_actions: { ...flags, can_accept: false } })); setWorking(false); return true
    }} onUpdate={async () => false} onSubmit={async () => false} onGenerate={() => {}} onApprove={async () => false} onReject={async () => false} onCancel={async () => false}/>}
  </main>
}
const root = createRoot(document.getElementById('root')!)
root.render(<Harness/>);
import.meta.hot?.dispose(() => root.unmount())
