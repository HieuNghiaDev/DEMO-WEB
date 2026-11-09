import { Info } from 'lucide-react'
import { legalApprovalPendingMessage } from '../legalApproval'

export default function LegalApprovalNotice() {
  return <p role="status" className="flex items-start gap-2 rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] px-3 py-2 text-xs leading-5 text-[var(--tm-text-secondary)]">
    <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true"/>
    <span>{legalApprovalPendingMessage}</span>
  </p>
}
