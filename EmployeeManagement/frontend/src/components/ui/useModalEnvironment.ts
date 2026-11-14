import { useEffect, type RefObject } from 'react'

// One shared lock for ModalShell instances: a nested dialog must not unlock its parent.
const layers: HTMLElement[] = []
const inertBefore = new Map<HTMLElement, boolean>()
let restoreScroll: (() => void) | null = null

function syncBackground() {
  const top = layers.at(-1)
  for (const child of document.body.children) {
    if (!(child instanceof HTMLElement)) continue
    if (!inertBefore.has(child)) inertBefore.set(child, child.inert)
    child.inert = child !== top
  }
}

function lockPage() {
  const body = document.body
  const html = document.documentElement
  const padding = body.style.paddingRight
  const htmlOverflow = html.style.overflow
  const overscroll = html.style.overscrollBehavior
  const scrollbar = Math.max(0, window.innerWidth - html.clientWidth)
  // Stable gutters already reserve the scrollbar's width.
  if (scrollbar && !getComputedStyle(html).scrollbarGutter.includes('stable')) {
    body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight) + scrollbar}px`
  }
  // Keep body out of the scroll chain so the desktop sidebar stays sticky to the viewport.
  html.style.overflow = 'hidden'
  html.style.overscrollBehavior = 'none'
  return () => {
    body.style.paddingRight = padding
    html.style.overflow = htmlOverflow
    html.style.overscrollBehavior = overscroll
  }
}

const focusableSelector = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
function focusable(layer: HTMLElement) {
  return Array.from(layer.querySelectorAll<HTMLElement>(focusableSelector))
    .filter(element => !element.matches(':disabled') && !element.closest('[inert]') && element.getClientRects().length > 0 && element.tabIndex >= 0)
}

export function useModalEnvironment(
  isOpen: boolean,
  layerRef: RefObject<HTMLDivElement | null>,
  dismissRef: RefObject<{ onClose: () => void; dismissible: boolean }>,
) {
  useEffect(() => {
    const layer = layerRef.current
    if (!isOpen || !layer) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!layers.length) restoreScroll = lockPage()
    layers.push(layer)
    syncBackground()
    // Include newly mounted portals/widgets in the inactive background too.
    const observer = new MutationObserver(syncBackground)
    observer.observe(document.body, { childList: true })
    const isTop = () => layers.at(-1) === layer
    const focusFirst = () => {
      const controls = focusable(layer)
      ;(controls.find(element => element.dataset.modalAutofocus === 'true') ?? controls[0] ?? layer).focus({ preventScroll: true })
    }
    if (!layer.contains(document.activeElement)) focusFirst()

    const onFocus = (event: FocusEvent) => {
      if (isTop() && !layer.contains(event.target as Node)) focusFirst()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTop()) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        if (dismissRef.current.dismissible) dismissRef.current.onClose()
      } else if (event.key === 'Tab') {
        const controls = focusable(layer)
        const first = controls[0]
        const last = controls.at(-1)
        if (!first || !layer.contains(document.activeElement) || document.activeElement === layer || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
          event.preventDefault()
          ;(event.shiftKey ? last ?? layer : first ?? layer).focus({ preventScroll: true })
        }
      }
    }
    document.addEventListener('focusin', onFocus, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      const wasTop = isTop()
      observer.disconnect()
      document.removeEventListener('focusin', onFocus, true)
      document.removeEventListener('keydown', onKeyDown, true)
      layers.splice(layers.indexOf(layer), 1)
      if (layers.length) syncBackground()
      else {
        for (const [element, inert] of inertBefore) element.inert = inert
        inertBefore.clear()
        restoreScroll?.()
        restoreScroll = null
      }
      if (wasTop && opener?.isConnected && !opener.closest('[inert]')) opener.focus({ preventScroll: true })
    }
  }, [isOpen, layerRef, dismissRef])
}
