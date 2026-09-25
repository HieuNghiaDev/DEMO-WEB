import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveMascotVisualState, THEMIS_HEAD_ASSET, MASCOT_FEEDBACK_DURATION } from '../src/components/ai/mascotExpressions.ts'

test('activity feedback has priority over expression state', () => {
  assert.equal(resolveMascotVisualState('error', 'happy'), 'error')
  assert.equal(resolveMascotVisualState('success', 'confused'), 'success')
  assert.equal(resolveMascotVisualState('generating', 'idea'), 'generating')
  assert.equal(resolveMascotVisualState('none', 'wink'), 'wink')
})

test('one approved head shell is shared by all face states', () => {
  assert.equal(THEMIS_HEAD_ASSET, '/images/themis-mascot/themis-head-shell.png')
})

test('success and error feedback remain temporary', () => {
  assert.equal(MASCOT_FEEDBACK_DURATION.success, 1500)
  assert.equal(MASCOT_FEEDBACK_DURATION.error, 2400)
})
