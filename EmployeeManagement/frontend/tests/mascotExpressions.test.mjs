import assert from 'node:assert/strict'
import test from 'node:test'
import { canTrackMascotPointer, getMascotGaze, mascotMouth, resolveMascotExpression, MASCOT_SLEEP_DELAY, MASCOT_FEEDBACK_DURATION } from '../src/components/ai/mascotExpressions.ts'

test('six expressions have independent facial geometry', () => {
  assert.equal(Object.keys(mascotMouth).length, 6)
  assert.equal(new Set(Object.values(mascotMouth)).size, 6)
})
test('AI feedback takes precedence over hover and inactivity', () => {
  for (const state of ['thinking', 'happy', 'sad']) {
    assert.equal(resolveMascotExpression(state, true, true), state)
  }
})
test('pointer or keyboard attention wakes sleepy idle mascot', () => {
  assert.equal(resolveMascotExpression('idle', false, true), 'sleepy')
  assert.equal(resolveMascotExpression('idle', true, true), 'hover')
  assert.equal(resolveMascotExpression('idle', false, false), 'idle')
})
test('eye movement remains small and returns to center outside the near zone', () => {
  assert.deepEqual(getMascotGaze(0, 0), { x: 0, y: 0 })
  assert.deepEqual(getMascotGaze(161, 0), { x: 0, y: 0 })
  for (let x = -160; x <= 160; x += 10) {
    for (let y = -160; y <= 160; y += 10) {
      const gaze = getMascotGaze(x, y)
      assert.ok(Math.hypot(gaze.x, gaze.y) <= 3.50001)
    }
  }
  assert.ok(getMascotGaze(30, -30).x > 0)
  assert.ok(getMascotGaze(30, -30).y < 0)
})
test('feedback is temporary and sleep uses real prolonged inactivity', () => {
  assert.equal(MASCOT_FEEDBACK_DURATION.happy, 1500)
  assert.equal(MASCOT_FEEDBACK_DURATION.sad, 2400)
  assert.equal(MASCOT_SLEEP_DELAY, 55000)
})

test('reduced motion, touch and AI expressions disable pointer tracking', () => {
  for (const expression of Object.keys(mascotMouth)) {
    assert.equal(canTrackMascotPointer(expression, true, true), false)
    assert.equal(canTrackMascotPointer(expression, false, false), false)
  }
  for (const expression of ['thinking', 'happy', 'sad', 'sleepy']) {
    assert.equal(canTrackMascotPointer(expression, false, true), false)
  }
  assert.equal(canTrackMascotPointer('idle', false, true), true)
  assert.equal(canTrackMascotPointer('hover', false, true), true)
})
