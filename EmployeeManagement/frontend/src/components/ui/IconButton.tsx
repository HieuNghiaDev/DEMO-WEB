import React, { type ButtonHTMLAttributes, type ReactNode } from 'react'
import { ButtonSpinner } from '../loading/ButtonSpinner'

export type IconButtonVariant = 'ghost' | 'outline' | 'secondary' | 'primary'
export type IconButtonSize = 'sm' | 'md' | 'lg'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string
  variant?: IconButtonVariant
  size?: IconButtonSize
  loading?: boolean
  children: ReactNode
}

const variantStyles: Record<IconButtonVariant, string> = {
  ghost:
    'bg-transparent text-[var(--tm-text-secondary)] hover:text-[var(--tm-text-primary)] hover:bg-[var(--tm-surface-hover)] active:bg-[var(--tm-surface-active)] border border-transparent',
  outline:
    'bg-transparent text-[var(--tm-text-primary)] hover:bg-[var(--tm-surface-hover)] border border-[var(--tm-border)] active:bg-[var(--tm-surface-active)]',
  secondary:
    'bg-[var(--tm-surface-elevated)] text-[var(--tm-text-primary)] hover:bg-[var(--tm-surface-hover)] border border-[var(--tm-border)] active:bg-[var(--tm-surface-active)] shadow-xs',
  primary:
    'bg-[var(--tm-primary)] text-white hover:bg-[var(--tm-primary-hover)] active:opacity-95 shadow-sm border border-transparent disabled:bg-[var(--tm-primary)]/50',
}

const sizeStyles: Record<IconButtonSize, string> = {
  sm: 'h-7 w-7 rounded-md p-1 [&_svg]:h-3.5 [&_svg]:w-3.5',
  md: 'h-9 w-9 rounded-lg p-2 [&_svg]:h-4 [&_svg]:w-4',
  lg: 'h-10 w-10 rounded-lg p-2.5 [&_svg]:h-5 [&_svg]:w-5',
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    variant = 'ghost',
    size = 'md',
    loading = false,
    disabled = false,
    className = '',
    children,
    title,
    'aria-label': ariaLabel,
    ...rest
  },
  ref
) {
  const isDisabled = disabled || loading

  return (
    <button
      ref={ref}
      aria-label={ariaLabel}
      title={title || ariaLabel}
      disabled={isDisabled}
      className={`
        inline-flex items-center justify-center select-none shrink-0
        transition-all duration-150 ease-out
        active:scale-[0.95] disabled:active:scale-100
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-focus-ring)] focus-visible:ring-offset-1
        disabled:cursor-not-allowed disabled:opacity-50
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `.trim()}
      {...rest}
    >
      {loading ? (
        <ButtonSpinner className="h-4 w-4" />
      ) : (
        children
      )}
    </button>
  )
})

export default IconButton
