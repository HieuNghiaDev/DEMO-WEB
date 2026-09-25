import { useEffect, useRef, useState } from 'react'
import ThemisFace from './ThemisFace'
import { resolveMascotVisualState, THEMIS_HEAD_ASSET, type ThemisActivity, type ThemisExpression, type ThemisGazeDirection } from './mascotExpressions'
import './ThemisAIMascot.css'

type ThemisHeadProps = {
  size?: number | string
  expression?: ThemisExpression
  activity?: ThemisActivity
  gaze?: ThemisGazeDirection
  interactive?: boolean
  className?: string
}

type IdleBeat = { expression: ThemisExpression; gaze: ThemisGazeDirection; duration: number; delay: number }

// A fixed sequence avoids hydration variance while keeping the resting mascot attentive.
const IDLE_BEATS: IdleBeat[] = [
  { expression: 'neutral', gaze: 'left', duration: 1_300, delay: 8_000 },
  { expression: 'softSmile', gaze: 'center', duration: 1_500, delay: 6_500 },
  { expression: 'neutral', gaze: 'right', duration: 1_300, delay: 7_000 },
  { expression: 'curious', gaze: 'right', duration: 1_450, delay: 14_000 },
  { expression: 'neutral', gaze: 'up', duration: 1_100, delay: 16_000 },
  { expression: 'wink', gaze: 'center', duration: 720, delay: 20_000 },
  { expression: 'sleepy', gaze: 'center', duration: 650, delay: 23_000 },
]

const BLINK_DELAYS = [4_800, 6_700, 5_300, 7_600, 5_900] as const

export default function ThemisHead({ size = '100%', expression = 'idle', activity = 'none', gaze, interactive = true, className = '' }: ThemisHeadProps) {
  const [blinking, setBlinking] = useState(false)
  const [idleReaction, setIdleReaction] = useState<{ expression: ThemisExpression; gaze: ThemisGazeDirection } | null>(null)
  const blinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const blinkCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const secondBlinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reactionCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const timers = [blinkTimer, blinkCloseTimer, secondBlinkTimer, reactionTimer, reactionCloseTimer]
    const clearTimers = () => timers.forEach((timer) => { if (timer.current) clearTimeout(timer.current) })
    clearTimers()
    let active = true
    const resetFrame = window.requestAnimationFrame(() => {
      if (!active) return
      setBlinking(false)
      setIdleReaction(null)
    })

    if (!interactive || activity !== 'none' || expression !== 'idle' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return () => { active = false; window.cancelAnimationFrame(resetFrame); clearTimers() }
    }

    let blinkIndex = 0
    let beatIndex = 0
    const scheduleBlink = () => {
      blinkTimer.current = setTimeout(() => {
        if (!active) return
        setBlinking(true)
        blinkCloseTimer.current = setTimeout(() => { if (active) setBlinking(false) }, 150)
        // A rare second blink gives the mascot a natural rhythm without distracting motion.
        if (blinkIndex > 0 && blinkIndex % 5 === 0) {
          secondBlinkTimer.current = setTimeout(() => {
            if (!active) return
            setBlinking(true)
            blinkCloseTimer.current = setTimeout(() => { if (active) setBlinking(false) }, 130)
          }, 330)
        }
        blinkIndex += 1
        scheduleBlink()
      }, BLINK_DELAYS[blinkIndex % BLINK_DELAYS.length])
    }
    const scheduleBeat = () => {
      const beat = IDLE_BEATS[beatIndex % IDLE_BEATS.length]
      reactionTimer.current = setTimeout(() => {
        if (!active) return
        setBlinking(false)
        setIdleReaction({ expression: beat.expression, gaze: beat.gaze })
        reactionCloseTimer.current = setTimeout(() => {
          if (!active) return
          setIdleReaction(null)
        }, beat.duration)
        beatIndex += 1
        scheduleBeat()
      }, beat.delay)
    }

    scheduleBlink()
    scheduleBeat()
    return () => { active = false; window.cancelAnimationFrame(resetFrame); clearTimers() }
  }, [activity, expression, interactive])

  const isIdleBase = activity === 'none' && expression === 'idle'
  const currentExpression = isIdleBase ? (idleReaction?.expression ?? expression) : expression
  const currentGaze = isIdleBase && idleReaction ? idleReaction.gaze : gaze
  const visualState = resolveMascotVisualState(activity, currentExpression)

  return <span className={`themis-head${className ? ` ${className}` : ''}`} data-activity={activity} data-expression={currentExpression} data-state={visualState} style={{ width: size, height: size }} aria-hidden="true"><img alt="" className="themis-head-shell" decoding="async" draggable={false} src={THEMIS_HEAD_ASSET} /><ThemisFace activity={activity} blinking={blinking && isIdleBase && idleReaction === null} expression={currentExpression} gaze={currentGaze} /></span>
}

export { ThemisHead }
