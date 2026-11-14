import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { compileFunction } from 'node:vm'
import ts from 'typescript'
import postcss from 'postcss'
import { productionArrow } from './helpers/loadTypeScript.mjs'

const source = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
const page = source('features/case-workspace/CaseWorkspacePage.tsx')
const header = source('features/case-workspace/CaseWorkspaceComponents.tsx')
const documents = source('features/document-collection/components/RequiredDocumentsPanel.tsx')
const css = source('features/case-workspace/caseWorkspace.css')
const tree = ts.createSourceFile('CaseWorkspacePage.tsx', page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

for (const status of [401, 403, 404, 500]) test(`quiet workspace refresh handles HTTP${status} without retaining denied content`, async () => {
  const oldData = { case_file: { title: 'SYNTHETIC previously authorized case' } }
  const state = { data: oldData, loading: true, error: null }
  const reload = productionArrow(page, 'reload', {
    activeScope: { current: '1:synthetic-user' }, workspaceScope: '1:synthetic-user',
    requestRevision: { current: 0 }, loadedScope: '1:synthetic-user', caseId: 1,
    caseWorkspaceApi: { show: async () => { throw { isAxiosError: true, response: { status } } } },
    axios: { isAxiosError: error => error.isAxiosError === true },
    setLoading: value => { state.loading = value }, setError: value => { state.error = value },
    setData: value => { state.data = value }, setLoadedScope: () => {},
    apiError: () => 'Synthetic error', t: key => key,
  })
  assert.equal(await reload(true), false)
  assert.equal(state.data, status === 500 ? oldData : null)
  assert.equal(state.loading, false)
  assert.equal(state.error, 'Synthetic error')
})

function find(node, predicate) {
  if (predicate(node)) return node
  let result
  ts.forEachChild(node, child => { result ??= find(child, predicate) })
  return result
}
function className(node) {
  const attribute = node.openingElement?.attributes.properties.find(item => item.name?.getText(tree) === 'className')
  return attribute?.initializer?.text ?? ''
}

test('case header, navigation and content are sibling surfaces; Back remains outside', () => {
  const main = find(tree, node => ts.isJsxElement(node) && className(node).includes('cm-case-detail'))
  assert.ok(main)
  const shell = main.children.find(node => ts.isJsxElement(node) && className(node) === 'cm-workspace-shell')
  const children = shell.children.filter(node => ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))
  assert.deepEqual(children.map(node => (node.openingElement ?? node).tagName.getText(tree)), ['WorkspaceHeader', 'section', 'div'])
  assert.equal(className(children[1]), 'cm-ws-section cm-ws-navigation')
  assert.match(children[2].openingElement.getText(tree), /cm-tab-content cm-ws-section cm-ws-content-surface/)
  assert.ok(main.children.some(node => ts.isJsxElement(node) && className(node) === 'cm-ws-backbar'))
  assert.doesNotMatch(shell.getText(tree), /cm-ws-backbar/)
  assert.match(header, /cm-dossier-header cm-ws-section cm-ws-case-information/)
  for (const label of ['CASE INFORMATION', 'NAVIGATION', 'REQUIRED DOCUMENTS']) assert.ok(!`${header}${page}`.includes(label))
})

