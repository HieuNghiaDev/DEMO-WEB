// Development-only harness: real route/form/workspace components, isolated transport and fictional records.
// No AuthProvider, tokens, database, or external requests. Never a production entry point.
import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AxiosError } from 'axios'
import api from '../../src/services/api'
import { CaseManagement } from '../../src/pages/BusinessQuest'
import type { CaseWorkspace } from '../../src/features/case-workspace/types'
import type { CaseClient, CaseEmployee, CaseTypeOption } from '../../src/features/case-management/types'
import { caseTypeOptions } from '../../src/features/case-management/helpers'
import '../../src/index.css'

if (!import.meta.env.DEV) throw new Error('Development fixture only')
const clients: CaseClient[] = [{ id: 1, name: '試験依頼者 山田', name_kana: 'ヤマダ', client_type: 'individual', phone: '090-0000-0001', email: 'yamada@example.test', address: '東京都 テスト住所', nationality: 'JP' }, { id: 2, name: 'NGUYEN VAN A', name_kana: 'グエン・ヴァン・ア', client_type: 'individual', phone: '090-0000-0002', email: 'nguyen@example.test', address: '大阪府 テスト住所', nationality: 'VN' }]
const types: CaseTypeOption[] = [{ id: 10, name: '労災', children: [{ id: 11, name: '障害（補償）給付', parent_id: 10 }] }, { id: 20, name: '交通事故', children: [{ id: 21, name: '後遺障害', parent_id: 20 }] }, { id: 30, name: 'その他' }]
const employees: CaseEmployee[] = [{ id: 1, full_name: '試験担当者 佐藤', full_name_kana: null, position_title: '担当', employee_status: 'active', department: { id: 1, name: '法律業務部' } }, { id: 2, full_name: '非在籍の試験担当者', full_name_kana: null, position_title: null, employee_status: 'inactive', department: null }]
const makeCase = (id: number): CaseWorkspace => ({ id, title: `事故相談 ${id}`, case_type: id % 2 ? '労災' : '交通事故', case_type_id: id % 2 ? 10 : 20, case_type_option: { id: id % 2 ? 10 : 20, name: id % 2 ? '労災' : '交通事故' }, status: id % 2 ? 'active' : 'waiting_documents', priority: 'normal', summary: '相談内容と現在の状況を確認するためのテスト案件。', opened_at: '2026-08-31T00:00:00.000000Z', target_completion_at: '2026-09-30T00:00:00.000000Z', created_at: '2026-08-31T01:00:00Z', updated_at: '2026-08-31T01:00:00Z', client: clients[(id - 1) % 2], assigned_employee: employees[0], documents_count: 0, confirmed_documents_count: 0, documents: [], precedents: [], meeting_logs: [], custom_sections: [], parties: [], deadlines: [], case_tasks: [], activities: [] })
let cases = Array.from({ length: 12 }, (_, index) => makeCase(index + 1))
let failure = ''
let delay = 25
const logs: { method: string; url: string; payload?: Record<string, unknown> }[] = []
let notify = () => {}
api.defaults.adapter = async config => {
  const url = config.url ?? ''
  const method = config.method ?? 'get'
  const payload = config.data ? JSON.parse(config.data) : undefined
  logs.push({ url, method, ...(payload ? { payload } : {}) }); notify()
  await new Promise(resolve => setTimeout(resolve, delay))
  const mutation = ['post', 'put', 'patch'].includes(method)
  // Exercises the production recovery contract: a newly created client is retained when only case creation fails.
  const allowClientThenFailCase = mutation && failure === 'case422afterclient' && url === '/clients'
  if (allowClientThenFailCase) failure = '422'
  if (mutation && failure && !allowClientThenFailCase) {
    const requestedFailure = failure
    if (url === '/clients') failure = '' // A failed quick-client attempt can retry inside the native modal.
    if (requestedFailure === 'network') throw new AxiosError('Simulated network failure', 'ERR_NETWORK', config)
    const errors = url === '/clients' ? { name: ['氏名を確認してください。'] } : method === 'put' ? { title: ['案件名を確認してください。'] } : { case_type_id: ['事件類型を確認してください。'] }
    throw new AxiosError('Simulated HTTP failure', undefined, config, undefined, { status: Number(requestedFailure), statusText: 'Test', config, headers: {}, data: { errors } })
  }
  let data: unknown
  if (url === '/clients' && method === 'post') {
    const client = { id: 99, ...payload }; clients.push(client); data = { client }
  }
  else if (url === '/clients') data = { clients }
  else if (url === '/case-types') data = { case_types: types }
  else if (url === '/organization') data = { employees }
  else if (url === '/case-files' && method === 'get') data = { case_files: cases }
  else if (url === '/case-files' && method === 'post') {
    const type = caseTypeOptions(types).find(type => type.id === payload.case_type_id)
    const item = Object.assign(makeCase(99), payload, { case_type: type?.name, case_type_option: type, client: clients.find(client => client.id === payload.client_id), assigned_employee: employees.find(employee => employee.id === payload.assigned_employee_id) ?? null })
    cases.unshift(item); data = { case_file: item }
  } else {
    const id = Number(url.split('/')[2])
    const item = cases.find(item => item.id === id)
    if (!item) throw new AxiosError('Not found', undefined, config, undefined, { status: 404, statusText: 'Not Found', config, headers: {}, data: {} })
    if (url.endsWith('/workspace')) data = { case_file: item, summary: { progress_percent: 0, missing_documents: 0, documents_total: 0, next_deadline: null, open_tasks: 0 } }
    else if (url.endsWith('/initialization-preview')) data = { case: { id, case_type: { id: item.case_type_id, name: item.case_type } }, initialization: { available: true, candidate_count: 3, existing_generated_count: 0, missing_candidate_count: 3, skipped_candidate_count: 0, manual_item_count: 0, total_existing_collection_items: 0, legacy_item_count: 0, soft_deleted_generated_count: 0 }, purposes: [], warnings: [] }
    else if (/^\/case-files\/\d+$/.test(url)) {
      if (method === 'put') { const type = caseTypeOptions(types).find(type => type.id === payload.case_type_id); Object.assign(item, payload, { case_type: type?.name, case_type_option: type, client: clients.find(client => client.id === payload.client_id) ?? item.client }) }
      data = { case_file: item }
    } else if (url.endsWith('/assignee') && method === 'patch') { item.assigned_employee = employees.find(employee => employee.id === payload.assigned_employee_id) ?? null; data = { case_file: item } }
    else throw new Error(`Unexpected fixture request: ${method} ${url}`)
  }
  return { data, status: method === 'post' ? 201 : 200, statusText: 'OK', headers: {}, config }
}

