import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { compileFunction } from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import postcss from 'postcss'
import { fixtureDetails, fixtureListItem, previewFixture } from './fixtures/collectionApiData.ts'
import { itemToRow } from '../src/features/document-collection/utils.ts'

const external = createRequire(import.meta.url)
const t = (key, values = {}) => key === 'documentCollection.list.detailAria'
  ? `${values.code} ${values.title} ${values.source} の詳細`
  : ({ 'documentCollection.list.necessityShort': '要否', 'documentCollection.list.collectionShort': '取得', 'documentCollection.list.fulfillmentShort': '充足', 'documentCollection.list.reviewShort': '確認' })[key] ?? key

function loader(overrides) {
  const modules = new Map()
  function load(path) {
    if (modules.has(path)) return modules.get(path).exports
    const module = { exports: {} }
    modules.set(path, module)
    const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText
    const require = name => {
      if (Object.hasOwn(overrides, name)) return overrides[name]
      if (name.endsWith('.css')) return {}
      if (!name.startsWith('.')) return external(name)
      const base = resolve(dirname(path), name)
      const file = extname(base) ? base : [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(existsSync)
      assert.ok(file, name)
      return load(file)
    }
    compileFunction(compiled, ['exports', 'require', 'module'], { filename: path })(module.exports, require, module)
    return module.exports
  }
  return load
}

// Exercise the actual component handlers/effects without a browser or API calls.
// Server rendering verifies semantics/markup only, not real layout or focus.
function hooks() {
  const slots = []
  let cursor = 0
  let pending = []
  let changed = false
  const react = {
    ...React,
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
      return [slots[index], value => {
        const next = typeof value === 'function' ? value(slots[index]) : value
        if (!Object.is(next, slots[index])) { slots[index] = next; changed = true }
      }]
    },
    useRef(value) {
      const index = cursor++
      slots[index] ??= { current: value }
      return slots[index]
    },
    useEffect(callback, dependencies) {
      const index = cursor++
      if (!slots[index] || dependencies.some((value, position) => !Object.is(value, slots[index][position]))) pending.push(callback)
      slots[index] = dependencies
    },
  }
  const settle = callback => {
    let tree
    for (let attempt = 0; attempt < 10; attempt++) {
      cursor = 0; changed = false
      tree = callback()
      const effects = pending; pending = []
      effects.forEach(effect => effect())
      if (!changed) return tree
    }
    assert.fail('component state did not settle')
  }
  const flush = () => { const effects = pending; pending = []; effects.forEach(effect => effect()) }
  return { react, settle, flush }
}

function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes)
  if (!React.isValidElement(node)) return []
  return [node, ...nodes(node.props.children)]
}
const documents = fixtureDetails().map(fixtureListItem)
const rows = documents.map(item => itemToRow(item))

function listHarness(extra = {}) {
  const state = hooks()
  const List = loader({ react: state.react, 'react-i18next': { useTranslation: () => ({ t }) } })(resolve('src/features/document-collection/components/CollectionListView.tsx')).default
  const props = { items: rows, selectedId: null, canSelect: true, onSelect() {}, onSelectionModeChange() {}, ...extra }
  let tree
  const render = () => { tree = state.settle(() => List(props)); return renderToStaticMarkup(tree) }
  const find = predicate => nodes(tree).find(predicate)
  const rowTrees = () => nodes(tree).filter(node => node.type.name === 'CollectionRow').map(node => node.type(node.props))
  const expand = () => { find(node => node.props.className === 'dc-expand-btn').props.onClick(); render() }
  return { props, render, find, rowTrees, expand, flush: state.flush }
}

test('normal screening rows have file icons, code/title, one metadata value and unchanged detail activation', () => {
  const opened = []
  const h = listHarness({ selectedId: rows[0].id, onSelect: id => opened.push(id) })
  h.render(); h.expand()
  const html = h.render()
  assert.doesNotMatch(html, /type="checkbox"|すべて選択|件選択|一括選択/)
  assert.equal((html.match(/class="dc-row-file-icon" aria-hidden="true"/g) ?? []).length, rows.length)
  assert.match(html, /一括操作/)
  for (const row of rows) for (const value of [row.code, row.title, row.source]) assert.ok(html.includes(value), value)
  for (const tree of h.rowTrees()) {
    const content = nodes(tree).find(node => node.props.className === 'dc-row-content')
    assert.deepEqual(content.props.children.map(node => node.props.className), ['dc-screening-code', 'dc-screening-title', 'dc-screening-meta', 'dc-screening-status', 'dc-screening-chevron'])
    assert.ok(!nodes(tree).some(node => /dc-source|dc-col-status-module|dc-status-cell|dc-col-owner-deadline|dc-doc-period|dc-preservation/.test(node.props.className ?? '')))
  }
  const first = h.rowTrees()[0]
  assert.match(first.props.className, /is-selected/)
  first.props.onClick()
  const content = nodes(first).find(node => node.props.className === 'dc-row-content')
  for (const key of ['Enter', ' ']) content.props.onKeyDown({ key, preventDefault() {} })
  assert.deepEqual(opened, [rows[0].id, rows[0].id, rows[0].id])
  assert.ok(nodes(first).some(node => node.type.displayName === 'ChevronRight'))
})

