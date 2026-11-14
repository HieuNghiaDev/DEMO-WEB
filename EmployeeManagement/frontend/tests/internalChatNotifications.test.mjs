import assert from 'node:assert/strict'
import test from 'node:test'
import { chatAlertFor, listenForChatAudioGesture, notifyIncomingChat, setChatNotificationEnabled } from '../src/features/internal-chat/chatNotifications.ts'

const mention = user_id => ({ type: 'user', user_id })

test('alert targets the last personal mention and ignores own, recalled and already handled messages', () => {
  assert.deepEqual(chatAlertFor([
    { id: 2, mentions: [mention(1)] },
    { id: 3, is_mine: true, mentions: [mention(1)] },
    { id: 4, mentions: [mention(1)] },
    { id: 5, recalled_at: 'now', mentions: [mention(1)] },
    { id: 6, mentions: [mention(2)] },
  ], 1, 2), { latestId: 6, targetId: 4, mention: true })
  assert.equal(chatAlertFor([{ id: 6 }], 1, 6), null)
})

test('muting ordinary chat leaves personal mention sound enabled and keeps system notifications private', async (t) => {
  const settings = new Map()
  const shown = []
  const notes = []
  const browser = new EventTarget()
  const page = { visibilityState: 'visible', hasFocus: () => true }
  class TestAudio {
    state = 'running'
    currentTime = 0
    createOscillator() {
      return { frequency: {}, connect: volume => volume, start: () => notes.push('note'), stop() {} }
    }
    createGain() {
      return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }
    }
    async close() {}
  }
  Object.assign(browser, { AudioContext: TestAudio, isSecureContext: true, Notification: {} })
  const globals = {
    window: browser, document: page, AudioContext: TestAudio, Notification: { permission: 'granted' },
    localStorage: { getItem: key => settings.get(key), setItem: (key, value) => settings.set(key, value) },
    navigator: { serviceWorker: { register: async () => ({
      active: true, showNotification: async (title, options) => shown.push({ title, ...options }),
    }) } },
  }
  let stop
  t.after(() => stop?.())
  for (const [key, value] of Object.entries(globals)) {
    const prior = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { value, configurable: true })
    t.after(() => prior ? Object.defineProperty(globalThis, key, prior) : delete globalThis[key])
  }
  stop = listenForChatAudioGesture()
  browser.dispatchEvent(new Event('pointerdown'))
  const signal = new AbortController().signal
  setChatNotificationEnabled(8, 'sound', false)
  await notifyIncomingChat(8, [{ id: 9 }], true, signal)
  assert.equal(notes.length, 0)
  await notifyIncomingChat(8, [{ id: 10, mentions: [mention(8)] }], true, signal)
  assert.equal(notes.length, 2)
  assert.equal(shown.length, 0)

  setChatNotificationEnabled(8, 'system', true)
  page.visibilityState = 'hidden'
  await notifyIncomingChat(8, [{ id: 11, original_text: 'private text' }], false, signal)
  await notifyIncomingChat(8, [{ id: 11 }], false, signal)
  await notifyIncomingChat(8, [{ id: 12, mentions: [mention(8)] }], false, signal)
  assert.deepEqual(shown.map(({ body, silent, renotify, data }) => ({ body, silent, renotify, data })), [
    { body: '新しいメッセージがあります。', silent: true, renotify: false, data: { messageId: 11 } },
    { body: 'あなた宛てのメンションがあります。', silent: false, renotify: true, data: { messageId: 12 } },
  ])
})
