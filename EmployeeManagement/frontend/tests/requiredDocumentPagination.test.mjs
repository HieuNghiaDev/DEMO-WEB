import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { compileFunction } from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ts from 'typescript'
import postcss from 'postcss'

const external = createRequire(import.meta.url)
await external('i18next').use(external('react-i18next').initReactI18next).init({ lng: 'ja', initImmediate: false, resources: { ja: { translation: {} } } })
function loader(overrides = {}) {
  const modules = new Map()
  function load(path) {
    if (modules.has(path)) return modules.get(path).exports
    const module = { exports: {} }
    modules.set(path, module)
    const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText
    const require = specifier => {
      if (Object.hasOwn(overrides, specifier)) return overrides[specifier]
      if (specifier.endsWith('.css')) return {}
      if (!specifier.startsWith('.')) return external(specifier)
      const base = resolve(dirname(path), specifier)
      const file = extname(base) ? base : [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(existsSync)
      assert.ok(file, specifier)
      return load(file)
    }
    compileFunction(compiled, ['exports', 'require', 'module'], { filename: path })(module.exports, require, module)
    return module.exports
  }
  return load
}
const { requiredDocumentPage, REQUIRED_DOCUMENT_PAGE_SIZES } = loader()(resolve('src/features/document-collection/requiredDocumentPagination.ts'))
const items = count => Array.from({ length: count }, (_, index) => ({
  id: index + 1, title: `Document ${index + 1}`, necessity_status: 'required',
  document_type: { code: `C-${String(index + 1).padStart(3, '0')}`, name_ja: `Document ${index + 1}`, handling_type: index % 2 ? 'collected' : 'official_form' },
  purposes: [], generated_versions: [], collection_status: 'not_started', fulfillment_status: 'undetermined', review_status: 'unreviewed',
  workflow_state: { code: index % 2 ? 'in_progress' : 'unaccepted' },
  active_task: { assigned_employee: { id: index % 2 + 1, display_name: `Employee ${index % 2 + 1}` }, is_overdue: false },
}))

test('empty and four-record ranges do not invent records or extra pages', () => {
  assert.deepEqual(REQUIRED_DOCUMENT_PAGE_SIZES, [10, 20, 50])
  const empty = requiredDocumentPage([], 3, 10)
  assert.equal(empty.range, '0件')
  assert.equal(empty.page, 1)
  assert.deepEqual(empty.rows, [])
  const four = requiredDocumentPage(items(4), 2, 10)
  assert.equal(four.range, '4件中1–4件を表示')
  assert.deepEqual(four.numbers, [1])
  assert.equal(four.pages, 1)
})

test('page slices preserve identities and order; all page sizes and bounds are valid', () => {
  const all = items(48)
  const second = requiredDocumentPage(all, 2, 10)
  assert.equal(second.range, '48件中11–20件を表示')
  assert.deepEqual(second.rows, all.slice(10, 20))
  assert.equal(second.rows[0], all[10])
  assert.deepEqual(second.numbers, [1, 2, 3, 4, 5])
  for (const [size, pages] of [[10, 5], [20, 3], [50, 1]]) {
    const last = requiredDocumentPage(all, 99, size)
    assert.equal(last.pages, pages)
    assert.equal(last.page, pages)
    assert.equal(last.to, 48)
    assert.ok(last.rows.length > 0)
  }
  assert.equal(requiredDocumentPage(all, -1, 10).page, 1)
  assert.equal(requiredDocumentPage(all, 1, 0).rows.length, 10)
  assert.equal(requiredDocumentPage(items(4), second.page, 10).page, 1)
  const large = requiredDocumentPage(items(1000), 50, 10)
  assert.deepEqual(large.numbers, [1, 49, 50, 51, 100])
})

function descendants(node) {
  if (Array.isArray(node)) return node.flatMap(descendants)
  if (!React.isValidElement(node)) return []
  return [node, ...descendants(node.props.children)]
}

// Execute component event handlers with a small state harness, not browser automation.
// Static React rendering checks markup only, not pixel layout or real focus behavior.
function panelHarness(all, props = {}) {
  const states = []
  let cursor = 0
  const collection = { items: all, loading: false, error: null, refreshCalls: 0, retry() {}, async refresh() { this.refreshCalls++; return true } }
  const react = {
    ...React, useMemo: callback => callback(),
    useState(initial) {
      const index = cursor++
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value }]
    },
  }
  const Panel = loader({
    react,
    '../hooks/useWorkflowCaseDocuments': { useWorkflowCaseDocuments: () => collection },
    './RequiredDocumentInspector': { __esModule: true, default: function Inspector() { return null } },
    '../../../components/loading': { SectionSkeleton: () => React.createElement('div', null, 'Loading') },
    '../../../components/ui/UserAvatar': { UserAvatar: () => null },
  })(resolve('src/features/document-collection/components/RequiredDocumentsPanel.tsx')).default
  let tree
  const render = () => {
    cursor = 0
    const oldWindow = globalThis.window
    globalThis.window = { localStorage: { getItem: () => 'list', setItem() {} } }
    try {
      tree = Panel({ caseId: 49, currentEmployeeId: 1, activities: [], canUpdate: true, onChanged() {}, onCandidates() {}, ...props })
      return renderToStaticMarkup(tree)
    } finally { globalThis.window = oldWindow }
  }
  const find = predicate => descendants(tree).find(predicate)
  const control = label => find(node => node.props['aria-label'] === label)
  const click = label => { const button = control(label); assert.ok(button, label); assert.ok(!button.props.disabled, label); button.props.onClick() }
  const rows = () => find(node => node.type.name === 'RequiredList').props.items
  return { render, find, control, click, rows, collection }
}

