export function maskEmail(value: string): string {
  const atIndex = value.lastIndexOf('@')
  if (atIndex <= 0) return value.length <= 2 ? `${value.slice(0, 1)}***` : `${value.slice(0, 3)}***`

  const localPart = value.slice(0, atIndex)
  const domain = value.slice(atIndex)
  const visibleLength = Math.min(3, Math.max(1, localPart.length - 1))
  return `${localPart.slice(0, visibleLength)}***${domain}`
}

export function maskPhone(value: string): string {
  const blocks = value.split('-')
  if (blocks.length >= 3) return `${blocks[0]}-****-${blocks.at(-1)}`

  const digits = value.replace(/\D/gu, '')
  if (digits.length < 7) return `${digits.slice(0, 2)}***${digits.slice(-2)}`
  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`
}
