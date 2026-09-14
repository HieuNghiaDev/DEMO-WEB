import React, { type ButtonHTMLAttributes, type ReactNode } from 'react'
import { ButtonSpinner } from '../loading/ButtonSpinner'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  iconPosition?: 'left' | 'right'
  loading?: boolean
  fullWidth?: boolean
  children?: ReactNode
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--tm-primary)] text-white hover:bg-[var(--tm-primary-hover)] active:opacity-95 shadow-sm border border-transparent disabled:bg-[var(--tm-primary)]/50',
  secondary:
    'bg-[var(--tm-surface-elevated)] text-[var(--tm-text-primary)] hover:bg-[var(--tm-surface-hover)] border border-[var(--tm-border)] active:bg-[var(--tm-surface-active)] shadow-xs',
  outline:
    'bg-transparent text-[var(--tm-text-primary)] hover:bg-[var(--tm-surface-hover)] border border-[var(--tm-border)] active:bg-[var(--tm-surface-active)]',
  ghost:
    'bg-transparent text-[var(--tm-text-secondary)] hover:text-[var(--tm-text-primary)] hover:bg-[var(--tm-surface-hover)] active:bg-[var(--tm-surface-active)] border border-transparent',
  danger:
    'bg-[var(--tm-danger)] text-white hover:opacity-90 active:opacity-100 shadow-sm border border-transparent disabled:bg-[var(--tm-danger)]/50',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-xs rounded-lg gap-1.5 font-medium',
  md: 'h-[38px] px-3.5 text-sm rounded-lg gap-2 font-medium',
  lg: 'h-11 px-5 text-sm sm:text-base rounded-lg gap-2.5 font-medium',
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    icon,
    iconPosition = 'left',
    loading = false,
    fullWidth = false,
    disabled = false,
    className = '',
    children,
    ...rest
  },
  ref
) {
  const isDisabled = disabled || loading

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      className={`
        inline-flex items-center justify-center select-none
        transition-all duration-150 ease-out
        active:scale-[0.98] disabled:active:scale-100
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-focus-ring)] focus-visible:ring-offset-1
        disabled:cursor-not-allowed disabled:opacity-60
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `.trim()}
      {...rest}
    >
      {loading ? (
        <ButtonSpinner className="h-4 w-4" />
      ) : (
        icon && iconPosition === 'left' && <span className="shrink-0 flex items-center">{icon}</span>
      )}
      {children && <span>{children}</span>}
      {!loading && icon && iconPosition === 'right' && (
        <span className="shrink-0 flex items-center">{icon}</span>
      )}
    </button>
  )
})

export default Button
