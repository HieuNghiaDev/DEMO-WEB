import { useCallback, useEffect, useRef, useState } from 'react'
import { MASCOT_FEEDBACK_DURATION, type MascotExpression } from './mascotExpressions'

/** Presentation-only feedback: never changes request state or clears API errors. */
export function useMascotFeedback() {
  const [feedback, setFeedback] = useState<MascotExpression>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [])

  const showFeedback = useCallback((expression: 'happy' | 'sad' | 'idle') => {
    if (!mounted.current) return
    if (timer.current !== null) clearTimeout(timer.current)
    setFeedback(expression)
    timer.current = expression === 'idle' ? null : setTimeout(() => {
      timer.current = null
      setFeedback('idle')
    }, MASCOT_FEEDBACK_DURATION[expression])
  }, [])

  return { feedback, showFeedback }
}
