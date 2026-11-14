import { useState } from 'react'
import { UserAvatar } from '../../components/ui/UserAvatar'
import { getEmployeeAvatarImageUrl } from '../../utils/employeeAvatar'
import MessageReceipt from './MessageReceipt'
import MessageActionMenu from './MessageActionMenu'
import ChatAttachment from './ChatAttachment'
import ChatMentionText from './ChatMentionText'
import { recalledMessageText } from './internalChatState'
import type { ChatActionName, ChatReceipt, ChatReply, ChatTranslationPair, InternalChatMessage } from './types'

const messageClock = new Intl.DateTimeFormat('ja-JP', {
  hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tokyo',
})

const formatMessageClock = (value: string) => {
  try {
    return messageClock.format(new Date(value))
  } catch {
    return ''
  }
}

export default function MessageBubble({ message, receipt, readerMarkers, actionsEnabled, hideEnabled, canPin, onReply, onAction, onJump, preview, translationPair = 'ja-vi', onTranslate }: {
  message: InternalChatMessage
  receipt?: ChatReceipt
  readerMarkers?: ChatReceipt['readers']
  actionsEnabled?: boolean
  hideEnabled?: boolean
  canPin?: boolean
  onReply?: (reply: ChatReply) => void
  onAction?: (id: number, action: ChatActionName) => Promise<boolean>
  onJump?: (id: number) => void
  preview?: boolean
  translationPair?: ChatTranslationPair
  onTranslate?: (id: number, pair: ChatTranslationPair) => Promise<boolean>
}) {
  const { is_mine: mine, sender } = message
  const { source_language: source } = message
  const [requesting, setRequesting] = useState(false)
  const [errorPair, setErrorPair] = useState<ChatTranslationPair | null>(null)
  const translation = message.translations?.[translationPair]
  const legacy = !message.translations && translationPair === 'ja-vi'
  const translated = translation?.text ?? (legacy ? (source === 'ja' ? message.vietnamese_content : message.japanese_content) : null)
  const target = translation?.language ?? (source === 'ja' ? 'vi' : 'ja')
  const status = translation?.status ?? (legacy ? message.translation_status : undefined)
  const translationNote = requesting ? '翻訳をリクエスト中…' : status === 'pending' ? '翻訳待機中...'
    : status === 'failed' || errorPair === translationPair ? '翻訳できませんでした' : ''
  const canTranslate = !preview && !message.recalled_at && !!onTranslate && !!message.original_text
    && !translated && !requesting && status !== 'pending'
  const requestTranslation = async () => {
    if (!onTranslate || requesting) return
    setRequesting(true)
    setErrorPair(null)
    try {
      if (!await onTranslate(message.id, translationPair)) setErrorPair(translationPair)
    } finally {
      setRequesting(false)
    }
  }
  const attachmentsOnly = !message.recalled_at && !message.original_text && !message.reply_to && !message.pinned_at
    && !!message.attachments?.length

  return (
    <article className={`internal-chat-message internal-chat-message--${mine ? 'mine' : 'other'}`}
      data-chat-readable-id={mine || preview ? undefined : message.id}>
      {!mine && (
        <UserAvatar name={sender.name} stableKey={sender.id} imageSrc={getEmployeeAvatarImageUrl(sender.avatar_path)}
          size="sm" shape="circle" />
      )}
      <div className="internal-chat-sender-content">
        {!mine && <div className="internal-chat-sender-header">
          <strong className="internal-chat-sender-name">{sender.name}</strong>
        </div>}
        <div className="internal-chat-bubble-row">
          <div className={`internal-chat-bubble internal-chat-bubble--${mine ? 'mine' : 'other'}${attachmentsOnly ? ' internal-chat-bubble--media' : ''}`}>
            {message.recalled_at ? <p className="internal-chat-translation-warn">{recalledMessageText}</p> : <>
              {message.pinned_at && <span className="internal-chat-pinned-label">ピン留め済み</span>}
              {message.reply_to && <button type="button" className="internal-chat-reply-quote internal-chat-reply-link"
                onClick={() => message.reply_to && onJump?.(message.reply_to.id)} disabled={!onJump}>
                <strong>{message.reply_to.sender_name}</strong>
                <span>{message.reply_to.excerpt ?? recalledMessageText}</span>
              </button>}
              {message.original_text && <p lang={source} className="internal-chat-text-original"><ChatMentionText text={message.original_text} mentions={message.mentions} /></p>}
              {translated && <p lang={target} className="internal-chat-text-translation">{translated}</p>}
              {!translated && translationNote && <p role="status" className="internal-chat-translation-warn">{translationNote}</p>}
              {!!message.attachments?.length && <ul className="internal-chat-attachments" aria-label="添付ファイル">
                {message.attachments.map(file => <ChatAttachment key={file.id} messageId={message.id} file={file} />)}
              </ul>}
            </>}
          </div>
          {!preview && (!message.recalled_at || hideEnabled) && <MessageActionMenu message={onTranslate ? { ...message, can_retry_translation: false } : message} translated={translated}
            translationAction={canTranslate ? { label: translationNote ? '翻訳を再試行' : '翻訳', run: requestTranslation } : undefined}
            actionsEnabled={actionsEnabled} hideEnabled={hideEnabled} canPin={canPin} onReply={onReply} onAction={onAction} />}
        </div>
        <div className="internal-chat-message-footer">
          <time dateTime={message.created_at} className="internal-chat-sender-time">{formatMessageClock(message.created_at)}</time>
          {!preview && !message.recalled_at && (mine || Boolean(readerMarkers?.length))
            && <MessageReceipt receipt={receipt} readerMarkers={readerMarkers} showDelivery={mine} />}
        </div>
      </div>
    </article>
  )
}

