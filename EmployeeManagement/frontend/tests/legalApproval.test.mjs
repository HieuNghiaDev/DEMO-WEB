import test from 'node:test'
import assert from 'node:assert/strict'
import { canReviewAction, legalApprovalPendingMessage, reviewActionError } from '../src/features/document-creation/legalApproval.ts'

test('missing, false and policy-pending capabilities never enable either legal decision', () => {
  for (const flags of [undefined, {}, { can_approve: false, can_reject: false },
    { can_approve: true, can_reject: true, legal_approval_pending: true }]) {
    assert.equal(canReviewAction(flags, 'approve'), false)
    assert.equal(canReviewAction(flags, 'reject'), false)
  }
})
test('explicit ordinary internal review capabilities remain independent', () => {
  assert.equal(canReviewAction({ can_approve: true, can_reject: false }, 'approve'), true)
  assert.equal(canReviewAction({ can_approve: true, can_reject: false }, 'reject'), false)
  assert.equal(canReviewAction({ can_reject: true, legal_approval_pending: false }, 'reject'), true)
})
test('policy pending 409 and stale 403 are explained without exposing raw server errors', () => {
  assert.equal(reviewActionError({ response: { status: 409, data: { code: 'legal_authority_policy_pending' } } }, 'fallback'), legalApprovalPendingMessage)
  assert.match(reviewActionError({ response: { status: 403, data: { message: 'private backend detail' } } }, 'fallback'), /権限/)
  assert.match(reviewActionError({ response: { status: 409 } }, 'fallback'), /再読み込み/)
  assert.equal(reviewActionError(new Error('network'), 'fallback'), 'fallback')
})
