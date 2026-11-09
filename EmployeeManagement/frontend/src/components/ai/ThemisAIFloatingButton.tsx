import { useEffect, useRef, useState } from 'react'
import ThemisHead from './ThemisHead'
import type { ThemisActivity, ThemisExpression } from './mascotExpressions'

export default function ThemisAIFloatingButton({ onOpen, expression = 'idle', activity, action = 'none', notificationCount = 0, hasNotification = false, preview = false, forceHover = false, docked = false }: {
  onOpen: () => void
  expression?: ThemisExpression
  activity?: ThemisActivity
  action?: ThemisActivity
  notificationCount?: number
  hasNotification?: boolean
  preview?: boolean
  forceHover?: boolean
  docked?: boolean
}) {
  const [attentive, setAttentive] = useState(false)
  const [notificationPop, setNotificationPop] = useState(false)
  const previousCount = useRef(notificationCount)
  const currentActivity = activity ?? action
  const displayExpression = (attentive || forceHover) && currentActivity === 'none' && expression === 'idle' ? 'softSmile' : expression
  const showNotification = hasNotification || notificationCount > 0

  useEffect(() => {
    if (notificationCount > previousCount.current) {
      setNotificationPop(true)
      const timer = setTimeout(() => setNotificationPop(false), 650)
      previousCount.current = notificationCount
      return () => clearTimeout(timer)
    }
    previousCount.current = notificationCount
  }, [notificationCount])

  return (
    <div className={`themis-ai-launcher${docked ? ' themis-ai-launcher--docked' : ''}${preview ? ' themis-ai-launcher--preview' : ''}${forceHover ? ' themis-ai-launcher--force-hover' : ''}${notificationPop ? ' themis-ai-launcher--notification-pop' : ''}`}>
      <button type="button" className={`themis-ai-launcher-button${docked ? ' workspace-tools-dock-action' : ''}`} aria-label="THEMIS AIを開く" aria-haspopup="dialog" onClick={onOpen}
        onPointerEnter={(event) => { if (event.pointerType === 'mouse') setAttentive(true) }} onPointerLeave={() => setAttentive(false)} onFocus={() => setAttentive(true)} onBlur={() => setAttentive(false)}>
        <ThemisHead activity={currentActivity} expression={displayExpression} />
        <span className="themis-ai-launcher-online" aria-hidden="true" />
        {docked && <span aria-hidden="true">AI</span>}
        {showNotification && <span className="themis-ai-launcher-notification" aria-label={notificationCount > 0 ? `${notificationCount}件の新しい通知` : '新しい通知'}>{notificationCount > 0 ? Math.min(notificationCount, 9) : ''}</span>}
      </button>
      {!docked && <span className="themis-ai-launcher-hint" aria-hidden="true"><strong>AI Themis</strong><span>何かお手伝いしますか？</span></span>}
    </div>
  )
}
