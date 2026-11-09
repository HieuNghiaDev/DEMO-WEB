import { useEffect, useRef, useState } from 'react'

export function useDrawerDismiss(onClose: () => void) {
  const [closing, setClosing] = useState(false)
  const timer = useRef<number | null>(null)
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current) }, [])
  const close = () => {
    if (closing) return
    setClosing(true)
    timer.current = window.setTimeout(onClose, 210)
  }
  return { closing, close }
}
