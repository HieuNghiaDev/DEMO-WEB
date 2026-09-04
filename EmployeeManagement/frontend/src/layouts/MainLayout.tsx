import { Outlet } from 'react-router-dom'
import ThemisAiAssistant from '../components/ai/ThemisAiAssistant'
import Sidebar from '../components/layout/Sidebar'
import AppFooter from '../components/layout/AppFooter'

function MainLayout() {
  return (
    <div className="themis-app flex min-h-screen bg-[var(--tm-bg)] text-[var(--tm-text-primary)]">
      <Sidebar />

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
        <AppFooter />
      </div>

      <ThemisAiAssistant />
    </div>
  )
}

export default MainLayout
