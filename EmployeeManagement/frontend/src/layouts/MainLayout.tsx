import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import ThemisAiAssistant from '../components/ai/ThemisAiAssistant'
import Sidebar from '../components/layout/Sidebar'
import AppFooter from '../components/layout/AppFooter'
import UpdateNotesModal from '../components/layout/UpdateNotesModal'
import { lastSeenVersionStorageKey } from '../config/app'
import { RouteProgress } from '../components/loading'
import { useAppRelease } from '../contexts/AppReleaseContext'
import { releaseVersionTag } from '../features/releases/releaseApi'

function MainLayout() {
  const location = useLocation()
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false)
  const { currentRelease, isLoading } = useAppRelease()

  useEffect(() => {
    if (isLoading) return
    const currentVersionTag = releaseVersionTag(currentRelease)
    const openTimer = window.setTimeout(() => {
      try {
        if (window.localStorage.getItem(lastSeenVersionStorageKey) !== currentVersionTag) {
          setReleaseNotesOpen(true)
        }
      } catch {
        setReleaseNotesOpen(true)
      }
    }, 0)
    return () => window.clearTimeout(openTimer)
  }, [currentRelease, isLoading])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname])

  return (
    <div className="themis-app flex min-h-screen bg-[var(--tm-bg)] text-[var(--tm-text-primary)]">
      <RouteProgress key={location.key} />
      <Sidebar />

      <div className="flex min-h-screen min-w-0 flex-1 flex-col pt-[calc(56px+env(safe-area-inset-top))] xl:pt-0">
        <main key={location.pathname} className="themis-page-transition min-w-0 flex-1">
          <Outlet />
        </main>
        <AppFooter onOpenReleaseNotes={() => setReleaseNotesOpen(true)} />
      </div>

      <ThemisAiAssistant />
      <UpdateNotesModal isOpen={releaseNotesOpen} onOpenChange={setReleaseNotesOpen} />
    </div>
  )
}

export default MainLayout
