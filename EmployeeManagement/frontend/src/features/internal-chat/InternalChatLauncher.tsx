import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MessageSquareText } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import FloatingChatDrawer from './FloatingChatDrawer'
import { useInternalChat } from './useInternalChat'

export default function InternalChatLauncher({ launcherHost }: { launcherHost: HTMLElement | null }) {
  const location = useLocation()
  const chat = useInternalChat()
  const drawerOpen = chat.drawerOpen
  const setDrawerOpen = chat.setDrawerOpen
  const launcherRef = useRef<HTMLButtonElement | null>(null)
  const [closing, setClosing] = useState(false)
  const finishClose = useCallback(() => {
    setDrawerOpen(false)
    setClosing(false)
    window.requestAnimationFrame(() => launcherRef.current?.focus({ preventScroll: true }))
  }, [setDrawerOpen])

  const closeDrawer = useCallback(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) finishClose()
    else setClosing(true)
  }, [finishClose])

  useEffect(() => {
    if (!closing) return
    // Finish even if the browser suppresses the animation or the route changes.
    const timer = window.setTimeout(finishClose, 240)
    return () => window.clearTimeout(timer)
  }, [closing, finishClose])

  useEffect(() => {
    if (!drawerOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDrawer()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [drawerOpen, closeDrawer])

  // Hide floating launcher on Employee Room (embedded chat is displayed directly there)
  // Also hidden on login/mfa pages as they are outside MainLayout.
  if (location.pathname === '/') return null

  return (
    <>
      {!drawerOpen && launcherHost && createPortal(
        <button
          ref={launcherRef}
          type="button"
          className="workspace-tools-dock-action internal-chat-launcher"
          onClick={() => setDrawerOpen(true)}
          aria-label={
            chat.unreadCount > 0
              ? `社内チャットを開く・未読${chat.unreadCount}件`
              : '社内チャットを開く'
          }
          aria-haspopup="dialog"
          aria-expanded={false}
        >
          <MessageSquareText size={18} className="internal-chat-launcher-icon" aria-hidden="true" />
          <span aria-hidden="true">チャット</span>
          {chat.unreadCount > 0 && (
            <span className="internal-chat-launcher-badge">
              {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
            </span>
          )}
        </button>, launcherHost,
      )}

      {drawerOpen && <FloatingChatDrawer closing={closing} onClose={closeDrawer} onExit={finishClose} />}
    </>
  )
}
