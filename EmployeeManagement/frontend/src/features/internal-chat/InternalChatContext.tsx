import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { isAxiosError } from 'axios'
import { useAuth } from '../../contexts/AuthContext'
import { CHAT_PAGE_SIZE, changeChatMessage, fetchChatMessage, fetchChatMessages, fetchChatPins, markChatDelivered, markChatRead, requestChatTranslation, sendChatMessage } from './api'
import type { ChatActionName, ChatDraftMention, ChatMemberSummary, ChatMessageAction, ChatMessagesResponse, ChatReceipt, ChatReply, ChatTranslationPair, ChatUnread, InternalChatMessage } from './types'
import { editMentions, trimmedMentions } from './chatMentions'
import { applyMessageActions, applyTranslationUpdates, chatErrorMessage, mergeChatTranslations, mergeMessages, mergeReceipts, startChatPolling } from './internalChatState'
import { InternalChatContext, type InternalChatContextValue } from './useInternalChat'
import { listenForChatAudioGesture, notifyIncomingChat } from './chatNotifications'

function InternalChatSession({ children, userId }: { children: ReactNode; userId: number }) {
  const { pathname } = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [messages, setMessages] = useState<InternalChatMessage[]>([])
  const [translationPair, setTranslationPair] = useState<ChatTranslationPair>('ja-vi')
  const [unread, setUnread] = useState<ChatUnread>({ unread_count: 0 })
  const [memberSummary, setMemberSummary] = useState<ChatMemberSummary | null>(null)
  const [receipts, setReceipts] = useState<Record<number, ChatReceipt>>({})
  const [draftState, setDraftState] = useState<{ text: string; mentions: ChatDraftMention[] }>({ text: '', mentions: [] })
  const { text: draft, mentions: draftMentions } = draftState
  const setDraft = useCallback((text: string) => setDraftState(previous => ({ text, mentions: editMentions(previous.text, text, previous.mentions) })), [])
  const setMentionDraft = useCallback((text: string, mentions: ChatDraftMention[]) => setDraftState({ text, mentions }), [])
  const [focusedMessageId, setFocusedMessageId] = useState<number | null>(() => {
    const target = Number(searchParams.get('chatMessage'))
    return Number.isSafeInteger(target) && target > 0 ? target : null
  })
  const clearMessageFocus = useCallback(() => setFocusedMessageId(null), [])
  const [files, setFiles] = useState<File[]>([])
  const [sendError, setSendError] = useState('')
  const [reply, setReply] = useState<ChatReply | null>(null)
  const [actionsEnabled, setActionsEnabled] = useState(false)
  const [hideEnabled, setHideEnabled] = useState(false)
  const [canPin, setCanPin] = useState(false)
  const [actionRevision, setActionRevision] = useState(0)
  const [isInitialLoading, setIsInitialLoading] = useState(false)
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [hasOlder, setHasOlder] = useState(false)
  const [error, setError] = useState('')
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(() => pathname !== '/' && focusedMessageId !== null)
  const openMessage = useCallback((id: number) => {
    setFocusedMessageId(id)
    if (pathname !== '/') setDrawerOpen(true)
  }, [pathname])
  const chatOpen = pathname === '/' || drawerOpen
  useEffect(() => {
    if (!searchParams.has('chatMessage')) return
    const next = new URLSearchParams(searchParams)
    next.delete('chatMessage')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])
  useEffect(listenForChatAudioGesture, [])
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onNotificationClick = (event: MessageEvent) => {
      const { type, messageId } = event.data ?? {}
      if (type === 'themis-chat-notification' && Number.isSafeInteger(messageId) && messageId > 0) openMessage(messageId)
    }
    navigator.serviceWorker.addEventListener('message', onNotificationClick)
    return () => navigator.serviceWorker.removeEventListener('message', onNotificationClick)
  }, [openMessage])
  const messagesRef = useRef<InternalChatMessage[]>([])
  const pollingRef = useRef<AbortSignal | null>(null)
  const pollCursor = useRef<number | undefined>(undefined)
  const beforeCursor = useRef<number | null>(null)
  const loadingOlder = useRef(false)
  const actionCursor = useRef<number | undefined>(undefined)
  const messageActions = useRef(new Map<number, ChatMessageAction>())
  const hasLoaded = useRef(false)
  const deliveredCursor = useRef(0)
  const readCursor = useRef(0)
  const unreadRevision = useRef(0)
  const seenIncoming = useRef(new Set<number>())
  const acknowledgedViews = useRef(new Set<number>())
  const lastReadWithoutProgress = useRef<{ batch: string; retryAt: number } | null>(null)
  const readingRef = useRef(false)
  const sendingRef = useRef(false)
  const pendingSend = useRef<{ text: string; mentions: string; replyId?: number; files: File[]; key: string } | null>(null)
  const deliveryEnabled = useRef(false)
  const sessionSignal = useRef<AbortSignal | null>(null)
  const poller = useRef<ReturnType<typeof startChatPolling> | null>(null)
  const viewingChat = useRef(chatOpen)

  useEffect(() => { messagesRef.current = messages }, [messages])
  const acknowledgeDelivery = useCallback(async (signal: AbortSignal) => {
    const id = pollCursor.current
    if (signal.aborted || !deliveryEnabled.current || !id || id <= deliveredCursor.current) return
    try {
      await markChatDelivered(id, signal)
      if (!signal.aborted) deliveredCursor.current = Math.max(deliveredCursor.current, id)
    } catch {
      // The next delta poll retries the last fetched cursor.
    }
  }, [])

  const markVisibleRead = useCallback(async (ids: number[]) => {
    const signal = sessionSignal.current
    const canRead = () => signal && !signal.aborted && viewingChat.current && document.visibilityState === 'visible'
    if (!signal || !canRead()) return
    ids.filter((id) => id > readCursor.current && !acknowledgedViews.current.has(id))
      .forEach((id) => seenIncoming.current.add(id))
    if (readingRef.current) return
    readingRef.current = true
    try {
      while (canRead()) {
        const seen = [...seenIncoming.current].filter((id) => !deliveryEnabled.current || id <= deliveredCursor.current)
          .sort((a, b) => a - b).slice(0, 50)
        const latest = seen.at(-1)
        const batch = seen.join(',')
        const stalled = lastReadWithoutProgress.current
        if (!latest || (stalled?.batch === batch && Date.now() < stalled.retryAt)) break
        const result = await markChatRead(latest, seen, signal)
        if (signal.aborted) return
        unreadRevision.current++
        setUnread({ unread_count: result.unread_count, first_unread_id: result.first_unread_id })
        const acknowledged = result.acknowledged_ids ?? []
        for (const id of acknowledged) {
          if (seenIncoming.current.delete(id)) acknowledgedViews.current.add(id)
        }
        if (result.read_cursor <= readCursor.current && !acknowledged.length) {
          // Another session may later fill the missing prefix.
          lastReadWithoutProgress.current = { batch, retryAt: Date.now() + 30_000 }
          continue
        }
        lastReadWithoutProgress.current = null
        readCursor.current = result.read_cursor
        seenIncoming.current.forEach((id) => {
          if (id <= readCursor.current) seenIncoming.current.delete(id)
        })
        acknowledgedViews.current.forEach((id) => {
          if (id <= readCursor.current) acknowledgedViews.current.delete(id)
        })
      }
    } catch {
      // Retry only when the message is still visible on a subsequent observation.
    } finally {
      readingRef.current = false
    }
  }, [])

  const applyMetadata = useCallback((result: ChatMessagesResponse) => {
    setMemberSummary((current) => current?.member_count === result.member_summary.member_count
      && current.online_count === result.member_summary.online_count ? current : result.member_summary)
    setReceipts((current) => mergeReceipts(current, result.receipts))
  }, [])

  const recordActions = useCallback((events: ChatMessageAction[]) => {
    if (!events.length) return
    const next = new Map(messageActions.current)
    for (const event of events) {
      if (event.action === 'retry') continue
      const previous = next.get(event.chat_message_id)
      if (previous?.action !== 'hide' && (!previous || event.action === 'hide'
        || (event.id !== undefined && event.id > (previous.id ?? 0)))) next.set(event.chat_message_id, event)
    }
    messageActions.current = next
    setReply(current => {
      const action = current && next.get(current.id)?.action
      return action === 'recall' || action === 'hide' ? null : current
    })
    setActionRevision(current => current + 1)
  }, [])

  const refresh = useCallback(async () => {
    const signal = sessionSignal.current
    if (!signal || signal.aborted || pollingRef.current === signal) return
    pollingRef.current = signal
    const initial = !hasLoaded.current && !messagesRef.current.length
    if (initial) setIsInitialLoading(true)
    try {
      const lastId = pollCursor.current
      const readAtStart = unreadRevision.current
      const receiptIds = messagesRef.current.filter((message) => !message.recalled_at).slice(-50).map((message) => message.id)
      const translationIds = messagesRef.current
        .filter((message) => !message.recalled_at && (Object.values(message.translations ?? {}).some(item => item.status === 'pending')
          || (message.translation_status === 'pending' && (message.translation_attempt ?? 0) > 0)))
        .slice(0, 50).map((message) => message.id)
      const result = await fetchChatMessages({
        afterId: lastId, limit: lastId === undefined ? CHAT_PAGE_SIZE : 50, receiptIds, translationIds, afterActionId: actionCursor.current,
      }, signal)
      if (signal.aborted) return
      pollCursor.current = result.messages.at(-1)?.id ?? lastId ?? 0
      deliveryEnabled.current = result.delivery_enabled
      const translationUpdates = result.translation_updates ?? []
      const events = result.message_actions ?? []
      actionCursor.current = result.action_cursor
      recordActions(events)
      const actions = messageActions.current
      if (lastId !== undefined && result.messages.length) {
        void notifyIncomingChat(userId, applyMessageActions(result.messages, actions), viewingChat.current, signal)
      }
      if (result.messages.length || translationUpdates.length || events.length) {
        setMessages((current) => applyTranslationUpdates(applyMessageActions(mergeMessages(current, result.messages), actions), translationUpdates))
      }
      if (lastId === undefined) {
        beforeCursor.current = result.pagination.has_more ? result.pagination.next_before_id : null
        setHasOlder(result.pagination.has_more)
      }
      setActionsEnabled(result.actions_enabled ?? false)
      setHideEnabled(result.hide_enabled ?? false)
      setCanPin(result.can_pin ?? false)
      applyMetadata(result)
      if (unreadRevision.current === readAtStart) {
        setUnread(current => current.unread_count === result.unread_count && current.first_unread_id === result.first_unread_id
          ? current : { unread_count: result.unread_count, first_unread_id: result.first_unread_id })
      }
      hasLoaded.current = true
      if (initial) setIsInitialLoading(false)
      setError('')
      setIsReconnecting(false)
      await acknowledgeDelivery(signal)
      if (!signal.aborted && seenIncoming.current.size) void markVisibleRead([])
      return true
    } catch (requestError) {
      if (signal.aborted) return
      if (initial) setError(chatErrorMessage(requestError))
      else setIsReconnecting(true)
      return false
    } finally {
      if (pollingRef.current === signal) pollingRef.current = null
      if (initial && !signal.aborted) setIsInitialLoading(false)
    }
  }, [acknowledgeDelivery, applyMetadata, markVisibleRead, recordActions, userId])

  useEffect(() => {
    const controller = new AbortController()
    sessionSignal.current = controller.signal
    const activePoller = startChatPolling(refresh, viewingChat.current)
    poller.current = activePoller
    return () => {
      activePoller.stop()
      controller.abort()
      poller.current = null
    }
  }, [refresh])

  useEffect(() => {
    viewingChat.current = chatOpen
    poller.current?.setOpen(chatOpen)
  }, [chatOpen])

  const loadOlder = useCallback(async (throughId?: number) => {
    const signal = sessionSignal.current
    let oldestId = beforeCursor.current
    if (!signal || signal.aborted || !oldestId || loadingOlder.current) return false
    loadingOlder.current = true
    setIsLoadingOlder(true)
    try {
      while (oldestId) {
        const result = await fetchChatMessages({ beforeId: oldestId, limit: throughId ? 50 : CHAT_PAGE_SIZE }, signal)
        if (signal.aborted) return false
        const next = result.pagination.next_before_id
        beforeCursor.current = result.pagination.has_more && next && next < oldestId ? next : null
        const actions = messageActions.current
        setMessages((current) => applyMessageActions(mergeMessages(current, result.messages), actions))
        setHasOlder(beforeCursor.current !== null)
        applyMetadata(result)
        setError('')
        if (!throughId) return result.messages.length > 0
        if (result.messages.some(message => message.id === throughId && !message.recalled_at)
          && !['recall', 'hide'].includes(actions.get(throughId)?.action ?? '')) return true
        if (next !== null && next <= throughId) return false
        oldestId = beforeCursor.current
      }
      return false
    } catch (requestError) {
      if (!signal.aborted) setError(chatErrorMessage(requestError))
      return false
    } finally {
      loadingOlder.current = false
      if (!signal.aborted) setIsLoadingOlder(false)
    }
  }, [applyMetadata])

  const send = useCallback(async () => {
    const signal = sessionSignal.current
    const text = draft.trim()
    const mentions = trimmedMentions(draft, draftMentions)
    const mentionSignature = JSON.stringify(mentions)
    if (!signal || signal.aborted || (!text && !files.length) || sendingRef.current) return
    sendingRef.current = true
    setIsSending(true)
    setSendError('')
    const replyId = reply?.id
    if (pendingSend.current?.text !== text || pendingSend.current.mentions !== mentionSignature || pendingSend.current.replyId !== replyId || pendingSend.current.files !== files) {
      pendingSend.current = { text, mentions: mentionSignature, replyId, files, key: crypto.randomUUID() }
    }
    try {
      const message = await sendChatMessage(text, pendingSend.current.key, signal, replyId, files, mentions)
      if (signal.aborted) return
      const actions = messageActions.current
      setMessages((current) => applyMessageActions(mergeMessages(current, [message]), actions))
      pendingSend.current = null
      setDraft('')
      setFiles([])
      setReply(null)
      setError('')
    } catch (requestError) {
      if (!signal.aborted) {
        const status = isAxiosError(requestError) ? requestError.response?.status : undefined
        setSendError(files.length && (status === 422 || status === 413)
          ? '添付ファイルの形式や容量を確認してください。'
          : '送信できませんでした。もう一度お試しください。')
      }
    } finally {
      sendingRef.current = false
      if (!signal.aborted) setIsSending(false)
    }
  }, [draft, draftMentions, files, reply, setDraft])

  const messageAction = useCallback(async (id: number, action: ChatActionName) => {
    const signal = sessionSignal.current
    if (!signal || signal.aborted) return false
    try {
      const event = await changeChatMessage(id, action, signal)
      if (signal.aborted) return false
      recordActions([event])
      const actions = messageActions.current
      setMessages(current => {
        const visible = applyMessageActions(current, actions)
        return action === 'retry' && event.id !== undefined ? applyTranslationUpdates(visible, [{
          id, translation_status: 'pending', translation_attempt: event.id, translation_provider: 'gemini',
        }]) : visible
      })
      setError('')
      if (action === 'recall' || action === 'hide') void poller.current?.retry()
      return true
    } catch {
      if (!signal.aborted) setError('メッセージを操作できませんでした。')
      return false
    }
  }, [recordActions])

  const translateMessage = useCallback(async (id: number, pair: ChatTranslationPair) => {
    const signal = sessionSignal.current
    if (!signal || signal.aborted) return false
    try {
      const translations = await requestChatTranslation(id, pair, signal)
      if (signal.aborted) return false
      setMessages(current => current.map(message => message.id === id && !message.recalled_at
        ? { ...message, translations: mergeChatTranslations(message.translations, translations) } : message))
      return true
    } catch {
      return false
    }
  }, [])

  const value = useMemo<InternalChatContextValue>(() => ({
    firstUnreadId: unread.first_unread_id ?? null,
    messages, unreadCount: unread.unread_count, memberSummary, receipts, draft, setDraft, draftMentions, setMentionDraft, focusedMessageId, clearMessageFocus, openMessage, files, setFiles, sendError, reply, setReply, actionsEnabled, hideEnabled, canPin, actionRevision, messageAction,
    loadPins: fetchChatPins, loadMessage: fetchChatMessage,
    translationPair, setTranslationPair, translateMessage,
    isInitialLoading, isLoadingOlder, isSending, hasOlder,
    error, isReconnecting, drawerOpen, setDrawerOpen, loadOlder, send,
    retry: async () => { await poller.current?.retry() }, markVisibleRead,
  }), [messages, unread, memberSummary, receipts, draft, setDraft, draftMentions, setMentionDraft, focusedMessageId, clearMessageFocus, openMessage, files, sendError, reply, actionsEnabled, hideEnabled, canPin, actionRevision, messageAction,
    isInitialLoading, isLoadingOlder, isSending, hasOlder, error, isReconnecting, drawerOpen, loadOlder, send, markVisibleRead, translationPair, translateMessage])

  return <InternalChatContext.Provider value={value}>{children}</InternalChatContext.Provider>
}

export function InternalChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (!user?.id) return children

  // Scope messages, drafts and in-flight requests to the authenticated account.
  return <InternalChatSession key={user.id} userId={user.id}>{children}</InternalChatSession>
}