test('seven primary tabs and retained deadline path share one stable content surface', () => {
  const content = find(tree, node => ts.isJsxElement(node) && node.openingElement.getText(tree).includes('cm-ws-content-surface'))
  const attribute = content.openingElement.attributes.properties.find(node => node.name?.getText(tree) === 'className')
  const classesForTab = compileFunction(`return ${attribute.initializer.expression.getText(tree)}`, ['tab'])
  const panels = {
    overview: 'OverviewPanel', collection: 'DocumentCollectionPanel', documents: 'RequiredDocumentsPanel',
    tasks: 'TasksPanel', interpretation: 'InterpretationPanel', deadlines: 'DeadlinesPanel', parties: 'PartiesPanel', timeline: 'CaseHistoryPanel',
  }
  const paths = content.children.filter(node => ts.isJsxExpression(node))
  assert.equal(paths.length, 8)
  for (const [tab, panel] of Object.entries(panels)) {
    const classes = classesForTab(tab).trim().split(/\s+/)
    assert.equal(classes.filter(value => value === 'cm-ws-section').length, 1, tab)
    assert.equal(classes.filter(value => value === 'cm-ws-content-surface').length, 1, tab)
    assert.equal(classes.includes('cm-ws-required-content'), tab === 'documents')
    const path = paths.find(node => node.expression.left.right.text === tab)
    assert.ok(path, tab)
    assert.ok(find(path, node => (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(tree) === panel), panel)
  }
  assert.doesNotMatch(content.openingElement.getText(tree), /\bkey=/)
  assert.doesNotMatch(content.getText(tree), /<div[^>]*className="cm-ws-section/)
  assert.equal((page.match(/cm-ws-content-surface/g) ?? []).length, 1)
})

test('interpretation replaces deadline tab while old deadline controls remain reachable', () => {
  const tabs = find(tree, node => ts.isVariableDeclaration(node) && node.name.getText(tree) === 'tabs')
  const ids = tabs.initializer.elements.map(element => element.properties.find(item => item.name.getText(tree) === 'id').initializer.text)
  assert.deepEqual(ids, ['overview', 'collection', 'documents', 'tasks', 'interpretation', 'parties', 'timeline'])
  assert.match(page, /onClick=\{\(\) => onOpenTab\('deadlines'\)\}/)
  assert.match(page, /期限管理を開く/)
  for (const action of ['createDeadline', 'updateDeadline', 'deleteDeadline']) assert.ok(page.includes(action), action)
  assert.match(page, /onClick=\{\(\) => setTab\(id\)\}/)
  assert.match(page, /<RequiredDocumentsPanel key=\{caseId\}/)
  const documentTree = ts.createSourceFile('RequiredDocumentsPanel.tsx', documents, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  for (const name of ['RequiredList', 'RequiredCards']) {
    const component = find(documentTree, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(documentTree) === name)
    const onOpen = component.attributes.properties.find(node => node.name?.getText(documentTree) === 'onOpen')
    assert.equal(onOpen.initializer.expression.getText(documentTree), 'openDocument')
  }
  const selected = []
  let refreshes = 0
  productionArrow(documents, 'openDocument', { setSelectedId: id => selected.push(id), collection: { refresh() { refreshes++ } } })(824)
  assert.deepEqual(selected, [824]); assert.equal(refreshes, 1, 'Opening a detail must also refresh stale list metadata')
  assert.match(documents, /<RequiredDocumentInspector key=\{selectedId\}/)
  assert.doesNotMatch(documents, /type="checkbox"/)
  assert.match(header, /selectEmploymentSummaryEntity\(caseFile\)/)
})

test('required documents retain six columns, five real KPIs and existing controls', () => {
  const head = documents.match(/<div className="dc-required-head">([^]*?)<\/div>/)[1]
  assert.deepEqual([...head.matchAll(/<span>([^<]+)<\/span>/g)].map(match => match[1]), ['資料', '状態', '担当者', '期限', 'ファイル', '更新日時'])
  assert.equal((documents.match(/<SummaryCard /g) ?? []).length, 5)
  for (const expression of ['required.length', 'counts.unaccepted', 'counts.in_progress + counts.pending_review + counts.changes_requested', 'counts.completed', 'counts.overdue']) assert.ok(documents.includes(`value={${expression}}`))
  for (const control of ['setQuery(event.target.value)', 'setMethodFilter(event.target.value)', "changeView('list')", "changeView('card')", 'setFilter(item.value)']) assert.ok(documents.includes(control))
})

const rules = postcss.parse(css)
const rule = selector => {
  const matches = []
  rules.walkRules(selector, value => matches.push(value))
  assert.ok(matches.length, selector)
  return matches[0]
}
const value = (rule, property) => rule.nodes.find(node => node.prop === property)?.value

test('case Back is the only control in the sticky navigation', () => {
  const backbar = find(tree, node => ts.isJsxElement(node) && className(node) === 'cm-ws-backbar')
  const controls = backbar.children.filter(node => ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))
  assert.equal(controls.length, 1)
  assert.match(controls[0].getText(tree), /onClick=\{onBack\}.*戻る/)
  assert.doesNotMatch(backbar.getText(tree), /案件詳細/)
  assert.equal(value(rule('.cm-ws-backbar'), 'position'), 'sticky')
})

test('shared section geometry uses theme surfaces; no continuous shell border remains', () => {
  const shell = rule('.cm-case-detail .cm-workspace-shell')
  assert.equal(value(shell, 'gap'), '20px')
  for (const [property, expected] of [['border', '0'], ['background', 'transparent'], ['box-shadow', 'none'], ['overflow', 'visible']]) assert.equal(value(shell, property), expected)
  const section = rule('.cm-case-detail .cm-workspace-shell > .cm-ws-section')
  for (const [property, expected] of [['width', '100%'], ['min-width', '0'], ['border-radius', '16px'], ['background', 'var(--tm-surface)'], ['box-shadow', 'var(--tm-shadow-md)']]) assert.equal(value(section, property), expected)
  const rail = rule('.cm-case-detail .cm-ws-navigation .cm-ws-tab-rail')
  assert.equal(value(rail, 'overflow-x'), 'auto')
  assert.equal(value(rail, 'width'), '100%')
  assert.equal(value(rail, 'box-shadow'), 'none')
})

test('shared content padding adapts without fixed height, clipping or a new containing block', () => {
  const styles = []
  rules.walkRules('.cm-case-detail .cm-workspace-shell > .cm-ws-content-surface', node => styles.push(node))
  assert.equal(styles.length, 2)
  assert.equal(value(styles[0], 'padding'), '20px 24px')
  assert.equal(value(styles[1], 'padding'), '18px 20px')
  assert.equal(styles[1].parent.params, 'case-workspace (max-width: 980px)')
  for (const style of styles) for (const declaration of style.nodes) assert.equal(declaration.prop, 'padding')
  const mobile = []
  rules.walkAtRules('container', node => { if (node.params === 'case-workspace (max-width: 540px)') mobile.push(node) })
  const section = mobile[0].nodes.find(node => node.selector === '.cm-case-detail .cm-workspace-shell > .cm-ws-section')
  assert.equal(value(section, 'padding'), '16px')
  const productionCss = source('features/document-collection/documentCollection.css')
  assert.match(productionCss, /\.dc-production\.dc-preview\s*\{\s*padding:\s*0;/)
})

test('responsive rules use available workspace width and compact only the document list', () => {
  const containers = []
  rules.walkAtRules('container', node => containers.push(node))
  for (const width of ['540px', '740px', '980px']) assert.ok(containers.some(node => node.params === `case-workspace (max-width: ${width})`))
  assert.ok(containers.some(node => node.params === 'case-workspace (min-width: 960px)' && node.parent.params === '(min-width: 1280px)'))
  const compact = rule('.cm-ws-required-content .dc-required .dc-required-work-row')
  assert.equal(value(compact, 'min-height'), '60px')
  const newStyles = css.slice(css.indexOf('/* Case Detail owns three separate surfaces'))
  assert.doesNotMatch(newStyles, /\.dc-required-inspector|\.dc-action-drawer|:root|\.cm-overview|\.cw-task/)
  assert.doesNotMatch(newStyles, /#[0-9a-f]{3,8}\b|linear-gradient|animation:/i)
})

test('decorative labels, accent lines and reserved space are removed without losing Japanese heading', () => {
  assert.doesNotMatch(`${page}${header}${css}`, /cm-ws-section-eyebrow|case-information-label|case-navigation-label/)
  assert.equal(value(rule('.cm-case-detail .cm-workspace-shell > .cm-ws-section'), 'padding'), '18px 24px 20px')
  assert.equal(value(rule('.cm-case-detail .cm-workspace-shell > .cm-ws-navigation'), 'padding'), '12px 20px')
  assert.match(header, /aria-label="案件情報"/)
  assert.match(page, /aria-label="案件ナビゲーション"/)
  assert.match(documents, /<h2>必要資料<\/h2>/)
  assert.match(documents, /dc-required-heading-icon[^]*?<Folder size=\{20\}/)
  assert.match(documents, /この案件で「必要」と判断された資料を管理します。/)
})
