import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { compileFunction } from 'node:vm'
import { createRequire } from 'node:module'
import { dirname, extname, resolve } from 'node:path'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import i18next from 'i18next'
import { fileReviewLabel, fileReturnReasons, validFileReturnReason, fileReviewRefreshWarning, saveFileReview } from '../src/features/document-collection/fileReview.ts'

test('collected-file labels are distinct from generated approval', () => {
  assert.equal(fileReviewLabel('approved'), '確認済み')
  assert.equal(fileReviewLabel('pending_review'), '確認待ち')
  assert.equal(fileReviewLabel('rejected'), '差し戻し')
  assert.equal(fileReviewLabel(null), '')
  for (const reason of fileReturnReasons) assert.equal(validFileReturnReason(reason), true)
  for (const reason of ['', '   ', 'arbitrary']) assert.equal(validFileReturnReason(reason), false)
})

// Render the actual component without a browser, requests, or an API server.
const modules = new Map()
const externalRequire = createRequire(import.meta.url)
const reactRuntime = externalRequire('react')
let testHooks
const reactHooks = { ...reactRuntime }
for (const hook of ['useState', 'useRef', 'useId']) reactHooks[hook] = (...args) => (testHooks?.[hook] ?? reactRuntime[hook])(...args)
// Share the CommonJS context used by the transpiled component imports.
const { I18nextProvider } = externalRequire('react-i18next')
function load(path) {
  if (modules.has(path)) return modules.get(path).exports
  const module = { exports: {} }
  modules.set(path, module)
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText.replaceAll('import.meta.env', '({})')
  const localRequire = name => {
    if (name === 'react') return reactHooks
    if (!name.startsWith('.')) return externalRequire(name)
    const candidate = resolve(dirname(path), name)
    if (extname(candidate) === '.css') return {}
    const resolved = extname(candidate) ? candidate : ['.ts', '.tsx'].map(extension => candidate + extension).find(file => { try { readFileSync(file); return true } catch { return false } })
    return load(resolved)
  }
  compileFunction(code, ['exports', 'require', 'module'], { filename: path })(module.exports, localRequire, module)
  return module.exports
}
const FileReviewActions = load(resolve('src/features/document-collection/components/FileReviewActions.tsx')).default
const DocumentFileCard = load(resolve('src/features/document-collection/components/DocumentFileCard.tsx')).default
const DocumentFilesHeader = load(resolve('src/features/document-collection/components/DocumentFilesHeader.tsx')).default
const DocumentVersionList = load(resolve('src/features/document-collection/components/DocumentVersionList.tsx')).default
const ReceivedDocumentsList = load(resolve('src/features/document-collection/components/ReceivedDocumentsList.tsx')).default
const { fileReviewError } = load(resolve('src/features/document-collection/errors.ts'))
const i18n = i18next.createInstance()
await i18n.init({ lng: 'ja', resources: { ja: { translation: {} } } })
function markup(status, capabilities = {}) {
  const detail = { id: 9, title: '本人確認資料', file_review: { source: 'received', id: 12, version: 2, status, reason: 'ファイルが不鮮明', detail: '再撮影', reviewed_by: null }, capabilities }
  return renderToStaticMarkup(React.createElement(I18nextProvider, { i18n }, React.createElement(FileReviewActions, { caseId: 1, detail, onChanged() {} })))
}
test('reviewer sees compact return/confirm actions only for pending latest file', () => {
  const html = markup('pending_review', { can_review: true, can_return: true })
  assert.match(html, /確認済みにする/)
  assert.match(html, /差し戻す/)
  for (const status of ['approved', 'rejected']) {
    const closed = markup(status, { can_review: true, can_return: true })
    assert.doesNotMatch(closed, /確認済みにする|>差し戻す</)
  }
})
test('viewer sees review metadata/reason but no upload or review actions; missing capabilities fail closed', () => {
  for (const status of ['pending_review', 'rejected', 'approved']) {
    const html = markup(status)
    assert.match(html, new RegExp(fileReviewLabel(status)))
    assert.doesNotMatch(html, /確認済みにする|>差し戻す<|新しいファイルをアップロード/)
  }
  assert.match(markup('rejected'), /ファイルが不鮮明/)
  assert.match(markup('rejected'), /再撮影/)
})
test('assigned employee can upload corrected version after return', () => {
  assert.match(markup('rejected', { can_upload: true }), /新しいファイルをアップロード/)
})

