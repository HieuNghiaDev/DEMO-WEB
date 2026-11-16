export const MFA_BACKUP_CODES_PATH = '/system/mfa/backup-codes'

/** These auth screens are transient and cannot be resumed after signing in. */
export function getLoginDestination(requested: unknown, mustChangePassword = false): string {
  if (mustChangePassword) return '/change-password'

  if (typeof requested !== 'string' || !requested.startsWith('/') || requested.startsWith('//') || requested.includes('\\')) {
    return '/'
  }

  const pathname = requested.split(/[?#]/, 1)[0].replace(/\/+$/, '').toLowerCase() || '/'
  if (['/login', '/activate-account', '/change-password', '/system/password', MFA_BACKUP_CODES_PATH].includes(pathname)) {
    return '/'
  }

  return requested
}