export function Harness() {
  const [dark, setDark] = useState(false)
  const [readonly, setReadonly] = useState(false)
  const [role, setRole] = useState('level_4')
  const [version, setVersion] = useState(0)
  const [log, setLog] = useState('[]')
  const [dimensions, setDimensions] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])
  useEffect(() => {
    const observer = new ResizeObserver(() => setDimensions(`${window.innerWidth}/${document.documentElement.scrollWidth}`))
    observer.observe(document.documentElement)
    return () => observer.disconnect()
  }, [])
  useEffect(() => { notify = () => setLog(JSON.stringify(logs)); return () => { notify = () => {} } }, [])
  return <><style>{'body{margin:0}.qa-tools{padding:10px;display:flex;flex-wrap:wrap;gap:12px;background:#e2e8f0;color:#0f172a;font-size:12px}.qa-content{min-width:0}@media(min-width:768px){.qa-content{margin-left:288px}}'}</style>
    <div className="qa-tools"><strong>隔離テスト · 実DBには接続しません</strong><button onClick={() => setDark(value => !value)}>テーマ切替</button><label><input type="checkbox" checked={readonly} onChange={event => setReadonly(event.target.checked)}/>閲覧のみ</label><label>試験ロール<select value={role} onChange={event => setRole(event.target.value)}><option>level_4</option><option>level_3</option></select></label>
      <label>試験エラー<select onChange={event => { failure = event.target.value }}><option value="">なし</option><option value="422">422</option><option value="case422afterclient">依頼者後に案件422</option><option value="403">403</option><option value="network">network</option></select></label><label>応答時間<select onChange={event => { delay = Number(event.target.value) }}><option value="25">通常</option><option value="1500">遅延</option></select></label>
      <button onClick={() => { cases = []; navigate('/quests'); setVersion(value => value + 1) }}>空の一覧</button><button onClick={() => { cases = Array.from({ length: 12 }, (_, index) => makeCase(index + 1)); navigate('/quests'); setVersion(value => value + 1) }}>一覧を復元</button><output data-testid="route">{location.pathname}</output>
    </div><div className="qa-content"><Routes><Route path="/quests/*" element={<CaseManagement key={version} user={{ role_names: [role], permission_names: readonly ? ['case.view', 'employee.view'] : ['case.view', 'case.create', 'case.update', 'case.assign', 'employee.view', 'document.create'] }}/>}/></Routes></div>
    <output data-testid="viewport-size">{dimensions}</output>
    <details><summary>試験通信履歴</summary><pre data-testid="case-transport-log" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{log}</pre></details>
  </>
}
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={['/quests']}><Harness/></MemoryRouter>)
