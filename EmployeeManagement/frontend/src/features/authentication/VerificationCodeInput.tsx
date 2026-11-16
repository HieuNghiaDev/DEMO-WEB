import { useState } from 'react'

type VerificationCodeInputProps = {
  id: string
  name: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  autoFocus?: boolean
  describedBy?: string
}

const codeLength = 6

export function VerificationCodeInput({ id, name, value, onChange, disabled, autoFocus, describedBy }: VerificationCodeInputProps) {
  const [cursor, setCursor] = useState(0)
  const activeIndex = Math.min(cursor, value.length, codeLength - 1)

  return <span className="auth-challenge-otp">
    <span className="auth-challenge-otp-slots" aria-hidden="true">
      {Array.from({ length: codeLength }, (_, index) => <span key={index}
        data-active={index === activeIndex}
        data-filled={Boolean(value[index])}>{value[index]}</span>)}
    </span>
    <input id={id} name={name} type="text" inputMode="numeric" autoComplete="one-time-code"
      required pattern="[0-9]{6}" value={value} disabled={disabled} autoFocus={autoFocus}
      aria-describedby={describedBy}
      onChange={event => {
        const field = event.currentTarget
        const digits = field.value.replace(/\D/g, '').slice(0, codeLength)
        onChange(digits)
        setCursor(Math.min(field.selectionStart ?? digits.length, digits.length))
      }}
      onSelect={event => setCursor(event.currentTarget.selectionStart ?? value.length)}
      onClick={event => {
        const field = event.currentTarget
        if (!event.detail || field.selectionStart !== field.selectionEnd) return
        const bounds = field.getBoundingClientRect()
        const index = Math.floor((event.clientX - bounds.left) * codeLength / bounds.width)
        const nextCursor = Math.min(Math.max(index, 0), value.length)
        field.setSelectionRange(nextCursor, Math.min(nextCursor + 1, value.length))
        setCursor(nextCursor)
      }} />
  </span>
}
