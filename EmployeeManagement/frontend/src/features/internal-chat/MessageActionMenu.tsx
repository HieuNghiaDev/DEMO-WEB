import { useId, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import type { ChatActionName, ChatReply, InternalChatMessage } from './types'

export default function MessageActionMenu({ message, translated, translationAction, actionsEnabled, hideEnabled, canPin, onReply, onAction }: {
  message: InternalChatMessage
  translated: string | null
  translationAction?: { label: string; run: () => Promise<void> }
  actionsEnabled?: boolean
  hideEnabled?: boolean
  canPin?: boolean
  onReply?: (reply: ChatReply) => void
  onAction?: (id: number, action: ChatActionName) => Promise<boolean>
}) {
  const id = useId()
  const popover = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState<'recall' | 'hide' | null>(null)
  const close = () => popover.current?.hidePopover()
  const change = async (action: ChatActionName) => {
    if (working) return
    setWorking(true)
    try {
      if (await onAction?.(message.id, action)) close()
      else setError('メッセージを操作できませんでした。')
    } finally {
      setWorking(false)
    }
  }
  const copy = async () => {
    const parts = [message.original_text]
    if (translated && translated !== message.original_text) parts.push(translated)
    try {
      await navigator.clipboard.writeText(parts.join('\n\n'))
      close()
    } catch {
      setError('コピーできませんでした。')
    }
  }

  return <>
    <button type="button" className="internal-chat-message-more" aria-label="メッセージの操作"
      popoverTarget={id} onClick={event => {
        const rect = event.currentTarget.getBoundingClientRect()
        const roomBelow = window.innerHeight - rect.bottom
        setPosition({
          left: Math.max(8, Math.min(rect.right - 176, window.innerWidth - 184)),
          top: roomBelow >= 208 ? rect.bottom + 4 : Math.max(8, rect.top - 208),
        })
      }}><MoreHorizontal size={16} aria-hidden="true" /></button>
    <div ref={popover} id={id} popover="auto" className="internal-chat-message-actions" style={position}
      aria-label="メッセージの操作" role="group" onToggle={event => {
        if (event.newState === 'closed') { setConfirmation(null); setError('') }
      }}>
      {confirmation ? <>
        <p className="internal-chat-confirm-text">{confirmation === 'recall'
          ? 'このメッセージの送信を取り消しますか？' : 'このメッセージを自分の画面から削除しますか？'}</p>
        <button type="button" disabled={working} onClick={() => setConfirmation(null)}>キャンセル</button>
        <button type="button" className="internal-chat-danger-action" disabled={working} onClick={() => void change(confirmation)}>
          {confirmation === 'recall' ? '送信取消を確定' : '削除を確定'}
        </button>
      </> : <>
      {!message.recalled_at && message.original_text && <button type="button" onClick={() => void copy()}>コピー</button>}
      {translationAction && <button type="button" disabled={working} onClick={() => {
        close()
        void translationAction.run()
      }}>{translationAction.label}</button>}
      {actionsEnabled && !message.recalled_at && <button type="button" disabled={working} onClick={() => {
        const excerpt = message.original_text.replace(/\s+/g, ' ').trim() || '添付ファイル'
        const characters = Array.from(excerpt)
        close()
        onReply?.({ id: message.id, sender_name: message.sender.name,
          excerpt: characters.length > 96 ? characters.slice(0, 96).join('') + '…' : excerpt })
      }}>返信</button>}
      {actionsEnabled && canPin && !message.recalled_at && <button type="button" disabled={working}
        onClick={() => void change(message.pinned_at ? 'unpin' : 'pin')}>
        {message.pinned_at ? 'ピン留め解除' : 'ピン留め'}
      </button>}
      {actionsEnabled && !message.recalled_at && message.can_recall && <button type="button" className="internal-chat-danger-action" disabled={working}
        onClick={() => setConfirmation('recall')}>送信取消</button>}
      {hideEnabled && <button type="button" className="internal-chat-danger-action" disabled={working}
        onClick={() => setConfirmation('hide')}>削除</button>}
      {!message.recalled_at && message.can_retry_translation && message.translation_status === 'failed'
        && <button type="button" disabled={working} onClick={() => void change('retry')}>翻訳を再試行</button>}
      </>}
      {error && <p role="status">{error}</p>}
    </div>
  </>
}
