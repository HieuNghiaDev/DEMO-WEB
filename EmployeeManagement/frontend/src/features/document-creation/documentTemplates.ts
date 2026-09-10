export type DocumentWorkflowStatus = 'not_created' | 'draft' | 'review' | 'approved'

export type DocumentFieldType = 'text' | 'date' | 'textarea'

export type DocumentFieldDefinition = {
  key: string
  label: string
  type: DocumentFieldType
  required?: boolean
  source?: string
  wide?: boolean
  rows?: number
}

export type DocumentRendererType = 'generic_legal_document'

export type DocumentTemplateDefinition = {
  id: number
  documentTypeId: number
  documentCode: string
  name: string
  version: number
  rendererType: DocumentRendererType
  format: 'html'
  templateBody: string
  fields: readonly DocumentFieldDefinition[]
}

export type DocumentDraft = Record<string, string>