test('compact file row promotes filename and uses a small separate version with inline metadata', () => {
  const html = renderToStaticMarkup(React.createElement(DocumentFileCard, { name: 'CASE-49_DOC-824_v1_LE_HIEU_NGHIA.pdf', version: 1, author: 'LE HIEU NGHIA', uploadedAt: '2026-10-08T03:30:00Z', reviewStatus: 'pending_review', onOpen() {} }))
  assert.match(html, /aria-label="PDF"/)
  assert.match(html, /dc-compact-file-version[^>]*aria-label="バージョン1"/)
  assert.match(html, /dc-compact-file-meta.*LE HIEU NGHIA/)
  assert.match(html, /dc-compact-file-status is-pending_review/)
  assert.match(html, /確認待ち/)
  assert.doesNotMatch(html, /dc-version-number|dc-version-author|1.2 MB/)
  assert.match(html, /CASE-49_DOC-824_v1_LE_HIEU_NGHIA.pdfをプレビュー/)
  const header = renderToStaticMarkup(React.createElement(DocumentFilesHeader, { count: 1 }))
  assert.match(header, /ファイル <small>\(1\)<\/small>/)
  assert.match(header, /資料のアップロード・バージョン管理・確認を行います。/)
})

test('compact generated/submitted and received files keep preview targets, status and uploader identity', () => {
  const version = { id: 1, version: 1, updated_at: '2026-10-08T03:30:00Z', created_by: { id: 1, name: 'Generator' }, artifacts: [{ filename: 'Generated.pdf', mime_type: 'application/pdf', uploaded_by: { id: 2, name: 'Uploader' }, uploaded_at: '2026-10-08T03:30:00Z' }] }
  const generated = renderToStaticMarkup(React.createElement(DocumentVersionList, { caseId: 49, documentId: 824, compact: true, versions: [version], onPreview() {} }))
  assert.match(generated, /Generated.pdf/)
  assert.match(generated, /Uploader/)
  assert.doesNotMatch(generated, /dc-version-number/)
  const files = [{ id: 2, title: 'Signed agreement', original_filename: 'Uploaded.pdf', storage_type: 'upload', version: 2, received_at: '2026-10-08T03:30:00Z', registered_by_employee: { id: 3, display_name: 'Employee uploader' }, review_status: 'approved', notes: 'Keep original' }]
  const received = renderToStaticMarkup(React.createElement(I18nextProvider, { i18n }, React.createElement(ReceivedDocumentsList, { caseId: 49, itemId: 824, files, compact: true, hideTitle: true })))
  for (const text of ['Uploaded.pdf', 'Employee uploader', '確認済み', 'Keep original', 'dc-file-download']) assert.match(received, new RegExp(text))
})

test('compact review presentation removes duplicate status/version but preserves capabilities and return details', () => {
  for (const capabilities of [{}, { can_upload: true }, { can_review: true, can_return: true }]) {
    const detail = { id: 9, title: '本人確認資料', file_review: { source: 'received', id: 12, version: 2, status: 'pending_review', reviewed_by: null }, capabilities }
    const html = renderToStaticMarkup(React.createElement(I18nextProvider, { i18n }, React.createElement(FileReviewActions, { compact: true, caseId: 1, detail, onChanged() {} })))
    assert.doesNotMatch(html, /dc-file-review-summary|v2 ·/)
    if (capabilities.can_review) { assert.match(html, /確認済みにする/); assert.match(html, /差し戻す/); assert.doesNotMatch(html, /dc-button dc-danger/) }
    else assert.doesNotMatch(html, /確認済みにする|>差し戻す</)
  }
  const css = readFileSync(resolve('src/features/document-collection/components/documentFiles.css'), 'utf8')
  assert.match(css, /dc-compact-file-version[^}]*height: 22px/s)
  assert.match(css, /text-overflow: ellipsis/)
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/)
})

