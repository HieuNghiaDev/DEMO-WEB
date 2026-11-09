import assert from 'node:assert/strict'
import test from 'node:test'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadTypeScript, productionArrow } from './helpers/loadTypeScript.mjs'

const feature = name => resolve('src/features/internal-chat', name)
const { editMentions, mentionQuery, trimmedMentions } = loadTypeScript(feature('chatMentions.ts'))
const mention = { type: 'user', user_id: 7, start: 3, end: 11 }
const text = '📎 @受信者 テスト 確認'

test('mention suggestions use the caret, exclude email addresses and do not reopen an inserted mention', () => {
  assert.deepEqual(mentionQuery('hello @受信', 9, []), { start: 6, end: 9, search: '受信' })
  assert.deepEqual(mentionQuery('@', 1, []), { start: 0, end: 1, search: '' })
  assert.equal(mentionQuery('user@example.com', 16, []), null)
  assert.equal(mentionQuery(text, 9, [mention]), null)
  assert.equal(mentionQuery('hello\nordinary text', 19, []), null)
})

test('draft edits shift structured user IDs and remove only mentions whose labels were changed', () => {
  assert.deepEqual(editMentions(text, 'Hi '+text, [mention]), [{ ...mention, start: 6, end: 14 }])
  assert.deepEqual(editMentions(text, text+'!', [mention]), [mention])
  assert.deepEqual(editMentions(text, text.replace('テスト', '変更'), [mention]), [])
  assert.deepEqual(editMentions(text, '', [mention]), [])
  assert.deepEqual(trimmedMentions('  '+text+'  ', [{ ...mention, start: 5, end: 13 }]), [mention])
})

test('mention Enter selects instead of sending, arrows move selection, Escape closes, and IME stays untouched', () => {
  let selected, sent = 0, prevented = 0, active = 0, dismissed
  const candidates = [{ user_id: 7 }, { user_id: 8 }]
  const bindings = {
    pickerOpen: true, candidates, activeIndex: 0, queryKey: '@', canSend: true,
    chooseMember: member => { selected = member }, onSend: () => sent++,
    setActiveMember: index => { active = index }, setDismissed: key => { dismissed = key },
  }
  const handler = productionArrow(readFileSync(feature('ChatComposer.tsx'), 'utf8'), 'onKeyDown', bindings)
  const event = key => ({ key, shiftKey: false, nativeEvent: { isComposing: false }, preventDefault: () => prevented++ })
  handler(event('Enter'))
  assert.equal(selected, candidates[0]); assert.equal(sent, 0)
  handler(event('ArrowDown')); assert.equal(active, 1)
  handler(event('Escape')); assert.equal(dismissed, '@')
  handler({ ...event('Enter'), nativeEvent: { isComposing: true } }); assert.equal(prevented, 3)
  const ordinary = productionArrow(readFileSync(feature('ChatComposer.tsx'), 'utf8'), 'onKeyDown', { ...bindings, pickerOpen: false })
  ordinary(event('Enter')); assert.equal(sent, 1)
})

test('mention API uses authenticated search, structured IDs, and multipart fields alongside attachments', async () => {
  const requests = []
  const api = loadTypeScript(feature('api.ts'), new Map([[resolve('src/services/api.ts'), {
    get: async (...args) => { requests.push(args); return { data: { members: [] } } },
    post: async (...args) => { requests.push(args); return { data: { message: { id: 9 } } } },
  }]]))
  const { signal } = new AbortController()
  await api.fetchChatMentionMembers('受信', signal)
  assert.deepEqual(requests[0], ['/internal-chat/members', { params: { q: '受信' }, signal, timeout: 12000 }])
  await api.sendChatMessage(text, 'idempotent-key', signal, undefined, [], [mention])
  assert.deepEqual(requests[1][1].mentions, [mention])
  await api.sendChatMessage(text, 'file-key', signal, undefined, [new File(['pdf'], 'file.pdf')], [mention])
  assert.equal(requests[2][1].get('mentions[0][user_id]'), '7')
  assert.equal(requests[2][1].get('mentions[0][start]'), '3')
  assert.equal(requests[2][1].get('attachments[]').name, 'file.pdf')
})

test('message markup highlights validated original names without HTML injection or translation rewriting', () => {
  const MentionText = loadTypeScript(feature('ChatMentionText.tsx')).default
  const html = renderToStaticMarkup(React.createElement(MentionText, { text: text+' <script>', mentions: [{ ...mention, name: '受信者 テスト' }] }))
  assert.match(html, /<mark[^>]*>@受信者 テスト<\/mark>/)
  assert.ok(html.includes('&lt;script&gt;'))
  const invalid = renderToStaticMarkup(React.createElement(MentionText, { text, mentions: [{ ...mention, name: 'Forged' }] }))
  assert.doesNotMatch(invalid, /<mark/)
})

test('mention notifications target the shared chat message and reject unsafe IDs', () => {
  const { notificationDestination } = loadTypeScript(resolve('src/components/employee-room/notificationCenterState.ts'))
  assert.deepEqual(notificationDestination({ chat_message_id: 6 }), { chatMessage: 6 })
  for (const id of [-1, 0, 1.5, '6', Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(notificationDestination({ chat_message_id: id }).chatMessage, undefined)
  }
})
