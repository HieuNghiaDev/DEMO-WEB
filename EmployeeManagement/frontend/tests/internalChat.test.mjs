import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadTypeScript, productionArrow } from './helpers/loadTypeScript.mjs'

const feature = name => resolve(`src/features/internal-chat/${name}`)
const source = name => readFileSync(feature(name), 'utf8')
const mockChatTransport = [resolve('src/services/api.ts'), {}]

test('chat API uses authenticated shared transport and cursor endpoints without trusted actor fields', async () => {
  const calls = []
  const transport = {
    get: async (...args) => { calls.push(['get', ...args]); return { data: { messages: [], pagination: {}, unread_count: 0 } } },
    post: async (...args) => { calls.push(['post', ...args]); return { data: { message: { id: 1 } } } },
    patch: async (...args) => { calls.push(['patch', ...args]); return { data: { unread_count: 0 } } },
  }
  const api = loadTypeScript(feature('api.ts'), new Map([[resolve('src/services/api.ts'), transport]]))
  const { signal } = new AbortController()
  await api.fetchChatMessages({ afterId: 7, limit: 50 }, signal)
  await api.sendChatMessage('Synthetic text', '00000000-0000-4000-8000-000000000001', signal)
  await api.markChatRead(8, [8], signal)
  await api.markChatDelivered(9, signal)
  assert.equal(calls[0][1], '/internal-chat/messages')
  assert.deepEqual(calls[0][2].params, { after_id: 7, before_id: undefined, limit: 50 })
  assert.deepEqual(calls[1][2], { text: 'Synthetic text', client_message_id: '00000000-0000-4000-8000-000000000001' })
  assert.equal('sender_id' in calls[1][2], false)
  assert.equal(calls[0][2].signal, signal)
  assert.equal(calls[0][2].timeout, 12_000)
  assert.equal(calls[1][3].signal, signal)
  assert.deepEqual(calls[2].slice(1), ['/internal-chat/read', { message_id: 8, visible_ids: [8] }, { signal, timeout: 12_000 }])
  assert.deepEqual(calls[3].slice(1), ['/internal-chat/delivered', { message_id: 9 }, { signal, timeout: 12_000 }])

  await api.sendChatMessage('', 'retry-key', signal, 8, [new File(['synthetic'], 'receipt.pdf')])
  assert.equal(calls[4][2].get('client_message_id'), 'retry-key')
  assert.equal(calls[4][2].get('reply_to_message_id'), '8')
  assert.equal(calls[4][2].get('attachments[]').name, 'receipt.pdf')
  assert.equal(calls[4][3].signal, signal)
  await api.fetchChatAttachment(9, 1, signal)
  assert.equal(calls[5][1], '/internal-chat/messages/9/attachments/1')
  assert.equal(calls[5][2].responseType, 'blob')
  await api.requestChatTranslation(9, 'ja-zh', signal)
  assert.deepEqual(calls[6].slice(1), ['/internal-chat/messages/9/translations', { pair: 'ja-zh' }, { signal, timeout: 12_000 }])
})

test('message merge deduplicates polling and preserves server ordering', () => {
  const replacements = new Map([
    [resolve('src/contexts/AuthContext.tsx'), { useAuth: () => ({ user: null }) }],
    [feature('api.ts'), {}],
  ])
  const { mergeMessages } = loadTypeScript(feature('internalChatState.ts'), replacements)
  const merged = mergeMessages([{ id: 2, original_text: 'old' }, { id: 4 }], [{ id: 2, original_text: 'new' }, { id: 3 }])
  assert.deepEqual(merged.map(item => item.id), [2, 3, 4])
  assert.equal(merged[0].original_text, 'new')
  assert.equal(mergeMessages(merged, []), merged)
})