test('bulk rows toggle selection, never open detail, and checkbox click stops propagation', () => {
  const toggled = []
  const modes = []
  const h = listHarness({ selectionMode: true, bulkSelectedIds: [Number(rows[0].id)], onSelect: () => assert.fail('bulk selection opened inspector'), onToggleBulkSelection: id => toggled.push(id), onSelectionModeChange: enabled => modes.push(enabled) })
  h.render(); h.expand()
  const html = h.render()
  const groupCount = new Set(rows.map(row => row.unnecessary ? 'NOT_REQUIRED' : row.purposes[0]?.code ?? 'UNGROUPED')).size
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, rows.length + groupCount + 1)
  assert.equal((html.match(/class="dc-row-file-icon"/g) ?? []).length, rows.length)
  assert.match(html, /1件選択/)
  const mode = h.find(node => node.props['aria-pressed'] === true && node.props.children === '一括操作を終了')
  mode.props.onClick()
  assert.deepEqual(modes, [false])
  const first = h.rowTrees()[0]
  assert.match(first.props.className, /is-bulk-selected/)
  first.props.onClick()
  const content = nodes(first).find(node => node.props.className === 'dc-row-content')
  assert.equal(content.props['aria-pressed'], true)
  for (const key of ['Enter', ' ']) content.props.onKeyDown({ key, preventDefault() {} })
  let stopped = false
  const label = nodes(first).find(node => node.type === 'label')
  label.props.onClick({ stopPropagation() { stopped = true } })
  assert.equal(stopped, true)
  nodes(label).find(node => node.type === 'input').props.onChange()
  assert.deepEqual(toggled, Array(4).fill(Number(rows[0].id)))
  assert.ok(!nodes(first).some(node => node.type.displayName === 'ChevronRight'))
})

test('screening metadata uses stored source, then stored target, with no invented fallback or data mutation', () => {
  for (const [source, target, expected] of [
    ['事務所で作成', '依頼者', '事務所で作成'],
    [null, '依頼者', '対象：依頼者'],
    ['依頼者から回収', null, '依頼者から回収'],
    ['  ', ' ', ''],
    [null, null, ''],
  ]) {
    const item = { ...rows[0], source, target }
    const before = structuredClone(item)
    const h = listHarness({ items: [item] }); h.render(); h.expand()
    const tree = h.rowTrees()[0]
    const metadata = nodes(tree).find(node => node.props.className === 'dc-screening-meta')
    assert.equal(metadata.props.children, expected)
    assert.equal(metadata.props.title, expected)
    assert.deepEqual(item, before, 'all status/source/assignment fields stay intact')
    assert.equal(nodes(tree).filter(node => node.type === 'strong').length, 1)
    assert.equal(nodes(tree).filter(node => node.type === 'button').length, 0)
  }
})

