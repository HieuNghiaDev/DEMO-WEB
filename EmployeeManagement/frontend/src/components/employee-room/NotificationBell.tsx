import { useContext } from 'react'
import { Bell } from 'lucide-react'
import { formatBellCount, NotificationCenterContext } from './notificationCenterState'

export default function NotificationBell() {
  const center = useContext(NotificationCenterContext)
  if (!center) return null
  const { unread, anchor, toggle } = center
  return (
    <button type="button" aria-label={unread ? `通知を表示・未読${unread}件` : '通知を表示'}
      aria-haspopup="dialog" aria-expanded={Boolean(anchor)}
      onClick={event => toggle(event.currentTarget)}
      className="workspace-bell-button relative grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface)] text-[var(--tm-text-secondary)] hover:bg-[var(--tm-surface-hover)] focus-visible:ring-2 focus-visible:ring-indigo-500">
      <Bell size={18} aria-hidden="true" />
      {unread > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-indigo-600 px-1 text-center text-[10px] font-bold leading-5 text-white">{formatBellCount(unread)}</span>}
    </button>
  )
}
