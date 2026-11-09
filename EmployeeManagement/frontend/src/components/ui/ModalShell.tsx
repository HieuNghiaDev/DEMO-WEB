import React, { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { IconButton } from './IconButton'
import { useModalEnvironment } from './useModalEnvironment'

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full'

export interface ModalShellProps {
  isOpen: boolean
  onClose: () => void
  title: ReactNode
  titleId?: string
  description?: ReactNode
  icon?: ReactNode
  size?: ModalSize
  children: ReactNode
  footer?: ReactNode
  className?: string
  overlayClassName?: string
  backdropClassName?: string
  /** Keep an existing feature dialog's markup while reusing the global modal layer. */
  customContent?: boolean
  dismissible?: boolean
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-6xl',
}

export const ModalShell: React.FC<ModalShellProps> = ({
  isOpen,
  onClose,
  title,
  titleId,
  description,
  icon,
  size = 'md',
  children,
  footer,
  className = '',
  overlayClassName = '',
  backdropClassName = '',
  customContent = false,
  dismissible = true,
}) => {
  const layerRef = useRef<HTMLDivElement>(null)
  const dismissRef = useRef({ onClose, dismissible })
  useEffect(() => {
    dismissRef.current = { onClose, dismissible }
  }, [onClose, dismissible])
  const dismiss = () => { if (dismissRef.current.dismissible) dismissRef.current.onClose() }
  useModalEnvironment(isOpen, layerRef, dismissRef)

  if (!isOpen) return null

  return createPortal(
    <div
      ref={layerRef}
      className={`fixed inset-0 ${customContent ? '' : 'flex items-center justify-center overflow-y-auto p-4 sm:p-6'} ${overlayClassName}`}
      style={{ zIndex: 'var(--tm-layer-modal)' }}
      role={customContent ? undefined : 'dialog'}
      aria-modal={customContent ? undefined : true}
      aria-labelledby={customContent ? undefined : titleId}
      tabIndex={-1}
      onMouseDown={customContent ? event => { if (event.target === event.currentTarget) dismiss() } : undefined}
    >
      {customContent ? children : <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/65 backdrop-blur-[2px] transition-opacity duration-200 ${backdropClassName}`}
        onClick={dismiss}
        aria-hidden="true"
      />

      {/* Dialog card */}
      <div
        className={`
          relative z-10 w-full rounded-xl bg-[var(--tm-surface)] border border-[var(--tm-border)]
          shadow-xl transition-all duration-200 flex flex-col max-h-[90vh]
          ${sizeClasses[size]}
          ${className}
        `.trim()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--tm-border)] p-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0 pr-4">
            {icon && (
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--tm-surface-elevated)] border border-[var(--tm-border)] text-[var(--tm-primary)] shrink-0">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h3 id={titleId} className="text-base font-semibold text-[var(--tm-text-primary)] truncate">
                {title}
              </h3>
              {description && (
                <p className="mt-0.5 text-xs text-[var(--tm-text-secondary)]">
                  {description}
                </p>
              )}
            </div>
          </div>

          <IconButton
            variant="ghost"
            size="sm"
            aria-label="閉じる"
            onClick={dismiss}
          >
            <X className="h-4 w-4" />
          </IconButton>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] p-4 sm:px-6 rounded-b-xl">
            {footer}
          </div>
        )}
      </div>
      </>}
    </div>,
    document.body,
  )
}

export default ModalShell
