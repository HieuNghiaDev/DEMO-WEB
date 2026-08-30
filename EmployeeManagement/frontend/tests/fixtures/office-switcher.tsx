// Dev-only fixture of the real component, using the existing EmployeeRoom office labels.
// No authenticated page, API requests, or production office records are modified.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import OfficeSwitcher from '../../src/components/employee-room/OfficeSwitcher'
import ThemeToggle from '../../src/components/layout/ThemeToggle'
import { ThemeProvider } from '../../src/contexts/ThemeContext'
import { initializeTheme } from '../../src/utils/theme'
import '../../src/index.css'

const offices = [
  { id: 'themis', name: 'THEMIS株式会社', address: '大阪府松原市北新町2-5-13', logo: 'T' },
  { id: 'law', name: '中華総合法律事務所', address: '大阪府松原市天美東1-80-22', logo: '法' },
] as const

initializeTheme()

function Preview() {
  const [selected, setSelected] = useState<'themis' | 'law'>('law')
  return <div className="themis-app office-qa-layout bg-slate-50">
    <aside className="office-qa-sidebar" aria-label="Sidebar width reference" />
    <main className="office-qa-content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}><p>Office selector — isolated UI test</p><ThemeToggle /></div>
      <OfficeSwitcher offices={offices} selectedOfficeId={selected} onSelectOffice={setSelected} summary="2法人・1チーム" />
      <p>Selected office: <output>{selected}</output></p>
    </main>
  </div>
}

createRoot(document.getElementById('root')!).render(<StrictMode><ThemeProvider><Preview /></ThemeProvider></StrictMode>)
