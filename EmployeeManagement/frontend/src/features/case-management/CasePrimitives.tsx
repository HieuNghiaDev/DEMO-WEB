import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import '../document-collection/documentCollection.css'
import './caseManagement.css'

// Presentation layer only — existing handlers/state/API must remain intact.

export function CaseHeaderIllustration() {
  return (
    <img className="cm-header-illustration" src="/images/filebg.png" alt="" aria-hidden="true" />
  )
}

export function CasePageHeader({
  title,
  description,
  actions,
  onBack,
  code,
  kicker,
  showIllustration = true
}: {
  title: string
  description?: string
  actions?: ReactNode
  onBack?: () => void
  code?: string
  kicker?: ReactNode
  showIllustration?: boolean
}) {
  return (
    <header className="cm-header">
      {showIllustration && !onBack && <CaseHeaderIllustration />}
      {onBack && (
        <div className="cm-breadcrumb">
          <button type="button" onClick={onBack}>
            <ArrowLeft size={15}/>案件一覧
          </button>
          {code && <><span>/</span><span>{code}</span></>}
        </div>
      )}
      <div className="cm-heading">
        <div className="cm-heading-text">
          {kicker && <div className="cm-kicker">{kicker}</div>}
          <h1>{title}</h1>
          {description && <p className="dc-meta">{description}</p>}
        </div>
        <div className="cm-heading-right">
          <div className="cm-actions">{actions}</div>
        </div>
      </div>
    </header>
  )
}

export function CaseFormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="cm-form-section">
      <h2>{title}</h2>
      {description && <p className="dc-meta">{description}</p>}
      <div className="cm-fields">{children}</div>
    </section>
  )
}