test('a linked document opens its inspector even when it is not on the first page', () => {
  const h = panelHarness(items(48), { initialSelectedId: 21 })
  h.render()
  assert.equal(h.rows()[0].id, 1)
  const inspector = h.find(node => node.type.name === 'Inspector')
  assert.equal(inspector.props.caseId, 49)
  assert.equal(inspector.props.itemId, 21)
  inspector.props.onClose()
  h.render()
  assert.equal(h.find(node => node.type.name === 'Inspector'), undefined)
})

test('a document URL selects the documents tab and inspector without router state', () => {
  const stub = { __esModule: true, default: () => null }
  const { CaseManagement } = loader({
    '../contexts/AuthContext': {},
    '../features/case-workspace/CaseWorkspacePage': {
      CaseWorkspaceView: ({ caseId, initialTab, initialDocumentId }) =>
        React.createElement('div', null, `${caseId}/${initialTab}/${initialDocumentId}`),
    },
    '../features/case-management/CaseFormPage': stub,
    '../features/document-creation/DocumentEditorPage': stub,
    '../features/case-management/NewCaseDialog': stub,
    '../features/case-management/api': {},
    './business-quest/CaseListView': stub,
  })(resolve('src/pages/BusinessQuest.tsx'))
  const view = React.createElement(MemoryRouter, { initialEntries: ['/quests/49?document=21'] },
    React.createElement(Routes, null, React.createElement(Route, {
      path: '/quests/*',
      element: React.createElement(CaseManagement),
    })))
  assert.match(renderToStaticMarkup(view), /49\/documents\/21/)
})

