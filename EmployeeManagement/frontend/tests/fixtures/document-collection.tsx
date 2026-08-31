// Vite dev-only presentation harness. No auth provider, backend or API access.
// Reserve the same 288px desktop shell width; the actual route uses MainLayout.
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from '../../src/contexts/ThemeContext'
import ThemeToggle from '../../src/components/layout/ThemeToggle'
import DocumentCollectionMockupPage from '../../src/features/document-collection-mockup/DocumentCollectionMockupPage'
import { initializeTheme } from '../../src/utils/theme'
import '../../src/index.css'

initializeTheme()
createRoot(document.getElementById('root')!).render(<ThemeProvider><BrowserRouter>
  <div className="themis-app min-h-screen bg-gray-50">
    <div className="fixed left-4 top-4 z-50 flex items-center gap-3"><ThemeToggle /><span className="text-xs text-slate-500 dark:text-slate-400">UI review · no API</span></div>
    <div className="md:ml-72"><DocumentCollectionMockupPage /></div>
  </div>
</BrowserRouter></ThemeProvider>)
