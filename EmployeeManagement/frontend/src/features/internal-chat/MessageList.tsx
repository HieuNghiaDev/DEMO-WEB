import { memo, useMemo, type RefObject, type UIEventHandler } from 'react'
import { ArrowDown, CalendarDays, LoaderCircle, MessageSquareText } from 'lucide-react'
import MessageBubble from './MessageBubble'
import type { ChatActionName, ChatReceipt, ChatReply, InternalChatMessage } from './types'

type MessageActions = {
  actionsEnabled?: boolean
  hideEnabled?: boolean
  canPin?: boolean
  onReply?: (reply: ChatReply) => void
  onAction?: (id: number, action: ChatActionName) => Promise<boolean>
  onJump?: (id: number) => void
}

const jaDayNames = ['日', '月', '火', '水', '木', '金', '土']
const calendarDay = new Intl.DateTimeFormat('en-CA', { dateStyle: 'short', timeZone: 'Asia/Tokyo' })

function formatChatDateSeparator(dateString: string): string {
  try {
    const target = new Date(dateString)
    const now = new Date()

    const targetJst = new Date(target.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
    const nowJst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))

    const isSameYear = targetJst.getFullYear() === nowJst.getFullYear()
    const isSameMonth = targetJst.getMonth() === nowJst.getMonth()
    const isSameDay = targetJst.getDate() === nowJst.getDate()

    const targetMidnight = new Date(targetJst.getFullYear(), targetJst.getMonth(), targetJst.getDate()).getTime()
    const nowMidnight = new Date(nowJst.getFullYear(), nowJst.getMonth(), nowJst.getDate()).getTime()
    const dayDiff = Math.round((nowMidnight - targetMidnight) / (24 * 60 * 60 * 1000))

    const month = String(targetJst.getMonth() + 1).padStart(2, '0')
    const day = String(targetJst.getDate()).padStart(2, '0')
    const weekday = jaDayNames[targetJst.getDay()] ?? ''

    if (isSameYear && isSameMonth && isSameDay) {
      return `今日 (${month}/${day} ${weekday})`
    }
    if (dayDiff === 1) {
      return `昨日 (${month}/${day} ${weekday})`
    }
    if (isSameYear) {
      return `${month}/${day} (${weekday})`
    }
    return `${targetJst.getFullYear()}/${month}/${day} (${weekday})`
  } catch {
    return dateString
  }
}

const ChatMessageRow = memo(function ChatMessageRow({
  message, receipt, readerMarkers, showDate, actionsEnabled, hideEnabled, canPin, onReply, onAction, onJump,
}: {
  message: InternalChatMessage
  receipt?: ChatReceipt
  readerMarkers?: ChatReceipt['readers']
  showDate: boolean
} & MessageActions) {
  const dateLabel = showDate ? formatChatDateSeparator(message.created_at) : ''
  return (
    <div className="internal-chat-message-row" data-chat-row-id={message.id} tabIndex={-1}>
      {showDate && (
        <div className="internal-chat-date-separator" role="separator" aria-label={dateLabel}>
          <span className="internal-chat-date-pill"><CalendarDays size={13} aria-hidden="true" />{dateLabel}</span>
        </div>
      )}
      <MessageBubble message={message} receipt={receipt} readerMarkers={readerMarkers} actionsEnabled={actionsEnabled} hideEnabled={hideEnabled}
        canPin={canPin} onReply={onReply} onAction={onAction} onJump={onJump} />
    </div>
  )
})

export default function MessageList({
  messages, receipts, scrollRef, onScroll, error, isInitialLoading, hasOlder, isLoadingOlder, onLoadOlder,
  actionsEnabled, hideEnabled, canPin, onReply, onAction, onJump,
}: {
  messages: InternalChatMessage[]
  receipts?: Record<number, ChatReceipt>
  scrollRef: RefObject<HTMLDivElement | null>
  onScroll: UIEventHandler<HTMLDivElement>
  error: string
  isInitialLoading: boolean
  hasOlder: boolean
  isLoadingOlder: boolean
  onLoadOlder: () => void
} & MessageActions) {
  const messageRows = useMemo(() => {
    const markedReaders = new Set<number>()
    const markersByMessage = new Map<number, ChatReceipt['readers']>()
    // Walk the conversation from newest to oldest so each reader has one marker.
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index]
      const readers = receipts?.[message.id]?.readers
      if (!message.is_mine || !readers?.length) continue
      const markers = readers.filter((reader) => {
        if (markedReaders.has(reader.user_id)) return false
        markedReaders.add(reader.user_id)
        return true
      })
      if (markers.length) markersByMessage.set(message.id, markers.length === readers.length ? readers : markers)
    }

    const rows = []
    let previousDay: string | undefined
    for (const message of messages) {
      const day = calendarDay.format(new Date(message.created_at))
      const showDate = day !== previousDay
      previousDay = day
      rows.push(<ChatMessageRow key={message.id} message={message} receipt={receipts?.[message.id]} readerMarkers={markersByMessage.get(message.id)} showDate={showDate}
        actionsEnabled={actionsEnabled} hideEnabled={hideEnabled} canPin={canPin} onReply={onReply} onAction={onAction} onJump={onJump} />)
    }
    return rows
  }, [messages, receipts, actionsEnabled, hideEnabled, canPin, onReply, onAction, onJump])
  return (
    <div
      className="internal-chat-scroll-area"
      ref={scrollRef}
      onScroll={onScroll}
      role="log"
      tabIndex={0}
      aria-live="polite"
      aria-relevant="additions"
    >
      {hasOlder && (
        <button
          type="button"
          className="internal-chat-load-older-btn"
          onClick={onLoadOlder}
          disabled={isLoadingOlder}
        >
          {isLoadingOlder ? (
            <LoaderCircle className="animate-spin" size={14} />
          ) : (
            <ArrowDown size={14} className="rotate-180" />
          )}
          <span>{isLoadingOlder ? '過去のメッセージを読み込み中...' : '以前のメッセージを読み込む'}</span>
        </button>
      )}

      {isInitialLoading ? (
        <div className="internal-chat-state-empty" role="status">
          <LoaderCircle className="animate-spin text-indigo-500" size={24} />
          <p>メッセージを読み込み中…</p>
        </div>
      ) : !messageRows.length && !error ? (
        <div className="internal-chat-state-empty">
          <div className="internal-chat-empty-icon" aria-hidden="true">
            <MessageSquareText size={26} />
          </div>
          <p className="font-bold text-slate-800 dark:text-slate-100">まだメッセージはありません。</p>
          <span className="text-slate-500 text-xs">最初の連絡を送信できます。</span>
        </div>
      ) : (
        messageRows
      )}
    </div>
  )
}
