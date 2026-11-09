type ResultDisplay = {
  label: string
  client_name?: string
  case_code?: string
  title?: string
  details?: string
}
type OpenCase = { action: 'open_case'; case_id: number } & ResultDisplay
export type WorkspaceDocumentSelection = {
  action: 'open_case_document'
  case_id: number
  document_id: number
  document_version_id: number
  source: 'received' | 'generated'
  version: number
}
export type OpenCaseDocument = WorkspaceDocumentSelection & ResultDisplay
export type AiNavigationOption = OpenCase | OpenCaseDocument
export type AiNavigationResult = { status: 'open' | 'choose' | 'not_found' | 'clarify'; options: AiNavigationOption[] }

const isId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

function option(value: unknown): AiNavigationOption | null {
  const row = record(value)
  if (!row || !isId(row.case_id) || typeof row.label !== 'string' || !row.label.trim() || row.label.length > 1500) return null
  const { action, case_id, label, document_id, document_version_id, source, version } = row
  const display: ResultDisplay = { label }
  for (const key of ['client_name', 'case_code', 'title', 'details'] as const) {
    const value = row[key]
    if (typeof value === 'string' && value.trim() && value.length <= 1500) display[key] = value.trim()
  }
  if (action === 'open_case') return { action, case_id, ...display }
  if (action === 'open_case_document' && isId(document_id) && isId(document_version_id) && isId(version)
    && (source === 'received' || source === 'generated')) {
    return { action, case_id, ...display, document_id, document_version_id, source, version }
  }
  return null
}

export function parseAiNavigation(value: unknown): AiNavigationResult | undefined {
  const result = record(value)
  if (!result || !Array.isArray(result.options) || result.options.length > 6) return
  const { status } = result
  if (status !== 'open' && status !== 'choose' && status !== 'not_found' && status !== 'clarify') return
  const options = result.options.map(option).filter(item => item !== null)
  if (options.length !== result.options.length
    || (status === 'open' && options.length !== 1)
    || (status === 'choose' && options.length === 0)
    || ((status === 'not_found' || status === 'clarify') && options.length !== 0)) return
  return { status, options }
}

export function aiNavigationLocation(target: AiNavigationOption) {
  if (target.action === 'open_case_document') {
    const { action, case_id, document_id, document_version_id, source, version } = target
    return {
      pathname: `/quests/${case_id}`,
      search: `?document=${document_id}`,
      state: { workspaceTab: 'documents' as const, aiDocument: { action, case_id, document_id, document_version_id, source, version } },
    }
  }
  return {
    pathname: `/quests/${target.case_id}`,
    state: null,
  }
}

export function aiDocumentForCase(value: unknown, caseId: number): WorkspaceDocumentSelection | undefined {
  const row = record(value)
  if (!row || row.case_id !== caseId || !isId(caseId)) return
  const { action, document_id, document_version_id, source, version } = row
  if (action === 'open_case_document' && isId(document_id) && isId(document_version_id) && isId(version)
    && (source === 'received' || source === 'generated')) {
    return { action, case_id: caseId, document_id, document_version_id, source, version }
  }
}
