import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Exercise the real API store with a transport stub, not the browser E2E.
const source = readFileSync(new URL('../src/features/document-creation/documentDraftStore.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source.replace("import api from '../../services/api'", 'const api = globalThis.__creationTransport'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
let response
let failure
const calls = []
globalThis.__creationTransport = Object.fromEntries(['get', 'post', 'patch'].map(method => [method, async (...args) => {
  calls.push([method, ...args])
  if (failure) throw failure
  return { data: response }
}]))
let storageReads = 0
globalThis.window = { sessionStorage: { getItem() { storageReads++; return '{"status":"approved","draft":{"client_name":"OLD"}}' } } }
const { documentDraftStore, documentDisplayData } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
const identity = { caseId: 33, documentId: 1 }
const state = status => ({ supported: true, template: null, document: {
  id: 1, workflow_status: status, draft_data: { client_name: 'MYSQL DRAFT' },
  approved_data: status === 'approved' ? { client_name: 'APPROVED SNAPSHOT' } : null,
  approved_by: null, approved_at: null, updated_at: null,
} })

test('backend draft, review and approved states win over legacy sessionStorage without writes', async () => {
  for (const status of ['draft', 'review', 'approved']) {
    response = state(status)
    const result = await documentDraftStore.load(identity)
    assert.equal(result.record.status, status)
    assert.equal(result.record.draft.client_name, 'MYSQL DRAFT')
  }
  assert.equal(storageReads, 0)
  assert.ok(calls.every(([method]) => method === 'get'))
  assert.ok(!source.includes('sessionStorage'))
})

test('approved display uses snapshot rather than draft; missing snapshot fails closed', async () => {
  response = state('approved')
  const { record } = await documentDraftStore.load(identity)
  assert.equal(documentDisplayData(record).client_name, 'APPROVED SNAPSHOT')
  assert.throws(() => documentDisplayData({ ...record, approvedData: null }))
  response.document.approved_data = null
  await assert.rejects(documentDraftStore.load(identity))
})

test('failed load/save/review/approve propagate failure and preserve entered values', async () => {
  failure = new Error('API unavailable')
  const draft = { client_name: 'UNSAVED INPUT' }
  for (const action of [
    () => documentDraftStore.load(identity),
    () => documentDraftStore.saveDraft(identity, draft),
    () => documentDraftStore.moveToReview(identity, draft),
    () => documentDraftStore.approve(identity),
  ]) await assert.rejects(action, /API unavailable/)
  assert.deepEqual(draft, { client_name: 'UNSAVED INPUT' })
  failure = null
})

test('editor clears stale notices before requests, locks double actions, and renders snapshot data', () => {
  const editor = readFileSync(new URL('../src/features/document-creation/DocumentEditorPage.tsx', import.meta.url), 'utf8')
  assert.match(editor, /if \(actionInFlight.current\) return false/)
  assert.match(editor, /setSaving\(true\); setActionError\(''\); setNotice\(''\)/)
  assert.match(editor, /setDraft\(documentDisplayData\(creation.record\)\)/)
  assert.match(editor, /if \(await perform\([\s\S]*?setNotice\('下書きを保存しました。'\)/)
})

test('document view remains available while editing is permission and workflow gated', () => {
  const section = readFileSync(new URL('../src/features/document-creation/components/DocumentCreationSection.tsx', import.meta.url), 'utf8')
  const editor = readFileSync(new URL('../src/features/document-creation/DocumentEditorPage.tsx', import.meta.url), 'utf8')
  assert.match(section, /文書を見る/)
  assert.match(section, /\?mode=view/)
  assert.match(section, /hasDocument && canUpdate[\s\S]*?文書を編集/)
  assert.match(section, /承認済みの版は保持されます。編集時は次の改訂版を作成します。/)
  assert.match(editor, /useSearchParams/)
  assert.match(editor, /status !== 'not_created' && \(searchParams\.get\('mode'\) === 'view' \|\| !canUpdate \|\| status === 'approved' \|\| isHistorical\)/)
  assert.match(editor, /viewOnly[\s\S]*?<ReviewView/)
  assert.match(editor, /documentDraftStore\.createRevision/)
  assert.match(editor, /改訂版を作成/)
})

test('revision state exposes document versions and uses the generic revision endpoint', async () => {
  response = {
    ...state('draft'), current_version: 2,
    document: { ...state('draft').document, version: 2, is_current: true },
    versions: [
      { version: 2, workflow_status: 'draft', is_current: true, approved_at: null, approved_by: null, drive_artifact: null },
      { version: 1, workflow_status: 'approved', is_current: false, approved_at: '2026-09-08T00:00:00Z', approved_by: { id: 1, name: 'Manager' }, drive_artifact: null },
    ],
  }
  const loaded = await documentDraftStore.load({ ...identity, version: 2 })
  assert.equal(loaded.record.version, 2)
  assert.equal(loaded.currentVersion, 2)
  assert.equal(loaded.versions.length, 2)
  assert.equal(calls.at(-1)[1], '/case-files/33/document-collection/1/creation?version=2')
  await documentDraftStore.createRevision(identity)
  assert.equal(calls.at(-1)[0], 'post')
  assert.equal(calls.at(-1)[1], '/case-files/33/document-collection/1/creation/revision')
})

test('generic review renders the versioned template body through an allowlist', () => {
  const renderer = readFileSync(new URL('../src/features/document-creation/components/DocumentReviewRenderer.tsx', import.meta.url), 'utf8')
  assert.match(renderer, /template\.templateBody/)
  assert.match(renderer, /allowedTags/)
  assert.match(renderer, /data-template-fields/)
  assert.doesNotMatch(renderer, /dangerouslySetInnerHTML/)
})
