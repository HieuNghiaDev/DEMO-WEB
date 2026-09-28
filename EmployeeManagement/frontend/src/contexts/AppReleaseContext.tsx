import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { appMetadata } from '../config/app'
import { fetchCurrentRelease, type AppRelease } from '../features/releases/releaseApi'

type AppReleaseContextValue = {
  currentRelease: AppRelease
  isLoading: boolean
  error: string | null
  refreshRelease: () => Promise<AppRelease | null>
}

const fallbackRelease: AppRelease = {
  id: null,
  version: appMetadata.version,
  codename: appMetadata.codename,
  release_type: 'minor',
  title: 'THEMIS アップデート',
  release_notes: { ui: [], new_features: [], improvements: [], bug_fixes: [] },
  released_at: null,
  environment: /build$/i.test(appMetadata.environmentLabel)
    ? appMetadata.environmentLabel
    : `${appMetadata.environmentLabel} Build`,
  build_date: appMetadata.build.replaceAll('.', '-'),
  status: 'fallback',
}

const AppReleaseContext = createContext<AppReleaseContextValue | undefined>(undefined)

export function AppReleaseProvider({ children }: { children: ReactNode }) {
  const [currentRelease, setCurrentRelease] = useState<AppRelease>(fallbackRelease)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshRelease = useCallback(async () => {
    try {
      const release = await fetchCurrentRelease()
      setCurrentRelease(release)
      setError(null)
      return release
    } catch {
      setError('バージョン情報を取得できませんでした。')
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshRelease(), 0)
    return () => window.clearTimeout(timer)
  }, [refreshRelease])

  const value = useMemo(() => ({ currentRelease, isLoading, error, refreshRelease }), [
    currentRelease,
    error,
    isLoading,
    refreshRelease,
  ])

  return <AppReleaseContext.Provider value={value}>{children}</AppReleaseContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppRelease() {
  const context = useContext(AppReleaseContext)
  if (!context) throw new Error('useAppRelease must be used inside AppReleaseProvider')
  return context
}
