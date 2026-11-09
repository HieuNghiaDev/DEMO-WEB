// Dev-only wizard verification: every API operation remains in memory.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../src/i18n'
import '../../src/index.css'
import '../../src/features/case-workspace/taskUI.css'
import CreateCaseTasksDrawer from '../../src/features/case-workspace/CreateCaseTasksDrawer'
import { caseWorkspaceApi } from '../../src/features/case-workspace/api'
import type { CaseTaskOptionsResponse } from '../../src/features/case-workspace/types'

if (!import.meta.env.DEV) throw new Error('Development-only task creation verification')
const task = (id: number, status: 'in_progress' | 'completed' | 'cancelled') => ({ id, status, due_at: '2026-10-10T10:00:00Z', assigned_employee: { id: 7, full_name: 'LE HIEU NGHIA' } })
const initial: CaseTaskOptionsResponse = {
  employees: [{ id: 7, full_name: 'LE HIEU NGHIA', avatar_path: null, office_id: 1 }],
  required_documents: ['委任契約書', '委任状（民事）', '本人確認資料', '既存の事件資料一式', 'その他資料'].map((title, index) => ({
    id: index + 1, title, category: 'チェックリスト', has_existing_task: index > 0,
    document_type: { id: index + 1, code: `C-00${index + 1}`, name_ja: title },
    case_tasks: index === 1 ? [task(101, 'in_progress')] : index === 2 ? [task(102, 'completed')] : index === 3 ? [task(103, 'cancelled')] : [],
  })),
}
let options = structuredClone(initial)
let requests = 0
caseWorkspaceApi.taskOptions = async () => structuredClone(options)
caseWorkspaceApi.createTaskBatch = async (_caseId, tasks) => {
  requests++
  if (tasks.some(item => options.required_documents.find(document => document.id === item.case_document_id)?.has_existing_task)) throw { isAxiosError: true, response: { status: 409, data: { message: 'この資料にはすでにタスクが作成されています。', code: 'case_document_task_exists' } } }
  options.required_documents = options.required_documents.map(document => {
    const item = tasks.find(item => item.case_document_id === document.id)
    return item ? { ...document, has_existing_task: true, case_tasks: [{ id: 200 + document.id, status: 'unaccepted', due_at: `${item.due_date}T12:00:00Z`, assigned_employee: { id: 7, full_name: 'LE HIEU NGHIA' } }] } : document
  })
  return { message: 'タスクを作成しました。', tasks: [] }
}
export function Harness() {
  const [open, setOpen] = useState(true)
  const [created, setCreated] = useState(0)
  return <main className="min-h-screen bg-[var(--tm-bg)] p-4 text-[var(--tm-text-primary)]">
    <p>Dev fixture — no real API or database mutations.</p>
    <p role="status">作成件数: {created} / POST回数: {requests}</p>
    <button onClick={() => setOpen(true)}>タスクを追加</button>
    <button onClick={() => { options = structuredClone(initial); requests = 0; setCreated(0); setOpen(false) }}>サンプルをリセット</button>
    <button onClick={() => document.documentElement.classList.toggle('dark')}>テーマ切替</button>
    <CreateCaseTasksDrawer isOpen={open} caseId={49} onClose={() => setOpen(false)} onCreated={count => { setCreated(value => value + count) }}/>
  </main>
}
const root = createRoot(document.getElementById('root')!)
root.render(<Harness/>)
import.meta.hot?.dispose(() => root.unmount())
