import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { compileFunction } from 'node:vm'
import { fileURLToPath } from 'node:url'
import { loadTypeScript } from './helpers/loadTypeScript.mjs'

let response
let failure
let request
const transport = { async get(...args) { request = args; if (failure) throw failure; return response } }
const { pdfFilename, fetchDocumentPdf, savePdfDownload } = loadTypeScript(new URL('../src/features/document-creation/documentPdf.ts', import.meta.url),
  new Map([[fileURLToPath(new URL('../src/services/api.ts', import.meta.url)), { __esModule: true, default: transport }]]))

test('UTF-8 backend filename is decoded and traversal/header characters are neutralized', () => {
  assert.equal(pdfFilename("attachment; filename=\"fallback.pdf\"; filename*=UTF-8''C-001_%E5%A7%94%E4%BB%BB.pdf"), 'C-001_委任.pdf')
  assert.equal(pdfFilename('attachment; filename="../../a.pdf"'), '____a.pdf')
  assert.equal(pdfFilename("filename*=UTF-8''%invalid"), 'document.pdf')
  assert.equal(pdfFilename('filename="not-a-pdf.html"'), 'document.pdf')
})

test('authenticated shared API fetches PDF blob from generic creation endpoint', async () => {
  response = { data: new Blob(['%PDF-1.4 sample'], { type: 'application/pdf' }), headers: { 'content-disposition': 'attachment; filename="sample.pdf"' } }
  const result = await fetchDocumentPdf(33, 349)
  assert.deepEqual(request, ['/case-files/33/document-collection/349/creation/pdf', { responseType: 'blob', signal: undefined }])
  assert.equal(result.filename, 'sample.pdf')
  assert.equal(result.blob, response.data)
  await fetchDocumentPdf(33, 349, 2)
  assert.deepEqual(request, ['/case-files/33/document-collection/349/creation/pdf?version=2', { responseType: 'blob', signal: undefined }])
  const controller = new AbortController()
  await fetchDocumentPdf(33, 349, 2, controller.signal)
  assert.equal(request[1].signal, controller.signal, 'Viewer cancellation reaches the authenticated transport')
})

test('network/permission failures and non-PDF content cannot be downloaded as successful PDF', async () => {
  failure = new Error('403 Forbidden')
  await assert.rejects(fetchDocumentPdf(33, 349), /Forbidden/)
  failure = null
  response = { data: new Blob(['{"error":"failure"}'], { type: 'application/json' }), headers: {} }
  await assert.rejects(fetchDocumentPdf(33, 349))
  response = { data: new Blob(['<html>not a PDF</html>'], { type: 'application/pdf' }), headers: {} }
  await assert.rejects(fetchDocumentPdf(33, 349), undefined, 'MIME alone cannot authorize a fake PDF')
})

test('browser download uses filename, clicks link and releases URL', () => {
  let clicked = false, removed = false, revoked = false, appended = false
  const link = { click() { clicked = true }, remove() { removed = true } }
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL
  const originalDocument = globalThis.document, originalWindow = globalThis.window
  URL.createObjectURL = () => 'blob:test'
  URL.revokeObjectURL = value => { revoked = value === 'blob:test' }
  globalThis.document = { createElement: () => link, body: { appendChild: () => { appended = true } } }
  globalThis.window = { setTimeout: callback => callback() }
  try { savePdfDownload(new Blob(['%PDF-']), 'test.pdf') } finally {
    URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow
  }
  assert.equal(link.download, 'test.pdf'); assert.equal(link.href, 'blob:test')
  assert.ok(clicked && removed && revoked && appended)
})

test('only approved view supplies PDF action and button prevents double click', () => {
  const editor = readFileSync(new URL('../src/features/document-creation/DocumentEditorPage.tsx', import.meta.url), 'utf8')
  const button = readFileSync(new URL('../src/features/document-creation/components/DocumentPdfDownloadButton.tsx', import.meta.url), 'utf8')
  const tree = ts.createSourceFile('DocumentEditorPage.tsx', editor, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const actions = []
  const visit = node => {
    if (ts.isJsxAttribute(node) && node.name.getText(tree) === 'pdfAction') actions.push(node)
    ts.forEachChild(node, visit)
  }
  visit(tree)
  assert.equal(actions.length, 1, 'Only the generic approved ReviewView receives this action')
  assert.equal(actions[0].parent.parent.tagName.getText(tree), 'ReviewView')
  let expression = actions[0]
  while (expression && !ts.isJsxExpression(expression)) expression = expression.parent
  assert.ok(ts.isBinaryExpression(expression.expression))
  const allowed = compileFunction(`return ${expression.expression.left.getText(tree)}`, ['status', 'isC001'])
  for (const status of ['not_created', 'draft', 'review', 'approved']) for (const isC001 of [false, true]) {
    assert.equal(allowed(status, isC001), status === 'approved' && !isC001)
  }
  assert.match(button, /if \(inFlight.current\) return/)
  assert.match(button, /disabled=\{busy\}/)
  assert.match(button, /role="alert"/)
})
