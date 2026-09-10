import type { ReactNode } from 'react'
import { ArrowLeft, type LucideIcon } from 'lucide-react'
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

export type CaseSummaryItem = {
  label: string
  value: ReactNode
  unit?: string
  icon?: LucideIcon
  iconVariant?: 'blue' | 'purple' | 'amber' | 'green'
  sparkline?: boolean
  progress?: number
}

export function CaseSummaryStrip({ items }: { items: CaseSummaryItem[] }) {
  return (
    <div className="cm-summary-grid">
      {items.map((item, index) => (
        <article key={item.label || index} className="cm-summary-card">
          <div className="cm-summary-card-left">
            {item.icon && (
              <div className={`cm-summary-icon cm-summary-icon--${item.iconVariant ?? 'blue'}`}>
                <item.icon size={20} strokeWidth={2} />
              </div>
            )}
            <div className="cm-summary-card-body">
              <span className="cm-summary-label">{item.label}</span>
              <div className="cm-summary-val-row">
                <span className="cm-summary-val">{item.value}</span>
                {item.unit && <span className="cm-summary-unit">{item.unit}</span>}
              </div>
            </div>
          </div>
          {item.sparkline && (
            <div className="cm-summary-sparkline" aria-hidden="true">
              <svg width="68" height="32" viewBox="0 0 68 32" fill="none">
                <path d="M2 26C16 26 24 16 38 18C50 20 54 6 66 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 26C16 26 24 16 38 18C50 20 54 6 66 4V30H2V26Z" fill="currentColor" fillOpacity="0.12"/>
              </svg>
            </div>
          )}
          {item.progress !== undefined && (
            <div className="cm-summary-progress" aria-hidden="true">
              <div className="cm-summary-progress-bar">
                <div
                  className="cm-summary-progress-fill"
                  style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }}
                />
              </div>
            </div>
          )}
        </article>
      ))}
    </div>
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
