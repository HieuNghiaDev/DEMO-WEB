import { Fragment, createElement } from 'react'
import type { ReactNode } from 'react'
import type { DocumentDraft, DocumentTemplateDefinition, DocumentRendererType } from '../documentTemplates'

type RendererProps = {
  template: DocumentTemplateDefinition
  draft: DocumentDraft
  documentVersion?: number
}

const allowedTags = new Set(['article', 'section', 'div', 'p', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'dl', 'dt', 'dd', 'br'])

function TemplateFields({ template, draft }: RendererProps) {
  return <dl>{template.fields.map(field => {
    const value = draft[field.key]
    if (field.type === 'textarea' && !value) return null
    return <Fragment key={field.key}><dt>{field.label}</dt><dd>{value || '—'}</dd></Fragment>
  })}</dl>
}

function templateNodes(template: DocumentTemplateDefinition, draft: DocumentDraft): ReactNode[] {
  const document = new DOMParser().parseFromString(`<body>${template.templateBody}</body>`, 'text/html')
  const values: DocumentDraft = { ...draft, document_name: template.name }
  let key = 0

  const render = (node: Node): ReactNode => {
    const nodeKey = key++
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent?.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, field: string) => values[field] || '—') ?? ''
    }
    if (!(node instanceof Element)) return null
    const tag = node.tagName.toLowerCase()
    if (!allowedTags.has(tag)) return null
    if (tag === 'section' && node.hasAttribute('data-template-fields')) {
      return <TemplateFields key={nodeKey} template={template} draft={draft}/>
    }
    if (tag === 'br') return <br key={nodeKey}/>
    return createElement(tag, { key: nodeKey }, Array.from(node.childNodes, render))
  }

  return Array.from(document.body.childNodes, render)
}

function GenericLegalDocumentRenderer({ template, draft, documentVersion }: RendererProps) {
  const usesFieldPlaceholder = template.templateBody.includes('data-template-fields')
  return <article className="c001-paper">
    <span className="c001-paper-code">{template.documentCode} / v{documentVersion ?? 1}</span>
    {templateNodes(template, draft)}
    {usesFieldPlaceholder && <p className="c001-paper-placeholder">参考出力：正式な契約本文は未収録です。</p>}
  </article>
}

const renderers: Record<DocumentRendererType, (props: RendererProps) => React.JSX.Element> = {
  generic_legal_document: GenericLegalDocumentRenderer,
}

export default function DocumentReviewRenderer(props: RendererProps) {
  const Renderer = renderers[props.template.rendererType]
  return <Renderer {...props}/>
}
