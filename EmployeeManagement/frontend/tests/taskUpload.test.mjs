import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { compileFunction } from 'node:vm'
import ts from 'typescript'

const requireExternal = createRequire(import.meta.url)
const modules = new Map()
const requests = []
let status = 201
let reviewTask = null
let api
let workspaceApi
let collectionApi
let upload
const oldWindow = globalThis.window
function loadModule(path) {
  if (modules.has(path)) return modules.get(path).exports
  const module = { exports: {} }
  modules.set(path, module)
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText.replaceAll('import.meta.env', '({})')
  const requireModule = specifier => {
    if (!specifier.startsWith('.')) return requireExternal(specifier)
    const base = resolve(dirname(path), specifier)
    return loadModule(extname(base) ? base : `${base}.ts`)
  }
  compileFunction(compiled, ['exports', 'require', 'module'], { filename: path })(module.exports, requireModule, module)
  return module.exports
}
before(() => {
  globalThis.window = { sessionStorage: { getItem: () => 'fixture-token' }, localStorage: { getItem: () => null } }
  workspaceApi = loadModule(resolve('src/features/case-workspace/api.ts')).caseWorkspaceApi
  collectionApi = loadModule(resolve('src/features/document-collection/api.ts')).documentCollectionApi
  upload = loadModule(resolve('src/features/case-workspace/taskUpload.ts'))
  api = modules.get(resolve('src/services/api.ts')).exports.default
  // The installed Axios fetch adapter performs the real request transform and
  // boundary construction; only fetch itself is intercepted, with no network.
  api.defaults.adapter = 'fetch'
  api.defaults.env = { ...api.defaults.env, Request, Response, fetch: async request => {
    requests.push(request)
    if (/\/submissions\/\d+\/(approve|reject)$/.test(new URL(request.url).pathname)) {
      return new Response(JSON.stringify({ task: reviewTask }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify(status === 201 ? { task: { id: 17, status: 'pending_review' }, submission: { id: 2, version: 1 }, document: { id: 824, file_review: { status: 'pending_review' } } } : { message: 'provider raw error' }), { status, headers: { 'Content-Type': 'application/json' } })
  } }
})
after(() => { globalThis.window = oldWindow })

test('review APIs preserve a successful privacy-filtered null task without synthesizing private data', async () => {
  reviewTask = null
  assert.equal(await workspaceApi.approveTaskSubmission(49, 17, 2), null)
  assert.equal(await workspaceApi.rejectTaskSubmission(49, 17, 2, 'Synthetic reason'), null)
  const request = requests.at(-1)
  assert.equal(request.method, 'POST')
  assert.equal(new URL(request.url).pathname, '/api/case-files/49/case-tasks/17/submissions/2/reject')
  assert.deepEqual(JSON.parse(await request.text()), { reason: 'Synthetic reason' })
})

test('review APIs keep the existing full task result when the server permits task visibility', async () => {
  reviewTask = { id: 17, status: 'completed', description: 'Synthetic authorized task' }
  assert.deepEqual(await workspaceApi.approveTaskSubmission(49, 17, 2), reviewTask)
  assert.deepEqual(await workspaceApi.rejectTaskSubmission(49, 17, 2, 'Synthetic reason'), reviewTask)
  reviewTask = null
})

test('reproduces the JSON default losing the File binary before the targeted correction', async () => {
  const form = new FormData()
  form.append('file', new File(['%PDF-test'], 'actual.pdf', { type: 'application/pdf' }))
  await api.post('/fixture-baseline', form)
  const request = requests.at(-1)
  assert.equal(request.headers.get('Content-Type'), 'application/json')
  assert.deepEqual(JSON.parse(await request.text()), { file: {} })
})

test('task submission sends POST multipart with file field, exact bytes, filename and Sanctum token', async () => {
  const selected = new File(['%PDF-1.4 actual binary'], '選択した資料.pdf', { type: 'application/pdf' })
  const result = await workspaceApi.submitTask(49, 17, selected)
  const request = requests.at(-1)
  assert.equal(request.method, 'POST')
  assert.equal(new URL(request.url).pathname, '/api/case-files/49/case-tasks/17/submissions')
  assert.match(request.headers.get('Content-Type'), /^multipart\/form-data; boundary=.+/)
  assert.equal(request.headers.get('Authorization'), 'Bearer fixture-token')
  const form = await request.formData()
  assert.deepEqual([...form.keys()], ['file'])
  const file = form.get('file')
  assert.ok(file instanceof File)
  assert.equal(file.name, selected.name)
  assert.equal(await file.text(), await selected.text())
  assert.equal(result.task.status, 'pending_review')
})

test('no file or metadata masquerading as a file fails locally without an upload request', async () => {
  const beforeCount = requests.length
  for (const value of [null, undefined, '', 'actual.pdf', { name: 'actual.pdf' }]) {
    await assert.rejects(workspaceApi.submitTask(49, 17, value), /ファイルを選択してください/)
  }
  assert.equal(requests.length, beforeCount)
})

test('a failed upload can retry the same selected File with all bytes intact', async () => {
  const selected = new File(['%PDF-preserve-for-retry'], 'retry.pdf', { type: 'application/pdf' })
  status = 503
  await assert.rejects(workspaceApi.submitTask(49, 17, selected), error => upload.taskUploadErrorMessage(error).includes('Google Drive'))
  const failedRequest = requests.at(-1)
  status = 201
  await workspaceApi.submitTask(49, 17, selected)
  const retryRequest = requests.at(-1)
  for (const request of [failedRequest, retryRequest]) assert.equal(await (await request.formData()).get('file').text(), '%PDF-preserve-for-retry')
})

test('upload correction does not change JSON headers for other existing task actions', async () => {
  await workspaceApi.updateTask(49, 17, { due_at: null })
  assert.equal(requests.at(-1).headers.get('Content-Type'), 'application/json')
  assert.deepEqual(JSON.parse(await requests.at(-1).text()), { due_at: null })
})

test('received-document registration sends multipart with exact file bytes and receipt metadata', async () => {
  const selected = new File(['%PDF-1.4 received binary'], '受領資料.pdf', { type: 'application/pdf' })
  const form = new FormData()
  form.append('storage_type', 'upload')
  form.append('title', '検証用の受領資料')
  form.append('received_at', '2026-10-15T06:00:00.000Z')
  form.append('notes', 'TEST ONLY')
  form.append('file', selected)
  const result = await collectionApi.registerReceivedDocument(49, 824, form)
  const request = requests.at(-1)
  assert.equal(request.method, 'POST')
  assert.equal(new URL(request.url).pathname, '/api/case-files/49/document-collection/824/received-documents')
  assert.match(request.headers.get('Content-Type'), /^multipart\/form-data; boundary=.+/)
  assert.equal(request.headers.get('Authorization'), 'Bearer fixture-token')
  const sent = await request.formData()
  for (const field of ['storage_type', 'title', 'received_at', 'notes']) assert.equal(sent.get(field), form.get(field))
  assert.ok(sent.get('file') instanceof File)
  assert.equal(sent.get('file').name, selected.name)
  assert.equal(sent.get('file').type, selected.type)
  assert.equal(await sent.get('file').text(), await selected.text())
  assert.equal(result.file_review.status, 'pending_review')
})

test('failed received-document registration can retry the same FormData without losing the file', async () => {
  const form = new FormData()
  form.append('storage_type', 'upload')
  form.append('title', 'Retry test')
  form.append('file', new File(['%PDF-corrected-v2'], 'corrected-v2.pdf', { type: 'application/pdf' }))
  status = 422
  await assert.rejects(collectionApi.registerReceivedDocument(49, 824, form))
  const failed = requests.at(-1)
  status = 201
  await collectionApi.registerReceivedDocument(49, 824, form)
  for (const request of [failed, requests.at(-1)]) {
    assert.match(request.headers.get('Content-Type'), /^multipart\/form-data; boundary=.+/)
    assert.equal(await (await request.formData()).get('file').text(), '%PDF-corrected-v2')
  }
})

test('received upload override leaves existing collection PATCH and review requests as JSON', async () => {
  await collectionApi.update(49, 824, { necessity_status: 'required' })
  assert.equal(requests.at(-1).headers.get('Content-Type'), 'application/json')
  assert.deepEqual(JSON.parse(await requests.at(-1).text()), { necessity_status: 'required' })
  const payload = { source: 'received', file_id: 10, action: 'confirm' }
  await collectionApi.reviewFile(49, 824, payload)
  assert.equal(requests.at(-1).headers.get('Content-Type'), 'application/json')
  assert.deepEqual(JSON.parse(await requests.at(-1).text()), payload)
})

test('upload errors are classified contextually without raw English validation or provider errors', () => {
  const error = (status, data = {}) => ({ isAxiosError: true, response: { status, data } })
  assert.equal(upload.taskUploadErrorMessage(error(422, { errors: { file: ['The file field is required.'] } })), 'ファイルを選択してください。')
  assert.match(upload.taskUploadErrorMessage(error(422, { errors: { file: ['The file field must not be greater than 20480 kilobytes.'] } })), /サイズ/)
  assert.match(upload.taskUploadErrorMessage(error(403)), /権限/)
  assert.match(upload.taskUploadErrorMessage(error(503, { message: 'private provider response' })), /Google Drive/)
  assert.doesNotMatch(upload.taskUploadErrorMessage(error(422)), /The file|タスクを取得・更新/)
  assert.doesNotMatch(upload.taskUploadErrorMessage(error(500, { message: 'secret raw error' })), /secret|raw/)
})
