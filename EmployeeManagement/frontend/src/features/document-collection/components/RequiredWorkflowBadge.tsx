import { Check } from 'lucide-react'
import { requiredWorkflowStatuses, type RequiredWorkflowCode } from '../requiredWorkflowPresentation'
import './requiredWorkflowBadge.css'

export default function RequiredWorkflowBadge({ status, className = '' }: { status: RequiredWorkflowCode; className?: string }) {
  const presentation = requiredWorkflowStatuses[status]
  return <span className={`dc-required-workflow-badge ${className}`} data-status={status}>
    {presentation.indicator === 'check' ? <Check size={12} aria-hidden="true"/> : <span className="dc-required-workflow-dot" aria-hidden="true"/>}
    {presentation.label}
  </span>
}
