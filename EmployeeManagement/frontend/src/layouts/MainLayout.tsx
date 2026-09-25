import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import ThemisAiAssistant from '../components/ai/ThemisAiAssistant'
import Sidebar from '../components/layout/Sidebar'
import AppFooter from '../components/layout/AppFooter'
import UpdateNotesModal from '../components/layout/UpdateNotesModal'
import { appVersionTag, lastSeenVersionStorageKey } from '../config/app'
import { RouteProgress } from '../components/loading'

function MainLayout() {
  const location = useLocation()
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false)

  useEffect(() => {
    try {
      if (window.localStorage.getItem(lastSeenVersionStorageKey) !== appVersionTag) {
        setReleaseNotesOpen(true)
      }
    } catch {
      setReleaseNotesOpen(true)
    }
  }, [])

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