test('real list navigation, page sizes and drawer identity remain independent', () => {
  const h = panelHarness(items(48))
  let html = h.render()
  assert.match(html, /資料一覧/)
  assert.equal((html.match(/48件中1–10件を表示/g) ?? []).length, 2)
  assert.equal(h.rows().length, 10)
  assert.equal(h.control('前のページ').props.disabled, true)
  const list = h.find(node => node.type.name === 'RequiredList')
  const firstRow = descendants(list.type(list.props)).find(node => node.type.name === 'RequiredRow')
  firstRow.props.onOpen()
  assert.equal(h.collection.refreshCalls, 1)
  h.click('次のページ')
  html = h.render()
  assert.match(html, /48件中11–20件を表示/)
  assert.equal(h.rows()[0].id, 11)
  assert.equal(h.find(node => node.type.name === 'Inspector').props.itemId, 1)
  h.click('5ページ')
  html = h.render()
  assert.match(html, /48件中41–48件を表示/)
  assert.equal(h.control('次のページ').props.disabled, true)
  h.click('前のページ')
  h.render()
  assert.equal(h.rows()[0].id, 31)
  const size = h.find(node => node.type === 'select' && node.props.value === 10)
  size.props.onChange({ target: { value: '20' } })
  assert.match(h.render(), /48件中1–20件を表示/)
  assert.equal(h.rows().length, 20)
  h.find(node => node.type === 'select' && node.props.value === 20).props.onChange({ target: { value: '50' } })
  h.render()
  assert.equal(h.rows().length, 48)
  assert.equal(h.control('次のページ').props.disabled, true)
})

test('list badges, counters, filters and inspector refresh key use the refreshed canonical workflow', () => {
  const initial = items(1)[0]
  initial.document_type = { ...initial.document_type, code: 'C-004', name_ja: '既存の事件資料一式' }
  initial.workflow_state = { code: 'in_progress', label: '対応中' }
  const h = panelHarness([initial])
  h.render()
  const row = descendants(h.find(node => node.type.name === 'RequiredList').type(h.find(node => node.type.name === 'RequiredList').props)).find(node => node.type.name === 'RequiredRow')
  row.props.onOpen()
  h.render()
  const previousKey = h.find(node => node.type.name === 'Inspector').props.refreshKey
  // The server response is authoritative, even if legacy/task fields disagree.
  h.collection.items = [{ ...initial, workflow_state: { code: 'pending_review', label: '確認待ち' }, file_review: { id: 2, status: 'pending_review' } }]
  const html = h.render()
  assert.notEqual(h.find(node => node.type.name === 'Inspector').props.refreshKey, previousKey)
  assert.match(html, /data-status="pending_review"/)
  const count = label => h.find(node => node.type === 'button' && node.props.children?.[0] === label).props.children[1].props.children
  assert.equal(count('対応中'), 0)
  assert.equal(count('確認待ち'), 1)
  h.find(node => node.type === 'button' && node.props.children?.[0] === '対応中').props.onClick()
  h.render()
  assert.equal(h.find(node => node.type.name === 'RequiredList'), undefined)
  h.find(node => node.type === 'button' && node.props.children?.[0] === '確認待ち').props.onClick()
  h.render()
  assert.deepEqual(h.rows().map(item => item.id), [initial.id])
})

test('each workflow stage moves exactly one list count/filter without using stale task status', () => {
  const document = items(1)[0]
  const h = panelHarness([document])
  const stages = ['selected', 'unaccepted', 'in_progress', 'pending_review', 'changes_requested', 'pending_review', 'completed']
  const labels = { selected: '選定済み', unaccepted: '未受領', in_progress: '対応中', pending_review: '確認待ち', changes_requested: '差戻し', completed: '完了' }
  for (const stage of stages) {
    h.collection.items = [{ ...document, workflow_state: { code: stage }, active_task: { ...document.active_task, status: 'in_progress' } }]
    h.render()
    for (const [code, label] of Object.entries(labels)) {
      const button = h.find(node => node.type === 'button' && node.props.children?.[0] === label)
      assert.equal(button.props.children[1].props.children, code === stage ? 1 : 0)
      button.props.onClick()
      h.render()
      const list = h.find(node => node.type.name === 'RequiredList')
      assert.equal(list?.props.items.length ?? 0, code === stage ? 1 : 0)
    }
  }
})

