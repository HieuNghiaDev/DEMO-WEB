import { useEffect, useRef, useState } from 'react'
import { Pin } from 'lucide-react'
import type { ChatActionName, InternalChatMessage } from './types'

const pinTime = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'short' })

export default function ChatPins({ revision, loadPins, canPin, onJump, onAction }: {
  revision: number
  loadPins: (signal: AbortSignal) => Promise<InternalChatMessage[]>
  canPin?: boolean
  onJump?: (id: number) => void
  onAction?: (id: number, action: ChatActionName) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [unpinning, setUnpinning] = useState<number | null>(null)
  const details = useRef<HTMLDetailsElement | null>(null)
  const [result, setResult] = useState<{ revision: number; attempt: number; messages: InternalChatMessage[] | null }>()

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    void loadPins(controller.signal).then(messages => {
      if (!controller.signal.aborted) setResult({ revision, attempt, messages })
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ revision, attempt, messages: null })
    })
    return () => controller.abort()
  }, [open, revision, attempt, loadPins])

  const current = result?.revision === revision && result.attempt === attempt ? result : undefined
  return <details ref={details} className="internal-chat-pins" onToggle={event => {
    const next = event.currentTarget.open
    setOpen(next)
    if (!next) setResult(undefined)
  }}>
    <summary className="internal-chat-icon-btn" aria-label="ピン留めしたメッセージ"><Pin size={16} aria-hidden="true" /></summary>
    {open && <div className="internal-chat-pins-list">
      <strong>ピン留めしたメッセージ</strong>
      {!current && <p role="status">読み込み中...</p>}
      {current?.messages === null && <button type="button" onClick={() => setAttempt(value => value + 1)}>再試行</button>}
      {current?.messages?.length === 0 && <p>ピン留めしたメッセージはありません。</p>}
      {!!current?.messages?.length && <ul>
        {current.messages.map(message => <li key={message.id}>
          <strong>{message.sender.name}</strong>
          <p className="internal-chat-pin-excerpt">{message.original_text || '添付ファイル'}</p>
          {message.pinned_at && <time dateTime={message.pinned_at}>{pinTime.format(new Date(message.pinned_at))}</time>}
          {message.pinned_by_name && <p>ピン留めした人 · {message.pinned_by_name}</p>}
          <div className="internal-chat-pin-actions">
            {onJump && <button type="button" onClick={() => {
              if (details.current) details.current.open = false
              onJump(message.id)
            }}>メッセージへ移動</button>}
            {canPin && onAction && <button type="button" disabled={unpinning !== null} onClick={async () => {
              setUnpinning(message.id)
              try { await onAction(message.id, 'unpin') } finally { setUnpinning(null) }
            }}>ピン留め解除</button>}
          </div>
        </li>)}
      </ul>}
    </div>}
  </details>
}