test('Employee Room and floating drawer share one provider and preserve MY QUEST', () => {
  const layout = readFileSync(resolve('src/layouts/MainLayout.tsx'), 'utf8')
  const room = readFileSync(resolve('src/pages/EmployeeRoom.tsx'), 'utf8')
  assert.equal((layout.match(/<InternalChatProvider>/g) ?? []).length, 1)
  assert.equal((layout.match(/<InternalChatLauncher/g) ?? []).length, 1)
  assert.match(room, /<InternalChatPanel variant="embedded"/)
  assert.match(room, /MY QUEST/)
  assert.match(room, /handleAcceptAssignedTask/)
  assert.match(room, /className="order-1">\s*<InternalChatPanel variant="embedded"/)
  assert.match(room, /<div hidden className="hidden order-3/)
  assert.match(room, /className="order-2 overflow-hidden[^]*?MEMBER STATUS/)
})

test('database/debug failures show safe Japanese text with retry and no misleading empty success', () => {
  const { chatErrorMessage } = loadTypeScript(feature('internalChatState.ts'))
  for (const status of [403, 422, 500, 503]) {
    const raw = { response: { status, data: { message: 'SQLSTATE[42S02] select * from chat_rooms SECRET' } } }
    assert.equal(chatErrorMessage(raw), 'チャットを読み込めませんでした。管理者にお問い合わせください。')
  }
  const error = chatErrorMessage(new Error('network failed'))
  const Panel = loadTypeScript(feature('InternalChatPanel.tsx'), new Map([
    mockChatTransport,
    [feature('useInternalChat.ts'), { useInternalChat: () => ({
      error, messages: [], draft: '', files: [], unreadCount: 0, hasOlder: false, isSending: false,
      isInitialLoading: false, setViewing() {}, retry() {}, setDraft() {}, send() {},
    }) }],
    [resolve('src/utils/employeeAvatar.ts'), { getEmployeeAvatarImageUrl: (path) => path }],
  ])).default
  const html = renderToStaticMarkup(React.createElement(Panel))
  assert.match(html, /role="alert"/)
  assert.match(html, /再試行/)
  assert.match(html, /管理者にお問い合わせください/)
  assert.doesNotMatch(html, /SQLSTATE|SECRET|まだメッセージはありません|最初の連絡を送信できます/)
})

test('panel retains accessible message history, error and composer behavior', () => {
  const panel = source('InternalChatPanel.tsx')
  const composer = source('ChatComposer.tsx')
  const surface = [panel, composer, source('ChatHeader.tsx'), source('MessageList.tsx')].join('\n')
  assert.doesNotMatch([panel, source('ChatHeader.tsx'), source('MessageList.tsx')].join('\n'), /日本語|TIẾNG VIỆT|JAPANESE|VIETNAMESE/)
  assert.match(composer, /placeholder="メッセージを入力\.\.\."/)
  for (const text of ['role="alert"', 'role="log"', 'aria-live="polite"', 'Shift+Enter', '全社員と共有']) {
    assert.ok(surface.includes(text), text)
  }
  assert.match(composer, /event\.key === 'Enter' && !event\.shiftKey/)
  assert.doesNotMatch(surface, /room_id|office_id/)
  const Composer = loadTypeScript(feature('ChatComposer.tsx'), new Map([mockChatTransport])).default
  const render = (files, isSending = false) => renderToStaticMarkup(React.createElement(Composer, { draft: '', files, isSending }))
  assert.match(render([]), /disabled="" class="internal-chat-send-btn"/)
  assert.match(render([]), /<select aria-label="翻訳する言語の組み合わせ"[^]*日本語 ↔ ベトナム語[^]*日本語 ↔ 中国語/)
  assert.doesNotMatch(render([]), /翻訳プレビュー/)
  const attachment = new File(['synthetic'], 'receipt.pdf')
  assert.doesNotMatch(render([attachment]), /disabled="" class="internal-chat-send-btn"/)
  assert.match(render([attachment]), /receipt\.pdf を外す/)
  assert.match(render([attachment], true), /disabled="" class="internal-chat-send-btn"/)
})

test('a reconnecting chat keeps history and offers retry without a fatal alert', () => {
  const Panel = loadTypeScript(feature('InternalChatPanel.tsx'), new Map([
    mockChatTransport,
    [feature('useInternalChat.ts'), { useInternalChat: () => ({
      isReconnecting: true, error: '', receipts: {}, draft: '', files: [], unreadCount: 0,
      messages: [{
        id: 6, is_mine: true, sender: { id: 1, name: 'Sender' }, source_language: 'ja',
        original_text: 'History before disconnect', created_at: '2026-11-03T12:00:00Z',
      }],
    }) }],
    [resolve('src/utils/employeeAvatar.ts'), { getEmployeeAvatarImageUrl: path => path }],
  ])).default
  for (const variant of ['embedded', 'drawer']) {
    const html = renderToStaticMarkup(React.createElement(Panel, { variant }))
    assert.match(html, /role="status"[^]*接続を再確認しています…/)
    assert.match(html, /History before disconnect/)
    assert.match(html, /再試行/)
    assert.doesNotMatch(html, /role="alert"|管理者にお問い合わせください/)
  }
})

test('poll failure preserves the last cursor and history until a delta recovers', async () => {
  const { mergeMessages, applyTranslationUpdates, applyMessageActions } = loadTypeScript(feature('internalChatState.ts'))
  const state = { messages: [], error: '', reconnecting: false, loading: false }
  const cursor = { current: undefined }
  const { signal } = new AbortController()
  const requests = []
  const data = messages => ({ messages, pagination: { has_more: false }, unread_count: 0 })
  const responses = [new Error('first failure'), data([{ id: 6 }]), new Error('poll failure'), data([{ id: 7 }])]
  const context = source('InternalChatContext.tsx').replace(
    /const refresh = useCallback\(([^]*?^  }), \[[^\n]*\]\)/m, 'const refresh = $1',
  )
  const refresh = productionArrow(context, 'refresh', {
    sessionSignal: { current: signal }, pollingRef: { current: null }, hasLoaded: { current: false },
    messagesRef: { get current() { return state.messages } }, pollCursor: cursor,
    beforeCursor: { current: null }, actionCursor: { current: undefined }, messageActions: { current: new Map() },
    CHAT_PAGE_SIZE: 20, recordActions() {}, setActionsEnabled() {}, setHideEnabled() {}, setCanPin() {},
    unreadRevision: { current: 0 }, seenIncoming: { current: new Set() }, deliveryEnabled: {},
    userId: 1, viewingChat: { current: false }, notifyIncomingChat() {},
    fetchChatMessages: async params => {
      requests.push(params)
      const response = responses.shift()
      if (response instanceof Error) throw response
      return response
    },
    acknowledgeDelivery: async () => { assert.equal(state.loading, false) },
    mergeMessages, applyTranslationUpdates, applyMessageActions, applyMetadata() {}, setHasOlder() {}, setUnread() {},
    setMessages: update => { state.messages = update(state.messages) },
    setIsInitialLoading: value => { state.loading = value },
    setError: value => { state.error = value },
    setIsReconnecting: value => { state.reconnecting = value },
    chatErrorMessage: () => 'Initial load error',
  })
  assert.equal(await refresh(), false)
  assert.equal(state.error, 'Initial load error')
  assert.equal(await refresh(), true)
  const history = state.messages
  assert.equal(await refresh(), false)
  assert.equal(state.error, '')
  assert.equal(state.reconnecting, true)
  assert.equal(state.messages, history)
  assert.equal(await refresh(), true)
  assert.equal(state.reconnecting, false)
  assert.deepEqual(state.messages.map(message => message.id), [6, 7])
  assert.deepEqual(requests.map(request => request.afterId), [undefined, undefined, 6, 6])
  assert.deepEqual(requests.map(request => request.limit), [20, 20, 50, 50])
})

test('recall redacts cached original, translation and reply even when an older response arrives late', () => {
  const { applyMessageActions, applyTranslationUpdates, mergeMessages } = loadTypeScript(feature('internalChatState.ts'))
  const message = { id: 11, original_text: 'confidential', japanese_content: '秘密', translation_status: 'pending', pinned_at: 'past' }
  const reply = { id: 12, original_text: 'reply', reply_to: { id: 11, sender_name: 'Fixture', excerpt: 'confidential' } }
  const recalled = applyMessageActions([message, reply], new Map([[11, { action: 'recall', created_at: 'now' }]]))
  const raced = applyTranslationUpdates(mergeMessages(recalled, [message]), [{ id: 11, japanese_content: '秘密' }])
  assert.equal(raced[0].original_text, '')
  assert.equal(raced[0].japanese_content, null)
  assert.equal(raced[0].pinned_at, null)
  assert.equal(raced[1].reply_to.excerpt, null)
  assert.equal(raced[1].original_text, 'reply')
})

test('hide drops the original and quote, and a stale translation cannot replace a retry', () => {
  const { applyMessageActions, applyTranslationUpdates, mergeMessages } = loadTypeScript(feature('internalChatState.ts'))
  const original = { id: 11, original_text: 'original', translation_status: 'failed', translation_attempt: 0 }
  const reply = { id: 12, reply_to: { id: 11, sender_name: 'Fixture', excerpt: 'original' } }
  const visible = applyMessageActions([original, reply], new Map([[11, { action: 'hide' }]]))
  assert.deepEqual(visible, [{ ...reply, pinned_at: undefined, reply_to: null }])
  const pending = applyTranslationUpdates([original], [{ id: 11, translation_status: 'pending', translation_attempt: 55 }])
  assert.equal(pending[0].translation_status, 'pending')
  assert.equal(mergeMessages(pending, [original])[0], pending[0])
  const completed = applyTranslationUpdates(pending, [{ id: 11, translation_status: 'completed', translation_attempt: 55 }])
  assert.equal(completed[0].translation_status, 'completed')
})

test('older history uses a locked 20-row cursor and stops when the final page arrives', async () => {
  const { mergeMessages, applyMessageActions } = loadTypeScript(feature('internalChatState.ts'))
  const context = source('InternalChatContext.tsx').replace(
    /const loadOlder = useCallback\(([^]*?^  }), \[[^\n]*\]\)/m, 'const loadOlder = $1',
  )
  let resolvePage
  const page = new Promise(resolve => { resolvePage = resolve })
  const calls = []
  let history = [{ id: 21 }, { id: 22 }]
  let hasOlder = true
  const loadOlder = productionArrow(context, 'loadOlder', {
    sessionSignal: { current: new AbortController().signal }, beforeCursor: { current: 21 }, loadingOlder: { current: false },
    messageActions: { current: new Map() }, CHAT_PAGE_SIZE: 20, mergeMessages, applyMessageActions,
    setMessages: update => { history = update(history) }, setHasOlder: value => { hasOlder = value },
    fetchChatMessages: params => { calls.push(params); return page },
    applyMetadata() {}, setIsLoadingOlder() {}, setError() {}, chatErrorMessage: () => 'Error',
  })
  const pending = loadOlder()
  assert.equal(await loadOlder(), false)
  resolvePage({ messages: [{ id: 1 }, { id: 20 }, { id: 21 }], pagination: { has_more: false, next_before_id: 1 } })
  assert.equal(await pending, true)
  assert.equal(await loadOlder(), false)
  assert.equal(hasOlder, false)
  assert.deepEqual(history.map(message => message.id), [1, 20, 21, 22])
  assert.deepEqual(calls, [{ beforeId: 21, limit: 20 }])
})