test('review errors are localized by status and never expose 500 exception details', () => {
  const failure = (status, errors) => ({ isAxiosError: true, response: { status, data: { message: 'SQLSTATE private backend detail', errors } } })
  assert.equal(fileReviewError(failure(403)), 'この資料を確認する権限がありません。')
  assert.equal(fileReviewError(failure(409)), 'この資料は現在確認できる状態ではありません。')
  assert.equal(fileReviewError(failure(422, { file_id: ['現在確認待ちの最新版を指定してください。'] })), '現在確認待ちの最新版を指定してください。')
  assert.equal(fileReviewError(failure(422)), '入力内容を確認してください。')
  for (const error of [failure(500), new Error('Network Error')]) {
    assert.equal(fileReviewError(error), '保存に失敗しました。再度お試しください。')
    assert.doesNotMatch(fileReviewError(error), /SQLSTATE|Network Error|資料収集データ/)
  }
})

test('successful confirm applies server state and waits for list/workspace refresh', async () => {
  const response = { file_review: { status: 'approved' }, workflow_state: { code: 'completed' } }
  let state = { file_review: { status: 'pending_review' } }
  let finishRefresh
  const gate = new Promise(resolve => { finishRefresh = resolve })
  let completed = false
  const operation = saveFileReview(async () => response, async updated => { state = updated; await gate }).then(result => { completed = true; return result })
  await Promise.resolve()
  assert.equal(state, response)
  assert.equal(completed, false)
  finishRefresh()
  assert.deepEqual(await operation, { kind: 'saved' })
})

test('confirm save failure never updates the inspector or reloads', async () => {
  const error = new Error('save failed')
  let refreshed = false
  const result = await saveFileReview(async () => { throw error }, () => { refreshed = true })
  assert.equal(result.kind, 'save_failed')
  assert.equal(result.error, error)
  assert.equal(refreshed, false)
})

test('confirm success followed by reload failure retains confirmed state, not a save failure', async () => {
  const response = { file_review: { status: 'approved' }, workflow_state: { code: 'completed' } }
  let posts = 0
  let state
  const result = await saveFileReview(async () => { posts++; return response }, async updated => { state = updated; throw new Error('reload failed') })
  assert.equal(result.kind, 'refresh_failed')
  assert.equal(result.updated, response)
  assert.equal(state, response)
  assert.equal(posts, 1)
  assert.equal(fileReviewRefreshWarning, '保存は完了しましたが、最新情報の再取得に失敗しました。')
  assert.doesNotMatch(fileReviewRefreshWarning, /保存に失敗/)
})

