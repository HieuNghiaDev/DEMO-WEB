import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')

test('document interfaces use the shared legal approval notice and have no C-001 finalization entry', () => {
  for (const file of ['DocumentEditorPage.tsx', 'components/C001DocumentReviewDrawer.tsx']) {
    const code = source(`features/document-creation/${file}`)
    assert.match(code, /LegalApprovalNotice/)
    assert.doesNotMatch(code, /C001FinalApprovalAction|c001FinalApproval/)
  }
  assert.doesNotMatch(source('features/document-creation/documentDraftStore.ts'), /c001\/final-decisions/)
  assert.doesNotMatch(source('features/authentication/authFlow.ts'), /legal\.c001\.final_approve/)
})
