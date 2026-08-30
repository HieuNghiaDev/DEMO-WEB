// Isolated dev-only visual fixture: real theme components, no auth or API mocks.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider, useTheme } from '../../src/contexts/ThemeContext'
import SidebarUtilityPanel from '../../src/components/layout/SidebarUtilityPanel'
import { initializeTheme } from '../../src/utils/theme'
import '../../src/index.css'

initializeTheme()

function Preview() {
  const { theme, setTheme } = useTheme()
  return <div className="themis-app min-h-screen bg-slate-50 p-4 md:p-8">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-700">
      <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">THEMIS HQ</h1>
      <div style={{ width: 'min(255px, calc(88vw - 32px))', maxWidth: '100%' }}><SidebarUtilityPanel /></div>
    </header>
    <main className="mt-6 max-w-2xl rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-lg text-slate-900 dark:text-slate-100">外観・動作確認</h2>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Theme motion test fixture — no account data.</p>
      <p className="mt-4 text-sm text-slate-700 dark:text-slate-300">現在のテーマ: <output>{theme}</output></p>
      <div className="mt-4 flex gap-3">{(['light', 'dark'] as const).map(mode => <button key={mode} onClick={event => setTheme(mode, event.currentTarget)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 dark:border-slate-600 dark:text-slate-200">{mode === 'light' ? 'ライト' : 'ダーク'}</button>)}</div>
    </main>
  </div>
}

createRoot(document.getElementById('root')!).render(<StrictMode><ThemeProvider><Preview /></ThemeProvider></StrictMode>)
