import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export default function InspectorShell({ title, code, subtitle, children, footer, onClose, breakpoint = 1024 }: {
  title: string; code: ReactNode; subtitle?: string; children: ReactNode; footer: ReactNode; onClose: () => void; breakpoint?: number
}) {
  const [overlay, setOverlay] = useState(() => window.innerWidth < breakpoint)
  const panel = useRef<HTMLElement>(null)
  const close = useRef(onClose)
  const titleId = useId()
  useEffect(() => { close.current = onClose }, [onClose])
  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const change = () => setOverlay(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [breakpoint])
  useEffect(() => {
    const origin = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    if (overlay) document.body.style.overflow = 'hidden'
    panel.current?.focus({ preventScroll: true })
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current() }
      if (event.key !== 'Tab' || !overlay) return
      const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]') ?? []).filter(element => !element.closest('fieldset[disabled]') && element.getClientRects().length)
      const first = controls[0]; const last = controls.at(-1)
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = previousOverflow; if (origin?.isConnected) origin.focus({ preventScroll: true }) }
  }, [overlay])
  return <>
    {overlay && <div className="dc-backdrop" onClick={onClose} aria-hidden="true" />}
    <aside className={`dc-inspector ${overlay ? 'is-overlay' : ''}`} ref={panel} tabIndex={-1} role={overlay ? 'dialog' : 'region'} aria-modal={overlay || undefined} aria-labelledby={titleId}>
      <header className="dc-inspector-head"><div><span className="dc-code">{code}</span><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button type="button" className="dc-icon-button" aria-label="詳細を閉じる" onClick={onClose}><X size={20} /></button></header>
      <div className="dc-inspector-body">{children}</div>
      <footer className="dc-inspector-footer">{footer}</footer>
    </aside>
  </>
}
