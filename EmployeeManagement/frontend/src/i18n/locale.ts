export const SUPPORTED_LOCALES = ['ja', 'vi'] as const

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export const LANGUAGE_STORAGE_KEY = 'themis_language'

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return value === 'ja' || value === 'vi'
}

export function resolveLocale(
  storedLanguage: string | null | undefined,
  browserLanguage: string | null | undefined,
): SupportedLocale {
  if (storedLanguage !== null && storedLanguage !== undefined) {
    return isSupportedLocale(storedLanguage) ? storedLanguage : 'ja'
  }

  return browserLanguage?.toLowerCase().startsWith('vi') ? 'vi' : 'ja'
}

export function getInitialLocale(): SupportedLocale {
  if (typeof window === 'undefined') return 'ja'

  return resolveLocale(
    window.localStorage.getItem(LANGUAGE_STORAGE_KEY),
    window.navigator.language,
  )
}
