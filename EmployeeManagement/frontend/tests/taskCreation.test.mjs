import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { compileFunction } from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { eligibleTaskDocumentIds, hasExistingDocumentTask, selectedEligibleTaskDocuments } from '../src/features/case-workspace/taskCreationEligibility.ts'

const existing = status => ({ id: 100, status, due_at: '2026-10-10T10:00:00Z', assigned_employee: { id: 7, full_name: '既存担当者' } })
const documentOption = (id, tasks = [], flag = tasks.length > 0) => ({ id, title: `資料${id}`, category: 'チェックリスト', has_existing_task: flag, document_type: { id, code: `C-00${id}`, name_ja: `資料${id}` }, case_tasks: tasks })
const initialOptions = () => ({ required_documents: [documentOption(1), documentOption(2, [existing('in_progress')]), documentOption(3, [existing('completed')]), documentOption(4, [existing('cancelled')]), documentOption(5, [], true)], employees: [{ id: 7, full_name: '既存担当者', avatar_path: null, office_id: 1 }] })
const nodes = tree => !React.isValidElement(tree) ? [] : [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)]

function drawerHarness({ options = initialOptions(), initialSelectedIds = [], getOptions, post } = {}) {
  const slots = []; let cursor = 0; let effects = []
  const cleanups = []
  const hooks = {
    ...React,
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }] },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index] },
    useMemo: callback => callback(),
    useId: () => 'wizard-test',
    useEffect(callback, dependencies) { const index = cursor++; if (!slots[index] || dependencies.some((value, i) => !Object.is(value, slots[index][i]))) effects.push(callback); slots[index] = dependencies },
  }
  const calls = []; const created = []; let closed = 0
  const api = { taskOptions: async (...args) => { calls.push(['options', args[0]]); return getOptions ? getOptions() : options }, createTaskBatch: async (...args) => { calls.push(['post', ...args]); return post ? post(...args) : { tasks: [] } } }
  const external = createRequire(import.meta.url); const modules = new Map()
  function load(path) {
    if (modules.has(path)) return modules.get(path).exports
    const module = { exports: {} }; modules.set(path, module)
    const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText.replaceAll('import.meta.env', '({})')
    const require = name => {
      if (name === 'react') return hooks
      if (name === 'react-dom') return { ...external(name), createPortal: children => children }
      if (name === './api') return { caseWorkspaceApi: api }
      if (name.endsWith('.css')) return {}
      if (!name.startsWith('.')) return external(name)
      const base = resolve(dirname(path), name)
      const file = extname(base) ? base : [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find(existsSync)
      assert.ok(file, name); return load(file)
    }
    compileFunction(code, ['exports', 'require', 'module'], { filename: path })(module.exports, require, module)
    return module.exports
  }
  const Drawer = load(resolve('src/features/case-workspace/CreateCaseTasksDrawer.tsx')).default
  const props = { caseId: 49, isOpen: true, initialSelectedIds, onClose: () => { closed++ }, onCreated: count => { created.push(count) } }
  const child = Drawer(props)
  const mockDocument = { body: {}, addEventListener() {}, removeEventListener() {} }
  const inDocument = callback => { const original = globalThis.document; globalThis.document = mockDocument; try { return callback() } finally { globalThis.document = original } }
  let tree
  const render = () => inDocument(() => { cursor = 0; tree = child.type(child.props); const pending = effects; effects = []; pending.forEach(effect => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup) }); return tree })
  const all = () => nodes(render())
  const find = predicate => all().find(predicate)
  const button = label => find(node => node.props.children === label && node.props.onClick)
  const selectVisible = () => find(node => node.props['aria-label'] === '表示中をすべて選択').props.onChange()
  const rows = () => all().filter(node => node.type.name === 'RequirementRow')
  const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); render() }
  const initialize = async () => { render(); await flush() }
  const setSharedAssignment = () => {
    find(node => node.type.name === 'AssignmentFields').props.onChange({
      assigned_employee_id: '7', due_date: '2026-10-10',
    })
  }
  const finish = () => inDocument(() => cleanups.forEach(cleanup => cleanup()))
  return { render, all, find, button, selectVisible, rows, initialize, flush, setSharedAssignment, finish, calls, created, closeCount: () => closed }
}

test('eligibility blocks every existing status and privacy-hidden tasks, and deduplicates selected IDs', () => {
  const options = initialOptions()
  assert.deepEqual(eligibleTaskDocumentIds(options.required_documents), [1])
  for (const status of ['unaccepted', 'in_progress', 'pending_review', 'changes_requested', 'completed', 'cancelled']) assert.equal(hasExistingDocumentTask(documentOption(8, [existing(status)])), true)
  assert.equal(hasExistingDocumentTask(documentOption(8, [], true)), true)
  assert.equal(hasExistingDocumentTask(documentOption(8, [existing('completed')], false)), true)
  assert.deepEqual(selectedEligibleTaskDocuments(options.required_documents, [1, 1, 2, 3, 4, 5, 999]).map(document => document.id), [1])
})

