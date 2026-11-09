// Dev-only manual verification of the production dialog. No API or data mutations.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import BulkNecessityDialog from '../../src/features/document-collection/components/BulkNecessityDialog'
import ModalShell from '../../src/components/ui/ModalShell'
import '../../src/index.css'
import '../../src/features/document-collection/documentCollection.css'

if (!import.meta.env.DEV) throw new Error('Development-only dialog verification')

export function Harness() {
  const [open, setOpen] = useState(false)
  const [nested, setNested] = useState(false)
  const [clicks, setClicks] = useState(0)
  const [busy, setBusy] = useState(false)
  return <div style={{ minHeight: 2000, background: 'var(--tm-bg)', color: 'var(--tm-text-primary)' }}>
    <aside style={{ position: 'fixed', inset: '0 auto 0 0', width: '18vw', padding: 12, zIndex: 50, background: 'var(--tm-sidebar)', borderRight: '1px solid var(--tm-border)' }}>THEMIS<br/><button onClick={() => setClicks(value => value + 1)}>Sidebar action</button></aside>
    <header style={{ position: 'sticky', top: 0, marginLeft: '18vw', padding: 16, zIndex: 30, background: 'var(--tm-surface)' }}>
      <button onClick={() => setOpen(true)}>一括変更を開く</button>{' '}
      <button onClick={() => document.documentElement.classList.toggle('dark')}>テーマ切替</button>{' '}
      <label><input type="checkbox" checked={busy} onChange={event => setBusy(event.target.checked)}/>処理中</label>
      <p>Background clicks: {clicks}. Isolated production component; no API calls.</p>
    </header>
    {/* A transformed content ancestor recreates the original fixed-position trap. */}
    <main style={{ marginLeft: '18vw', padding: 16, transform: 'translateZ(0)' }}>
      <h1>資料収集</h1><p>Scroll the page before opening. Background and sidebar must remain dimmed and inactive.</p>
      {open && <BulkNecessityDialog action="not_required" count={3} busy={busy} error={null} onClose={() => setOpen(false)} onConfirm={() => setNested(true)}/>}
      {nested && <ModalShell isOpen title="Nested dialog verification" titleId="nested-title" onClose={() => setNested(false)}><p>Closing this dialog must not unlock the parent.</p></ModalShell>}
    </main>
    <button style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 90, padding: 16, background: 'var(--tm-primary)', color: '#fff' }} onClick={() => setClicks(value => value + 1)}>Floating assistant</button>
    <footer style={{ marginLeft: '18vw', marginTop: 1400, padding: 16 }}>Bottom area</footer>
  </div>
}
const root = createRoot(document.getElementById('root')!)
root.render(<Harness/>)
import.meta.hot?.dispose(() => root.unmount())
