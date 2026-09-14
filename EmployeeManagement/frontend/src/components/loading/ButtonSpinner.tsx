import { Loader2 } from 'lucide-react'
export interface ButtonSpinnerProps {
  className?: string
  size?: number
}

export function ButtonSpinner({ className, size = 16 }: ButtonSpinnerProps) {
  return (
    <Loader2
      size={size}
      className={`animate-spin shrink-0 motion-reduce:animate-none ${className ?? ''}`.trim()}
      aria-hidden="true"
    />
  )
}
