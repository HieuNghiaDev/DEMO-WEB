// Dev-only presentation checks. No account data, auth provider or API calls.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import AppFooter from '../../src/components/layout/AppFooter'
import SettingsLogoutAction from '../../src/components/settings/SettingsLogoutAction'
import LogoutConfirmationDialog from '../../src/components/settings/LogoutConfirmationDialog'
import ThemeToggle from '../../src/components/layout/ThemeToggle'
import { ThemeProvider } from '../../src/contexts/ThemeContext'
import { initializeTheme } from '../../src/utils/theme'
import '../../src/index.css'

initializeTheme()

export default function Preview() {
  const [open, setOpen] = useState(false)
  const [longPage, setLongPage] = useState(false)
  const [confirmations, setConfirmations] = useState(0)
  return <div className="themis-app flex min-h-screen bg-gray-50 text-slate-900 dark:text-slate-100">
    <aside className="hidden w-72 shrink-0 border-r border-slate-200 p-4 dark:border-slate-800 md:block">Layout test</aside>
    <div className="flex min-h-screen min-w-0 flex-1 flex-col">
      <main className="min-w-0 flex-1 p-4 md:p-6">
        <h1 className="text-xl font-semibold">Settings controls — visual test</h1>
        <p className="mt-2 text-sm text-slate-500">No account data. Confirmation only updates the counter below.</p>
        <div className="my-4 flex items-center gap-4"><ThemeToggle /><button type="button" onClick={() => setLongPage(!longPage)}>Toggle long content</button></div>
        <div className="max-w-xs border-t border-slate-200 pt-3 dark:border-slate-800"><SettingsLogoutAction onClick={() => setOpen(true)} /></div>
        <output aria-label="Confirmations">{confirmations}</output>
        {longPage && <div className="h-[1400px] border-l border-slate-200 px-4 dark:border-slate-800">Long content</div>}
      </main>
      <AppFooter />
    </div>
    {open && <LogoutConfirmationDialog isLoggingOut={false} onCancel={() => setOpen(false)} onConfirm={() => { setConfirmations(confirmations + 1); setOpen(false) }} />}
  </div>
}

createRoot(document.getElementById('root')!).render(<ThemeProvider><Preview /></ThemeProvider>)