test('jump to unread automatically loads older pages until the requested row is present', async () => {
  const { mergeMessages, applyMessageActions } = loadTypeScript(feature('internalChatState.ts'))
  const context = source('InternalChatContext.tsx').replace(
    /const loadOlder = useCallback\(([^]*?^  }), \[[^\n]*\]\)/m, 'const loadOlder = $1',
  )
  const calls = []
  let history = [{ id: 110 }]
  const loadOlder = productionArrow(context, 'loadOlder', {
    sessionSignal: { current: new AbortController().signal }, beforeCursor: { current: 110 }, loadingOlder: { current: false },
    messageActions: { current: new Map() }, CHAT_PAGE_SIZE: 20, mergeMessages, applyMessageActions,
    setMessages: update => { history = update(history) }, setHasOlder() {},
    fetchChatMessages: async params => {
      calls.push(params)
      const ids = params.beforeId === 110 ? [60, 109] : [10, 15, 59]
      return { messages: ids.map(id => ({ id })), pagination: { has_more: true, next_before_id: ids[0] } }
    },
    applyMetadata() {}, setIsLoadingOlder() {}, setError() {}, chatErrorMessage: () => 'Error',
  })
  assert.equal(await loadOlder(15), true)
  assert.deepEqual(calls, [{ beforeId: 110, limit: 50 }, { beforeId: 60, limit: 50 }])
  assert.deepEqual(history.map(message => message.id), [10, 15, 59, 60, 109, 110])
})

