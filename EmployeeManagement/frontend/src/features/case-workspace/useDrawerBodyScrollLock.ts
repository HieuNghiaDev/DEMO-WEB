import { useEffect, useRef } from 'react'

let activeDrawerLocks = 0
let originalBodyOverflow = ''
let originalBodyPaddingRight = ''

function lockBodyScroll() {
  if (activeDrawerLocks === 0) {
    originalBodyOverflow = document.body.style.overflow
    originalBodyPaddingRight = document.body.style.paddingRight

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }

    document.body.style.overflow = 'hidden'
    document.body.classList.add('themis-drawer-open')
  }

  activeDrawerLocks += 1
}

function unlockBodyScroll() {
  activeDrawerLocks = Math.max(0, activeDrawerLocks - 1)
  if (activeDrawerLocks > 0) return

  document.body.style.overflow = originalBodyOverflow
  document.body.style.paddingRight = originalBodyPaddingRight
  document.body.classList.remove('themis-drawer-open')
}

export function useDrawerBodyScrollLock(isActive: boolean, onEscape: () => void) {
  const onEscapeRef = useRef(onEscape)

  useEffect(() => {
    onEscapeRef.current = onEscape
  }, [onEscape])

  useEffect(() => {
    if (!isActive || typeof document === 'undefined') return

    lockBodyScroll()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onEscapeRef.current()
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      unlockBodyScroll()
    }
  }, [isActive])
}