test('actual review component guards rapid clicks and retry only reloads without another POST', () => {
  const source = readFileSync(resolve('src/features/document-collection/components/FileReviewActions.tsx'), 'utf8')
  assert.match(source, /if \(inFlight\.current\) return/)
  assert.match(source, /inFlight\.current = true/)
  assert.match(source, /saveFileReview\(/)
  assert.match(source, /aria-busy=\{busy\}/)
  const retry = source.slice(source.indexOf('const retryRefresh'), source.indexOf('return <div className'))
  assert.match(retry, /await onChanged\(savedDetail\)/)
  assert.doesNotMatch(retry, /reviewFile\(/)
  const inspector = readFileSync(resolve('src/features/document-collection/components/RequiredDocumentInspector.tsx'), 'utf8')
  assert.equal((inspector.match(/onChanged=\{onReviewed\}/g) ?? []).length, 2)
  assert.match(inspector, /await onReviewed\(\)/)
  const panel = readFileSync(resolve('src/features/document-collection/components/RequiredDocumentsPanel.tsx'), 'utf8')
  assert.match(panel, /Promise\.all\(\[collection\.refresh\(\), onChanged\(\)\]\)/)
  assert.match(panel, /onReviewed=\{refreshAfterReview\}/)
})

for (const compact of [false, true]) test(`actual review handlers block duplicate clicks and retry failed refresh without resubmitting (compact=${compact})`, async () => {
  // Execute the production handlers with persistent hook slots; no browser,
  // test renderer dependency, or real API writes are needed.
  const slots = []
  let cursor = 0
  const hooks = {
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }]
    },
    useRef(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = { current: initial }
      return slots[index]
    },
    useId: () => 'review-test',
  }
  const elements = tree => !React.isValidElement(tree) ? [] : [tree, ...React.Children.toArray(tree.props.children).flatMap(elements)]
  const text = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : React.isValidElement(tree) ? React.Children.toArray(tree.props.children).map(text).join('') : ''
  const props = { compact, caseId: 1, detail: { id: 9, title: '委任契約書', document_type: { code: 'C-001', name_ja: '委任契約書' }, file_review: { source: 'received', id: 12, version: 1, status: 'pending_review' }, capabilities: { can_review: true } } }
  let refreshes = 0
  props.onChanged = async updated => { props.detail = updated; if (++refreshes === 1) throw new Error('reload failed') }
  const render = () => {
    cursor = 0; testHooks = hooks
    try { return FileReviewActions(props) } finally { testHooks = undefined }
  }
  const flush = async () => { for (let index = 0; index < 20; index++) await Promise.resolve() }
  const api = load(resolve('src/features/document-collection/api.ts')).documentCollectionApi
  const original = api.reviewFile
  let posts = 0
  let release
  const gate = new Promise(resolve => { release = resolve })
  api.reviewFile = async () => { posts++; await gate; return { ...props.detail, file_review: { ...props.detail.file_review, status: 'approved' }, capabilities: { can_review: false } } }
  try {
    const confirm = elements(render()).find(element => element.type === 'button' && text(element) === '確認済みにする')
    confirm.props.onClick(); confirm.props.onClick()
    assert.equal(posts, 0, 'opening the confirmation must not perform a review')
    const opened = render()
    const modal = elements(opened).find(element => element.props.className === 'dc-preview dc-file-review-dialog')
    assert.equal(modal.props.isOpen, true)
    assert.equal(modal.props.title, '資料を確認済みにしますか？')
    assert.match(text(opened), /C-001/)
    assert.match(text(opened), /委任契約書/)
    assert.match(text(opened), /v1/)
    const form = elements(opened).find(element => element.type === 'form')
    form.props.onSubmit({ preventDefault() {} }); form.props.onSubmit({ preventDefault() {} })
    assert.equal(posts, 1)
    assert.equal(elements(render()).find(element => element.type === 'button').props.disabled, true)
    const runningModal = elements(render()).find(element => element.props.className === 'dc-preview dc-file-review-dialog')
    assert.equal(runningModal.props.dismissible, false)
    assert.ok(elements(runningModal.props.footer).filter(element => element.type === 'button').every(element => element.props.disabled))
    runningModal.props.onClose()
    assert.equal(elements(render()).find(element => element.props.className === 'dc-preview dc-file-review-dialog').props.isOpen, true)
    release(); await flush()
    const saved = render()
    assert.equal(props.detail.file_review.status, 'approved')
    if (!compact) assert.match(text(saved), /確認済み/)
    else assert.equal(elements(saved).find(element => element.props.role === 'alert').props.className, 'dc-compact-file-alert')
    assert.match(text(saved), new RegExp(fileReviewRefreshWarning))
    assert.doesNotMatch(text(saved), /保存に失敗/)
    const retry = elements(saved).find(element => element.type === 'button' && text(element) === '最新情報を再取得')
    retry.props.onClick(); await flush()
    assert.equal(posts, 1)
    assert.equal(refreshes, 2)
    assert.doesNotMatch(text(render()), /再取得に失敗|最新情報を再取得/)
  } finally { api.reviewFile = original; testHooks = undefined }
})

const reviewElements = tree => !React.isValidElement(tree) ? [] : [tree, ...React.Children.toArray(tree.props.children).flatMap(reviewElements)]
const reviewText = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : React.isValidElement(tree) ? React.Children.toArray(tree.props.children).map(reviewText).join('') : ''
function confirmationHarness(capabilities = { can_review: true, can_return: true }) {
  const slots = []; let cursor = 0
  const hooks = {
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }]
    },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index] },
    useId: () => 'confirmation-test',
  }
  const changed = []
  const props = { compact: true, caseId: 49, detail: { id: 824, title: '委任契約書', document_type: { code: 'C-001', name_ja: '委任契約書' }, file_review: { source: 'received', id: 12, version: 1, status: 'pending_review' }, capabilities }, onChanged(updated) { changed.push(updated); props.detail = updated } }
  const render = () => {
    cursor = 0; testHooks = hooks
    try { return FileReviewActions(props) } finally { testHooks = undefined }
  }
  const nodes = () => reviewElements(render())
  const modal = () => nodes().find(node => node.props.className === 'dc-preview dc-file-review-dialog')
  const form = () => nodes().find(node => node.type === 'form')
  const footer = () => reviewElements(modal().props.footer).filter(node => node.type === 'button')
  const open = label => { const button = nodes().find(node => node.type === 'button' && reviewText(node) === label); assert.ok(button); button.props.onClick() }
  const submit = () => form().props.onSubmit({ preventDefault() {} })
  const setReason = value => nodes().find(node => node.type === 'select').props.onChange({ target: { value } })
  const setExplanation = value => nodes().find(node => node.type === 'textarea').props.onChange({ target: { value } })
  const flush = async () => { for (let index = 0; index < 30; index++) await Promise.resolve() }
  const withApi = async (handler, run) => {
    const api = load(resolve('src/features/document-collection/api.ts')).documentCollectionApi
    const original = api.reviewFile; api.reviewFile = handler
    try { await run() } finally { api.reviewFile = original; testHooks = undefined }
  }
  return { props, changed, render, nodes, modal, form, footer, open, submit, setReason, setExplanation, flush, withApi }
}

