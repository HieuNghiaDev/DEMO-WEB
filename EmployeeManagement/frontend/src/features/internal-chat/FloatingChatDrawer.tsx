import { useEffect, useRef } from 'react'
import InternalChatPanel from './InternalChatPanel'

export default function FloatingChatDrawer({ closing, onClose, onExit }: { closing: boolean; onClose: () => void; onExit: () => void }) {
  const dialog = useRef<HTMLElement | null>(null)
  useEffect(() => { dialog.current?.focus({ preventScroll: true }) }, [])

  return (
    <div className="internal-chat-modal-layer" data-closing={closing || undefined}>
      <div className="internal-chat-modal-backdrop" aria-hidden="true" onClick={onClose} />
      <aside ref={dialog} className="internal-chat-modal-window" tabIndex={-1}
        onAnimationEnd={event => {
          if (closing && event.target === event.currentTarget && event.animationName === 'chat-window-out') onExit()
        }}
        role="dialog" aria-modal="true" aria-label="社内チャット">
        <InternalChatPanel variant="drawer" onClose={onClose} />
      </aside>
    </div>
  )
}