test('polling adapts to visibility, backs off after errors and stops while a request is in flight', async () => {
  const { startChatPolling } = loadTypeScript(feature('internalChatState.ts'))
  const page = new EventTarget()
  page.visibilityState = 'visible'
  const browser = new EventTarget()
  const timers = new Map()
  let nextTimer = 0
  browser.setTimeout = (callback, delay) => {
    timers.set(++nextTimer, { callback, delay })
    return nextTimer
  }
  browser.clearTimeout = id => timers.delete(id)
  const prior = { window: globalThis.window, document: globalThis.document }
  Object.assign(globalThis, { window: browser, document: page })
  let finish
  const poller = startChatPolling(() => new Promise(resolve => { finish = resolve }), true)
  const run = delay => {
    assert.equal(timers.size, 1)
    const [id, task] = [...timers][0]
    assert.equal(task.delay, delay)
    timers.delete(id)
    return task.callback()
  }
  try {
    let request = run(0)
    browser.dispatchEvent(new Event('online'))
    assert.equal(timers.size, 0)
    finish(true)
    await request
    request = run(10_000)
    finish(false)
    await request
    assert.equal([...timers.values()][0].delay, 20_000)
    request = poller.retry()
    assert.equal(timers.size, 0)
    await poller.retry()
    finish(true)
    await request
    poller.setOpen(false)
    request = run(30_000)
    finish(true)
    await request
    page.visibilityState = 'hidden'
    page.dispatchEvent(new Event('visibilitychange'))
    request = run(60_000)
    finish(true)
    await request
    page.visibilityState = 'visible'
    page.dispatchEvent(new Event('visibilitychange'))
    request = run(0)
    poller.stop()
    finish(true)
    await request
    assert.equal(timers.size, 0)
  } finally {
    poller.stop()
    Object.assign(globalThis, prior)
  }
})

