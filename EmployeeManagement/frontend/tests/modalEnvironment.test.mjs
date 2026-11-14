import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { compileFunction, createContext } from 'node:vm'
import ts from 'typescript'

// Lifecycle tests without browser/API access; visual checks use bulk-dialog.html.
function environment(stableGutter = false) {
  const listeners = new Map()
  const observers = []
  const document = { activeElement: null, addEventListener(name, callback) { const list = listeners.get(name) ?? []; list.push(callback); listeners.set(name, list) }, removeEventListener(name, callback) { listeners.set(name, listeners.get(name).filter(item => item !== callback)) } }
  class Element {
    constructor(parent = null) { this.parent = parent; this.inert = false; this.isConnected = true; this.disabled = false; this.hidden = false; this.tabIndex = 0; this.dataset = {}; this.controls = []; this.style = { overflow: 'auto', paddingRight: '7px', overscrollBehavior: 'contain' } }
    contains(element) { return element === this || this.controls.includes(element) }
    querySelectorAll() { return this.controls }
    matches(selector) { return selector === ':disabled' && this.disabled }
    closest() { return this.inert ? this : this.parent?.closest() ?? null }
    getClientRects() { return this.hidden ? [] : [{}] }
    focus() { document.activeElement = this }
  }
  const root = new Element()
  const opener = new Element(root)
  const body = new Element()
  body.style.overflow = ''
  const html = new Element(); html.clientWidth = 1265
  body.children = [root]
  document.body = body; document.documentElement = html; document.activeElement = opener
  let effect
  const context = createContext({ document, window: { innerWidth: 1280 }, HTMLElement: Element, getComputedStyle: element => ({ paddingRight: element.style.paddingRight, scrollbarGutter: stableGutter ? 'stable' : 'auto' }), MutationObserver: class { constructor(callback) { this.callback = callback; observers.push(this) } observe() {} disconnect() { this.disconnected = true } } })
  const source = ts.transpileModule(readFileSync('src/components/ui/useModalEnvironment.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText
  const exports = {}
  compileFunction(source, ['exports', 'require'], { parsingContext: context })(exports, () => ({ useEffect: callback => { effect = callback } }))
  const layer = () => { const node = new Element(); node.tabIndex = -1; body.children.push(node); return node }
  const control = (node, settings = {}) => { const child = Object.assign(new Element(node), settings); node.controls.push(child); return child }
  const mount = (node, dismissible = true) => { let closes = 0; const dismissRef = { current: { onClose: () => closes++, dismissible } }; exports.useModalEnvironment(true, { current: node }, dismissRef); const cleanup = effect(); return { dismissRef, closeCount: () => closes, cleanup } }
  const key = (value, shiftKey = false) => { const event = { key: value, shiftKey, preventDefault() { this.prevented = true }, stopImmediatePropagation() { this.stopped = true } }; for (const callback of listeners.get('keydown') ?? []) { callback(event); if (event.stopped) break } return event }
  return { document, body, html, root, opener, layer, control, mount, key, observers, listeners }
}

test('lock viewport scrolling without making the body a scroll container for sticky navigation', () => {
  const h = environment()
  const alreadyInert = h.layer(); alreadyInert.inert = true
  const layer = h.layer(); h.control(layer)
  const modal = h.mount(layer)
  assert.equal(h.root.inert, true)
  assert.equal(layer.inert, false)
  assert.equal(h.body.style.overflow, '')
  assert.equal(h.html.style.overflow, 'hidden')
  assert.equal(h.body.style.paddingRight, '22px')
  modal.cleanup()
  assert.equal(h.body.style.overflow, '')
  assert.equal(h.body.style.paddingRight, '7px')
  assert.equal(h.html.style.overflow, 'auto')
  assert.equal(h.html.style.overscrollBehavior, 'contain')
  assert.equal(h.root.inert, false)
  assert.equal(alreadyInert.inert, true)
  assert.equal(h.document.activeElement, h.opener)
  assert.equal(h.listeners.get('keydown').length, 0)
})

test('stable scrollbar gutter is not compensated twice', () => {
  const h = environment(true); const modal = h.mount(h.layer())
  assert.equal(h.body.style.paddingRight, '7px')
  modal.cleanup()
})

test('focus enters intended control, skips hidden/disabled elements, wraps Tab, and blocks escaped focus', () => {
  const h = environment(); const layer = h.layer()
  h.control(layer, { disabled: true }); h.control(layer, { hidden: true })
  const first = h.control(layer)
  const initial = h.control(layer, { dataset: { modalAutofocus: 'true' } })
  const last = h.control(layer)
  const modal = h.mount(layer)
  assert.equal(h.document.activeElement, initial)
  last.focus(); assert.equal(h.key('Tab').prevented, true); assert.equal(h.document.activeElement, first)
  first.focus(); h.key('Tab', true); assert.equal(h.document.activeElement, last)
  h.opener.focus(); h.listeners.get('focusin')[0]({ target: h.opener }); assert.equal(h.document.activeElement, initial)
  modal.cleanup()
})

test('Escape respects busy dismissal guard without remounting or unlocking', () => {
  const h = environment(); const modal = h.mount(h.layer(), false)
  assert.equal(h.key('Escape').stopped, true); assert.equal(modal.closeCount(), 0)
  modal.dismissRef.current.dismissible = true
  h.key('Escape'); assert.equal(modal.closeCount(), 1)
  assert.equal(h.root.inert, true)
  modal.cleanup()
})

test('nested modal closes independently and never restores scrolling before the final dialog closes', () => {
  const h = environment(); const parentLayer = h.layer(); const opener = h.control(parentLayer)
  const parent = h.mount(parentLayer)
  const childLayer = h.layer(); h.control(childLayer)
  const child = h.mount(childLayer)
  assert.equal(parentLayer.inert, true)
  h.key('Escape'); assert.equal(child.closeCount(), 1); assert.equal(parent.closeCount(), 0)
  child.cleanup(); assert.equal(parentLayer.inert, false); assert.equal(h.document.activeElement, opener)
  assert.equal(h.html.style.overflow, 'hidden')
  parent.cleanup(); assert.equal(h.html.style.overflow, 'auto')
})

test('employee role confirmation shares the detail dialog scroll lock even if the parent closes first', () => {
  const organization = readFileSync('src/pages/OrganizationDesign.tsx', 'utf8')
  const detail = organization.slice(organization.indexOf('function EmployeeDetailModal('), organization.indexOf('function TabButton('))
  const stepUp = readFileSync('src/features/authentication/StepUpDialog.tsx', 'utf8')
  assert.match(detail, /<ModalShell\s+isOpen\s+onClose=\{closeEmployeeDialog\}/)
  assert.match(detail, /roleStepUp && <StepUpDialog/)
  assert.doesNotMatch(detail, /useOrganizationDialog\(/)
  assert.match(stepUp, /<ModalShell isOpen/)

  const h = environment()
  const parent = h.mount(h.layer())
  const child = h.mount(h.layer())
  parent.cleanup()
  assert.equal(h.html.style.overflow, 'hidden')
  assert.equal(h.root.inert, true)
  child.cleanup()
  assert.equal(h.html.style.overflow, 'auto')
  assert.equal(h.root.inert, false)
})

test('new floating/portal roots are inert while open and restored after cleanup', () => {
  const h = environment(); const modal = h.mount(h.layer())
  const widget = h.layer(); h.observers[0].callback()
  assert.equal(widget.inert, true)
  modal.cleanup(); assert.equal(widget.inert, false)
})

test('attendance dialogs and application loading escape the animated page column', () => {
  const room = readFileSync('src/pages/EmployeeRoom.tsx', 'utf8')
  const loader = readFileSync('src/components/loading/AppLoadingScreen.tsx', 'utf8')
  const css = readFileSync('src/index.css', 'utf8')
  assert.match(room, /<ModalShell isOpen customContent title=\{null\} onClose=\{onClose\} dismissible=\{!busy\}/)
  assert.match(room, /role="dialog" aria-modal="true" aria-labelledby=\{titleId\} aria-busy=\{busy\}/)
  for (const id of ['attendance-start-confirmation-title', 'attendance-report-prompt-title', 'work-session-modal-title', 'status-confirmation-title']) {
    assert.ok(room.includes(`<AttendanceDialog titleId="${id}" busy={`), id)
  }
  assert.match(loader, /return createPortal\([\s\S]*themis-app-loader fixed inset-0[\s\S]*document\.body,/)
  assert.doesNotMatch(css.match(/@keyframes themisPageEnter \{[\s\S]*?^\}/m)[0], /transform|filter/)
  assert.doesNotMatch(css.match(/\.themis-page-transition \{[^}]+\}/)[0], /will-change|forwards/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[^]*?\.themis-route-progress \{ display: none; \}/)
})

test('bulk dialog reuses global portal, preserves validation, uses one viewport overlay and safe mobile bounds', () => {
  const bulk = readFileSync('src/features/document-collection/components/BulkNecessityDialog.tsx', 'utf8')
  const shell = readFileSync('src/components/ui/ModalShell.tsx', 'utf8')
  const css = readFileSync('src/features/document-collection/documentCollection.css', 'utf8')
  const globalCss = readFileSync('src/index.css', 'utf8')
  assert.match(bulk, /<ModalShell isOpen onClose=\{onClose\} dismissible=\{!busy\}/)
  assert.match(bulk, /customContent overlayClassName="dc-preview dc-bulk-dialog-backdrop"/)
  assert.match(bulk, /role="dialog" aria-modal="true" aria-busy=\{busy\}/)
  assert.match(bulk, /const canConfirm = !busy && \(!isNotRequired \|\| reason !== ''\)/)
  assert.match(bulk, /onConfirm\(isNotRequired \? reason : undefined\)/)
  assert.match(shell, /return createPortal\(/)
  assert.match(shell, /document.body,/)
  assert.match(shell, /useModalEnvironment\(isOpen, layerRef, dismissRef\)/)
  assert.match(shell, /customContent \? children/)
  assert.match(globalCss, /--tm-layer-modal: 10030/)
  assert.match(css, /\.dc-preview\.dc-bulk-dialog-backdrop \{ position: fixed; inset: 0; display: grid; place-items: center; padding: 16px;/)
  assert.match(css, /max-height: min\(720px, calc\(100dvh - 32px\)\); overflow: auto; overscroll-behavior: contain;/)
  assert.doesNotMatch(css, /\.dc-bulk-dialog-backdrop \{ align-items: end; padding: 0;/)
})