test('expanded-row styles are scoped, compact and responsive without touching group headers', () => {
  const source = readFileSync(resolve('src/features/document-collection/components/collectionRows.css'), 'utf8')
  const css = postcss.parse(source)
  const rules = []
  css.walkRules(rule => rules.push(rule))
  assert.ok(rules.every(rule => rule.selector.includes('.dc-screening-row') || /\.dc-screening-(code|title|meta|status|preservation|chevron)/.test(rule.selector)))
  assert.doesNotMatch(source, /dc-group-title|dc-summary|dc-toolbar|#[0-9a-f]{3,8}\b|gradient\(/)
  assert.ok(rules.some(rule => rule.nodes.some(node => node.prop === 'min-height' && node.value === '48px')))
  assert.ok(rules.some(rule => rule.nodes.some(node => node.prop === 'grid-template-columns' && node.value === '62px minmax(0, 1fr) minmax(0, 180px) 64px 16px')))
  assert.ok(rules.some(rule => rule.parent.type === 'atrule' && rule.selector.endsWith('.dc-screening-meta') && rule.nodes.some(node => node.prop === 'display' && node.value === 'none')))
})

test('select all covers the displayed document identities with all/none/mixed states', () => {
  const calls = []
  const h = listHarness({ selectionMode: true, onSetVisibleSelection: (ids, checked) => calls.push({ ids, checked }) })
  const selectAll = () => h.find(node => node.type.name === 'SelectionCheckbox')
  h.render()
  assert.equal(selectAll().props.checked, false)
  assert.equal(selectAll().props.indeterminate, false)
  selectAll().props.onChange({ target: { checked: true } })
  h.props.bulkSelectedIds = rows.map(row => Number(row.id))
  assert.match(h.render(), /3件選択/)
  assert.equal(selectAll().props.checked, true)
  selectAll().props.onChange({ target: { checked: false } })
  assert.deepEqual(calls, [{ ids: [201, 202, 203], checked: true }, { ids: [201, 202, 203], checked: false }])
  h.props.bulkSelectedIds = [201]
  h.render()
  assert.equal(selectAll().props.indeterminate, true)
  const checkbox = selectAll().type(selectAll().props)
  const element = { indeterminate: false }
  checkbox.props.ref.current = element
  h.flush()
  assert.equal(element.indeterminate, true)
  assert.equal(checkbox.props['aria-checked'], 'mixed')
  h.props.items = []
  assert.match(h.render(), /1件選択/)
  assert.equal(selectAll().props.disabled, true)
  h.props.bulkSelectedIds = []
  assert.match(h.render(), /0件選択/)
})

test('B-style rows show one read-only necessity pill without dots, using real state and a separate preservation marker', () => {
  for (const [code, status, label] of [['C-001', 'required', '必要'], ['C-003', 'undetermined', '未判定'], ['C-004', 'not_required', '不要']]) {
    for (const selectionMode of [false, true]) {
      const item = { ...rows[0], code, necessityStatus: status, necessity: label, unnecessary: status === 'not_required', preservation: true, preservationText: '保存期限の確認' }
      const before = structuredClone(item)
      const h = listHarness({ items: [item], selectionMode }); h.render(); h.expand()
      const tree = h.rowTrees()[0]
      assert.equal(tree.props['data-necessity'], status)
      const pills = nodes(tree).filter(node => node.props.className === 'dc-screening-status')
      assert.equal(pills.length, 1)
      assert.equal(pills[0].type, 'span')
      assert.equal(pills[0].props.children, label, 'text only, no status dot or icon')
      assert.equal(pills[0].props.onClick, undefined, 'editing stays in the existing inspector')
      assert.ok(nodes(tree).some(node => node.props.className === 'dc-screening-preservation' && node.props.title.includes(item.preservationText)))
      assert.equal(nodes(tree).filter(node => node.type === 'input').length, selectionMode ? 1 : 0)
      assert.deepEqual(item, before)
    }
  }
})

test('B-style necessity accents and pills use semantic theme tokens without glow or pill pseudo-elements', () => {
  const css = postcss.parse(readFileSync(resolve('src/features/document-collection/components/collectionRows.css'), 'utf8'))
  const rules = []
  css.walkRules(rule => rules.push(rule))
  const decl = (selector, prop) => rules.find(rule => rule.selector === selector)?.nodes.find(node => node.prop === prop)?.value
  assert.equal(decl('.dc-screening-row', '--dc-screening-tone'), 'var(--dc-muted)')
  assert.equal(decl('.dc-screening-row[data-necessity="required"]', '--dc-screening-tone'), 'var(--dc-success)')
  assert.equal(decl('.dc-screening-row[data-necessity="not_required"]', '--dc-screening-tone'), 'var(--dc-danger)')
  assert.equal(decl('.dc-screening-row::before', 'width'), '3px')
  assert.equal(decl('.dc-screening-row::before', 'background'), 'var(--dc-screening-tone)')
  assert.equal(decl('.dc-screening-status', 'height'), '26px')
  assert.ok(!rules.some(rule => /dc-screening-status.*::/.test(rule.selector)))
  assert.ok(!rules.some(rule => rule.nodes.some(node => node.prop === 'box-shadow' && !node.value.startsWith('inset'))))
})

test('bulk mode leaves expansion untouched; busy/read-only and reference-only adapters cannot mutate', () => {
  const h = listHarness()
  h.render()
  assert.equal(h.rowTrees().length, 0)
  h.find(node => node.props.className === 'dc-group-title').props.onClick()
  h.render()
  const normalCount = h.rowTrees().length
  h.props.selectionMode = true
  h.render()
  assert.equal(h.rowTrees().length, normalCount)
  h.props.selectionBusy = true
  const busy = h.render()
  assert.match(busy, /disabled=""/)
  assert.equal(h.find(node => node.props.children === '一括操作を終了').props.disabled, true)
  h.props.onToggleBulkSelection = () => assert.fail('busy row mutated selection')
  h.rowTrees()[0].props.onClick()
  h.props.selectionMode = false
  h.props.selectionBusy = false
  h.render()
  assert.equal(h.rowTrees().length, normalCount)
  const opened = []
  const readOnly = listHarness({ canSelect: false, onSelect: id => opened.push(id) })
  readOnly.render(); readOnly.expand()
  assert.doesNotMatch(readOnly.render(), /一括操作|type="checkbox"/)
  readOnly.rowTrees()[0].props.onClick()
  assert.deepEqual(opened, [rows[0].id])
  readOnly.props.selectionMode = true
  assert.match(readOnly.render(), /一括操作を終了/)
  readOnly.props.onToggleBulkSelection = () => assert.fail('read-only row mutated selection')
  readOnly.rowTrees()[0].props.onClick()
  const reference = listHarness({ onSelectionModeChange: undefined })
  assert.doesNotMatch(reference.render(), /一括操作|type="checkbox"/)
})

function splitGroupRows() {
  return [
    ...rows.slice(0, 2).map(row => ({ ...row, purposes: [{ code: 'COMMON', label: '事件共通の資料' }] })),
    ...[203, 204].map(id => ({ ...rows[2], id: String(id), purposes: [{ code: 'T2', label: '人身損害の確認' }] })),
  ]
}
function groupControl(h, code, predicate) {
  const section = h.find(node => node.type === 'section' && node.key === code)
  return nodes(section).find(predicate)
}
const headerFor = (h, code) => groupControl(h, code, node => node.props.className === 'dc-group-title')
const checkboxFor = (h, code) => groupControl(h, code, node => node.type.name === 'SelectionCheckbox')

test('enter/exit bulk with all groups closed never renders document rows or changes expansion', () => {
  const h = listHarness({ items: splitGroupRows() })
  assert.doesNotMatch(h.render(), /type="checkbox"/)
  h.props.selectionMode = true
  const html = h.render()
  assert.equal(h.rowTrees().length, 0)
  assert.equal(headerFor(h, 'COMMON').props['aria-expanded'], false)
  assert.equal(headerFor(h, 'T2').props['aria-expanded'], false)
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 3, 'only select-all and two group checkboxes')
  h.props.selectionMode = false
  assert.doesNotMatch(h.render(), /type="checkbox"/)
  assert.equal(h.rowTrees().length, 0)
})

