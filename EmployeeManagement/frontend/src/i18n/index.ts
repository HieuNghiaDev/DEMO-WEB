import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ja from './locales/ja.json'
import vi from './locales/vi.json'
import {
  getInitialLocale,
  LANGUAGE_STORAGE_KEY,
  resolveLocale,
  type SupportedLocale,
} from './locale'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      ja: { translation: ja },
      vi: { translation: vi },
    },
    lng: getInitialLocale(),
    fallbackLng: 'ja',
    supportedLngs: ['ja', 'vi'],
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  })

export async function setAppLanguage(locale: SupportedLocale): Promise<void> {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, locale)
  await i18n.changeLanguage(locale)
}

export { getInitialLocale, resolveLocale, type SupportedLocale }
export default i18n
