import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../src/index.css'
import InterpretationPanel from '../../src/features/interpretation/InterpretationPanel'
import { interpretationApi } from '../../src/features/interpretation/api'
import type { InterpretationCapabilities, InterpretationEvent, InterpretationItem, InterpretationStatus, Interpreter } from '../../src/features/interpretation/types'

// Test-only page. Every feature API method is replaced before render; no real API/Drive writes.
let records: InterpretationItem[] = []
let profiles: Interpreter[] = [{ id: 1, name: 'テスト通訳者（外部）', kind: 'external', is_active: true }]
const events = new Map<number, InterpretationEvent[]>()
let scenario = 'normal'
const allCaps: InterpretationCapabilities = { can_create: true, can_update: true, can_assign: true, can_transition: true, can_cancel: true, can_view_costs: false }
const caps = () => Object.fromEntries(Object.keys(allCaps).map(key => [key, scenario === 'viewer' ? false : allCaps[key as keyof typeof allCaps]])) as InterpretationCapabilities
const transport = async (write = false) => {
  await new Promise(resolve => setTimeout(resolve, 180))
  if (['403', '409', '500'].includes(scenario)) throw { isAxiosError: true, response: { status: Number(scenario) } }
  if (write && scenario.startsWith('mutation')) throw { isAxiosError: true, response: { status: Number(scenario.slice(8)) } }
}
const found = (id: number) => { const item = records.find(value => value.id === id); if (!item) throw { isAxiosError: true, response: { status: 404 } }; return item }
const audit = (item: InterpretationItem, title: string) => events.set(item.id, [{ id: (events.get(item.id)?.length ?? 0) + 1, title, occurred_at: new Date().toISOString(), actor_user_id: 10001, actor_name: 'テスト担当者', before: {}, after: { status: item.status } }, ...(events.get(item.id) ?? [])])
interpretationApi.list = async () => { await transport(); return { items: records.map(item => ({ ...item })), statistics: Object.fromEntries(['pending', 'arranging', 'confirmed', 'completed', 'cancelled'].map(status => [status, records.filter(item => item.status === status).length])) as Record<InterpretationStatus, number>, pagination: { page: 1, last_page: 1, total: records.length }, capabilities: caps() } }
interpretationApi.options = async () => { await transport(); return { interpreters: profiles, employees: [{ id: 10001, name: 'テスト社員' }] } }
interpretationApi.show = async (_caseId, id) => { await transport(); return { item: { ...found(id) }, capabilities: caps() } }
interpretationApi.save = async (caseId, payload, id) => {
  await transport(true)
  const old = id ? found(id) : undefined
  const item: InterpretationItem = { ...payload, id: id ?? records.length + 1, case_file_id: caseId, revision: (old?.revision ?? 0) + 1, status: old?.status ?? 'pending', cancellation_reason: null,
    interpreter: id ? old?.interpreter ?? null : profiles.find(p => p.id === payload.interpreter_id) ?? null, updated_at: new Date().toISOString() }
  records = [...records.filter(value => value.id !== item.id), item]; audit(item, old ? '通訳依頼を更新' : '通訳依頼を追加'); return { ...item }
}
interpretationApi.assign = async (_caseId, item, interpreterId) => { await transport(true); const current = found(item.id); current.interpreter = profiles.find(p => p.id === interpreterId) ?? null; current.revision++; audit(current, '通訳者を変更'); return { ...current } }
interpretationApi.transition = async (_caseId, item, status, reason) => { await transport(true); const current = found(item.id); current.status = status; current.cancellation_reason = reason ?? null; current.revision++; audit(current, '通訳依頼の状態を変更'); return { ...current } }
interpretationApi.register = async (_caseId, payload) => { await transport(true); const interpreter: Interpreter = { id: profiles.length + 1, name: payload.display_name ?? 'テスト社員', kind: payload.kind, is_active: true }; profiles = [...profiles, interpreter]; return interpreter }
interpretationApi.history = async (_caseId, id) => { await transport(); return { events: events.get(id) ?? [], pagination: { page: 1, last_page: 1 } } }
interpretationApi.conflicts = async () => { await transport(); return { has_conflict: false } }
export function App() {
  const [version, setVersion] = useState(0)
  const [dark, setDark] = useState(true)
  return <main className={dark ? 'dark' : ''} style={{ minHeight: '100vh', padding: '20px', background: 'var(--tm-bg)', color: 'var(--tm-text-primary)' }}>
    <div style={{ marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}><strong>SYNTHETIC — メモリ内テスト（実DB書込なし）</strong><label>テスト応答 <select aria-label="テスト応答" value={scenario} onChange={event => { scenario = event.target.value; setVersion(value => value + 1) }}><option value="normal">正常</option><option value="viewer">閲覧のみ</option><option value="403">HTTP403</option><option value="409">HTTP409</option><option value="500">HTTP500</option><option value="mutation403">書込HTTP403</option><option value="mutation409">書込HTTP409</option></select></label><button onClick={() => { document.documentElement.classList.toggle('dark', !dark); setDark(!dark) }}>テーマ切替</button></div>
    <button style={{ marginBottom: 16 }} onClick={() => {
      const sample: InterpretationItem = { id: 1, case_file_id: 10001, language: 'ベトナム語', content: 'Synthetic consultation', work_type: 'consultation', mode: 'online', starts_at: '2026-12-10T00:00:00Z', ends_at: '2026-12-10T01:00:00Z', location: null, notes: null, status: 'pending', revision: 1, interpreter: profiles[0], updated_at: new Date().toISOString(), cancellation_reason: null }
      records = [sample]; events.clear(); audit(sample, '通訳依頼を追加'); setVersion(value => value + 1)
    }}>テスト依頼を用意（メモリのみ）</button>
    <InterpretationPanel key={version} caseId={10001} caseLabel="SYNTHETIC-CASE" clientName="テスト依頼者" />
  </main>
}
document.documentElement.classList.add('dark')
const root = createRoot(document.getElementById('root')!)
root.render(<App />)
// This standalone test entry is re-evaluated by Vite; dispose its own root before recreating it.
import.meta.hot?.dispose(() => root.unmount())