test('manual open/close changes in bulk persist on exit rather than restoring a normal-mode snapshot', () => {
  const h = listHarness({ items: splitGroupRows() }); h.render()
  headerFor(h, 'COMMON').props.onClick(); h.render()
  h.props.selectionMode = true; h.render()
  assert.equal(headerFor(h, 'COMMON').props['aria-expanded'], true)
  assert.equal(headerFor(h, 'T2').props['aria-expanded'], false)
  assert.equal(h.rowTrees().length, 2)
  headerFor(h, 'T2').props.onClick(); h.render()
  assert.equal(h.rowTrees().length, 4)
  headerFor(h, 'COMMON').props.onClick(); h.render()
  assert.equal(h.rowTrees().length, 2)
  h.props.selectionMode = false
  assert.doesNotMatch(h.render(), /type="checkbox"/)
  assert.equal(headerFor(h, 'COMMON').props['aria-expanded'], false)
  assert.equal(headerFor(h, 'T2').props['aria-expanded'], true)
  assert.equal(h.rowTrees().length, 2)
})

test('collapsed group selection is tri-state and selects only its unique document IDs without expansion', () => {
  const calls = []
  const h = listHarness({ items: splitGroupRows(), selectionMode: true, onSetVisibleSelection: (ids, selected) => calls.push({ ids, selected }) })
  h.render()
  assert.equal(checkboxFor(h, 'T2').props.checked, false)
  assert.equal(checkboxFor(h, 'T2').props.indeterminate, false)
  checkboxFor(h, 'T2').props.onChange({ target: { checked: true } })
  assert.deepEqual(calls, [{ ids: [203, 204], selected: true }])
  h.props.bulkSelectedIds = [203, 204]; h.render()
  assert.equal(checkboxFor(h, 'T2').props.checked, true)
  assert.equal(headerFor(h, 'T2').props['aria-expanded'], false)
  assert.equal(checkboxFor(h, 'COMMON').props.checked, false)
  assert.equal(h.rowTrees().length, 0)
  h.props.bulkSelectedIds = [203]; h.render()
  assert.equal(checkboxFor(h, 'T2').props.indeterminate, true)
  assert.equal(checkboxFor(h, 'T2').props.checked, false)
  let stopped = false
  groupControl(h, 'T2', node => node.props.className === 'dc-group-check').props.onClick({ stopPropagation() { stopped = true } })
  assert.equal(stopped, true)
  checkboxFor(h, 'T2').props.onChange({ target: { checked: false } })
  assert.deepEqual(calls[1], { ids: [203, 204], selected: false })
  h.props.selectionBusy = true; h.render()
  assert.equal(checkboxFor(h, 'T2').props.disabled, true)
  h.props.selectionBusy = false; h.props.canSelect = false; h.render()
  assert.equal(checkboxFor(h, 'T2').props.disabled, true)
})

