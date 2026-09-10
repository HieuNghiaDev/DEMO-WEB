import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('../src/features/document-creation/documentDraftStore.ts', import.meta.url), 'utf8')
let response, failure, request
globalThis.__driveTransport = {
  async get() { return { data: response } },
  async post(...args) { request = args; if (failure) throw failure; return { data: response } },
}
const compiled = ts.transpileModule(source.replace("import api from '../../services/api'", 'const api = globalThis.__driveTransport'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const { documentDraftStore, saveDocumentToDrive } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

test('backend capability defaults to unavailable, not browser configuration', async () => {
  response = { supported: true, template: null, document: null }
  assert.deepEqual((await documentDraftStore.load({ caseId: 1, documentId: 2 })).drive, { available: false, artifact: null })
  response.drive = { available: true, artifact: null }
  assert.equal((await documentDraftStore.load({ caseId: 1, documentId: 2 })).drive.available, true)
})

test('upload returns real API artifact and load preserves it; failure is not success', async () => {
  const drive = { available: false, artifact: { url: 'https://drive.google.com/file/d/file/view', filename: 'approved.pdf', uploaded_at: '2026-09-06T00:00:00Z' } }
  response = { drive }
  assert.deepEqual(await saveDocumentToDrive({ caseId: 1, documentId: 2 }), drive)
  assert.deepEqual(request, ['/case-files/1/document-collection/2/creation/google-drive'])
  assert.deepEqual(await saveDocumentToDrive({ caseId: 1, documentId: 2 }, 2), drive)
  assert.deepEqual(request, ['/case-files/1/document-collection/2/creation/google-drive?version=2'])
  response = { supported: true, template: null, document: null, drive }
  assert.deepEqual((await documentDraftStore.load({ caseId: 1, documentId: 2 })).drive.artifact, drive.artifact)
  failure = new Error('Upload failed')
  await assert.rejects(saveDocumentToDrive({ caseId: 1, documentId: 2 }), /Upload failed/)
})

test('Drive action uses backend capability, duplicate guard, safe link and truthful error', () => {
  const component = readFileSync(new URL('../src/features/document-creation/components/DocumentDriveButton.tsx', import.meta.url), 'utf8')
  assert.match(component, /if \(inFlight.current \|\| !drive.available \|\| drive.artifact\) return/)
  assert.match(component, /disabled=\{!drive.available \|\| busy\}/)
  assert.match(component, /if \(!result.artifact \|\| !driveLink\(result.artifact.url\)\) throw/)
  assert.match(component, /target="_blank" rel="noopener noreferrer"/)
  assert.match(component, /url.hostname === 'drive.google.com'/)
  assert.match(component, /role="alert"/)
})