test('opening/canceling confirmation never calls API or changes status, including stale submit after dismissal', async () => {
  const h = confirmationHarness(); let calls = 0
  const before = structuredClone(h.props.detail)
  await h.withApi(async () => { calls++; return h.props.detail }, async () => {
    h.open('確認済みにする')
    assert.equal(calls, 0)
    assert.equal(h.modal().props.isOpen, true)
    assert.equal(h.modal().props.title, '資料を確認済みにしますか？')
    assert.equal(h.modal().props.description, 'この操作を実行すると、このファイルは「確認済み」として記録されます。')
    assert.equal(h.modal().props.size, 'sm')
    for (const target of ['C-001', '委任契約書', 'v1']) assert.ok(reviewText(h.form()).includes(target))
    const staleForm = h.form()
    h.footer().find(button => reviewText(button) === 'キャンセル').props.onClick()
    assert.equal(h.modal().props.isOpen, false)
    staleForm.props.onSubmit({ preventDefault() {} }); await h.flush()
    h.open('確認済みにする')
    staleForm.props.onSubmit({ preventDefault() {} }); await h.flush()
    assert.equal(calls, 0, 'a canceled dialog cannot submit a newly opened confirmation')
    h.modal().props.onClose(); await h.flush()
    assert.equal(calls, 0)
    assert.equal(h.changed.length, 0)
    assert.deepEqual(h.props.detail, before)
  })
})

test('final confirm calls the existing API once and applies only server-returned status/workflow/history', async () => {
  const h = confirmationHarness(); const calls = []
  const response = { ...h.props.detail, file_review: { ...h.props.detail.file_review, status: 'approved' }, workflow_state: { code: 'completed' }, history: ['server-confirmed-event'] }
  await h.withApi(async (...args) => { calls.push(args); return response }, async () => {
    h.open('確認済みにする')
    assert.equal(calls.length, 0)
    const finalForm = h.form()
    finalForm.props.onSubmit({ preventDefault() {} }); finalForm.props.onSubmit({ preventDefault() {} })
    assert.equal(h.props.detail.file_review.status, 'pending_review', 'no optimistic business state')
    await h.flush()
    assert.deepEqual(calls, [[49, 824, { source: 'received', file_id: 12, action: 'confirm' }]])
    assert.deepEqual(h.changed, [response])
    assert.equal(h.props.detail, response)
    assert.equal(h.modal().props.isOpen, false)
  })
})

