import assert from 'node:assert/strict'
import test from 'node:test'
import { getLoginDestination } from '../src/utils/authNavigation.ts'

test('does not resume either password form after reauthentication', () => {
  for (const pathname of ['/change-password', '/system/password']) {
    assert.equal(getLoginDestination(pathname), '/')
  }
})

test('normalizes transient routes with search, hash, case or trailing slash', () => {
  for (const pathname of ['/login/', '/LOGIN', '/change-password?from=reset', '/system/password/', '/SYSTEM/PASSWORD', '/system/password#form']) {
    assert.equal(getLoginDestination(pathname), '/')
  }
})

test('keeps ordinary workspace routes and settings categories', () => {
  for (const pathname of ['/', '/organization', '/quests', '/visa-progress', '/ai', '/approvals', '/system', '/system?section=security']) {
    assert.equal(getLoginDestination(pathname), pathname)
  }
})

test('temporary passwords always go directly to mandatory password change', () => {
  for (const pathname of ['/', '/login', '/system/password', '/system', '/quests', undefined]) {
    assert.equal(getLoginDestination(pathname, true), '/change-password')
  }
})

test('rejects malformed or external return destinations', () => {
  for (const pathname of [null, undefined, 42, {}, '', 'https://example.test', '//example.test', '/\\example.test']) {
    assert.equal(getLoginDestination(pathname), '/')
  }
})

test('reset -> sign in -> change -> reauthenticate converges to the workspace', () => {
  const resetDestination = getLoginDestination('/system', true)
  assert.equal(resetDestination, '/change-password')
  const returnAfterRevocation = getLoginDestination(resetDestination)
  assert.equal(getLoginDestination(returnAfterRevocation, false), '/')
})

test('voluntary password change and an expired password-page session do not reopen the form', () => {
  const returnAfterRevocation = getLoginDestination('/system/password')
  assert.equal(getLoginDestination(returnAfterRevocation, false), '/')
  // Also handles an old Login history entry made before this fix.
  assert.equal(getLoginDestination('/system/password', false), '/')
})
