import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { compileFunction } from 'node:vm'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, resolve } from 'node:path'
import ts from 'typescript'

let preview
let api
const requests = []
const originalWindow = globalThis.window
const modules = new Map()
const requireExternal = createRequire(import.meta.url)

function loadModule(path) {
  if (modules.has(path)) return modules.get(path)
  const source = readFileSync(path, 'utf8')
  const transformed = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText.replaceAll('import.meta.env', '({})')
  const module = { exports: {} }
  modules.set(path, module)
  const requireModule = specifier => {
    if (specifier.startsWith('.')) {
      const candidate = resolve(dirname(path), specifier)
      return loadModule(extname(candidate) ? candidate : `${candidate}.ts`).exports
    }
    return requireExternal(specifier)
  }
  compileFunction(transformed, ['exports', 'require', 'module', '__filename', '__dirname'], { filename: path })(module.exports, requireModule, module, path, dirname(path))
  return module
}

before(() => {
  globalThis.window = { sessionStorage: { getItem: () => null }, localStorage: { getItem: () => null } }
  // Load the actual TypeScript modules with existing TypeScript + Node tools.
  // No browser, HTTP listener, database or Google request is used.
  preview = loadModule(resolve('src/features/document-collection/documentPreview.ts')).exports
  api = modules.get(resolve('src/services/api.ts')).exports.default
  api.defaults.adapter = async config => {
    requests.push(config)
    return { data: new Blob(['%PDF-test'], { type: 'application/pdf' }), status: 200, statusText: 'OK', headers: {}, config }
  }
})

after(() => { globalThis.window = originalWindow })

const artifact = (filename = 'contract.pdf', mime_type = 'application/pdf') => ({ id: 5, artifact_type: 'pdf', filename, mime_type, url: 'https://drive.google.com/file/d/file123/view', uploaded_at: null, uploaded_by: null })
const generated = (version = 2, artifacts = [artifact()]) => ({ id: 8, version, artifacts, workflow_status: 'approved', created_at: null, updated_at: null, created_by: null, approved_by: null })
const received = (extra = {}) => ({ id: 12, title: '受領資料', original_filename: 'manual.pdf', version: 3, storage_type: 'upload', external_url: null, ...extra })
const submission = (extra = {}) => ({ id: 30, version: 4, source_type: 'manual_upload', review_status: 'pending_review', filename: 'submitted.pdf', mime_type: 'application/pdf', url: 'https://drive.google.com/file/d/sub123/view', submitted_at: null, submitted_by: null, reviewed_at: null, reviewed_by: null, review_note: null, ...extra })

test('generated PDF loads the clicked version through the authenticated API', async () => {
  const target = preview.resolveGeneratedVersionPreviewTarget(49, 823, generated(2))
  assert.equal(target.kind, 'pdf')
  await target.load(new AbortController().signal)
  assert.equal(requests.at(-1).url, '/case-files/49/document-collection/823/creation/pdf?version=2')
  assert.equal(requests.at(-1).responseType, 'blob')
})

test('C-001 still loads the exact saved PDF version through previewC001', async () => {
  const target = preview.resolveC001PreviewTarget(49, 823, 1, 'contract_v1.pdf')
  assert.equal(target.source, 'c001')
  await target.load(new AbortController().signal)
  assert.equal(requests.at(-1).url, '/case-files/49/document-collection/823/creation/c001/pdf?version=1')
})

test('manual received upload resolves the specific received file ID and abort signal', async () => {
  const target = preview.resolveReceivedDocumentPreviewTarget(49, 824, received())
  const controller = new AbortController()
  await target.load(controller.signal)
  assert.equal(requests.at(-1).url, '/case-files/49/document-collection/824/received-documents/12/download')
  assert.equal(requests.at(-1).signal, controller.signal)
  assert.equal(target.versionLabel, 'v3')
})

test('received-file task submission previews the immutable local file, not a generated template', async () => {
  const target = preview.resolveSubmissionPreviewTarget(49, 824, submission({ received_document_id: 42, storage_provider: 'upload', url: null }))
  assert.equal(target.source, 'received_upload')
  assert.equal(target.kind, 'auto')
  await target.load(new AbortController().signal)
  assert.equal(requests.at(-1).url, '/case-files/49/document-collection/824/received-documents/42/download')
})

test('Drive and external links use external fallback and never an iframe loader', () => {
  for (const storage_type of ['google_drive', 'external_link']) {
    const target = preview.resolveReceivedDocumentPreviewTarget(49, 824, received({ storage_type, external_url: artifact().url }))
    assert.equal(target.kind, 'external')
    assert.equal(target.load, undefined)
    assert.equal(target.externalUrl, artifact().url)
  }
})

test('missing/unsafe URLs and missing record IDs are unavailable', () => {
  for (const external_url of [null, '', 'javascript:alert(1)', 'https://user:password@example.com/file.pdf']) {
    assert.equal(preview.resolveReceivedDocumentPreviewTarget(49, 824, received({ storage_type: 'google_drive', external_url })).kind, 'unavailable')
  }
  assert.equal(preview.resolveReceivedDocumentPreviewTarget(49, 824, received({ id: 0 })).kind, 'unavailable')
  assert.equal(preview.resolveGeneratedVersionPreviewTarget(49, 824, generated(1, [])).kind, 'unavailable')
})