test('select-all includes collapsed groups without expanding, and only manually opened rows have file checkboxes', () => {
  const calls = []
  const h = listHarness({ items: splitGroupRows(), selectionMode: true, onSetVisibleSelection: (ids, selected) => calls.push({ ids, selected }) }); h.render()
  h.find(node => node.type.name === 'SelectionCheckbox').props.onChange({ target: { checked: true } })
  assert.deepEqual(calls, [{ ids: [201, 202, 203, 204], selected: true }])
  h.props.bulkSelectedIds = [201, 202, 203, 204]; h.render()
  assert.equal(h.rowTrees().length, 0)
  assert.equal(headerFor(h, 'T2').props['aria-expanded'], false)
  headerFor(h, 'T2').props.onClick(); h.render()
  assert.equal(h.rowTrees().length, 2)
  for (const row of h.rowTrees()) {
    assert.equal(nodes(row).filter(node => node.type === 'input' && node.props.type === 'checkbox').length, 1)
    assert.equal(nodes(row).filter(node => node.props.className === 'dc-row-file-icon').length, 1)
  }
})

const stub = name => ({ __esModule: true, default: { [name]: function() { return null } }[name] })
function panelHarness(extra = {}) {
  const state = hooks()
  const calls = []
  let confirmResult = true
  const collection = {
    preview: structuredClone(previewFixture), query: { necessity_status: 'required', page: 1, per_page: 100, search: 'existing' }, search: 'existing',
    data: { documents, summary: { total: 3, filtered_count: 3, necessity: { required: 2, not_required: 0, undetermined: 1 }, overdue: 0, preservation_priority: 1 } },
    employees: [], notice: '', bulkUpdating: false,
    changeFilter: (...args) => calls.push(['filter', ...args]), setSearch: value => calls.push(['search', value]),
    replaceView: () => assert.fail('selection changed search/filter view'), refresh() {},
    setNotice: value => calls.push(['notice', value]),
    bulkUpdateNecessity: async payload => { calls.push(['bulk', payload]); return { updated_count: payload.case_document_ids.length } },
  }
  const Panel = loader({
    react: state.react, 'react-i18next': { useTranslation: () => ({ t }) }, './hooks/useDocumentCollection': { useDocumentCollection: () => collection },
    './components/CollectionListView': stub('List'), './components/DocumentCollectionToolbar': stub('Toolbar'),
    './components/DocumentCollectionInspector': stub('Inspector'), './components/BulkNecessityDialog': stub('BulkDialog'),
    './components/InitializationDialog': stub('InitializeDialog'), '../../components/loading': { InlineLoader: () => null, SectionSkeleton: () => null },
  })(resolve('src/features/document-collection/DocumentCollectionPanel.tsx')).default
  const props = { caseId: 49, canUpdate: true, canReviewDocuments: true, canReadEmployees: false, activities: [], onChanged() { calls.push(['changed']) }, ...extra }
  let tree
  const render = () => {
    const oldWindow = globalThis.window
    globalThis.window = { confirm: () => { calls.push(['confirm']); return confirmResult } }
    try { tree = state.settle(() => Panel(props)) } finally { globalThis.window = oldWindow }
  }
  const find = name => nodes(tree).find(node => node.type.name === name)
  const run = callback => {
    const oldWindow = globalThis.window
    globalThis.window = { confirm: () => { calls.push(['confirm']); return confirmResult } }
    try { return callback() } finally { globalThis.window = oldWindow }
  }
  return { render, find, run, props, collection, calls, nodes: () => nodes(tree), setConfirm: value => { confirmResult = value } }
}

