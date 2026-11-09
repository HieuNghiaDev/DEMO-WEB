import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { compileFunction } from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const requireExternal = createRequire(import.meta.url)
await requireExternal('i18next').use(requireExternal('react-i18next').initReactI18next).init({ lng: 'ja', initImmediate: false, resources: { ja: { translation: { documentCollection: { editor: { closeDetail: '閉じる' } } } } } })
const modules = new Map()
function loadModule(path) {
  if (modules.has(path)) return modules.get(path).exports
  const module = { exports: {} }
  modules.set(path, module)
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText.replaceAll('import.meta.env', '({})')
  const requireModule = specifier => {
    if (specifier.endsWith('.css')) return {}
    // Server-render the existing portal contents for structural assertions only;
    // this does not emulate browser layout, motion, focus or click behavior.
    if (specifier === 'react-dom') return { ...requireExternal(specifier), createPortal: children => children }
    if (!specifier.startsWith('.')) return requireExternal(specifier)
    const base = resolve(dirname(path), specifier)
    const file = extname(base) ? base : [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(existsSync)
    assert.ok(file, `module exists: ${specifier}`)
    return loadModule(file)
  }
  compileFunction(compiled, ['exports', 'require', 'module'], { filename: path })(module.exports, requireModule, module)
  return module.exports
}
const TasksPanel = loadModule(resolve('src/features/case-workspace/TasksPanel.tsx')).default
const TaskDrawer = loadModule(resolve('src/features/case-workspace/TaskDetailDrawer.tsx')).default
const WorkflowBadge = loadModule(resolve('src/features/document-collection/components/RequiredWorkflowBadge.tsx')).default
const BasicInfo = loadModule(resolve('src/features/document-collection/components/RequiredDocumentBasicInfo.tsx')).default
const RelatedTask = loadModule(resolve('src/features/document-collection/components/RequiredDocumentRelatedTask.tsx')).default
const flags = { can_accept: false, can_submit: false, can_reassign: false, can_change_deadline: false, can_approve: false, can_reject: false, can_cancel: false }
const file = version => ({ id: version, version, filename: `actual_v${version}.pdf`, source_type: 'manual_upload', external_url: 'https://drive.google.com/file/d/file123/view', mime_type: 'application/pdf', review_status: 'pending_review', submitted_at: '2026-10-08T10:00:00Z', submitted_by: { id: 1, name: 'Real uploader' } })
const task = extra => ({ id: 1, title: 'Actual task', description: 'Actual description', case_document_id: 823, created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-08T10:00:00Z', status: 'in_progress', assigned_employee: { id: 1, full_name: 'Real employee' }, due_at: '2026-10-22T10:00:00Z', is_overdue: false, case_document: { id: 823, title: 'Actual document', document_type: { code: 'C-001', name_ja: '委任契約書', handling_type: 'office_generated' } }, submissions: [], latest_submission: null, allowed_actions: flags, ...extra })
const handlers = { onUpdate: async () => true, onAccept: async () => true, onSubmit: async () => true, onGenerate: () => {}, onApprove: async () => true, onReject: async () => true, onCancel: async () => true }
function drawer(row, overrides = {}) {
  const oldDocument = globalThis.document
  globalThis.document = { body: {} }
  try { return renderToStaticMarkup(React.createElement(TaskDrawer, { task: row, caseId: 49, activities: [], canManage: false, canReview: false, working: false, onClose: () => {}, ...handlers, ...overrides })) }
  finally { globalThis.document = oldDocument }
}

test('task rows are compact read-only table cells with real identity and no editing inputs', () => {
  const html = renderToStaticMarkup(React.createElement(TasksPanel, { caseId: 49, tasks: [task()], activities: [], canManage: false, canReview: false, working: false, onAdd: () => {}, onRetry: () => {}, ...handlers }))
  const body = html.match(/<tbody>(.*?)<\/tbody>/s)[1]
  assert.match(body, /Actual task/)
  assert.match(body, /委任契約書/)
  assert.match(body, /C-001/)
  assert.doesNotMatch(body, /<select|type="date|type="datetime/)
  assert.doesNotMatch(html, /type="checkbox"|is-check|件を選択中/)
  assert.equal((body.match(/<td\b/g) ?? []).length, 7)
  assert.match(body, /^<tr[^>]*><td class="is-document">/)
  assert.match(body, /タスク詳細を開く/)
  assert.doesNotMatch(html, /自分のタスク|タスクを追加/)
  assert.match(html, /表示件数/)
})

test('an unaccepted employee task offers acceptance without management or review actions', () => {
  const html = drawer(task({ status: 'unaccepted', allowed_actions: { ...flags, can_accept: true } }))
  assert.match(html, /対応を開始/)
  assert.match(html, /この資料の対応を開始し、担当者として処理を行います。/)
  assert.match(html, /aria-describedby="task-start-help-1"/)
  assert.doesNotMatch(html, /受領する|>作業<|チームに通知/)
  assert.doesNotMatch(html, /担当者を変更|期限を変更|承認する|差し戻す/)
  assert.match(html, /cm-task-detail-drawer/)
  assert.match(html, /タスク詳細/)
})

test('start handling respects task state, permissions and busy state without duplicating actions', () => {
  assert.doesNotMatch(drawer(task({ status: 'unaccepted' })), /対応を開始/)
  for (const status of ['in_progress', 'pending_review', 'changes_requested', 'completed', 'cancelled']) {
    const html = drawer(task({ status, accepted_at: '2026-10-09T02:20:00Z', allowed_actions: { ...flags, can_accept: true } }))
    assert.doesNotMatch(html, /対応を開始/)
    assert.match(html, /対応開始日時/)
    assert.match(html, /Real employee/)
    assert.doesNotMatch(html, />作業</)
  }
  const busy = drawer(task({ status: 'unaccepted', allowed_actions: { ...flags, can_accept: true } }), { working: true })
  assert.match(busy, /aria-busy="true" aria-describedby="task-start-help-1"/)
  assert.match(busy, /disabled=""/)
  assert.equal((busy.match(/>対応を開始</g) ?? []).length, 1)
})

test('task file rows reuse compact file identities, version pills and semantic review statuses', () => {
  const html = drawer(task({ latest_submission: file(2), submissions: [file(1), file(2)] }))
  assert.match(html, /dc-compact-file-type is-pdf/)
  assert.match(html, /dc-compact-file-version/)
  assert.match(html, /dc-compact-file-status is-pending_review/)
  assert.match(html, /Real uploader/)
  assert.match(html, /バージョン履歴を見る/)
  assert.match(html, /プレビュー/)
  assert.doesNotMatch(html, /cm-task-version|cm-task-file-identity/)
})

test('working/rejected employee tasks retain upload and supported generation', () => {
  for (const status of ['in_progress', 'changes_requested']) {
    const html = drawer(task({ status, allowed_actions: { ...flags, can_submit: true }, latest_submission: status === 'changes_requested' ? { ...file(1), review_status: 'rejected', review_note: 'Actual rejection reason' } : null }))
    assert.match(html, /ファイルをアップロード/)
    assert.match(html, /自動作成/)
    if (status === 'changes_requested') assert.match(html, /Actual rejection reason/)
  }
})

test('unsupported documents never show an auto-generation action', () => {
  const html = drawer(task({ case_document: { document_type: { code: 'C-002', name_ja: '委任状', handling_type: 'collected' } }, allowed_actions: { ...flags, can_submit: true } }))
  assert.doesNotMatch(html, /自動作成/)
  assert.match(html, /ファイルをアップロード/)
})

test('pending-review employees see a wait message and exact submitted filenames', () => {
  const html = drawer(task({ status: 'pending_review', latest_submission: file(2), submissions: [file(1), file(2)] }))
  assert.match(html, /提出したファイルは管理者の確認待ちです/)
  assert.match(html, /actual_v1.pdf/)
  assert.match(html, /actual_v2.pdf/)
  assert.doesNotMatch(html, /承認する|差し戻す/)
})

test('management/review controls require backend allowed_actions and current capabilities', () => {
  const allowed = { ...flags, can_reassign: true, can_change_deadline: true, can_approve: true, can_reject: true, can_cancel: true }
  const row = task({ status: 'pending_review', latest_submission: file(2), submissions: [file(2)], allowed_actions: allowed })
  const authorized = drawer(row, { canManage: true, canReview: true })
  assert.match(authorized, /担当者を変更|期限を変更/)
  assert.match(authorized, /承認する/)
  assert.match(authorized, /差し戻す/)
  const unauthorized = drawer(row)
  assert.doesNotMatch(unauthorized, /担当者を変更|期限を変更|承認する|差し戻す|タスクをキャンセル/)
})

test('completed tasks keep approved file information and do not offer status editing', () => {
  const approved = { ...file(1), review_status: 'approved' }
  const html = drawer(task({ status: 'completed', latest_submission: approved, submissions: [approved] }), { canManage: true, canReview: true })
  assert.match(html, /actual_v1.pdf/)
  assert.match(html, /完了/)
  assert.doesNotMatch(html, /<select|ファイルをアップロード|承認する|差し戻す/)
})

test('an authorized related task opens the existing drawer on its actual list page', () => {
  const oldDocument = globalThis.document
  globalThis.document = { body: {} }
  try {
    const rows = Array.from({ length: 15 }, (_, index) => task({ id: index + 1, title: `Task ${index + 1}`, updated_at: null }))
    const html = renderToStaticMarkup(React.createElement(TasksPanel, { caseId: 49, tasks: rows, activities: [], canManage: false, canReview: false, working: false, initialTaskId: 1, onAdd: () => {}, onRetry: () => {}, ...handlers }))
    assert.match(html, /class="is-selected"/)
    assert.match(html, /aria-label="Task 1のタスク詳細を開く" aria-expanded="true"/)
    assert.match(html, /15件中11–15件を表示/)
    assert.match(html, /cm-task-detail-drawer/)
  } finally { globalThis.document = oldDocument }
})

test('an unauthorized requested task ID cannot mount a drawer from another source', () => {
  const html = renderToStaticMarkup(React.createElement(TasksPanel, { caseId: 49, tasks: [task()], activities: [], canManage: false, canReview: false, working: false, initialTaskId: 999, onAdd: () => {}, onRetry: () => {}, ...handlers }))
  assert.doesNotMatch(html, /cm-task-detail-drawer/)
})

test('inconsistent pending submission metadata does not expose review actions', () => {
  for (const latest_submission of [null, { ...file(2), case_task_id: 999 }, { ...file(2), case_document_id: 999 }]) {
    const html = drawer(task({ status: 'pending_review', latest_submission, allowed_actions: { ...flags, can_approve: true, can_reject: true } }), { canManage: true, canReview: true })
    assert.match(html, /確認対象の提出ファイルを取得できませんでした/)
    assert.doesNotMatch(html, /承認する|差し戻す/)
  }
})

test('required workflow badges keep their labels and indicators in all display contexts', () => {
  const labels = { selected: '選定済み', unaccepted: '未受領', in_progress: '対応中', pending_review: '確認待ち', changes_requested: '差戻し', completed: '完了', cancelled: 'キャンセル' }
  for (const [status, label] of Object.entries(labels)) {
    const html = renderToStaticMarkup(React.createElement(WorkflowBadge, { status }))
    assert.match(html, new RegExp(`data-status="${status}"`))
    assert.ok(html.includes(label))
    assert.match(html, /aria-hidden="true"/)
    assert.doesNotMatch(html, /<button/)
  }
})

test('document basic info and related task use the same pending badge without review buttons', () => {
  const active = { id: 1, status: 'pending_review', due_at: '2026-10-22', is_overdue: false, assigned_employee: { id: 1, display_name: 'Real employee' } }
  const detail = { active_task: active, necessity: { status: 'required' }, collection: { response_deadline: null }, created_at: null, updated_at: null }
  const basic = renderToStaticMarkup(React.createElement(BasicInfo, { detail, title: '委任状', code: 'C-002', method: '依頼者から回収', status: { key: 'pending_review', label: '確認待ち' } }))
  const related = renderToStaticMarkup(React.createElement(RelatedTask, { task: active, taskDetails: task(), onOpen: () => {} }))
  for (const html of [basic, related]) {
    assert.match(html, /data-status="pending_review"/)
    assert.doesNotMatch(html, /承認する|差し戻す/)
  }
  assert.match(related, /タスクを開く/)
  assert.match(related, /関連タスク T-1 を開く/)
  const hidden = renderToStaticMarkup(React.createElement(RelatedTask, { task: null, taskDetails: task() }))
  assert.equal(hidden, '')
})

test('completed/cancelled related task deadlines do not infer overdue from a past date', () => {
  for (const status of ['completed', 'cancelled']) {
    const html = renderToStaticMarkup(React.createElement(RelatedTask, { task: { id: 1, status, due_at: '2020-01-01', is_overdue: false, assigned_employee: null } }))
    assert.doesNotMatch(html, /is-overdue/)
    assert.match(html, new RegExp(`data-status="${status}"`))
  }
})

test('basic information preserves assignment/deadline edits and unique acquisition metadata without a work card', () => {
  const detail = { active_task: { id: 1, status: 'in_progress', due_at: '2026-10-22', assigned_employee: { id: 1, display_name: 'Real employee' } }, necessity: { status: 'required' }, fulfillment_status: 'undetermined', collection: { status: 'not_started', source: 'Original source', method: 'Unique method', target_person: 'Target person', target_period_from: '2026-01-01', target_period_to: '2026-09-30', target_scope: 'Unique required scope' } }
  const props = { detail, title: '本人確認資料', code: 'C-003', method: '依頼者から回収', status: { key: 'in_progress', label: '対応中' } }
  const html = renderToStaticMarkup(React.createElement(BasicInfo, { ...props, onEditTask() {}, onEditAcquisition() {}, onChangeCollection() {}, onChangeFulfillment() {} }))
  for (const label of ['担当者', '回答期限', '期限を設定', '取得情報を編集', 'Original source', 'Unique method', 'Target person', 'Unique required scope', '2026/01/01', '2026/09/30', '収集状況', '内容充足']) assert.ok(html.includes(label), label)
  assert.equal((html.match(/>変更<\/button>/g) ?? []).length, 2)
  assert.doesNotMatch(html, /is-work|担当・期限を変更|取得情報を確認/)
  const readonly = renderToStaticMarkup(React.createElement(BasicInfo, props))
  assert.doesNotMatch(readonly, /<button/)
  assert.match(readonly, /Unique required scope/)
})

test('both required-document inspectors remove work navigation and keep file operations inside files', () => {
  for (const file of ['src/features/document-collection/components/RequiredDocumentInspector.tsx', 'src/features/document-creation/components/C001DocumentReviewDrawer.tsx']) {
    const source = readFileSync(resolve(file), 'utf8')
    assert.doesNotMatch(source, /is-work|<h3>作業<\/h3>|\['work', '作業'\]|tab === 'work'|取得情報を確認|担当・期限を変更/)
    assert.match(source, /\['overview', '概要'\], \['files', 'ファイル'\], \['history', '履歴'\]/)
    assert.match(source, /<RequiredDocumentBasicInfo[^>]+onEditTask=/)
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    let uploads = 0, reviews = 0, creationActions = 0
    function walk(node, inFiles = false) {
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'section') {
        const className = node.openingElement.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.text === 'className')
        inFiles ||= className?.initializer && ts.isStringLiteral(className.initializer) && className.initializer.text.split(' ').includes('is-files')
      }
      if (ts.isJsxSelfClosingElement(node)) {
        const name = node.tagName.getText(ast)
        if (['ReceivedDocumentRegistration', 'FileReviewActions', 'GenerationActions'].includes(name)) {
          assert.ok(inFiles, `${name} must be inside files: ${file}`)
          if (name === 'ReceivedDocumentRegistration') uploads++
          if (name === 'FileReviewActions') reviews++
          if (name === 'GenerationActions') creationActions++
        }
      }
      if (ts.isJsxExpression(node) && node.expression?.getText(ast) === 'fileEditAction') {
        assert.ok(inFiles, `C-001 edit must be inside files: ${file}`)
        creationActions++
      }
      ts.forEachChild(node, child => walk(child, inFiles))
    }
    walk(ast)
    assert.ok(uploads >= 2)
    assert.equal(creationActions, 2)
    if (file.includes('RequiredDocumentInspector')) assert.equal(reviews, 2)
  }
  const css = readFileSync(resolve('src/features/document-collection/documentCollection.css'), 'utf8')
  assert.match(css, /\.dc-required-drawer-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(3,/)
})

test('required drawers and editor no longer dispatch a second approval/rejection workflow', () => {
  for (const file of ['src/features/document-collection/components/RequiredDocumentInspector.tsx', 'src/features/document-creation/components/C001DocumentReviewDrawer.tsx', 'src/features/document-creation/DocumentEditorPage.tsx']) {
    const source = readFileSync(resolve(file), 'utf8')
    assert.doesNotMatch(source, /documentDraftStore\.approve|documentDraftStore\.rejectC001|review_status: reviewStatus/)
  }
})
