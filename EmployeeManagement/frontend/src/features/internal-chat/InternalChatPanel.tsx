import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowDown, RefreshCw, X } from 'lucide-react'
import { useInternalChat } from './useInternalChat'
import ChatHeader from './ChatHeader'
import MessageList from './MessageList'
import ChatComposer from './ChatComposer'
import MessageBubble from './MessageBubble'
import type { ChatReply, InternalChatMessage } from './types'

export default function InternalChatPanel({
  variant = 'embedded',
  onClose,
}: {
  variant?: 'embedded' | 'drawer'
  onClose?: () => void
}) {
  const chat = useInternalChat()
  const markVisibleRead = chat.markVisibleRead
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const previousLatestRef = useRef<number | undefined>(undefined)
  const olderAnchor = useRef<{ id: number; top: number } | null>(null)
  const [readingAt, setReadingAt] = useState<number | null>(null)
  const [jumpId, setJumpId] = useState<number | null>(null)
  const [jumpResult, setJumpResult] = useState<{ id: number; revision: number; message: InternalChatMessage | null }>()
  const oldest = chat.messages[0]?.id
  const latest = chat.messages.at(-1)?.id
  const nearBottom = useRef(true)
  const setReply = chat.setReply
  const { actionRevision, loadMessage } = chat
  const onReply = useCallback((reply: ChatReply) => {
    setReply(reply)
    composerRef.current?.focus()
  }, [setReply])

  const jumpToMessage = useCallback((id: number) => {
    const list = scrollRef.current
    const row = list?.querySelector<HTMLElement>(`[data-chat-row-id="${id}"]`)
    if (list && row) {
      setJumpId(null)
      const top = list.scrollTop + row.getBoundingClientRect().top - list.getBoundingClientRect().top
        - Math.max(0, (list.clientHeight - row.offsetHeight) / 2)
      list.scrollTo({ top, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
      row.focus({ preventScroll: true })
    } else {
      setJumpResult(undefined)
      setJumpId(id)
    }
  }, [])

  useEffect(() => {
    if (jumpId === null) return
    const controller = new AbortController()
    void loadMessage(jumpId, controller.signal).then(message => {
      if (!controller.signal.aborted) setJumpResult({ id: jumpId, revision: actionRevision, message })
    }).catch(() => {
      if (!controller.signal.aborted) setJumpResult({ id: jumpId, revision: actionRevision, message: null })
    })
    return () => controller.abort()
  }, [jumpId, actionRevision, loadMessage])
  const focusedMessage = jumpResult?.id === jumpId && jumpResult.revision === actionRevision ? jumpResult : undefined
  const { focusedMessageId, clearMessageFocus } = chat
  useEffect(() => {
    if (!focusedMessageId) return
    jumpToMessage(focusedMessageId)
    clearMessageFocus()
  }, [focusedMessageId, clearMessageFocus, jumpToMessage])

  useLayoutEffect(() => {
    const list = scrollRef.current
    const anchor = olderAnchor.current
    if (list && anchor && oldest !== anchor.id) {
      if (nearBottom.current) {
        list.scrollTop = list.scrollHeight
      } else {
        const row = list.querySelector(`[data-chat-row-id="${anchor.id}"]`)
        if (row) list.scrollTop += row.getBoundingClientRect().top - list.getBoundingClientRect().top - anchor.top
      }
      olderAnchor.current = null
    } else if (list && latest && latest !== previousLatestRef.current && nearBottom.current) {
      list.scrollTop = list.scrollHeight
      const previous = previousLatestRef.current
      if (previous !== undefined && latest > previous && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const bubble = list.querySelector<HTMLElement>(`[data-chat-row-id="${latest}"] .internal-chat-bubble`)
        bubble?.animate?.([{ opacity: 0.55, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 190, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' })
      }
    }
    previousLatestRef.current = latest
  }, [oldest, latest])

  const loadOlder = async () => {
    const list = scrollRef.current
    if (!list || !oldest || !chat.hasOlder || chat.isLoadingOlder || olderAnchor.current) return
    const row = list.querySelector(`[data-chat-row-id="${oldest}"]`)
    if (!row) return
    const anchor = { id: oldest, top: row.getBoundingClientRect().top - list.getBoundingClientRect().top }
    olderAnchor.current = anchor
    if (!await chat.loadOlder() && olderAnchor.current === anchor) olderAnchor.current = null
  }

  const jumpToLatest = () => {
    const list = scrollRef.current
    if (!list) return
    list.focus({ preventScroll: true })
    list.scrollTo({
      top: list.scrollHeight,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    })
  }

  useEffect(() => {
    const list = scrollRef.current
    if (!list || jumpId !== null || typeof IntersectionObserver === 'undefined') return

    let observing = true
    const queuedIds = new Set<number>()
    let readTimer: number | undefined
    const cancelQueuedRead = () => {
      window.clearTimeout(readTimer)
      readTimer = undefined
      queuedIds.clear()
    }
    const flushVisibleReads = () => {
      const ids = [...queuedIds]
      cancelQueuedRead()
      if (observing && document.visibilityState === 'visible' && list.isConnected && ids.length) {
        void markVisibleRead(ids)
      }
    }
    const queueVisibleReads = (ids: number[]) => {
      ids.forEach((id) => queuedIds.add(id))
      readTimer ??= window.setTimeout(flushVisibleReads, 250)
    }
    const onIntersection = (entries: IntersectionObserverEntry[]) => {
      if (!observing || document.visibilityState !== 'visible' || !list.isConnected) return
      const visibleIds = entries.filter((entry) => entry.isIntersecting && entry.intersectionRect.height > 0)
        .map((entry) => Number((entry.target as HTMLElement).dataset.chatReadableId))
      if (visibleIds.length) queueVisibleReads(visibleIds)
    }
    const observer = new IntersectionObserver(onIntersection)
    const observeVisibleTab = () => {
      cancelQueuedRead()
      observer.disconnect()
      if (document.visibilityState === 'visible') {
        list.querySelectorAll('[data-chat-readable-id]').forEach((message) => observer.observe(message))
      }
    }
    observeVisibleTab()
    document.addEventListener('visibilitychange', observeVisibleTab)
    return () => {
      observing = false
      cancelQueuedRead()
      observer.disconnect()
      document.removeEventListener('visibilitychange', observeVisibleTab)
    }
  }, [chat.messages, markVisibleRead, jumpId])

  return (
    <section
      className={`internal-chat-panel internal-chat-panel--${variant}`}
      aria-label="社内チャット"
    >
      <ChatHeader unreadCount={chat.unreadCount} memberSummary={chat.memberSummary}
        onRetry={() => void chat.retry()} onClose={variant === 'drawer' ? onClose : undefined}
        showPins={chat.actionsEnabled} actionRevision={actionRevision} loadPins={chat.loadPins}
        canPin={chat.canPin} onAction={chat.messageAction} onJump={jumpToMessage} />

      {/* Error notification bar with retry */}
      {chat.error && (
        <div className="internal-chat-error-bar" role="alert">
          <AlertCircle size={15} aria-hidden="true" className="shrink-0" />
          <span className="flex-1 min-w-0">{chat.error}</span>
          <button
            type="button"
            onClick={() => void chat.retry()}
            className="internal-chat-retry-btn"
          >
            <RefreshCw size={12} aria-hidden="true" />
            <span>再試行</span>
          </button>
        </div>
      )}

      {chat.isReconnecting && (
        <div className="flex items-center justify-between gap-2 px-3 py-1 text-xs text-[var(--tm-text-muted)]" role="status">
          <span>接続を再確認しています…</span>
          <button type="button" onClick={() => void chat.retry()} className="internal-chat-retry-btn">再試行</button>
        </div>
      )}

      <div className="internal-chat-history">
      <MessageList messages={chat.messages} receipts={chat.receipts} scrollRef={scrollRef} error={chat.error}
        actionsEnabled={chat.actionsEnabled} hideEnabled={chat.hideEnabled} canPin={chat.canPin} onAction={chat.messageAction}
        onReply={onReply} onJump={jumpToMessage}
        isInitialLoading={chat.isInitialLoading} hasOlder={chat.hasOlder} isLoadingOlder={chat.isLoadingOlder}
        onLoadOlder={() => void loadOlder()} onScroll={(event) => {
          const list = event.currentTarget
          nearBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 48
          setReadingAt(current => nearBottom.current ? null : (current ?? latest ?? null))
          const anchor = olderAnchor.current
          if (anchor) {
            const row = list.querySelector(`[data-chat-row-id="${anchor.id}"]`)
            if (row) anchor.top = row.getBoundingClientRect().top - list.getBoundingClientRect().top
          }
          if (list.scrollTop <= 96 && !nearBottom.current && !chat.error) void loadOlder()
        }} />
      {jumpId === null && readingAt !== null && latest !== undefined && (
        <div className="internal-chat-new-messages">
          <button type="button" onClick={jumpToLatest}>
            {latest > readingAt ? '新しいメッセージ' : '最新のメッセージへ'}
            <ArrowDown size={14} aria-hidden="true" />
          </button>
        </div>
      )}
      {jumpId !== null && <section className="internal-chat-message-preview" aria-label="元のメッセージ">
        <header><strong>元のメッセージ</strong>
          <button type="button" className="internal-chat-icon-btn" aria-label="元のメッセージを閉じる" onClick={() => {
            setJumpId(null)
            scrollRef.current?.focus({ preventScroll: true })
          }}><X size={16} aria-hidden="true" /></button>
        </header>
        {!focusedMessage && <p role="status">読み込み中...</p>}
        {focusedMessage?.message === null && <p role="status">メッセージを表示できません。</p>}
        {focusedMessage?.message && <MessageBubble message={focusedMessage.message} preview />}
      </section>}
      </div>

      <ChatComposer variant={variant} draft={chat.draft} isSending={chat.isSending}
        mentions={chat.draftMentions} onMentionDraft={chat.setMentionDraft}
        files={chat.files} onFiles={chat.setFiles} sendError={chat.sendError}
        inputRef={composerRef} reply={chat.reply} onCancelReply={() => chat.setReply(null)}
        onDraft={chat.setDraft} onSend={() => void chat.send()} />
    </section>
  )
}