test('production entry/exit is local, closes inspector safely and clears selected IDs without changing filters', () => {
  const h = panelHarness({ initialSelectedId: 201 })
  h.render()
  h.find('Inspector').props.onEditState({ dirty: true, saving: false })
  h.setConfirm(false)
  h.run(() => h.find('List').props.onSelectionModeChange(true)); h.render()
  assert.equal(h.find('List').props.selectionMode, false)
  assert.ok(h.find('Inspector'))
  h.setConfirm(true)
  h.run(() => h.find('List').props.onSelectionModeChange(true)); h.render()
  assert.equal(h.find('List').props.selectionMode, true)
  assert.equal(h.find('Inspector'), undefined)
  h.find('List').props.onToggleBulkSelection(201); h.render()
  h.find('List').props.onToggleBulkSelection(202); h.render()
  assert.deepEqual(h.find('List').props.bulkSelectedIds, [201, 202])
  h.find('List').props.onSetVisibleSelection([201, 202, 203], true); h.render()
  assert.deepEqual(h.find('List').props.bulkSelectedIds, [201, 202, 203])
  h.find('List').props.onSetVisibleSelection([201, 202, 203], false); h.render()
  assert.deepEqual(h.find('List').props.bulkSelectedIds, [])
  h.find('List').props.onToggleBulkSelection(201); h.render()
  h.run(() => h.find('List').props.onSelect('202')); h.render()
  assert.equal(h.find('Inspector'), undefined)
  h.find('List').props.onSelectionModeChange(false); h.render()
  assert.equal(h.find('List').props.selectionMode, false)
  assert.deepEqual(h.find('List').props.bulkSelectedIds, [])
  h.find('List').props.onToggleBulkSelection(201); h.render()
  assert.deepEqual(h.find('List').props.bulkSelectedIds, [])
  h.run(() => h.find('List').props.onSelect('202')); h.render()
  assert.equal(h.find('Inspector').props.itemId, 202)
  assert.equal(h.calls.filter(([kind]) => kind === 'bulk').length, 0)
  assert.equal(h.collection.search, 'existing')
  assert.equal(h.collection.query.necessity_status, 'required')
})

test('search/filter changes clear selection, fresh tab/case instances start clean, and read-only/saving guards remain', () => {
  const h = panelHarness()
  h.render(); h.find('List').props.onSelectionModeChange(true); h.render()
  h.find('List').props.onToggleBulkSelection(201); h.render()
  h.find('Toolbar').props.onSearch('new term'); h.render()
  assert.deepEqual(h.find('List').props.bulkSelectedIds, [])
  h.find('List').props.onToggleBulkSelection(202); h.render()
  h.find('Toolbar').props.onChange({ necessity_status: 'not_required' }); h.render()
  assert.deepEqual(h.find('List').props.bulkSelectedIds, [])
  assert.ok(h.calls.some(([kind]) => kind === 'search'))
  assert.ok(h.calls.some(([kind]) => kind === 'filter'))
  for (const caseId of [49, 50]) {
    const fresh = panelHarness({ caseId }); fresh.render()
    assert.equal(fresh.find('List').props.selectionMode, false)
    assert.deepEqual(fresh.find('List').props.bulkSelectedIds, [])
  }
  const source = readFileSync(resolve('src/features/case-workspace/CaseWorkspacePage.tsx'), 'utf8')
  assert.match(source, /tab === 'collection'[^]*?<DocumentCollectionPanel key=\{caseId\}/)
  const readOnly = panelHarness({ canUpdate: false }); readOnly.render()
  readOnly.find('List').props.onSelectionModeChange(true); readOnly.render()
  assert.equal(readOnly.find('List').props.selectionMode, false)
  assert.equal(readOnly.find('List').props.canSelect, false)
  const saving = panelHarness({ initialSelectedId: 201 }); saving.render()
  saving.find('Inspector').props.onEditState({ dirty: true, saving: true })
  saving.find('List').props.onSelectionModeChange(true); saving.render()
  assert.equal(saving.find('List').props.selectionMode, false)
  assert.ok(saving.find('Inspector'))
})

