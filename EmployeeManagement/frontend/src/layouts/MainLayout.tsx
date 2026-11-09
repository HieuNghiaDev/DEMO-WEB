import { useEffect, useState } from 'react'
import { matchPath, Outlet, useLocation } from 'react-router-dom'
import ThemisAiAssistant from '../components/ai/ThemisAiAssistant'
import NotificationCenter from '../components/employee-room/NotificationCenter'
import Sidebar from '../components/layout/Sidebar'
import AppFooter from '../components/layout/AppFooter'
import UpdateNotesModal from '../components/layout/UpdateNotesModal'
import { lastSeenVersionStorageKey } from '../config/app'
import { RouteProgress } from '../components/loading'
import { useAppRelease } from '../contexts/AppReleaseContext'
import { releaseVersionTag } from '../features/releases/releaseApi'
import { InternalChatProvider } from '../features/internal-chat/InternalChatContext'
import InternalChatLauncher from '../features/internal-chat/InternalChatLauncher'
import '../features/internal-chat/internalChat.css'
import './workspaceToolsDock.css'

function MainLayout() {
  const location = useLocation()
  const isMfaSettings = matchPath('/system/mfa', location.pathname) !== null
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false)
  const [chatLauncherHost, setChatLauncherHost] = useState<HTMLDivElement | null>(null)
  const [aiLauncherHost, setAiLauncherHost] = useState<HTMLDivElement | null>(null)
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
    <InternalChatProvider>
    <NotificationCenter>
    <div className="themis-app flex min-h-screen bg-[var(--tm-bg)] text-[var(--tm-text-primary)]">
      <RouteProgress key={location.key} />
      <Sidebar />

      <div className="flex min-h-screen min-w-0 flex-1 flex-col pt-[calc(56px+env(safe-area-inset-top))] xl:pt-0">
        <div className="workspace-tools-dock" role="group" aria-label="クイックアクセス">
          <div className="contents" ref={setChatLauncherHost} />
          <div className="contents" ref={setAiLauncherHost} />
        </div>
        <main key={location.pathname} className="themis-page-transition min-w-0 flex-1">
          <Outlet />
        </main>
        <AppFooter onOpenReleaseNotes={() => setReleaseNotesOpen(true)} />
      </div>

      <InternalChatLauncher launcherHost={isMfaSettings ? null : chatLauncherHost} />
      <ThemisAiAssistant launcherHost={isMfaSettings ? null : aiLauncherHost} />
      <UpdateNotesModal isOpen={releaseNotesOpen} onOpenChange={setReleaseNotesOpen} />
    </div>
    </NotificationCenter>
    </InternalChatProvider>
  )
}

export default MainLayout
