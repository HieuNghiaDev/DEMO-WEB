// Dev-only visual/interaction fixture: no auth, user data or AI API requests.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import ThemisAIMascot from '../../src/components/ai/ThemisAIMascot'
import ThemisAIFloatingButton from '../../src/components/ai/ThemisAIFloatingButton'
import { useMascotFeedback } from '../../src/components/ai/useMascotFeedback'
import type { MascotExpression } from '../../src/components/ai/mascotExpressions'
import { ThemeProvider } from '../../src/contexts/ThemeContext'
import ThemeToggle from '../../src/components/layout/ThemeToggle'
import AppFooter from '../../src/components/layout/AppFooter'
import { initializeTheme } from '../../src/utils/theme'
import '../../src/index.css'

initializeTheme()
const expressions: MascotExpression[] = ['idle', 'hover', 'happy', 'thinking', 'sad', 'sleepy']
const buttonStyle = 'rounded-lg border border-slate-300 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-indigo-400 dark:border-slate-700'

export default function Preview() {
  const [open, setOpen] = useState(false)
  const [opens, setOpens] = useState(0)
  const [busy, setBusy] = useState(false)
  const { feedback, showFeedback } = useMascotFeedback()
  const [manual, setManual] = useState<MascotExpression | ''>('')
  const expression = manual || (busy ? 'thinking' : feedback)
  return <div className="themis-app flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
      <header className="mb-6 flex items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold">THEMIS companion</h1><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Development preview · SVG expressions · no API calls</p></div><ThemeToggle /></header>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {expressions.map(state => <figure key={state} className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 py-6 dark:border-slate-800">
          <div style={{ width: 144, height: 144 }}><ThemisAIMascot expression={state} /></div>
          <div style={{ width: 76, height: 76 }}><ThemisAIMascot expression={state} /></div>
          <figcaption className="text-xs text-slate-500 dark:text-slate-400">{state} · actual 76px below</figcaption>
        </figure>)}
      </div>
      <fieldset className="mt-6 flex flex-wrap gap-2"><legend className="mb-2 text-sm">Floating expression override</legend>{(['', ...expressions] as const).map(state => <button type="button" key={state} className={buttonStyle} aria-pressed={manual === state} onClick={() => setManual(state)}>{state || 'automatic'}</button>)}</fieldset>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className={buttonStyle} onClick={() => { setManual(''); showFeedback('idle'); setBusy(true) }}>Simulate thinking</button>
        <button className={buttonStyle} onClick={() => { setManual(''); setBusy(false); showFeedback('happy') }}>Simulate success</button>
        <button className={buttonStyle} onClick={() => { setManual(''); setBusy(false); showFeedback('sad') }}>Simulate error</button>
      </div>
      <p className="mt-4 text-sm">Open callback count: <output aria-label="Open count">{opens}</output></p>
      <p className="mt-2 pb-24 text-xs text-slate-500">Automatic mode sleeps after 55 seconds without interaction. Click, pointer and keyboard wake it.</p>
    </main>
    <AppFooter />
    {!open && <ThemisAIFloatingButton expression={expression} onOpen={() => { setOpens(opens + 1); setOpen(true) }} />}
    {open && <div role="dialog" aria-label="Preview AI panel" className="fixed bottom-24 right-4 z-[90] w-[min(360px,calc(100vw-32px))] rounded-xl border border-slate-300 bg-white p-5 shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-3"><ThemisAIMascot compact expression={expression} /><h2>Preview AI panel</h2></div>
      <p className="my-4 text-sm">The actual launcher opened this test panel; no AI request was sent.</p>
      <button className={buttonStyle} onClick={() => setOpen(false)}>Close preview</button>
    </div>}
  </div>
}

const previewRoot = createRoot(document.getElementById('root')!)
previewRoot.render(<ThemeProvider><Preview /></ThemeProvider>)
import.meta.hot?.dispose(() => previewRoot.unmount())
