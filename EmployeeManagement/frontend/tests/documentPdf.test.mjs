import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('../src/features/document-creation/documentPdf.ts', import.meta.url), 'utf8')
let response
let failure
let request
globalThis.__pdfTransport = { async get(...args) { request = args; if (failure) throw failure; return response } }
const compiled = ts.transpileModule(source.replace("import api from '../../services/api'", 'const api = globalThis.__pdfTransport'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { pdfFilename, fetchDocumentPdf, savePdfDownload } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

test('UTF-8 backend filename is decoded and traversal/header characters are neutralized', () => {
  assert.equal(pdfFilename("attachment; filename=\"fallback.pdf\"; filename*=UTF-8''C-001_%E5%A7%94%E4%BB%BB.pdf"), 'C-001_委任.pdf')
  assert.equal(pdfFilename('attachment; filename="../../a.pdf"'), '____a.pdf')
  assert.equal(pdfFilename("filename*=UTF-8''%invalid"), 'document.pdf')
  assert.equal(pdfFilename('filename="not-a-pdf.html"'), 'document.pdf')
})

test('authenticated shared API fetches PDF blob from generic creation endpoint', async () => {
  response = { data: new Blob(['%PDF-1.4 sample'], { type: 'application/pdf' }), headers: { 'content-disposition': 'attachment; filename="sample.pdf"' } }
  const result = await fetchDocumentPdf(33, 349)
  assert.deepEqual(request, ['/case-files/33/document-collection/349/creation/pdf', { responseType: 'blob' }])
  assert.equal(result.filename, 'sample.pdf')
  assert.equal(result.blob, response.data)
  await fetchDocumentPdf(33, 349, 2)
  assert.deepEqual(request, ['/case-files/33/document-collection/349/creation/pdf?version=2', { responseType: 'blob' }])
})

test('network/permission failures and non-PDF content cannot be downloaded as successful PDF', async () => {
  failure = new Error('403 Forbidden')
  await assert.rejects(fetchDocumentPdf(33, 349), /Forbidden/)
  failure = null
  response = { data: new Blob(['{"error":"failure"}'], { type: 'application/json' }), headers: {} }
  await assert.rejects(fetchDocumentPdf(33, 349))
})

test('browser download uses filename, clicks link and releases URL', () => {
  let clicked = false, removed = false, revoked = false, appended = false
  const link = { click() { clicked = true }, remove() { removed = true } }
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL
  URL.createObjectURL = () => 'blob:test'
  URL.revokeObjectURL = value => { revoked = value === 'blob:test' }
  globalThis.document = { createElement: () => link, body: { appendChild: () => { appended = true } } }
  globalThis.window = { setTimeout: callback => callback() }
  try { savePdfDownload(new Blob(['%PDF-']), 'test.pdf') } finally {
    URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke
  }
  assert.equal(link.download, 'test.pdf'); assert.equal(link.href, 'blob:test')
  assert.ok(clicked && removed && revoked && appended)
})

test('only approved view supplies PDF action and button prevents double click', () => {
  const editor = readFileSync(new URL('../src/features/document-creation/DocumentEditorPage.tsx', import.meta.url), 'utf8')
  const button = readFileSync(new URL('../src/features/document-creation/components/DocumentPdfDownloadButton.tsx', import.meta.url), 'utf8')
  assert.match(editor, /status === 'approved'.*pdfAction=/)
  assert.match(button, /if \(inFlight.current\) return/)
  assert.match(button, /disabled=\{busy\}/)
  assert.match(button, /role="alert"/)
})
