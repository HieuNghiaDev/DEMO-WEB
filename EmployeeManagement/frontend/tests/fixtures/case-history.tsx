import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import CaseHistoryPanel from '../../src/features/case-workspace/CaseHistoryPanel'
import { caseWorkspaceApi } from '../../src/features/case-workspace/api'
import type { HistoryEntry, HistoryOptions, HistoryResponse } from '../../src/features/case-workspace/historyTypes'
import '../../src/index.css'

// All API methods used by this fixture are memory-only. Never call the real backend.
const permissions = { can_view_history: true, can_add_communication: true, can_edit_communication: true, can_create_task: true }
const people: HistoryOptions['people'] = [{ type: 'client', id: 1, name: 'PHAM GIA HUY' }, { type: 'employee', id: 3, name: 'LE HIEU NGHIA' }, { type: 'party', id: 2, name: '通訳担当' }]
let entries: HistoryEntry[] = [
  { id: 'activity:2', record_id: 2, kind: 'system', type: 'system', occurred_at: '2026-10-09T06:26:18Z', title: '資料を確認済みに変更', summary: 'C-004 既存の事件資料一式', actor: { id: 3, full_name: 'LE HIEU NGHIA' }, communication: null, changes: { review_status: { before: 'pending_review', after: 'approved' } }, permissions: { can_edit: false, can_create_task: false }, legacy: false, linked_task: null },
  { id: 'activity:1', record_id: 1, kind: 'communication', type: 'phone', occurred_at: '2026-10-09T05:00:00Z', title: '事故後の治療状況について', summary: '現在の通院状況と今後必要となる診断書について確認。', actor: { id: 3, full_name: 'LE HIEU NGHIA' }, changes: {}, permissions: { can_edit: true, can_create_task: true }, legacy: false, linked_task: null,
    communication: { communication_type: 'phone', direction: 'outbound', started_at: '2026-10-09T05:00:00Z', ended_at: '2026-10-09T05:32:00Z', duration_minutes: 32, subject: '事故後の治療状況について', summary: '現在の通院状況と今後必要となる診断書について確認。', details: '週2回通院中\n次回診察10/15', outcome: '診断書を取得後、事務所へ提出予定', next_action: '診断書の提出状況を確認', next_action_due_at: '2026-10-16T00:00:00Z', counterparties: [people[0]], participants: people } },
]
let nextId = 3
let saves = 0; let tasks = 0
caseWorkspaceApi.historyOptions = async () => ({ people, permissions })
caseWorkspaceApi.history = async (_case, filters) => {
  const matching = entries.filter(e => (!filters.type || e.type === filters.type)
    && (!filters.search || `${e.title} ${e.summary}`.includes(String(filters.search)))
    && (!filters.actor_id || e.actor?.id === Number(filters.actor_id)))
    .toSorted((a, b) => b.occurred_at.localeCompare(a.occurred_at))
  const counts = { all: matching.length, system: matching.filter(e => e.kind === 'system').length, communication: matching.filter(e => e.kind === 'communication').length }
  const rows = matching.filter(e => !filters.kind || e.kind === filters.kind)
  const perPage = Number(filters.per_page ?? 15)
  const lastPage = Math.max(1, Math.ceil(rows.length / perPage))
  const page = Math.min(Number(filters.page ?? 1), lastPage)
  const start = (page - 1) * perPage
  return { entries: rows.slice(start, start + perPage), counts, permissions, pagination: { current_page: page, per_page: perPage, last_page: lastPage, total: rows.length, from: rows.length ? start + 1 : null, to: rows.length ? Math.min(start + perPage, rows.length) : null } } satisfies HistoryResponse
}
caseWorkspaceApi.saveCommunication = async (_case, data, id) => {
  saves++
  const record = id ?? nextId++
  const entry: HistoryEntry = { id: `activity:${record}`, record_id: record, kind: 'communication', type: data.communication_type, occurred_at: data.started_at, title: data.subject, summary: data.summary,
    actor: { id: 3, full_name: 'LE HIEU NGHIA' }, communication: { ...data, duration_minutes: data.ended_at ? Math.floor((Date.parse(data.ended_at) - Date.parse(data.started_at)) / 60000) : null }, changes: {}, legacy: false, linked_task: null, permissions: { can_edit: true, can_create_task: Boolean(data.next_action || data.next_action_due_at) } }
  entries = [...entries.filter(e => e.record_id !== record), entry]
  return entry
}
caseWorkspaceApi.communicationTask = async (_case, id, payload) => {
  tasks++
  entries = entries.map(e => e.record_id === id ? { ...e, permissions: { ...e.permissions, can_create_task: false }, linked_task: { id: 100, title: String(payload.title) } } : e)
  return null
}
const query = new URLSearchParams(location.search)
document.documentElement.classList.toggle('dark', query.get('theme') !== 'light')
export function Harness() {
  const [counts, setCounts] = useState({ saves, tasks })
  return <main className="p-4 bg-[var(--tm-surface)] min-h-screen"><p className="text-xs text-[var(--tm-text-secondary)] mb-4">ISOLATED TEST FIXTURE — 保存 {counts.saves} / タスクPOST {counts.tasks} (memory only)</p><CaseHistoryPanel caseId={49} onChanged={async () => { setCounts({ saves, tasks }) }} onOpenTask={() => {}}/></main>
}
export function ResponsiveHarness() {
  const [width, setWidth] = useState(1440)
  const [theme, setTheme] = useState('dark')
  return <main><header className="flex gap-4 p-3 bg-slate-100 text-slate-900"><label>Viewport<select aria-label="Viewport" value={width} onChange={e => setWidth(Number(e.target.value))}>{[1440, 1024, 768, 390].map(w => <option key={w} value={w}>{w}</option>)}</select></label><label>Theme<select aria-label="Theme" value={theme} onChange={e => setTheme(e.target.value)}><option value="dark">Dark</option><option value="light">Light</option></select></label></header><iframe title="History responsive fixture" src={`./case-history.html?frame=1&theme=${theme}`} style={{ width, height: 650, border: 0 }}/></main>
}
createRoot(document.getElementById('root')!).render(query.has('frame') ? <Harness/> : <ResponsiveHarness/>)
