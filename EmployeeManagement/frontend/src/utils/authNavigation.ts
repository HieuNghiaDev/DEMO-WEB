/** Password forms are actions, never destinations to resume after signing in. */
export function getLoginDestination(requested: unknown, mustChangePassword = false): string {
  if (mustChangePassword) return '/change-password'

  if (typeof requested !== 'string' || !requested.startsWith('/') || requested.startsWith('//') || requested.includes('\\')) {
    return '/'
  }

  const pathname = requested.split(/[?#]/, 1)[0].replace(/\/+$/, '').toLowerCase() || '/'
  if (['/login', '/change-password', '/system/password'].includes(pathname)) {
    return '/'
  }

  return requested
}