test('unchanged receipts retain row identity and a changed reader refreshes only its receipt', () => {
  const { mergeReceipts } = loadTypeScript(feature('internalChatState.ts'))
  const read = { delivered_count: 1, read_count: 1, eligible_recipient_count: 7,
    readers: [{ user_id: 2, employee_id: 2, display_name: 'Reader', avatar_url: null }] }
  const current = { 6: read, 7: { ...read } }
  assert.equal(mergeReceipts(current, structuredClone(current)), current)
  const changed = structuredClone(read)
  changed.readers[0].avatar_url = '/avatar'
  const merged = mergeReceipts(current, { 6: changed })
  assert.equal(merged[6], changed)
  assert.equal(merged[7], current[7])
})

test('on-demand translation leaves new messages idle and isolates the selected pair from stale polling', () => {
  const { applyTranslationUpdates } = loadTypeScript(feature('internalChatState.ts'))
  const Bubble = loadTypeScript(feature('MessageBubble.tsx'), new Map([
    mockChatTransport,
    [resolve('src/utils/employeeAvatar.ts'), { getEmployeeAvatarImageUrl: path => path }],
  ])).default
  const original = { id: 6, is_mine: true, sender: { id: 1, name: 'Sender' }, source_language: 'ja',
    original_text: '会議です。', translation_status: 'pending', translations: {}, created_at: '2026-11-03T12:00:00Z' }
  const render = (message, pair) => renderToStaticMarkup(React.createElement(Bubble, { message, translationPair: pair, onTranslate: async () => true }))
  const [bubble, menu] = render(original, 'ja-zh').split('popover="auto"')
  assert.match(bubble, /会議です。/)
  assert.doesNotMatch(bubble, /翻訳/)
  assert.match(menu, /<button[^>]*>翻訳<\/button>/)
  assert.doesNotMatch(render(original, 'ja-zh'), /翻訳待機中|有会议/)
  const update = translations => ({ id: original.id, translation_status: 'pending', translations })
  const pending = { status: 'pending', revision: 1 }
  const waiting = applyTranslationUpdates([original], [update({ 'ja-zh': pending })])
  assert.match(render(waiting[0], 'ja-zh'), /翻訳待機中/)
  assert.doesNotMatch(render(waiting[0], 'ja-zh'), />翻訳<\/button>/)
  const failed = applyTranslationUpdates(waiting, [update({ 'ja-zh': { status: 'failed', revision: 1 } })])
  assert.match(render(failed[0], 'ja-zh').split('popover="auto"')[1], /<button[^>]*>翻訳を再試行<\/button>/)
  const done = applyTranslationUpdates(waiting, [update({ 'ja-zh': { status: 'completed', revision: 1, language: 'zh-Hans', text: '有会议。' } })])
  assert.match(render(done[0], 'ja-zh'), /lang="zh-Hans"[^>]*>有会议。/)
  assert.doesNotMatch(render(done[0], 'ja-vi'), /有会议/)
  assert.equal(applyTranslationUpdates(done, [update({ 'ja-zh': pending })])[0], done[0])
})

