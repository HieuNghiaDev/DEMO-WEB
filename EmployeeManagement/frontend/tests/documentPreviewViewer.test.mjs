import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { compileFunction } from 'node:vm'
import { resolve, dirname, extname } from 'node:path'
import ts from 'typescript'

const externalRequire = createRequire(import.meta.url)
const React = externalRequire('react')
const { renderToStaticMarkup } = externalRequire('react-dom/server')
const modules = new Map()
let hooks, pdfTaskFactory
const fakeReact = { ...React }
for (const name of ['useState', 'useRef', 'useEffect']) fakeReact[name] = (...args) => hooks[name](...args)
function load(path) {
  if (modules.has(path)) return modules.get(path).exports
  const module = { exports: {} }
  modules.set(path, module)
  // Vite's asset manifest is not executed in this no-browser component harness.
  const source = readFileSync(path, 'utf8').replace(/^const resources = import.meta.glob.*$/m, 'const resources = {}')
  let code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText.replaceAll('import.meta.env', '({})')
  if (path.endsWith('DocumentPreviewViewer.tsx')) code += '\nexports.PreviewBodyForTest = PreviewBody;'
  const requireModule = name => {
    if (name === 'react') return fakeReact
    if (name === 'pdfjs-dist') return { GlobalWorkerOptions: {}, getDocument: (...args) => pdfTaskFactory(...args) }
    if (name.endsWith('?url')) return '/assets/pdf-worker.mjs'
    if (!name.startsWith('.')) return externalRequire(name)
    const target = resolve(dirname(path), name)
    if (extname(target) === '.css') return {}
    const file = extname(target) ? target : ['.ts', '.tsx'].map(extension => target + extension).find(candidate => { try { readFileSync(candidate); return true } catch { return false } })
    return load(file)
  }
  compileFunction(code, ['exports', 'require', 'module'], { filename: path })(module.exports, requireModule, module)
  return module.exports
}
const PreviewBody = load(resolve('src/features/document-collection/components/DocumentPreviewViewer.tsx')).PreviewBodyForTest
const PdfCanvasViewer = load(resolve('src/features/document-collection/components/PdfCanvasViewer.tsx')).default
function setup(states, refValues = []) {
  let index = 0, refIndex = 0
  const effects = [], updates = [], timers = []
  hooks = {
    useState(initial) { const position = index++; return [position < states.length ? states[position] : typeof initial === 'function' ? initial() : initial, value => updates.push([position, value])] },
    useRef(initial) { const position = refIndex++; return { current: position < refValues.length ? refValues[position] : initial } },
    useEffect(effect) { effects.push(effect) },
  }
  globalThis.window = { setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length }, clearTimeout() {}, devicePixelRatio: 1 }
  return { effects, updates, timers }
}
const target = { key: 'received:49:827:2:1', name: 'TEST.pdf', kind: 'auto', load: async () => new Blob(['%PDF-test']) }
const props = { target, externalBlocked: false, onExternalBlocked() {}, onRetry() {}, onClose() {} }

test('native PDF is visible without iframe load; missing load switches to canvas, not a false error', () => {
  const run = setup([target, { kind: 'pdf', url: 'blob:private' }, false, false, false, null, '', false])
  const html = renderToStaticMarkup(PreviewBody(props))
  assert.match(html, /iframe class="is-ready"/)
  assert.match(html, /aria-busy="false"/)
  assert.doesNotMatch(html, /role="status"/)
  run.effects[3]()
  assert.equal(run.timers[0].delay, 8000)
  run.timers[0].callback()
  assert.deepEqual(run.updates, [[4, true]])
})

test('unsupported-browser PDF uses local renderer and no native-frame watchdog; images still wait for decode', () => {
  const run = setup([target, { kind: 'pdf', url: 'blob:private' }, false, false, true, ({ name }) => React.createElement('div', null, name), '', false])
  const html = renderToStaticMarkup(PreviewBody(props))
  assert.doesNotMatch(html, /iframe|role="status"/)
  assert.match(html, /TEST.pdf/)
  run.effects[3]()
  assert.equal(run.timers.length, 0)
  const image = setup([target, { kind: 'image', url: 'blob:image' }, false, false, false, null, '', false])
  assert.match(renderToStaticMarkup(PreviewBody(props)), /role="status"/)
  image.effects[3]()
  assert.equal(image.timers[0].delay, 20000)
  image.timers[0].callback()
  assert.equal(image.updates[0][0], 6)
})

test('canvas PDF destroys loading worker on close and ignores late resolution; resources stay local', async () => {
  let resolveDocument, destroyed = 0, options
  const task = { promise: new Promise(resolve => { resolveDocument = resolve }), destroy: async () => { destroyed++ } }
  pdfTaskFactory = value => { options = value; return task }
  const run = setup([null, 1, 1, 400, '', ''])
  const html = renderToStaticMarkup(PdfCanvasViewer({ url: 'blob:private', name: 'TEST.pdf', onError() {} }))
  assert.match(html, /PDFページ操作|PDFをダウンロード|表示倍率/)
  const close = run.effects[1]()
  assert.equal(options.url, 'blob:private')
  assert.equal(options.useWorkerFetch, false)
  assert.equal(options.enableXfa, false)
  await assert.rejects(new options.BinaryDataFactory().fetch({ kind: 'cMapUrl', filename: 'missing.bcmap' }))
  close()
  resolveDocument({ numPages: 3 })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(destroyed, 1)
  assert.equal(run.updates.length, 0)
})

test('rapid page changes cancel an in-flight canvas render before reusing its canvas', async () => {
  let cancelled = 0, rejectRender
  const renderPromise = new Promise((resolve, reject) => { rejectRender = reject })
  const pdf = { numPages: 3, async getPage() { return { getViewport: ({ scale }) => ({ width: 500 * scale, height: 700 * scale }), render: () => ({ promise: renderPromise, cancel() { cancelled++; rejectRender(new Error('cancelled')) } }), getTextContent: async () => ({ items: [] }) } } }
  const canvas = { style: {}, getContext: () => ({}) }
  const run = setup([pdf, 1, 1, 400, '', ''], [null, canvas])
  PdfCanvasViewer({ url: 'blob:private', name: 'TEST.pdf', onError() { assert.fail('cancelled render must not surface an error') } })
  const close = run.effects[3]()
  await new Promise(resolve => setImmediate(resolve))
  close()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(cancelled, 1)
  assert.equal(run.updates.length, 0)
})

test('PDF loading overlay does not resize the scroll viewport and cause a render/scrollbar loop', () => {
  const css = readFileSync(resolve('src/features/document-collection/components/documentPreviewViewer.css'), 'utf8')
  assert.match(css, /\.dc-pdf-canvas-pages\s*\{[^}]*scrollbar-gutter:\s*stable/)
  assert.match(css, /\.dc-pdf-canvas-pages > \.dc-document-preview-state\s*\{[^}]*position:\s*absolute/)
})
