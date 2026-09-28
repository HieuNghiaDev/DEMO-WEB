import { memo, useState } from 'react'

export type UserAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
export type UserAvatarStatus = 'online' | 'working' | 'break' | 'outside' | 'offline'
export type UserAvatarShape = 'squircle' | 'circle'

type Props = {
  name?: string | null
  stableKey?: string | number | null
  imageSrc?: string | null
  imageAlt?: string
  size?: UserAvatarSize
  status?: UserAvatarStatus
  bordered?: boolean
  shape?: UserAvatarShape
  className?: string
}

const sizeClasses: Record<UserAvatarSize, string> = {
  xs: 'h-6 w-6 text-[9px]',
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-10 w-10 text-xs',
  lg: 'h-12 w-12 text-sm',
  xl: 'h-14 w-14 text-base',
}

const statusSizeClasses: Record<UserAvatarSize, string> = {
  xs: 'h-2 w-2 border',
  sm: 'h-2.5 w-2.5 border-2',
  md: 'h-2.5 w-2.5 border-2',
  lg: 'h-3 w-3 border-2',
  xl: 'h-3 w-3 border-2',
}

const statusClasses: Record<UserAvatarStatus, string> = {
  online: 'bg-emerald-500',
  working: 'bg-emerald-500',
  break: 'bg-amber-500',
  outside: 'bg-blue-500',
  offline: 'bg-slate-400 dark:bg-slate-500',
}

const palette = [
  'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200',
  'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200',
  'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-200',
  'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-200',
  'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200',
  'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200',
] as const

export function getUserInitials(name?: string | null): string {
  const parts = name?.trim().split(/\s+/u).filter(Boolean) ?? []
  if (parts.length === 0) return '?'

  if (parts.length > 1) {
    return parts
      .slice(0, 2)
      .map((part) => Array.from(part)[0] ?? '')
      .join('')
      .toLocaleUpperCase()
  }

  return Array.from(parts[0]).slice(0, 2).join('').toLocaleUpperCase() || '?'
}

function paletteIndex(value: string) {
  let hash = 0
  for (const character of value) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) | 0
  }
  return Math.abs(hash) % palette.length
}

function UserAvatarComponent({
  name,
  stableKey,
  imageSrc,
  imageAlt,
  size = 'md',
  status,
  bordered = true,
  shape = 'squircle',
  className = '',
}: Props) {
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null)
  const displayName = name?.trim() || ''
  const colorKey = String(stableKey ?? displayName ?? '?')
  const showImage = Boolean(imageSrc) && failedImageSrc !== imageSrc

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-visible font-bold leading-none tracking-[0.02em] ${sizeClasses[size]} ${shape === 'circle' ? 'rounded-full' : 'rounded-xl'} ${bordered ? 'border border-slate-200/90 dark:border-white/10' : ''} ${palette[paletteIndex(colorKey)]} ${className}`}
      aria-hidden={!showImage ? 'true' : undefined}
    >
      {showImage ? (
        <img
          src={imageSrc ?? undefined}
          alt={imageAlt ?? `${displayName || 'ユーザー'}のプロフィール画像`}
          className={`h-full w-full object-cover ${shape === 'circle' ? 'rounded-full' : 'rounded-[inherit]'}`}
          onError={() => setFailedImageSrc(imageSrc ?? null)}
        />
      ) : (
        <span aria-hidden="true">{getUserInitials(displayName)}</span>
      )}

      {status && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 rounded-full border-white dark:border-[var(--tm-surface,#11161f)] ${statusSizeClasses[size]} ${statusClasses[status]}`}
          aria-hidden="true"
        />
      )}
    </span>
  )
}

export const UserAvatar = memo(UserAvatarComponent)