test('translation updates the existing bubble in JP–VI order without changing receipt identity', () => {
  const { applyTranslationUpdates, mergeMessages } = loadTypeScript(feature('internalChatState.ts'))
  const original = {
    id: 6, is_mine: true, sender: { id: 1, name: 'Sender' }, source_language: 'vi',
    original_text: 'Ngày mai tôi sẽ đến lúc 9 giờ.', vietnamese_content: 'Ngày mai tôi sẽ đến lúc 9 giờ.',
    japanese_content: null, translation_status: 'pending', created_at: '2026-11-03T12:00:00Z',
  }
  let messages = [original]
  const Panel = loadTypeScript(feature('InternalChatPanel.tsx'), new Map([
    mockChatTransport,
    [feature('useInternalChat.ts'), { useInternalChat: () => ({ messages, receipts: {}, draft: '', files: [], unreadCount: 0 }) }],
    [resolve('src/utils/employeeAvatar.ts'), { getEmployeeAvatarImageUrl: path => path }],
  ])).default
  const render = variant => renderToStaticMarkup(React.createElement(Panel, { variant }))
  assert.match(render('embedded'), /Ngày mai[^]*翻訳待機中\.\.\./)
  const translated = '明日は9時に伺います。'
  messages = applyTranslationUpdates(messages, [{
    id: 6, translation_status: 'completed', japanese_content: translated, vietnamese_content: original.original_text,
  }])
  assert.equal(messages.length, 1)
  assert.equal(mergeMessages(messages, [original])[0], messages[0])
  for (const variant of ['embedded', 'drawer']) {
    const html = render(variant)
    assert.ok(html.indexOf(original.original_text) >= 0 && html.indexOf(original.original_text) < html.indexOf(translated))
    assert.match(html, /lang="vi" class="internal-chat-text-original"[^]*lang="ja" class="internal-chat-text-translation"/)
    assert.doesNotMatch(html.match(/<article[^]*?<\/article>/)[0], /日本語|TIẾNG VIỆT|翻訳待機中/)
  }
  messages = [{
    ...original, source_language: 'ja', original_text: translated,
    japanese_content: translated, vietnamese_content: original.original_text, translation_status: 'completed',
  }]
  assert.match(render('drawer'), /lang="ja" class="internal-chat-text-original"[^]*lang="vi" class="internal-chat-text-translation"/)
  messages = applyTranslationUpdates([original], [{
    id: 6, translation_status: 'failed', japanese_content: null, vietnamese_content: original.original_text,
  }])
  assert.match(render('drawer'), /Ngày mai[^]*翻訳できませんでした/)
})

