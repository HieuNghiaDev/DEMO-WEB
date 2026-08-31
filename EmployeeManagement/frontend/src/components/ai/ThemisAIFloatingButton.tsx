import { useEffect, useState } from 'react'
import ThemisAIMascot from './ThemisAIMascot'
import { MASCOT_SLEEP_DELAY, resolveMascotExpression, type MascotExpression } from './mascotExpressions'

export default function ThemisAIFloatingButton({ onOpen, expression = 'idle' }: {
  onOpen: () => void
  expression?: MascotExpression
}) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [sleepy, setSleepy] = useState(false)

  useEffect(() => {
    let lastActivity = Date.now()
    let asleep = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const check = () => {
      const remaining = MASCOT_SLEEP_DELAY - (Date.now() - lastActivity)
      if (remaining > 0) timer = setTimeout(check, remaining)
      else { asleep = true; setSleepy(true) }
    }
    const wake = () => {
      if (document.hidden) return
      lastActivity = Date.now()
      if (asleep) {
        asleep = false
        setSleepy(false)
        timer = setTimeout(check, MASCOT_SLEEP_DELAY)
      }
    }
    const visibility = () => {
      clearTimeout(timer)
      if (!document.hidden) {
        asleep = false
        setSleepy(false)
        lastActivity = Date.now()
        timer = setTimeout(check, MASCOT_SLEEP_DELAY)
      }
    }
    timer = setTimeout(check, MASCOT_SLEEP_DELAY)
    window.addEventListener('pointermove', wake, { passive: true })
    window.addEventListener('pointerdown', wake, { passive: true })
    window.addEventListener('keydown', wake)
    window.addEventListener('scroll', wake, { passive: true, capture: true })
    document.addEventListener('visibilitychange', visibility)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointermove', wake)
      window.removeEventListener('pointerdown', wake)
      window.removeEventListener('keydown', wake)
      window.removeEventListener('scroll', wake, true)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])

  return (
    <div className="themis-ai-launcher">
      <button type="button" className="themis-ai-launcher-button" aria-label="THEMIS AIを開く" aria-haspopup="dialog"
        onClick={onOpen}
        onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHovered(true) }}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); setHovered(false) }}>
        <ThemisAIMascot expression={resolveMascotExpression(expression, hovered || focused, sleepy)} />
      </button>
      <span className="themis-ai-launcher-hint" aria-hidden="true">THEMIS AI に相談</span>
    </div>
  )
}
