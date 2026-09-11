import React, { type InputHTMLAttributes } from 'react'
import { Search, X } from 'lucide-react'

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  value: string
  onChangeValue?: (value: string) => void
  onClear?: () => void
  shortcutHint?: string
  size?: 'sm' | 'md'
  containerClassName?: string
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  {
    value,
    onChange,
    onChangeValue,
    onClear,
    shortcutHint,
    size = 'md',
    placeholder = '検索...',
    className = '',
    containerClassName = '',
    disabled = false,
    ...rest
  },
  ref
) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onChange) onChange(e)
    if (onChangeValue) onChangeValue(e.target.value)
  }

  const handleClear = () => {
    if (onClear) {
      onClear()
    } else if (onChangeValue) {
      onChangeValue('')
    }
  }

  const heightClass = size === 'sm' ? 'h-8 text-xs' : 'h-[38px] text-sm'
  const iconSize = size === 'sm' ? 14 : 16

  return (
    <div
      className={`
        relative flex items-center w-full rounded-lg
        bg-[var(--tm-surface-elevated)] border border-[var(--tm-border)]
        focus-within:border-[var(--tm-border-focus)] focus-within:ring-2 focus-within:ring-[var(--tm-focus-ring)]/25
        transition-all duration-150
        ${disabled ? 'opacity-60 cursor-not-allowed' : ''}
        ${containerClassName}
      `.trim()}
    >
      <div className="flex items-center justify-center pl-3 pr-1 text-[var(--tm-text-muted)] pointer-events-none shrink-0">
        <Search size={iconSize} aria-hidden="true" />
      </div>

      <input
        ref={ref}
        type="text"
        value={value}
        onChange={handleChange}
        disabled={disabled}
        placeholder={placeholder}
        className={`
          w-full bg-transparent px-2 text-[var(--tm-text-primary)] placeholder:text-[var(--tm-text-muted)]
          focus:outline-none disabled:cursor-not-allowed
          ${heightClass}
          ${className}
        `.trim()}
        {...rest}
      />

      {value ? (
        <button
          type="button"
          onClick={handleClear}
          disabled={disabled}
          className="mr-2 flex h-5 w-5 items-center justify-center rounded text-[var(--tm-text-muted)] hover:text-[var(--tm-text-primary)] hover:bg-[var(--tm-surface-hover)] focus:outline-none transition-colors"
          aria-label="検索内容をクリア"
        >
          <X size={13} />
        </button>
      ) : (
        shortcutHint && (
          <div className="mr-2.5 hidden sm:flex items-center pointer-events-none">
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-[var(--tm-text-muted)] bg-[var(--tm-surface)] border border-[var(--tm-border)] rounded shadow-2xs">
              {shortcutHint}
            </kbd>
          </div>
        )
      )}
    </div>
  )
})

export default SearchInput