test('Chat and AI share the dock without moving the Chat dialog into its stacking layer', () => {
  const launcher = source('InternalChatLauncher.tsx')
  const css = source('internalChat.css')
  const layout = readFileSync('src/layouts/MainLayout.tsx', 'utf8')
  const dock = readFileSync('src/layouts/workspaceToolsDock.css', 'utf8')
  assert.match(launcher, /location\.pathname === '\/'/)
  assert.match(launcher, /aria-haspopup="dialog"/)
  assert.match(layout, /ref=\{setChatLauncherHost\}[\s\S]*ref=\{setAiLauncherHost\}/)
  assert.match(layout, /const isMfaSettings = matchPath\('\/system\/mfa', location\.pathname\) !== null/)
  assert.match(layout, /<InternalChatLauncher launcherHost=\{isMfaSettings \? null : chatLauncherHost\}/)
  assert.match(layout, /<ThemisAiAssistant launcherHost=\{isMfaSettings \? null : aiLauncherHost\}/)
  assert.match(launcher, /<\/button>, launcherHost,[\s\S]*\{drawerOpen &&/)
  assert.match(source('FloatingChatDrawer.tsx'), /<InternalChatPanel variant="drawer"/)
  assert.match(dock, /env\(safe-area-inset-bottom\)/)
  assert.match(dock, /\.workspace-tools-dock\s*\{[^}]*position: fixed;[^}]*bottom:/)
  assert.doesNotMatch(dock, /workspace-tools-dock--room/)
  assert.doesNotMatch(layout, /workspace-tools-dock--room/)
  assert.match(css, /\.internal-chat-modal-layer\s*\{[^}]*z-index: 75/)
  assert.match(css, /@media \(max-width: 639px\)/)
  assert.match(css, /calc\(100vw - 32px\)/)
  assert.match(css, /\.internal-chat-scroll-area\s*\{[^}]*overflow-y: auto/)
  assert.match(css, /\.internal-chat-composer-wrap\s*\{[^}]*flex: none/)
  assert.doesNotMatch(css, /overflow-x:\s*scroll|min-width:\s*(?:600|800|1000)px/)
})

test('read acknowledgement requires a mounted panel, visible tab and intersecting message', () => {
  const ids = []
  const document = { visibilityState: 'hidden' }
  const list = { isConnected: true }
  const observe = (observing) => productionArrow(source('InternalChatPanel.tsx'), 'onIntersection', {
    document, list, observing, queueVisibleReads: (visible) => ids.push(...visible),
  })
  const entry = (id, isIntersecting, height) => ({
    isIntersecting, intersectionRect: { height }, target: { dataset: { chatReadableId: String(id) } },
  })
  observe(true)([entry(2, true, 30)])
  document.visibilityState = 'visible'
  observe(false)([entry(2, true, 30)])
  list.isConnected = false
  observe(true)([entry(2, true, 30)])
  list.isConnected = true
  observe(true)([entry(3, false, 0), entry(4, true, 0)])
  assert.deepEqual(ids, [])
  observe(true)([entry(2, true, 30), entry(5, true, 15), entry(9, false, 0)])
  assert.deepEqual(ids, [2, 5])
})

test('visible read observations share one timer and cannot flush while hidden', () => {
  const panel = source('InternalChatPanel.tsx')
  const queuedIds = new Set()
  const document = { visibilityState: 'visible' }
  const reads = []
  const timers = []
  const state = {
    queuedIds, document, list: { isConnected: true }, observing: true,
    markVisibleRead: (ids) => reads.push(ids),
    cancelQueuedRead: () => queuedIds.clear(),
  }
  const flushVisibleReads = productionArrow(panel, 'flushVisibleReads', state)
  const queue = productionArrow(panel, 'queueVisibleReads', {
    queuedIds, readTimer: undefined, flushVisibleReads,
    window: { setTimeout: (callback, delay) => timers.push({ callback, delay }) },
  })
  queue([2, 3])
  queue([3, 4])
  assert.equal(timers.length, 1)
  assert.equal(timers[0].delay, 250)
  assert.deepEqual(reads, [])
  timers[0].callback()
  assert.deepEqual(reads, [[2, 3, 4]])
  queuedIds.add(5)
  document.visibilityState = 'hidden'
  flushVisibleReads()
  assert.deepEqual(reads, [[2, 3, 4]])
  assert.equal(queuedIds.size, 0)
})

