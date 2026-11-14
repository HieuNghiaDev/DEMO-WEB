import type { ChatMessageAction, ChatMessagesResponse, ChatReceipt, InternalChatMessage } from './types'

export const recalledMessageText = 'メッセージが取り消されました'

export function applyMessageActions(messages: InternalChatMessage[], actions: ReadonlyMap<number, ChatMessageAction>) {
  if (!actions.size) return messages
  let changed = false
  const result: InternalChatMessage[] = []
  for (const message of messages) {
    const action = actions.get(message.id)
    if (action?.action === 'hide') {
      changed = true
      continue
    }
    if (action?.action === 'recall' && !message.recalled_at) {
      changed = true
      result.push({ ...message, recalled_at: action.created_at, pinned_at: null,
        original_text: '', attachments: [], mentions: [], japanese_content: null, vietnamese_content: null, translations: {}, reply_to: null })
      continue
    }
    const pinnedAt = action?.action === 'pin' ? action.created_at : action?.action === 'unpin' ? null : message.pinned_at
    const reply = message.reply_to
    const parentAction = reply && actions.get(reply.id)?.action
    const visibleReply = parentAction === 'hide' ? null : parentAction === 'recall' && reply?.excerpt != null
      ? { ...reply, excerpt: null } : reply
    const next = pinnedAt === message.pinned_at && visibleReply === reply ? message : { ...message, pinned_at: pinnedAt, reply_to: visibleReply }
    changed ||= next !== message
    result.push(next)
  }
  return changed ? result : messages
}

// Never render server exception text, including debug SQL/stack traces.
export const chatErrorMessage = (error: unknown) => {
  void error
  return 'チャットを読み込めませんでした。管理者にお問い合わせください。'
}

export const mergeMessages = (current: InternalChatMessage[], incoming: InternalChatMessage[]) => {
  if (incoming.length === 0) return current

  const byId = new Map<number, InternalChatMessage>()
  current.forEach((message) => byId.set(message.id, message))
  incoming.forEach((message) => {
    const previous = byId.get(message.id)
    if (previous?.recalled_at && !message.recalled_at) return
    if (previous && !message.recalled_at && !acceptTranslation(previous, message)) return
    byId.set(message.id, previous && !message.recalled_at
      ? { ...message, translations: mergeChatTranslations(previous.translations, message.translations) } : message)
  })
  return [...byId.values()].sort((left, right) => left.id - right.id)
}

export function applyTranslationUpdates(current: InternalChatMessage[], updates: NonNullable<ChatMessagesResponse['translation_updates']>) {
  if (!updates.length) return current
  const byId = new Map(updates.map((update) => [update.id, update]))
  return current.map((message) => {
    const update = byId.get(message.id)
    if (message.recalled_at || !update) return message
    const translations = mergeChatTranslations(message.translations, update.translations)
    if (acceptTranslation(message, update)
      && (message.translation_status !== update.translation_status || (message.translation_attempt ?? 0) !== (update.translation_attempt ?? 0))) {
      return { ...message, ...update, translations }
    }
    return translations === message.translations ? message : { ...message, translations }
  })
}

export function mergeChatTranslations(previous: InternalChatMessage['translations'], incoming: InternalChatMessage['translations']) {
  if (!previous || !incoming) return incoming ?? previous
  let result = previous
  for (const pair of ['ja-vi', 'ja-zh'] as const) {
    const next = incoming[pair]
    const current = previous[pair]
    if (next && (!current || next.revision > current.revision
      || (next.revision === current.revision && current.status === 'pending' && next.status !== 'pending'))) {
      result = { ...result, [pair]: next }
    }
  }
  return result
}

function acceptTranslation(previous: InternalChatMessage, incoming: Pick<InternalChatMessage, 'translation_status' | 'translation_attempt'>) {
  const previousAttempt = previous.translation_attempt ?? 0
  const nextAttempt = incoming.translation_attempt ?? 0
  return nextAttempt > previousAttempt || (nextAttempt === previousAttempt
    && (previous.translation_status === 'pending' || incoming.translation_status !== 'pending'))
}

export const mergeReceipts = (current: Record<number, ChatReceipt>, incoming: Record<number, ChatReceipt>) => {
  let merged = current
  for (const [id, next] of Object.entries(incoming)) {
    const messageId = Number(id)
    const previous = current[messageId]
    const unchanged = previous
      && previous.delivered_count === next.delivered_count
      && previous.read_count === next.read_count
      && previous.eligible_recipient_count === next.eligible_recipient_count
      && previous.readers.length === next.readers.length
      && next.readers.every((reader, index) => {
        const priorReader = previous.readers[index]
        return reader.user_id === priorReader.user_id && reader.employee_id === priorReader.employee_id
          && reader.display_name === priorReader.display_name && reader.avatar_url === priorReader.avatar_url
      })
    if (unchanged) continue
    if (merged === current) merged = { ...current }
    merged[messageId] = next
  }
  return merged
}

export function startChatPolling(poll: () => Promise<boolean | undefined>, open: boolean) {
  let chatOpen = open
  let stopped = false
  let running = false
  let failures = 0
  let timer: number

  const schedule = (immediate = false) => {
    window.clearTimeout(timer)
    if (stopped || running) return
    const baseDelay = document.visibilityState === 'hidden' ? 60_000 : chatOpen ? 10_000 : 30_000
    const delay = Math.min(baseDelay * 2 ** failures, 120_000)
    timer = window.setTimeout(run, immediate ? 0 : delay)
  }

  const run = async () => {
    if (stopped || running) return
    window.clearTimeout(timer)
    running = true
    try {
      const result = await poll()
      if (result !== undefined) failures = result ? 0 : Math.min(failures + 1, 4)
    } finally {
      running = false
      schedule()
    }
  }

  const onVisibilityChange = () => schedule(document.visibilityState === 'visible')
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('online', onVisibilityChange)
  schedule(true)

  return {
    retry: run,
    setOpen(next: boolean) {
      if (chatOpen === next) return
      chatOpen = next
      schedule()
    },
    stop() {
      stopped = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('online', onVisibilityChange)
    },
  }
}
