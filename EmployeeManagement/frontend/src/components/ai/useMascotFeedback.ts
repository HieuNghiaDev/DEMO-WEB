import { useCallback, useEffect, useRef, useState } from 'react'
import { MASCOT_FEEDBACK_DURATION, type ThemisAction } from './mascotExpressions'

/** Presentation-only feedback: never changes request state or clears API errors. */
export function useMascotFeedback() {
  const [feedback, setFeedback] = useState<ThemisAction>('none')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current)
  }, [])

  const showFeedback = useCallback((action: 'success' | 'error' | 'none') => {
    if (timer.current !== null) clearTimeout(timer.current)
    setFeedback(action)
    timer.current = action === 'none' ? null : setTimeout(() => {
      timer.current = null
      setFeedback('none')
    }, MASCOT_FEEDBACK_DURATION[action])
  }, [])

  return { feedback, showFeedback }
}
