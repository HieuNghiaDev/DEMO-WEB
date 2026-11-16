import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { compileFunction } from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { changeHistoryFilter, compactHistoryChange, durationLabel, groupHistoryDays, historyCategory, historyOperationIcon, historyPageNumbers, historyRange, historyTime, historyTypeLabel, historyValue, initialHistoryFilters, localDateInput } from '../src/features/case-workspace/historyPresentation.ts'

const person = { type: 'client', id: 1, name: 'PHAM GIA HUY' }
const communication = { communication_type: 'phone', direction: 'outbound', started_at: '2026-10-09T05:00:00Z', ended_at: '2026-10-09T05:32:00Z', duration_minutes: 32,
  subject: '治療の確認', summary: '週2回の通院について確認', details: '次回診察10/15', outcome: '診断書を提出予定', next_action: '提出状況を確認', next_action_due_at: '2026-10-16T00:00:00Z', counterparties: [person], participants: [person] }
const entry = { id: 'activity:10', record_id: 10, kind: 'communication', title: communication.subject, summary: communication.summary, type: 'phone', occurred_at: communication.started_at, communication,
  actor: { id: 3, full_name: 'LE HIEU NGHIA' }, permissions: { can_edit: true, can_create_task: true }, changes: {}, legacy: false, linked_task: null }
const nodes = tree => !React.isValidElement(tree) ? [] : [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)]

function harness(api = {}, withEffects = false) {
  const slots = []; let cursor = 0
  let effects = []
  const hooks = { ...React,
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }] },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index] },
    useEffect(effect, deps) {
      if (!withEffects) return
      const index = cursor++; const previous = slots[index]
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        slots[index] = { deps, cleanup: previous?.cleanup }
        effects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = effect() })
      }
    }, useId: () => 'history-test',
  }
  const external = createRequire(import.meta.url); const modules = new Map()
  function load(path) {
    if (modules.has(path)) return modules.get(path).exports
    const module = { exports: {} }; modules.set(path, module)
    let code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
    if (path.endsWith('CaseHistoryPanel.tsx')) code += '\nexports.CommunicationDialog = CommunicationDialog; exports.HistoryPeopleField = HistoryPeopleField; exports.NextActionTaskDialog = NextActionTaskDialog;'
    const require = name => {
      if (name === 'react') return hooks
      if (name === './api') return { caseWorkspaceApi: api }
      if (name === '../../services/api') return { captureAuthSession: () => () => true }
      if (name === '../../components/ui') return { Button: ({ icon, iconPosition: _position, variant: _variant, size: _size, loading: _loading, ...props }) => React.createElement('button', props, props.children, icon), ModalShell: props => React.createElement('section', props) }
      if (name.endsWith('.css')) return {}
      if (!name.startsWith('.')) return external(name)
      const base = resolve(dirname(path), name)
      return load(extname(base) ? base : [`${base}.ts`, `${base}.tsx`].find(existsSync))
    }
    compileFunction(code, ['exports', 'require', 'module'], { filename: path })(module.exports, require, module)
    return module.exports
  }
  const module = load(resolve('src/features/case-workspace/CaseHistoryPanel.tsx'))
  return { module, render(name, props) { cursor = 0; return module[name](props) }, async flushEffects() { const pending = effects; effects = []; pending.forEach(effect => effect()); await new Promise(resolve => setTimeout(resolve, 5)) } }
}

