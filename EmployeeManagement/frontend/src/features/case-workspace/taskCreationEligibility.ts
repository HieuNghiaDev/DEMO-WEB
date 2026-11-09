import type { CaseTaskRequirementOption } from './types'

/** Existence is separate from the privacy-filtered task records used for display. */
export function hasExistingDocumentTask(document: CaseTaskRequirementOption): boolean {
  return document.has_existing_task === true || document.case_tasks.length > 0
}

export function eligibleTaskDocumentIds(documents: CaseTaskRequirementOption[]): number[] {
  return documents.filter(document => !hasExistingDocumentTask(document)).map(document => document.id)
}

export function selectedEligibleTaskDocuments(documents: CaseTaskRequirementOption[], selectedIds: number[]): CaseTaskRequirementOption[] {
  return [...new Set(selectedIds)].map(id => documents.find(document => document.id === id))
    .filter((document): document is CaseTaskRequirementOption => !!document && !hasExistingDocumentTask(document))
}