test('embedded and floating panels render actual counts, status, named avatars and overflow count', () => {
  const readers = Array.from({ length: 4 }, (_, index) => ({
    user_id: index + 2, employee_id: index + 12, display_name: `Reader ${index + 1}`, avatar_url: `/avatar/${index}`,
  }))
  const message = (id, is_mine = true) => ({
    id, is_mine, sender: { id: 1, name: 'Sender' }, source_language: 'ja',
    original_text: '原文', translation_status: 'pending', created_at: '2026-11-03T12:00:00Z',
  })
  const earlierReader = { user_id: 8, employee_id: 18, display_name: 'Earlier reader', avatar_url: null }
  const Panel = loadTypeScript(feature('InternalChatPanel.tsx'), new Map([
    mockChatTransport,
    [feature('useInternalChat.ts'), { useInternalChat: () => ({
      messages: [message(1), message(2), message(3), message(4), message(5), {
        ...message(6, false), attachments: [{ id: 1, name: 'fixture.png', mime_type: 'image/png', size: 1024 }],
      }, {
        ...message(7), original_text: '', translation_status: 'completed',
        attachments: [{ id: 1, name: 'synthetic-receipt.pdf', mime_type: 'application/pdf', size: 39936 }],
      }], draft: '', files: [], unreadCount: 1,
      memberSummary: { member_count: 8, online_count: 2 },
      receipts: { 2: { delivered_count: 1, read_count: 0, readers: [] },
        3: { delivered_count: 5, read_count: 5, eligible_recipient_count: 7, readers: [...readers, earlierReader] },
        4: { delivered_count: 5, read_count: 5, eligible_recipient_count: 7, readers: [...readers, earlierReader] },
        5: { delivered_count: 4, read_count: 4, eligible_recipient_count: 7, readers },
        6: { delivered_count: 0, read_count: 1, eligible_recipient_count: 7, readers: [
          { user_id: 9, employee_id: 19, display_name: 'Reader of incoming', avatar_url: null },
        ] } },
      firstUnreadId: 6,
      markVisibleRead() {},
    }) }],
    [resolve('src/utils/employeeAvatar.ts'), { getEmployeeAvatarImageUrl: (path) => path }],
  ])).default
  for (const variant of ['embedded', 'drawer']) {
    const html = renderToStaticMarkup(React.createElement(Panel, { variant, onClose() {} }))
    for (const label of ['オンライン 2', '送信済み', '受信済み', 'Reader 4', '翻訳待機中...', '1件の未読']) assert.ok(html.includes(label), label)
    assert.doesNotMatch(html, /既読 \d+\/\d+/)
    assert.match(html, /internal-chat-read-avatar-more">\+1/)
    assert.equal((html.match(/class="[^"]*internal-chat-read-avatar-img/g) ?? []).length, 5)
    assert.match(html, /未読メッセージへ（1件）/)
    const rows = html.split(/data-chat-row-id="\d+"/)
    assert.doesNotMatch(rows[3], /internal-chat-read-receipt/)
    assert.match(rows[4], /title="Earlier reader"/)
    assert.doesNotMatch(rows[4], /internal-chat-read-text|internal-chat-read-check/)
    assert.doesNotMatch(rows[4], /Reader 1|internal-chat-read-avatar-more/)
    assert.match(rows[5], /title="Reader 1、Reader 2、Reader 3、Reader 4"/)
    assert.match(rows[6], /title="Reader of incoming"/)
    assert.doesNotMatch(rows[6], /送信済み|受信済み/)
    assert.doesNotMatch(rows[5], /internal-chat-read-text|internal-chat-read-check/)
    assert.match(html, /internal-chat-message--other/)
    assert.match(html, /internal-chat-message--mine/)
    assert.match(html, /internal-chat-image-frame/)
    assert.match(html, /画像を読み込み中…/)
    assert.doesNotMatch(rows[6], /fixture\.png|internal-chat-attachment-row/)
    assert.match(rows[7], /internal-chat-bubble--media/)
    assert.match(rows[7], /class="internal-chat-file-name"[^>]*>synthetic-receipt\.pdf</)
    assert.match(rows[7], /PDF · 39 KB/)
    assert.doesNotMatch(html, /オンライン 5|既読 3\/4|boy\.png/)
  }
})