test('existing necessity bulk actions retain exact IDs and not-required reason, with no new API operation', async () => {
  for (const [label, status, reason] of [['必要にする', 'required'], ['不要にする', 'not_required', '本件では使用しない'], ['未判定に戻す', 'undetermined']]) {
    const h = panelHarness(); h.render()
    h.find('List').props.onSelectionModeChange(true); h.render()
    h.find('List').props.onSetVisibleSelection([201, 202], true); h.render()
    const action = h.nodes().find(node => node.type === 'button' && node.props.children === label)
    assert.ok(action, label)
    action.props.onClick(); h.render()
    const dialog = h.find('BulkDialog')
    assert.equal(dialog.props.count, 2)
    assert.equal(dialog.props.action, status)
    dialog.props.onConfirm(reason)
    await Promise.resolve(); await Promise.resolve()
    h.render()
    assert.deepEqual(h.calls.find(([kind]) => kind === 'bulk')[1], { case_document_ids: [201, 202], necessity_status: status, ...(reason ? { necessity_reason: reason } : {}) })
    assert.deepEqual(h.find('List').props.bulkSelectedIds, [])
  }
  const busy = panelHarness(); busy.render()
  busy.find('List').props.onSelectionModeChange(true); busy.render()
  busy.find('List').props.onToggleBulkSelection(201); busy.render()
  busy.collection.bulkUpdating = true; busy.render()
  busy.find('List').props.onSelectionModeChange(false)
  busy.find('List').props.onToggleBulkSelection(202); busy.render()
  assert.equal(busy.find('List').props.selectionBusy, true)
  assert.equal(busy.find('List').props.selectionMode, true)
  assert.deepEqual(busy.find('List').props.bulkSelectedIds, [201])
})

test('selection-only styles use existing tokens, stay compact and retain the mobile icon column', () => {
  const css = postcss.parse(readFileSync(resolve('src/features/document-collection/documentCollection.css'), 'utf8'))
  const rules = []
  css.walkRules(rule => rules.push(rule))
  const decl = (selector, prop) => rules.find(rule => rule.selector === selector)?.nodes.find(node => node.prop === prop)?.value
  assert.equal(decl('.dc-command-row.is-browser-mode', 'padding'), '0')
  assert.equal(decl('.dc-command-row.is-browser-mode', 'background'), 'transparent')
  assert.equal(decl('.dc-row-file-icon', 'color'), 'var(--tm-text-secondary)')
  assert.equal(decl('.dc-row.has-selection.is-bulk-selected', 'box-shadow'), 'inset 2px 0 var(--dc-blue)')
  assert.equal(rules.filter(rule => rule.selector === '.dc-row:not(.has-selection)' && rule.nodes.some(node => node.prop === 'grid-template-columns' && node.value === '44px minmax(0, 1fr)')).length, 2)
  assert.ok(rules.some(rule => rule.selector.includes('dc-command-check-label') && rule.selector.includes(':focus-visible')))
})

test('group headers show folders and semantic counts for the same visible unique document rows', () => {
  const h = listHarness()
  h.render()
  for (const purpose of [...new Set(rows.map(row => row.unnecessary ? 'NOT_REQUIRED' : row.purposes[0]?.code ?? 'UNGROUPED'))]) {
    const section = h.find(node => node.type === 'section' && node.key === purpose)
    assert.ok(section)
    const groupRows = rows.filter(row => (row.unnecessary ? 'NOT_REQUIRED' : row.purposes[0]?.code ?? 'UNGROUPED') === purpose)
    const metrics = nodes(section).filter(node => node.props.className?.startsWith('dc-group-metric is-'))
    assert.deepEqual(metrics.map(node => node.props.children[1].props.children), [
      groupRows.filter(row => row.necessityStatus === 'required').length,
      groupRows.filter(row => row.necessityStatus === 'not_required').length,
      groupRows.filter(row => row.necessityStatus === 'undetermined').length,
      groupRows.filter(row => row.overdue).length,
      groupRows.filter(row => row.preservation).length,
    ])
    metrics.forEach(node => assert.equal(node.props.title, node.props['aria-label']))
    assert.ok(nodes(section).some(node => node.type.displayName === 'Folder'))
  }
  h.expand()
  assert.ok(h.find(node => node.type.displayName === 'FolderOpen'))
  assert.equal(h.rowTrees().length, rows.length, 'multi-purpose documents are not duplicated')
})

test('collection summary keeps six actual server metrics and one flat summary strip', () => {
  const h = panelHarness(); h.render()
  const summary = h.nodes().find(node => node.props.className === 'dc-summary')
  assert.equal(nodes(summary).filter(node => node.props.className?.includes('dc-summary-metric')).length, 6)
  assert.deepEqual(nodes(summary).filter(node => node.type === 'b').map(node => node.props.children), [3, 2, 0, 1, 0, 1])
  assert.match(h.nodes()[0].props.className, /dc-collection-browse/)
})