test('already-tasked rows stay locked and only display task details supplied by the server', async () => {
  const h = drawerHarness(); await h.initialize()
  try {
    for (const row of h.rows()) {
      const html = renderToStaticMarkup(row)
      if (row.props.document.id === 1) { assert.doesNotMatch(html, /disabled|タスク作成済み/); row.props.onToggle() }
      else {
        assert.equal(row.props.disabled, true)
        assert.doesNotMatch(html, /type="checkbox"/)
        assert.match(html, /タスク作成済み/)
        if (row.props.document.case_tasks.length) {
          assert.match(html, /既存担当者/); assert.match(html, /2026\/10\/10/)
          for (const value of [{ in_progress: '対応中', completed: '完了', cancelled: 'キャンセル' }[row.props.document.case_tasks[0].status]]) assert.ok(html.includes(value))
        } else assert.doesNotMatch(html, /既存担当者|期限|対応中|完了/)
        row.props.onToggle() // even a forced handler cannot select a locked row
      }
    }
    assert.deepEqual(h.rows().filter(row => row.props.isSelected).map(row => row.props.document.id), [1])
  } finally { h.finish() }
})

test('filtered select-all preserves earlier selections and shared values are submitted in one request with field-level overrides', async () => {
  const options = initialOptions()
  options.required_documents.push(documentOption(6), documentOption(7))
  const h = drawerHarness({ options, initialSelectedIds: [1, 1, 2, 3, 4, 5] })
  await h.initialize()
  try {
    assert.equal(h.button('1件のタスクを作成').props.disabled, true)
    const search = query => h.find(node => node.props.type === 'search').props.onChange({ target: { value: query } })
    search('Ｃ－００６')
    h.selectVisible()
    search('')
    assert.deepEqual(h.rows().filter(row => row.props.isSelected).map(row => row.props.document.id), [1, 6])
    h.setSharedAssignment()
    h.rows().find(row => row.props.document.id === 6).props.onChange({ priority: 'high' })
    h.find(node => node.type.name === 'AssignmentFields').props.onChange({ due_date: '2026-10-11' })
    const submit = h.button('2件のタスクを作成')
    assert.ok(submit); submit.props.onClick(); submit.props.onClick()
    await h.flush()
    const posts = h.calls.filter(call => call[0] === 'post')
    assert.deepEqual(posts, [['post', 49, [
      { case_document_id: 1, assigned_employee_id: 7, due_date: '2026-10-11', priority: 'normal' },
      { case_document_id: 6, assigned_employee_id: 7, due_date: '2026-10-11', priority: 'high' },
    ]]])
    assert.deepEqual(h.created, [2]); assert.equal(h.closeCount(), 1)
  } finally { h.finish() }
})

test('stale 409 reloads options, clears locked selection and never retries POST', async () => {
  let reads = 0
  const fresh = initialOptions(); fresh.required_documents[0] = documentOption(1, [existing('unaccepted')])
  const h = drawerHarness({ getOptions: () => ++reads === 1 ? initialOptions() : fresh, post: async () => { throw { isAxiosError: true, response: { status: 409, data: { message: 'この資料にはすでにタスクが作成されています。', code: 'case_document_task_exists' } } } } })
  await h.initialize()
  try {
    h.selectVisible(); h.setSharedAssignment()
    h.button('1件のタスクを作成').props.onClick(); await h.flush()
    assert.equal(reads, 2); assert.equal(h.calls.filter(call => call[0] === 'post').length, 1)
    assert.equal(h.button('タスクを作成').props.disabled, true)
    assert.equal(h.rows().filter(row => row.props.isSelected).length, 0)
    assert.equal(h.rows()[0].props.document.has_existing_task, true)
    assert.ok(h.find(node => node.props.role === 'alert' && node.props.children === 'この資料にはすでにタスクが作成されています。'))
    assert.deepEqual(h.created, []); assert.equal(h.closeCount(), 0)
  } finally { h.finish() }
})

test('opening the drawer again fetches existing-task metadata without a browser reload', async () => {
  let server = initialOptions()
  const first = drawerHarness({ getOptions: () => server, post: async () => { server = initialOptions(); server.required_documents[0] = documentOption(1, [existing('unaccepted')]); return { tasks: [] } } })
  await first.initialize()
  try {
    first.selectVisible(); first.setSharedAssignment()
    first.button('1件のタスクを作成').props.onClick(); await first.flush()
    assert.equal(first.closeCount(), 1)
    const reopened = drawerHarness({ getOptions: () => server }); await reopened.initialize()
    try { assert.equal(reopened.button('タスクを作成').props.disabled, true); assert.equal(reopened.rows()[0].props.document.has_existing_task, true) }
    finally { reopened.finish() }
  } finally { first.finish() }
})
