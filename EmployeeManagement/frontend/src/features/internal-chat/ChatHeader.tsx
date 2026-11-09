import { MessageSquareText, MoreVertical, Users, X } from 'lucide-react'
import ChatPins from './ChatPins'
import type { ChatActionName, ChatMemberSummary, InternalChatMessage } from './types'

export default function ChatHeader({ unreadCount, memberSummary, onRetry, onClose, showPins, actionRevision, loadPins, canPin, onJump, onAction }: {
  unreadCount: number
  memberSummary?: ChatMemberSummary | null
  onRetry: () => void
  onClose?: () => void
  showPins?: boolean
  actionRevision?: number
  loadPins?: (signal: AbortSignal) => Promise<InternalChatMessage[]>
  canPin?: boolean
  onJump?: (id: number) => void
  onAction?: (id: number, action: ChatActionName) => Promise<boolean>
}) {
  return (
    <header className="internal-chat-header">
      <div className="internal-chat-header-main">
        <div className="internal-chat-header-icon" aria-hidden="true">
          <MessageSquareText size={20} />
        </div>

        <div className="internal-chat-header-text">
          <div className="internal-chat-title-row">
            <h2 className="internal-chat-title">社内チャット</h2>
            {unreadCount > 0 && (
              <span className="internal-chat-unread-badge" aria-label={`${unreadCount}件の未読`}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <div className="internal-chat-header-meta">
            <p className="internal-chat-subtitle">全社員と共有</p>
            {memberSummary && (
              <div className="internal-chat-member-pill" title={`参加者 ${memberSummary.member_count}名 / オンライン ${memberSummary.online_count}名`}>
                <span className="internal-chat-member-count">
                  <Users size={12} aria-hidden="true" />
                  <span>{memberSummary.member_count}</span>
                </span>
                <span className="internal-chat-online-count">
                  <span className="internal-chat-online-indicator" aria-hidden="true" />
                  <span>オンライン {memberSummary.online_count}</span>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="internal-chat-header-actions">
        {showPins && loadPins && <ChatPins revision={actionRevision ?? 0} loadPins={loadPins}
          canPin={canPin} onJump={onJump} onAction={onAction} />}
        <details className="internal-chat-menu" onBlur={event => {
          if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false
        }}>
          <summary className="internal-chat-icon-btn" aria-label="チャットメニュー"><MoreVertical size={18} /></summary>
          <button type="button" className="internal-chat-menu-action" onClick={event => {
            const menu = event.currentTarget.closest('details')
            if (menu) {
              menu.querySelector('summary')?.focus()
              menu.open = false
            }
            onRetry()
          }}>更新</button>
        </details>

        {onClose && (
          <button
            type="button"
            className="internal-chat-close-btn"
            onClick={onClose}
            title="閉じる"
            aria-label="社内チャットを閉じる"
          >
            <X size={18} />
          </button>
        )}
      </div>
    </header>
  )
}
