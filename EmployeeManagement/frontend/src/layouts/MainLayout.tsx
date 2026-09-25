import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import ThemisAiAssistant from '../components/ai/ThemisAiAssistant'
import Sidebar from '../components/layout/Sidebar'
import AppFooter from '../components/layout/AppFooter'
import { RouteProgress } from '../components/loading'

function MainLayout() {
  const location = useLocation()

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
        <AppFooter />
      </div>

      <ThemisAiAssistant />
    </div>
  )
}

export default MainLayout