test('Japanese type/direction and duration use real communication fields', () => {
  assert.equal(historyTypeLabel(entry), '電話・発信')
  assert.equal(historyTypeLabel({ ...entry, type: 'email' }), 'メール・送信')
  assert.equal(historyTypeLabel({ ...entry, kind: 'system' }), '操作履歴')
  assert.equal(durationLabel(75), '1時間15分'); assert.equal(durationLabel(60), '1時間'); assert.equal(durationLabel(null), '')
  assert.equal(localDateInput('invalid'), '')
})
test('structured changes never dump raw objects/participant JSON', () => {
  assert.equal(historyValue([person]), person.name)
  assert.equal(historyValue({ unknown: 'secret structure' }), '構造化情報の変更')
  assert.equal(historyValue('pending_review'), '確認待ち')
})
test('compact timeline exposes full detail and only capability-controlled actions', () => {
  const h = harness()
  const props = { entry, onEdit() {}, onTask() {}, onOpenTask() {} }
  const html = renderToStaticMarkup(h.render('TimelineEntry', props))
  assert.match(html, /電話・発信.*32分/); assert.match(html, /PHAM GIA HUY/); assert.match(html, /次回対応/); assert.match(html, /詳細を見る/); assert.doesNotMatch(html, /診断書を提出予定/)
  nodes(h.render('TimelineEntry', props)).find(n => n.props['aria-expanded'] === false).props.onClick()
  const expanded = renderToStaticMarkup(h.render('TimelineEntry', props))
  assert.match(expanded, /診断書を提出予定/); assert.match(expanded, />編集</); assert.match(expanded, /次回対応からタスクを作成/)
  const readonly = renderToStaticMarkup(h.render('TimelineEntry', { ...props, entry: { ...entry, kind: 'system', type: 'system', communication: null, permissions: { can_edit: false, can_create_task: false } } }))
  assert.doesNotMatch(readonly, />編集</); assert.doesNotMatch(readonly, /タスクを作成/)
  assert.doesNotMatch(readonly, /操作履歴/)
})
test('approved timeline structure has rail, semantic icon, real actor initials and restrained categories', () => {
  const props = { entry, onEdit() {}, onTask() {}, onOpenTask() {} }
  const html = renderToStaticMarkup(harness().render('TimelineEntry', props))
  assert.match(html, /cm-history-track.*aria-hidden="true"/)
  assert.match(html, /cm-history-actor-avatar/)
  assert.match(html, /cm-history-category">連絡・面談/)
  assert.match(html, /cm-history-duration">32分/)
  assert.match(html, /相手：PHAM GIA HUY/)
  assert.match(html, /参加者 1名/)
  assert.match(html, /cm-history-next-date/)
  assert.doesNotMatch(html, /2026\/10\/09/)
  assert.equal(historyCategory({ ...entry, kind: 'system', action_type: 'party.updated', title: '更新' }), '関係者')
  assert.equal(historyCategory({ ...entry, kind: 'system', title: 'タスクを登録' }), 'タスク')
  assert.equal(historyCategory({ ...entry, kind: 'system', title: 'ファイル v2 をアップロード' }), '資料')
  assert.equal(historyCategory({ ...entry, kind: 'system', action_type: 'task.submission.approved', title: '資料を確認済みに変更' }), '資料')
  assert.equal(historyCategory({ ...entry, kind: 'system', title: '不明な操作' }), null)
  assert.equal(historyCategory({ ...entry, title: 'タスクという件名の電話' }), '連絡・面談')
  assert.equal(historyOperationIcon({ ...entry, kind: 'system', action_type: 'party.updated', title: '関係者情報を更新' }), 'person')
})
test('page helpers keep bounds, meaningful change, day grouping and time-only rows', () => {
  assert.deepEqual(historyPageNumbers(1, 12), [1, 2, 3, 4, 'ellipsis', 12])
  assert.deepEqual(historyPageNumbers(6, 12), [1, 'ellipsis', 5, 6, 7, 'ellipsis', 12])
  assert.deepEqual(historyPageNumbers(12, 12), [1, 'ellipsis', 9, 10, 11, 12])
  assert.deepEqual(historyPageNumbers(1, 1), [1])
  assert.equal(historyRange({ total: 42, from: 16, to: 30 }), '42件中 16–30件を表示')
  assert.equal(historyRange({ total: 0, from: null, to: null }), '0件中 0件を表示')
  assert.doesNotMatch(historyTime(entry.occurred_at), /2026|\//)
  const groups = groupHistoryDays([entry, { ...entry, id: '2' }, { ...entry, id: '3', occurred_at: '2026-10-08T05:00:00Z' }])
  assert.deepEqual(groups.map(g => g.entries.length), [2, 1])
  assert.equal(historyOperationIcon({ ...entry, title: '資料を差し戻し' }), 'return')
  assert.equal(historyOperationIcon({ ...entry, action_type: 'document.file.approved' }), 'confirmed')
  assert.deepEqual(compactHistoryChange({ ...entry, changes: { review_status: { before: 'pending_review', after: 'approved' } } }), { field: '確認状況', before: '確認待ち', after: '確認済み', more: 0 })
  for (const [field, value] of Object.entries({ kind: 'system', type: 'phone', actor_id: '3', from: '2026-10-09', to: '2026-10-10', search: '診断書', per_page: 30 })) {
    const current = { ...initialHistoryFilters, page: 3, search: 'existing' }
    const next = changeHistoryFilter(current, field, value)
    assert.equal(next.page, 1); assert.equal(next[field], value)
    if (field !== 'search') assert.equal(next.search, 'existing')
  }
})
test('history panel sends server page/per_page, keeps filters, resets page, and uses server totals', async () => {
  const requests = []
  const h = harness({ historyOptions: async () => ({ people: [], permissions: {} }), history: async (_case, filters) => {
    requests.push(filters)
    const current = Number(filters.page); const size = Number(filters.per_page)
    return { entries: [entry], permissions: {}, counts: { all: 42, system: 36, communication: 6 }, pagination: { current_page: current, per_page: size, last_page: Math.ceil(42 / size), total: 42, from: (current - 1) * size + 1, to: Math.min(current * size, 42) } }
  } }, true)
  const props = { caseId: 49, onChanged: async () => {}, onOpenTask() {} }
  const oldWindow = globalThis.window
  globalThis.window = { setTimeout: callback => setTimeout(callback, 0), clearTimeout }
  const render = () => h.render('default', props)
  try {
    render(); await h.flushEffects(); let tree = render()
    assert.equal(requests[0].per_page, 15); assert.equal(requests[0].page, 1)
    let html = renderToStaticMarkup(tree)
    assert.match(html, /すべて<span>42/); assert.match(html, /操作履歴<span>36/); assert.match(html, /42件中 1–15件を表示/)
    assert.equal(nodes(tree).find(n => n.props['aria-label'] === '前のページ').props.disabled, true)
    nodes(tree).find(n => n.props['aria-label'] === '2ページ').props.onClick()
    tree = render(); assert.ok(nodes(tree).some(n => n.props.role === 'status' && n.props['aria-label'] === '履歴を読み込み中'))
    await h.flushEffects(); tree = render()
    assert.equal(requests.at(-1).page, 2)
    assert.match(renderToStaticMarkup(tree), /42件中 16–30件を表示/)
    assert.equal(nodes(tree).find(n => n.props['aria-label'] === '2ページ').props['aria-current'], 'page')
    nodes(tree).find(n => n.type === 'input' && n.props.type === 'search').props.onChange({ target: { value: '治療' } })
    render(); await h.flushEffects(); tree = render()
    assert.equal(requests.at(-1).page, 1); assert.equal(requests.at(-1).search, '治療')
    nodes(tree).find(n => n.props['aria-label'] === '2ページ').props.onClick(); render(); await h.flushEffects(); tree = render()
    assert.equal(requests.at(-1).page, 2); assert.equal(requests.at(-1).search, '治療')
    nodes(tree).find(n => n.type === 'select' && n.props.value === 15).props.onChange({ target: { value: '30' } })
    render(); await h.flushEffects(); tree = render()
    assert.equal(requests.at(-1).page, 1); assert.equal(requests.at(-1).per_page, 30); assert.equal(requests.at(-1).search, '治療')
    nodes(tree).find(n => n.props['aria-label'] === '2ページ').props.onClick(); render(); await h.flushEffects(); tree = render()
    assert.equal(nodes(tree).find(n => n.props['aria-label'] === '次のページ').props.disabled, true)
  } finally { globalThis.window = oldWindow }
})
test('stale request cannot overwrite a newer filter; empty result keeps controls and clear action', async () => {
  const requests = []
  const h = harness({ historyOptions: async () => ({ people: [], permissions: {} }), history: (_case, filters) => new Promise(resolve => requests.push({ filters, resolve })) }, true)
  const props = { caseId: 49, onChanged: async () => {}, onOpenTask() {} }
  const oldWindow = globalThis.window
  globalThis.window = { setTimeout: callback => setTimeout(callback, 0), clearTimeout }
  const render = () => h.render('default', props)
  const response = (total, entries) => ({ entries, permissions: {}, counts: { all: total, system: total, communication: 0 }, pagination: { current_page: 1, per_page: 15, last_page: 1, total, from: total ? 1 : null, to: total || null } })
  try {
    render(); await h.flushEffects()
    nodes(render()).find(n => n.type === 'input' && n.props.type === 'search').props.onChange({ target: { value: '存在しない' } })
    render(); await h.flushEffects()
    requests[0].resolve(response(99, [entry])); await new Promise(resolve => setImmediate(resolve))
    assert.doesNotMatch(renderToStaticMarkup(render()), /99件中/)
    requests[1].resolve(response(0, [])); await new Promise(resolve => setImmediate(resolve))
    const tree = render(); const html = renderToStaticMarkup(tree)
    assert.match(html, /該当する履歴はありません。/); assert.match(html, /0件中 0件を表示/)
    assert.ok(nodes(tree).some(n => n.type === 'input' && n.props.value === '存在しない'))
    const empty = nodes(tree).find(n => n.props.className === 'cm-history-empty')
    nodes(empty).find(n => n.props.onClick).props.onClick()
    render(); await h.flushEffects()
    assert.equal(requests.at(-1).filters.search, undefined); assert.equal(requests.at(-1).filters.page, 1)
  } finally { globalThis.window = oldWindow }
})
test('communication open/cancel do not write; explicit save writes once and strips server fields', async () => {
  let calls = 0; let payload; let finish; let saved = 0; let closed = 0
  const h = harness({ saveCommunication: async (_case, data) => { calls++; payload = data; return new Promise(resolve => { finish = resolve }) } })
  const props = { caseId: 49, entry, people: [person], onClose() { closed++ }, onSaved() { saved++ } }
  const tree = h.render('CommunicationDialog', props)
  assert.equal(calls, 0); tree.props.onClose(); assert.equal(closed, 1)
  const form = nodes(tree).find(n => n.type === 'form')
  const event = { preventDefault() {} }
  form.props.onSubmit(event); form.props.onSubmit(event)
  assert.equal(calls, 1); assert.equal(payload.duration_minutes, undefined); assert.equal(payload.has_linked_task, undefined)
  assert.equal(saved, 0); finish(entry); await new Promise(resolve => setImmediate(resolve)); assert.equal(saved, 1)
})
test('failed save retains dialog/form data and shows error without success', async () => {
  const h = harness({ saveCommunication: async () => { throw new Error('failure') } })
  let saved = 0
  const props = { caseId: 49, entry, people: [person], onClose() {}, onSaved() { saved++ } }
  const oldWindow = globalThis.window; globalThis.window = { setTimeout() {} }
  try {
    nodes(h.render('CommunicationDialog', props)).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} })
    await new Promise(resolve => setImmediate(resolve))
    const tree = h.render('CommunicationDialog', props)
    assert.ok(nodes(tree).some(n => n.props.role === 'alert'))
    assert.ok(nodes(tree).some(n => n.props.value === communication.subject)); assert.equal(saved, 0)
  } finally { globalThis.window = oldWindow }
})
test('editing a communication sends newly selected files only on Save', async () => {
  const calls = []
  const h = harness({ saveCommunication: async (...args) => { calls.push(args); return entry } })
  const props = { caseId: 49, entry, people: [person], canAttach: true, onClose() {}, onSaved() {} }
  const selected = new File(['synthetic'], 'consultation.mp4', { type: 'video/mp4' })
  const tree = h.render('CommunicationDialog', props)
  const drawer = nodes(tree).find(n => n.type === 'aside' && n.props.role === 'dialog')
  assert.equal(drawer.props['aria-modal'], 'true')
  const drawerNodes = nodes(drawer)
  assert.equal(drawerNodes.find(n => n.props.type === 'submit').props.form, drawerNodes.find(n => n.type === 'form').props.id)
  const picker = nodes(tree).find(n => n.type?.name === 'HistoryAttachmentPicker')
  picker.props.onChange([selected])
  assert.equal(calls.length, 0)
  const form = nodes(h.render('CommunicationDialog', props)).find(n => n.type === 'form')
  form.props.onSubmit({ preventDefault() {} })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 49)
  assert.equal(calls[0][2], entry.record_id)
  assert.deepEqual(calls[0][3], [selected])
})
test('collapsed person picker keeps selected people, filters choices and forwards the selected reference', () => {
  const h = harness()
  const employee = { type: 'employee', id: 3, name: '佐藤' }
  const external = { type: 'external', id: null, name: '外部参加者' }
  const picks = []
  const props = { id: 'people', label: '参加者', people: [person, employee], selected: [external], onPick: (...args) => picks.push(args) }
  const render = () => nodes(h.render('HistoryPeopleField', props))
  assert.equal(render().find(n => n.type === 'details').props.open, undefined)
  assert.equal(render().filter(n => n.props.type === 'checkbox' && n.props.checked).length, 1)
  render().find(n => n.props.type === 'search').props.onChange({ target: { value: '佐藤' } })
  const filtered = render().filter(n => n.props.type === 'checkbox')
  assert.equal(filtered.length, 1)
  filtered[0].props.onChange({ target: { checked: true } })
  assert.deepEqual(picks, [[employee, true]])
})
test('next-action task is explicit, prefilled, assignee-required and single-flight', async () => {
  let calls = 0; let payload; let finish
  const h = harness({ communicationTask: async (_case, _id, data) => { calls++; payload = data; return new Promise(resolve => { finish = resolve }) } })
  const props = { caseId: 49, entry, people: [{ type: 'employee', id: 3, name: 'LE HIEU NGHIA' }], onClose() {}, onSaved() {} }
  let tree = h.render('NextActionTaskDialog', props)
  assert.equal(calls, 0)
  let submit = nodes(tree.props.footer).find(n => n.props.variant === 'primary')
  assert.equal(submit.props.disabled, true)
  nodes(tree).find(n => n.type === 'select').props.onChange({ target: { value: '3' } })
  tree = h.render('NextActionTaskDialog', props); submit = nodes(tree.props.footer).find(n => n.props.variant === 'primary')
  submit.props.onClick(); submit.props.onClick(); assert.equal(calls, 1); assert.equal(payload.title, communication.next_action); assert.equal(payload.assigned_employee_id, 3)
  finish(null); await new Promise(resolve => setImmediate(resolve))
})