test('return reason modal is the only confirmation; invalid reason is blocked and final return is single-flight', async () => {
  const h = confirmationHarness(); const calls = []
  let release; const gate = new Promise(resolve => { release = resolve })
  await h.withApi(async (...args) => { calls.push(args); await gate; return { ...h.props.detail, file_review: { ...h.props.detail.file_review, status: 'rejected', reason: 'ファイルが不鮮明', detail: '再撮影してください。' }, workflow_state: { code: 'returned' } } }, async () => {
    h.open('差し戻す')
    assert.equal(calls.length, 0)
    assert.equal(h.nodes().filter(node => node.props.isOpen === true).length, 1)
    assert.equal(h.modal().props.title, '資料を差し戻しますか？')
    assert.equal(h.modal().props.description, '担当者に修正・再提出を依頼します。')
    let final = h.footer().find(button => reviewText(button) === '差し戻しを確定')
    assert.match(final.props.className, /dc-review-destructive/)
    assert.equal(final.props.disabled, true)
    h.submit(); await h.flush()
    assert.equal(calls.length, 0)
    assert.match(reviewText(h.form()), /差し戻し理由を選択してください。/)
    h.setReason('ファイルが不鮮明'); h.setExplanation('  再撮影してください。  ')
    final = h.footer().find(button => reviewText(button) === '差し戻しを確定')
    assert.equal(final.props.disabled, false)
    const finalForm = h.form()
    finalForm.props.onSubmit({ preventDefault() {} }); finalForm.props.onSubmit({ preventDefault() {} })
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0], [49, 824, { source: 'received', file_id: 12, action: 'return', reason: 'ファイルが不鮮明', detail: '再撮影してください。' }])
    assert.ok(h.footer().every(button => button.props.disabled))
    assert.equal(h.modal().props.dismissible, false)
    h.footer()[0].props.onClick(); h.modal().props.onClose()
    assert.equal(h.modal().props.isOpen, true)
    assert.equal(h.props.detail.file_review.status, 'pending_review')
    release(); await h.flush()
    assert.equal(h.modal().props.isOpen, false)
    assert.equal(h.changed.length, 1)
    assert.equal(h.props.detail.file_review.status, 'rejected')
  })
})

for (const action of ['確認済みにする', '差し戻す']) test(`save failure keeps ${action} modal open with inline error and no business-state change`, async () => {
  const h = confirmationHarness(); let calls = 0
  const before = structuredClone(h.props.detail)
  await h.withApi(async () => { calls++; throw new Error('Network Error') }, async () => {
    h.open(action)
    if (action === '差し戻す') { h.setReason('その他'); h.setExplanation('再提出が必要です。') }
    h.submit(); await h.flush()
    assert.equal(calls, 1)
    assert.equal(h.modal().props.isOpen, true)
    assert.equal(h.modal().props.dismissible, true)
    assert.match(reviewText(h.form()), /保存に失敗しました。再度お試しください。/)
    assert.ok(h.nodes().some(node => node.props.role === 'alert'))
    assert.deepEqual(h.props.detail, before)
    assert.equal(h.changed.length, 0)
    assert.equal(h.footer()[0].props.disabled, false)
    h.modal().props.onClose()
    assert.equal(h.modal().props.isOpen, false)
  })
})

test('confirmation is bound to the opened version and fails closed after capability revocation', async () => {
  const h = confirmationHarness(); let calls = 0
  await h.withApi(async () => { calls++; return h.props.detail }, async () => {
    h.open('確認済みにする')
    h.props.detail = { ...h.props.detail, file_review: { ...h.props.detail.file_review, id: 13, version: 2 } }
    assert.match(reviewText(h.form()), /v1/)
    h.submit(); await h.flush()
    assert.equal(calls, 0)
    assert.match(reviewText(h.form()), /対象のファイルが更新されています。/)
    h.modal().props.onClose(); h.open('確認済みにする')
    assert.match(reviewText(h.form()), /v2/)
    h.props.detail = { ...h.props.detail, capabilities: {} }
    assert.equal(h.footer()[1].props.disabled, true)
    h.submit(); await h.flush()
    assert.equal(calls, 0)
    assert.match(reviewText(h.form()), /権限がありません/)
  })
})

test('canceling return preserves pending state without review or history writes', async () => {
  const h = confirmationHarness(); let calls = 0
  await h.withApi(async () => { calls++; return h.props.detail }, async () => {
    h.open('差し戻す'); h.setReason('最新版が必要')
    h.footer()[0].props.onClick(); await h.flush()
    assert.equal(h.modal().props.isOpen, false)
    assert.equal(calls, 0)
    assert.equal(h.changed.length, 0)
    assert.equal(h.props.detail.file_review.status, 'pending_review')
  })
})

test('review dialog styling is scoped and does not inherit page padding or clip narrow titles', () => {
  const css = readFileSync(resolve('src/features/document-collection/components/fileReviewDialog.css'), 'utf8')
  assert.match(css, /\.dc-preview\.dc-file-review-dialog\s*\{\s*padding: 0;/)
  assert.match(css, /\.dc-file-review-dialog h3[^}]*white-space: normal/)
  assert.match(css, /\.dc-review-destructive[^}]*background: var\(--dc-danger\)/)
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b|gradient\(|z-index/)
})
