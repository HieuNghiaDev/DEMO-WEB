import { Outlet } from 'react-router-dom'
import ThemisAiAssistant from '../components/ai/ThemisAiAssistant'
import Sidebar from '../components/layout/Sidebar'

function MainLayout() {
  return (
    <div className="themis-app flex min-h-screen bg-gray-50">
      <Sidebar />

      <main className="min-w-0 flex-1">
        <Outlet />
      </main>

      <ThemisAiAssistant />
    </div>
  )
}

export default MainLayout
