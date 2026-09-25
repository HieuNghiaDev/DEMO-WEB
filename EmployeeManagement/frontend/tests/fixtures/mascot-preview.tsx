// Dev-only visual fixture: no auth, user data, routing, or AI API requests.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import ThemisHead from '../../src/components/ai/ThemisHead'
import ThemisAIFloatingButton from '../../src/components/ai/ThemisAIFloatingButton'
import { THEMIS_EXPRESSION_PREVIEW_STATES, type ThemisActivity, type ThemisExpression } from '../../src/components/ai/mascotExpressions'
import { ThemeProvider } from '../../src/contexts/ThemeContext'
import ThemeToggle from '../../src/components/layout/ThemeToggle'
import { initializeTheme } from '../../src/utils/theme'
import '../../src/index.css'

initializeTheme()
const expressions = THEMIS_EXPRESSION_PREVIEW_STATES
const activities: ThemisActivity[] = ['processing', 'searching', 'generating', 'success', 'error']
const buttonStyle = 'rounded-lg border border-slate-300 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-indigo-400 dark:border-slate-700'

function StateCard({ label, expression = 'idle', activity = 'none', interactive = false }: { label: string; expression?: ThemisExpression; activity?: ThemisActivity; interactive?: boolean }) {
  return <figure className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><ThemisHead activity={activity} expression={expression} interactive={interactive} size={112} /><figcaption className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</figcaption></figure>
}

export default function Preview() {
  const [openCount, setOpenCount] = useState(0)
  const [selectedExpression, setSelectedExpression] = useState<ThemisExpression>('idle')
  const [selectedActivity, setSelectedActivity] = useState<ThemisActivity>('none')

  return <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <div className="mx-auto max-w-6xl">
      <header className="mb-7 flex items-center justify-between gap-4"><div><p className="text-xs font-bold tracking-[.18em] text-indigo-500">DEV PREVIEW</p><h1 className="mt-1 text-2xl font-semibold">AI Themis · Head states</h1><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">One shell, dynamic SVG face, no API calls.</p></div><ThemeToggle /></header>
      <section><h2 className="mb-3 text-sm font-bold">IDLE 30 SECOND DEMO</h2><div className="max-w-64"><StateCard interactive label="Open eyes · blink · gaze · soft smile" /></div></section>
      <section className="mt-8"><h2 className="mb-3 text-sm font-bold">EXPRESSIONS</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{expressions.map(state => <StateCard key={state} label={state} expression={state} />)}</div></section>
      <section className="mt-8"><h2 className="mb-3 text-sm font-bold">ACTIVITY</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{activities.map(state => <StateCard key={state} label={state} activity={state} expression={state === 'success' ? 'happy' : state === 'error' ? 'confused' : 'idle'} />)}</div></section>
      <section className="mt-8"><h2 className="mb-3 text-sm font-bold">FLOATING</h2><div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><figure className="flex min-h-32 flex-col items-center justify-center gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><ThemisAIFloatingButton preview onOpen={() => setOpenCount(value => value + 1)} /><figcaption className="text-xs text-slate-500">Normal</figcaption></figure><figure className="flex min-h-32 flex-col items-center justify-center gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><ThemisAIFloatingButton forceHover preview onOpen={() => setOpenCount(value => value + 1)} /><figcaption className="text-xs text-slate-500">Hover</figcaption></figure><figure className="flex min-h-32 flex-col items-center justify-center gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><ThemisAIFloatingButton notificationCount={2} preview onOpen={() => setOpenCount(value => value + 1)} /><figcaption className="text-xs text-slate-500">Notification</figcaption></figure></div></section>
      <section className="mt-8 pb-28"><h2 className="mb-3 text-sm font-bold">INTERACTIVE STATE SWITCHER</h2><div className="flex flex-wrap gap-2">{expressions.map(state => <button className={buttonStyle} key={state} onClick={() => { setSelectedExpression(state); setSelectedActivity('none') }}>{state}</button>)}{activities.map(state => <button className={buttonStyle} key={state} onClick={() => setSelectedActivity(state)}>{state}</button>)}</div><div className="mt-5 flex items-center gap-5"><ThemisHead activity={selectedActivity} expression={selectedExpression} size={144} /><p className="text-sm text-slate-500">expression: {selectedExpression}<br />activity: {selectedActivity}<br />launcher opens: {openCount}</p></div></section>
    </div>
    <ThemisAIFloatingButton activity={selectedActivity} expression={selectedExpression} onOpen={() => setOpenCount(value => value + 1)} />
  </main>
}

const previewRoot = createRoot(document.getElementById('root')!)
previewRoot.render(<ThemeProvider><Preview /></ThemeProvider>)
import.meta.hot?.dispose(() => previewRoot.unmount())
