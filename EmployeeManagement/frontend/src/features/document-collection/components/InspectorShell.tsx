import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function InspectorShell({ title, code, subtitle, children, footer, headerAside, onClose, breakpoint = 1280, forceOverlay = false, className = '', backdropClassName = '', editLayout = false }: {
  title: string; code: ReactNode; subtitle?: string; children: ReactNode; footer?: ReactNode; headerAside?: ReactNode; onClose: () => void; breakpoint?: number; forceOverlay?: boolean; className?: string; backdropClassName?: string; editLayout?: boolean
}) {
  const { t } = useTranslation()
  const [overlay, setOverlay] = useState(() => forceOverlay || window.innerWidth < breakpoint)
  const panel = useRef<HTMLElement>(null)
  const close = useRef(onClose)
  const titleId = useId()
  useEffect(() => { close.current = onClose }, [onClose])
  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const change = () => setOverlay(forceOverlay || media.matches)
    change()
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [breakpoint, forceOverlay])
  useEffect(() => {
    const origin = document.activeElement as HTMLElement | null
    const currentPanel = panel.current
    const previousOverflow = document.body.style.overflow
    if (overlay) document.body.style.overflow = 'hidden'
    panel.current?.focus({ preventScroll: true })
    const keydown = (event: KeyboardEvent) => {
      const overlays = Array.from(document.querySelectorAll<HTMLElement>('.dc-inspector.is-overlay'))
      if (overlays.at(-1) !== panel.current) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close.current() }
      if (event.key !== 'Tab' || !overlay) return
      const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]') ?? []).filter(element => !element.closest('fieldset[disabled]') && element.getClientRects().length)
      const first = controls[0]; const last = controls.at(-1)
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      document.removeEventListener('keydown', keydown)
      document.body.style.overflow = previousOverflow
      if (origin?.isConnected) origin.focus({ preventScroll: true })
      else {
        const parent = Array.from(document.querySelectorAll<HTMLElement>('.dc-inspector.is-overlay')).filter(element => element !== currentPanel).at(-1)
        parent?.focus({ preventScroll: true })
      }
    }
  }, [overlay])
  const inspector = <>
    {overlay && <div className={`dc-backdrop ${backdropClassName}`.trim()} onClick={onClose} aria-hidden="true" />}
    <aside className={`dc-inspector ${overlay ? 'is-overlay' : ''} ${editLayout ? 'cm-ws-drawer cm-incident-drawer' : ''} ${className}`.trim()} ref={panel} tabIndex={-1} role={overlay ? 'dialog' : 'region'} aria-modal={overlay || undefined} aria-labelledby={titleId}>
      {editLayout ? <header className="cm-incident-drawer-header"><div className="cm-incident-drawer-header-left"><span className="cm-incident-drawer-iconbox" aria-hidden="true">{code}</span><div className="cm-incident-drawer-title-wrap"><h2 id={titleId} className="cm-incident-drawer-title">{title}</h2>{subtitle && <p className="cm-incident-drawer-subtext">{subtitle}</p>}</div></div><button type="button" className="cm-incident-drawer-close-btn" aria-label={t('documentCollection.editor.closeDetail')} onClick={onClose}><X size={20}/></button></header> : <header className="dc-inspector-head"><div><span className="dc-code">{code}</span><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><div className="dc-inspector-head-actions">{headerAside}<button type="button" className="dc-icon-button" aria-label={t('documentCollection.editor.closeDetail')} onClick={onClose}><X size={20} /></button></div></header>}
      <div className={`dc-inspector-body ${editLayout ? 'cm-incident-drawer-body' : ''}`}>{children}</div>
      {footer && <footer className={`dc-inspector-footer ${editLayout ? 'cm-incident-drawer-footer' : ''}`}>{footer}</footer>}
    </aside>
  </>

  return overlay ? createPortal(inspector, document.body) : inspector
}
