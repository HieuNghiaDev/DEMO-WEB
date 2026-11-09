import assert from 'node:assert/strict'
import test from 'node:test'
import { canGenerateTaskDocument, currentPendingTaskSubmission, taskDocumentName, taskFilterCounts, taskHistory, taskPage, visibleTaskRows } from '../src/features/case-workspace/taskPresentation.ts'

const task = (id, extra = {}) => ({
  id, title: `Task ${id}`, description: null, status: 'in_progress', is_overdue: false,
  updated_at: `2026-10-${String(id).padStart(2, '0')}T10:00:00Z`, due_at: null,
  assigned_employee: { id: 2, full_name: 'Authorized employee' },
  case_document: { title: '委任契約書', document_type: { code: 'C-001', name_ja: '委任契約書', handling_type: 'office_generated' } },
  allowed_actions: { can_submit: true }, ...extra,
})

test('counts use only the supplied authorized tasks and preserve all backend statuses', () => {
  const tasks = [task(1, { status: 'unaccepted' }), task(2), task(3, { status: 'pending_review' }), task(4, { status: 'changes_requested' }), task(5, { status: 'completed' }), task(6, { status: 'cancelled' })]
  assert.deepEqual(taskFilterCounts(tasks), { all: 6, unaccepted: 1, in_progress: 1, pending_review: 1, changes_requested: 1, completed: 1, cancelled: 1, overdue: 0 })
  assert.equal(taskFilterCounts([tasks[0]]).all, 1)
})

test('search matches task title, document name, and normalized document code', () => {
  const rows = [task(1, { title: '契約書の作成' }), task(2, { title: '給与の取得', case_document: { title: '給与明細', document_type: { code: 'W-003', name_ja: '給与明細' } } })]
  for (const search of ['契約書', 'Ｃ－００１', '  c-001  ']) assert.deepEqual(visibleTaskRows(rows, search, 'all', '', 'updated_desc').map(row => row.id), [1])
  assert.deepEqual(visibleTaskRows(rows, '給与明細', 'all', '', 'updated_desc').map(row => row.id), [2])
  assert.equal(visibleTaskRows(rows, '不存在', 'all', '', 'updated_desc').length, 0)
})

test('overdue filtering trusts the backend flag and does not change task status', () => {
  const active = task(1, { is_overdue: true })
  const completed = task(2, { status: 'completed', due_at: '2020-01-01', is_overdue: false })
  const result = visibleTaskRows([active, completed], '', 'overdue', '', 'updated_desc')
  assert.deepEqual(result.map(row => row.id), [1])
  assert.equal(result[0].status, 'in_progress')
})

test('assignee and status filters combine without introducing visibility rules', () => {
  const rows = [task(1), task(2, { status: 'completed' }), task(3, { assigned_employee: { id: 3, full_name: 'Other authorized employee' } })]
  assert.deepEqual(visibleTaskRows(rows, '', 'in_progress', '2', 'updated_desc').map(row => row.id), [1])
})

test('date sorting is stable, uses real timestamps, keeps missing dates last, and leaves source unchanged', () => {
  const rows = [task(1, { due_at: '2026-10-22' }), task(2, { due_at: '2026-10-12' }), task(3, { updated_at: null })]
  const order = rows.map(row => row.id)
  assert.deepEqual(visibleTaskRows(rows, '', 'all', '', 'deadline_asc').map(row => row.id), [2, 1, 3])
  assert.deepEqual(visibleTaskRows(rows, '', 'all', '', 'deadline_desc').map(row => row.id), [1, 2, 3])
  assert.deepEqual(visibleTaskRows(rows, '', 'all', '', 'updated_asc').map(row => row.id), [1, 2, 3])
  assert.deepEqual(rows.map(row => row.id), order)
})

test('pagination supports 10/20/50, exact counts, and clamps after filtering or deletion', () => {
  const rows = Array.from({ length: 52 }, (_, index) => task(index + 1))
  for (const perPage of [10, 20, 50]) {
    const page = taskPage(rows, 2, perPage)
    assert.equal(page.from, perPage + 1)
    assert.equal(page.to, Math.min(2 * perPage, 52))
    assert.equal(page.total, 52)
    assert.equal(page.rows[0].id, perPage + 1)
  }
  assert.equal(taskPage(rows.slice(0, 2), 99, 10).page, 1)
  assert.deepEqual(taskPage([], 99, 10), { page: 1, pages: 1, rows: [], from: 0, to: 0, total: 0 })
})

test('task history uses the real task metadata ID, not other tasks for the same document', () => {
  const rows = [{ id: 1, occurred_at: '2026-10-01', metadata: { task_id: 1 } }, { id: 2, occurred_at: '2026-10-02', metadata: { case_task_id: 1 } }, { id: 3, occurred_at: '2026-10-03', metadata: { task_id: 2, document_id: 3 } }]
  assert.deepEqual(taskHistory(task(1), rows).map(item => item.id), [2, 1])
})

test('auto-generation requires both an allowed submission action and the supported document', () => {
  assert.equal(canGenerateTaskDocument(task(1)), true)
  assert.equal(canGenerateTaskDocument(task(1, { allowed_actions: { can_submit: false } })), false)
  assert.equal(canGenerateTaskDocument(task(1, { case_document: { document_type: { code: 'W-001', handling_type: 'collected' } } })), false)
  assert.equal(taskDocumentName(task(1, { case_document: null })), 'Task 1')
})

test('review targets only the current pending submission with matching task/document identity', () => {
  const submission = { id: 20, version: 2, review_status: 'pending_review', case_task_id: 1, case_document_id: 823 }
  const current = task(1, { status: 'pending_review', case_document_id: 823, latest_submission: submission })
  assert.equal(currentPendingTaskSubmission(current), submission)
  for (const row of [
    { ...current, status: 'in_progress' },
    { ...current, latest_submission: null },
    { ...current, latest_submission: { ...submission, review_status: 'approved' } },
    { ...current, latest_submission: { ...submission, review_status: 'rejected' } },
    { ...current, latest_submission: { ...submission, case_task_id: 99 } },
    { ...current, latest_submission: { ...submission, case_document_id: 99 } },
  ]) assert.equal(currentPendingTaskSubmission(row), null)
})
