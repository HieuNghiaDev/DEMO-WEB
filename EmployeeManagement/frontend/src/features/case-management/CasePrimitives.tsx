import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import '../document-collection/documentCollection.css'
import './caseManagement.css'

export function CasePageHeader({ title, description, actions, onBack, code, kicker }: { title: string; description?: string; actions?: ReactNode; onBack?: () => void; code?: string; kicker?: ReactNode }) {
  return <header className="cm-header">
    {onBack && <div className="cm-breadcrumb"><button type="button" onClick={onBack}><ArrowLeft size={15}/>案件一覧</button>{code && <><span>/</span><span>{code}</span></>}</div>}
    <div className="cm-heading"><div>{kicker && <p className="cm-kicker">{kicker}</p>}<h1>{title}</h1>{description && <p className="dc-meta">{description}</p>}</div><div className="cm-actions">{actions}</div></div>
  </header>
}
export function CaseSummaryStrip({ items }: { items: { label: string; value: ReactNode }[] }) {
  return <dl className="cm-summary">{items.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
}
export function CaseFormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="cm-form-section"><h2>{title}</h2>{description && <p className="dc-meta">{description}</p>}<div className="cm-fields">{children}</div></section>
}
