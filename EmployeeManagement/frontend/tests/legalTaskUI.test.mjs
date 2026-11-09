import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { compileFunction } from 'node:vm'
import ts from 'typescript'
import * as legalApproval from '../src/features/document-creation/legalApproval.ts'
const external = createRequire(import.meta.url)
const nodes = tree => { const result = []; const visit = node => { if (Array.isArray(node)) node.forEach(visit); else if (node?.props) { result.push(node); visit(node.props.children) } }; visit(tree); return result }

function taskView(pending) {
  const file = { id: 1, version: 1, filename: 'synthetic.pdf', review_status: 'pending_review', submitted_at: null, source_type: pending ? 'auto_generated' : 'manual_upload' }
  const task = { id: 1, title: 'Synthetic', description: null, status: 'pending_review', latest_submission: file, submissions: [file], assigned_employee: null,
    allowed_actions: { can_approve: true, can_reject: true, legal_approval_pending: pending } }
  const source = readFileSync(new URL('../src/features/case-workspace/TaskDetailDrawer.tsx', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  compileFunction(code, ['require', 'exports', 'module'])(specifier => {
    if (specifier === 'react') return { useState: initial => [initial, () => {}], useRef: initial => ({ current: initial }), useEffect() {} }
    if (specifier.endsWith('/legalApproval')) return legalApproval
    if (specifier.endsWith('/taskPresentation')) return { currentPendingTaskSubmission: task => task.latest_submission, taskHistory: () => [], taskDocumentName: task => task.title, canGenerateTaskDocument: () => false }
    if (specifier.endsWith('/useDrawerDismiss')) return { useDrawerDismiss: onClose => ({ close: onClose, closing: false }) }
    if (specifier.endsWith('/utils')) return { formatDate: () => '—' }
    if (specifier.endsWith('/Button')) return { Button: 'Button' }
    if (specifier.endsWith('/UserAvatar')) return { UserAvatar: 'UserAvatar' }
    if (specifier === 'react/jsx-runtime' || specifier === 'lucide-react') return external(specifier)
    return { __esModule: true, default: specifier.split('/').at(-1) }
  }, module.exports, module)
  return nodes(module.exports.default({ task, caseId: 1, activities: [], canManage: false, canReview: true, working: false, onClose() {} }))
}

test('generated-linked task explains policy pending and cannot open either decision even with stale true flags', () => {
  const view = taskView(true)
  assert.ok(view.some(node => node.type === 'LegalApprovalNotice'))
  const labels = view.filter(node => node.type === 'Button').map(node => node.props.children)
  assert.ok(!labels.includes('承認する') && !labels.includes('差し戻す'))
  assert.ok(labels.includes('ファイルを確認'), 'Read-only file operation must remain')
  assert.ok(view.some(node => node.type === 'DocumentFileCard'), 'File metadata/preview row must remain')
})
test('manual internal review retains both decision buttons and file inspection', () => {
  const view = taskView(false)
  assert.ok(!view.some(node => node.type === 'LegalApprovalNotice'))
  const labels = view.filter(node => node.type === 'Button').map(node => node.props.children)
  assert.ok(labels.includes('承認する') && labels.includes('差し戻す'))
  assert.ok(labels.includes('ファイルを確認'))
})
test('creation state consumes backend policy pending without synthesizing authority from user role', async () => {
  const source = readFileSync(new URL('../src/features/document-creation/documentDraftStore.ts', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  let response = { supported: true, template: null, document: null, permissions: { can_approve: false, legal_approval_pending: true } }
  compileFunction(code, ['require', 'exports', 'module'])(specifier => {
    if (specifier.endsWith('/services/api')) return { __esModule: true, default: { get: async () => ({ data: response }) } }
    if (specifier === 'axios') return external(specifier)
    if (specifier === './documentPdf') return { pdfFilename: () => 'synthetic.pdf' }
    throw new Error(`Unexpected dependency: ${specifier}`)
  }, module.exports, module)
  assert.deepEqual((await module.exports.documentDraftStore.load({ caseId: 1, documentId: 1 })).permissions, { canApprove: false, legalApprovalPending: true })
  response = { supported: true, template: null, document: null }
  assert.deepEqual((await module.exports.documentDraftStore.load({ caseId: 1, documentId: 1 })).permissions, { canApprove: false, legalApprovalPending: false })
})