test('compact collection toolbar preserves search and every filter callback with approved ordering', () => {
  const state = hooks()
  const Toolbar = loader({ react: state.react, 'react-i18next': { useTranslation: () => ({ t }) }, './DocumentCollectionFilterDrawer': stub('FilterDrawer') })(resolve('src/features/document-collection/components/DocumentCollectionToolbar.tsx')).default
  const calls = []
  const props = { query: { necessity_status: 'required' }, search: '', purposes: [], employees: [], employeeError: null, onSearch: value => calls.push(['search', value]), onChange: (...args) => calls.push(['filter', ...args]) }
  let tree = state.settle(() => Toolbar(props))
  const all = nodes(tree)
  const chips = all.filter(node => node.props.className?.startsWith('dc-filter-chip '))
  assert.deepEqual(chips.map(node => node.props.className.split(' ')[1]), ['dc-filter-chip--all', 'dc-filter-chip--required', 'dc-filter-chip--not_required', 'dc-filter-chip--undetermined', 'dc-filter-chip--overdue', 'dc-filter-chip--preservation'])
  assert.equal(chips[1].props['aria-pressed'], true)
  chips[1].props.onClick()
  chips[4].props.onClick()
  chips[0].props.onClick()
  all.find(node => node.type === 'input').props.onChange({ target: { value: 'C-004' } })
  assert.deepEqual(calls, [['filter', { necessity_status: undefined }], ['filter', { overdue: true }], ['filter', {}, true], ['search', 'C-004']])
  all.find(node => node.props['aria-haspopup'] === 'dialog').props.onClick()
  tree = state.settle(() => Toolbar(props))
  assert.ok(nodes(tree).some(node => node.type.name === 'FilterDrawer'))
})

test('collection redesign is scoped, token-based and wraps rather than hiding group metrics', () => {
  const source = readFileSync(resolve('src/features/document-collection/collectionBrowse.css'), 'utf8')
  const css = postcss.parse(source)
  const rules = []
  css.walkRules(rule => rules.push(rule))
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b|gradient\(|--tm-primary-light/)
  assert.ok(rules.some(rule => rule.selector === '.dc-collection-browse .dc-group-title' && rule.nodes.some(node => node.prop === 'min-height' && node.value === '56px')))
  assert.ok(rules.some(rule => rule.parent.type === 'atrule' && rule.selector.endsWith('.dc-group-metrics') && rule.nodes.some(node => node.prop === 'flex-wrap' && node.value === 'wrap')))
  assert.ok(rules.some(rule => rule.selector.endsWith('.dc-search-icon') && rule.nodes.some(node => node.prop === 'top' && node.value === '50%')))
})

test('group headers start with the folder and keep whole-button expansion with only an end arrow', () => {
  const h = listHarness()
  h.render()
  const header = () => h.find(node => node.props.className === 'dc-group-title')
  const children = () => nodes(header()).filter(node => node.props.className)
  assert.equal(header().type, 'button', 'native button keeps keyboard activation')
  assert.equal(header().props['aria-expanded'], false)
  assert.equal(header().props.children[0].props.className, 'dc-group-folder')
  assert.equal(children().filter(node => node.props.className === 'dc-group-chevron').length, 0)
  assert.equal(children().filter(node => node.props.className === 'dc-group-end-chevron').length, 1)
  header().props.onClick(); h.render()
  assert.equal(header().props['aria-expanded'], true)
  assert.ok(h.find(node => node.type.displayName === 'FolderOpen'))
  header().props.onClick(); h.render()
  assert.equal(header().props['aria-expanded'], false)
  assert.equal(h.rowTrees().length, 0)
})

test('collection scrolling uses natural page height without inner list or toolbar scrolling', () => {
  const css = postcss.parse(readFileSync(resolve('src/features/document-collection/collectionBrowse.css'), 'utf8'))
  const rules = []
  css.walkRules(rule => rules.push(rule))
  const decl = (selector, prop) => rules.find(rule => rule.selector === selector)?.nodes.find(node => node.prop === prop)?.value
  const scope = '.dc-collection-browse.dc-production'
  assert.equal(decl(`${scope} .dc-workspace`, 'height'), 'auto')
  assert.equal(decl(`${scope} .dc-workspace`, 'align-items'), 'start')
  assert.equal(decl(`${scope} .dc-master`, 'display'), 'block')
  for (const target of ['dc-list', 'dc-toolbar']) {
    assert.equal(decl(`${scope} .${target}`, 'max-height'), 'none')
    assert.equal(decl(`${scope} .${target}`, 'overflow'), 'visible')
  }
  assert.equal(decl(`${scope} .dc-list`, 'overscroll-behavior'), 'auto')
  assert.equal(decl('.dc-collection-browse .dc-group-title', 'grid-template-columns'), '22px auto minmax(0, 1fr) auto auto 16px')
  assert.doesNotMatch(css.toString(), /scrollbar-width|scrollbar-color|::-webkit-scrollbar/, 'remove the scroll constraint rather than disguise it')
})
