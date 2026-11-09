import assert from 'node:assert/strict'
import test from 'node:test'
import { performStepUp, AuthFailure, MutationUncertain } from '../src/features/authentication/authFlow.ts'

test('password reset verifies the exact target before the one-time mutation', async () => {
  const calls = []
  const operation = { action: 'employee.reset_password', scope: { user_id: 200, employee_id: 100 } }
  const value = await performStepUp(async (path, payload) => {
    calls.push({ path, payload })
    return { status: 200, data: { verified: true, action: 'employee.reset_password', expires_in: 300 } }
  }, operation, 'SYNTHETIC PASSWORD', '123456', async () => {
    assert.equal(calls.length, 1)
    return 'synthetic handover'
  }, () => true)
  assert.equal(value, 'synthetic handover')
  assert.deepEqual(calls[0].payload.scope, { user_id: 200, employee_id: 100 })
  assert.equal(calls[0].path, '/mfa/step-up')
})

test('reset proof denial never invokes password mutation', async () => {
  let mutations = 0
  await assert.rejects(performStepUp(async () => ({ status: 403, data: {} }),
    { action: 'employee.reset_password', scope: { user_id: 200, employee_id: 100 } },
    'SYNTHETIC PASSWORD', '123456', async () => { mutations++ }, () => true), AuthFailure)
  assert.equal(mutations, 0)
})

test('uncertain reset handover is not automatically submitted twice', async () => {
  let mutations = 0
  await assert.rejects(performStepUp(async () => ({ status: 200, data: {
    verified: true, action: 'employee.reset_password', expires_in: 300,
  } }), { action: 'employee.reset_password', scope: { user_id: 200, employee_id: 100 } },
  'SYNTHETIC PASSWORD', '123456', async () => { mutations++; throw new Error('synthetic network failure') }, () => true), MutationUncertain)
  assert.equal(mutations, 1)
})