test('search, method and status filters reset to page one and use matching counts', () => {
  const h = panelHarness(items(48))
  h.render(); h.click('3ページ'); h.render()
  h.control('必要資料を検索').props.onChange({ target: { value: 'C-048' } })
  assert.match(h.render(), /1件中1–1件を表示/)
  assert.deepEqual(h.rows().map(item => item.id), [48])
  h.control('必要資料を検索').props.onChange({ target: { value: '' } })
  h.render(); h.click('3ページ'); h.render()
  const method = h.find(node => node.type === 'select' && node.props.value === 'all')
  method.props.onChange({ target: { value: '依頼者から回収' } })
  assert.match(h.render(), /24件中1–10件を表示/)
  h.click('3ページ'); h.render()
  h.find(node => node.type === 'button' && node.props.children?.[0] === '対応中').props.onClick()
  assert.match(h.render(), /24件中1–10件を表示/)
  h.click('3ページ'); h.render()
  h.find(node => node.type === 'button' && node.props.children?.[1] === '自分の担当').props.onClick()
  const html = h.render()
  assert.match(html, />0件</)
  assert.doesNotMatch(html, /0–0|aria-current="page"/)
  assert.equal(h.control('次のページ').props.disabled, true)
})

test('refresh clamps the visible page; counts/pager wait for successfully loaded results; cards stay unpaginated', () => {
  const h = panelHarness(items(48))
  h.render(); h.click('5ページ'); h.render()
  h.collection.items = items(4)
  assert.match(h.render(), /4件中1–4件を表示/)
  assert.equal(h.rows().length, 4)
  assert.equal(h.control('前のページ').props.disabled, true)
  assert.equal(h.control('次のページ').props.disabled, true)
  h.collection.loading = true
  assert.doesNotMatch(h.render(), /dc-required-result-toolbar|dc-required-pagination/)
  h.collection.loading = false
  h.collection.error = { message: 'Failed', fields: {} }
  assert.doesNotMatch(h.render(), /dc-required-result-toolbar|dc-required-pagination/)
  h.collection.error = null
  h.collection.items = items(48)
  h.render()
  const switcher = h.find(node => node.props.className === 'dc-view-switch')
  const oldWindow = globalThis.window
  globalThis.window = { localStorage: { setItem() {} } }
  try { descendants(switcher).find(node => node.type === 'button' && node.props.children?.[1] === 'カード').props.onClick() }
  finally { globalThis.window = oldWindow }
  const html = h.render()
  assert.match(html, /48件中1–48件を表示/)
  assert.doesNotMatch(html, /dc-required-pagination/)
  assert.equal(h.find(node => node.type.name === 'RequiredCards').props.items.length, 48)
})

test('compact toolbar and responsive pager use semantic theme tokens and visible focus', () => {
  const css = postcss.parse(readFileSync(resolve('src/features/document-collection/documentCollection.css'), 'utf8'))
  const rules = []
  css.walkRules(node => { if (/\.dc-required-(?:result|pagination)/.test(node.selector)) rules.push(node) })
  const toolbar = rules.find(rule => rule.selector === '.dc-required-result-toolbar')
  assert.ok(toolbar.nodes.some(node => node.prop === 'min-height' && node.value === '36px'))
  assert.ok(!toolbar.nodes.some(node => ['background', 'box-shadow'].includes(node.prop)))
  assert.ok(rules.some(rule => rule.selector.includes(':focus-visible')))
  assert.ok(rules.some(rule => rule.parent.name === 'container' && rule.parent.params.includes('740px')))
  assert.ok(rules.some(rule => rule.parent.name === 'media' && rule.parent.params.includes('740px')))
  assert.ok(rules.some(rule => rule.parent.params === '(prefers-reduced-motion: reduce)'))
  for (const rule of rules) for (const declaration of rule.nodes) assert.doesNotMatch(declaration.value, /#[0-9a-f]{3,8}\b|gradient|glow/i)
})