test('Office artifacts preserve their MIME and use external fallback', () => {
  const target = preview.resolveGeneratedVersionPreviewTarget(49, 824, generated(2, [artifact('sheet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')]))
  assert.equal(target.kind, 'external')
  assert.equal(target.load, undefined)
  assert.equal(target.mimeType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
})

test('MIME normalization prefers server MIME and safely falls back for legacy files', () => {
  assert.equal(preview.previewKindFor('old.PDF', null), 'pdf')
  assert.equal(preview.previewKindFor('old.PNG', 'application/octet-stream'), 'image')
  assert.equal(preview.previewKindFor('misnamed.pdf', 'application/msword'), 'unavailable')
  assert.equal(preview.previewKindFor('malicious.svg', 'image/svg+xml'), 'unavailable')
  assert.equal(preview.previewKindFor('photo.webp', null), 'image')
})

test('legacy octet-stream PDF and image Blobs get concrete browser MIME', async () => {
  const target = preview.resolveReceivedDocumentPreviewTarget(49, 824, received())
  const pdf = await preview.resolvePreviewBlob(target, new Blob(['%PDF-test'], { type: 'application/octet-stream' }), new AbortController().signal)
  assert.equal(pdf.kind, 'pdf')
  assert.equal(pdf.blob.type, 'application/pdf')
  const imageTarget = preview.resolveReceivedDocumentPreviewTarget(49, 824, received({ original_filename: 'photo.png' }))
  const image = await preview.resolvePreviewBlob(imageTarget, new Blob(['image'], { type: 'image/png' }), new AbortController().signal)
  assert.equal(image.kind, 'image')
})

test('invalid PDFs, Office and HTML error responses cannot enter the PDF viewer', async () => {
  const target = preview.resolveReceivedDocumentPreviewTarget(49, 824, received())
  for (const blob of [new Blob(['not-pdf'], { type: 'application/pdf' }), new Blob(['html'], { type: 'text/html' }), new Blob(['docx'], { type: 'application/msword' })]) {
    await assert.rejects(preview.resolvePreviewBlob(target, blob, new AbortController().signal))
  }
})

test('closing/switching during asynchronous PDF validation suppresses stale completion', async () => {
  const controller = new AbortController()
  const target = preview.resolveC001PreviewTarget(49, 823, 1, 'v1.pdf')
  const blob = { type: 'application/pdf', slice: () => ({ text: async () => { controller.abort(); return '%PDF-' } }) }
  assert.equal(await preview.resolvePreviewBlob(target, blob, controller.signal), null)
})

test('manual task submissions stay external instead of regenerating an unrelated PDF', () => {
  const target = preview.resolveSubmissionPreviewTarget(49, 824, submission())
  assert.equal(target.kind, 'external')
  assert.equal(target.load, undefined)
  assert.equal(target.versionLabel, 'v4')
  const versions = preview.mergePreviewVersions([generated(2)], [submission()])
  assert.deepEqual(versions.map(item => item.version), [4, 2])
  const overlapping = preview.mergePreviewVersions([generated(4)], [submission()])
  assert.equal(overlapping.length, 1)
  assert.equal(preview.resolveGeneratedVersionPreviewTarget(49, 824, overlapping[0], overlapping[0].previewSubmission).source, 'submission')
})

test('auto-generated C-001 task submission reuses the existing Blob source', () => {
  const target = preview.resolveSubmissionPreviewTarget(49, 823, submission({ source_type: 'auto_generated' }), 'C-001')
  assert.equal(target.source, 'c001')
  assert.equal(target.kind, 'pdf')
})

test('authorization failures are identified to suppress external-open bypass', () => {
  for (const status of [401, 403]) assert.equal(preview.previewAuthorizationFailed({ isAxiosError: true, response: { status } }), true)
  for (const status of [404, 500]) assert.equal(preview.previewAuthorizationFailed({ isAxiosError: true, response: { status } }), false)
})

test('C-001 preserves authorization status even when the API returns a JSON error Blob', async () => {
  const adapter = api.defaults.adapter
  const denied = { isAxiosError: true, response: { status: 403, data: new Blob(['{"message":"private-provider-error"}'], { type: 'application/json' }) } }
  api.defaults.adapter = async () => { throw denied }
  try {
    const target = preview.resolveC001PreviewTarget(49, 823, 1, 'v1.pdf', artifact().url)
    await assert.rejects(target.load(new AbortController().signal), error => error === denied && preview.previewAuthorizationFailed(error))
  } finally { api.defaults.adapter = adapter }
})

test('an older detail API missing workflow metadata fails before mounting the ordinary drawer', async () => {
  const collectionApi = modules.get(resolve('src/features/document-collection/api.ts')).exports.documentCollectionApi
  const adapter = api.defaults.adapter
  api.defaults.adapter = async config => ({ data: { document: { generated_versions: [], received_documents: [] } }, status: 200, statusText: 'OK', headers: {}, config })
  try { await assert.rejects(collectionApi.detail(49, 824), /必要資料の詳細を取得できませんでした/) }
  finally { api.defaults.adapter = adapter }
})
