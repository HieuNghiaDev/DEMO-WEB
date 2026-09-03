import { Check, ChevronRight } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { CollectionDetail, CollectionDraft, EmployeeOption } from '../types'
import { collectionLabels, fulfillmentLabels, necessityLabels, priorityLabels, resultLabels, reviewLabels } from '../labels'
import { formatDate, fromLocalDateTime, toLocalDateTime } from '../utils'

export type InspectorEditSection = 'necessity' | 'conditions' | 'preparation' | 'receipt' | 'review' | 'exception'

export default function CollectionEditor({ detail, draft, onChange, errors, employees, employeeError, disabled, canReviewDocuments, editing, onStartEdit, receivedDocuments }: {
  detail: CollectionDetail; draft: CollectionDraft; onChange: (draft: CollectionDraft) => void
  errors: Record<string, string>; employees: EmployeeOption[]; employeeError: string | null; disabled: boolean; canReviewDocuments: boolean
  editing: InspectorEditSection | null; onStartEdit: (section: InspectorEditSection) => void; receivedDocuments: ReactNode
}) {
  const { t } = useTranslation()
  const prefix = useId()
  const editor = useRef<HTMLFieldSetElement>(null)
  useEffect(() => { if (Object.keys(errors).length) editor.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus() }, [errors])
  const update = <K extends keyof CollectionDraft>(key: K, value: CollectionDraft[K]) => onChange({ ...draft, [key]: value })
  const errorId = (key: keyof CollectionDraft) => `${prefix}-${key}-error`
  const fieldError = (key: keyof CollectionDraft) => errors[key] ? <span className="dc-danger" id={errorId(key)}>{errors[key]}</span> : null
  const fieldProps = (key: keyof CollectionDraft) => ({ 'aria-invalid': !!errors[key], 'aria-describedby': errors[key] ? errorId(key) : undefined })
  const textField = (key: keyof CollectionDraft, label: string, options: { area?: boolean; type?: string; wide?: boolean; max?: number } = {}) => <label className={options.wide ? 'dc-wide' : undefined}>{label}
    {options.area ? <textarea {...fieldProps(key)} rows={2} maxLength={options.max} value={String(draft[key] ?? '')} onChange={event => update(key, event.target.value || null)} /> : <input {...fieldProps(key)} type={options.type ?? 'text'} maxLength={options.max} value={String(draft[key] ?? '')} onChange={event => update(key, event.target.value || null)} />}{fieldError(key)}
  </label>
  const select = <K extends 'collection_status' | 'collection_result' | 'fulfillment_status' | 'review_status' | 'collection_priority'>(key: K, label: string, labels: Record<string, string>) => <label>{label}<select {...fieldProps(key)} value={draft[key] ?? ''} onChange={event => update(key, (event.target.value || null) as CollectionDraft[K])}>{key === 'collection_result' && <option value="">{t('documentCollection.toolbar.noException')}</option>}{Object.entries(labels).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select>{fieldError(key)}</label>
  const assigneeOptions = detail.assigned_employee && !employees.some(employee => employee.id === detail.assigned_employee?.id) ? [detail.assigned_employee, ...employees] : employees
  const action = (section: InspectorEditSection, label: string, emphasis?: 'necessity' | 'preparation') => !disabled && editing === null && <button type="button" className={`dc-text-action${emphasis ? ` dc-text-action--${emphasis}` : ''}`} onClick={() => onStartEdit(section)}>{label}</button>

  return <fieldset ref={editor} className="dc-editor dc-inspector-editor" disabled={disabled}>
    <section className="dc-detail-section dc-inspector-section">
      <SectionHeading label="A" title={t('documentCollection.editor.necessity')} action={action('necessity', t('documentCollection.editor.changeNecessity'), 'necessity')}/>
      {editing === 'necessity' ? <>
        <div className="dc-necessity" aria-label={t('documentCollection.editor.necessityAria')}>
          {Object.keys(necessityLabels).map(value => (
            <button
              type="button"
              key={value}
              aria-pressed={draft.necessity_status === value}
              className={[
                'dc-necessity-btn',
                `dc-necessity-btn--${value}`,
                draft.necessity_status === value ? 'is-active' : ''
              ].filter(Boolean).join(' ')}
              onClick={() => update('necessity_status', value as CollectionDraft['necessity_status'])}
            >
              {draft.necessity_status === value && <Check size={14} strokeWidth={2.5} />}
              {t(`documentCollection.status.necessity.${value}`)}
            </button>
          ))}
        </div>
        {fieldError('necessity_status')}
        <label className="dc-reason-label">
          {t('documentCollection.editor.reason')}
          {draft.necessity_status === 'not_required' && <span className="dc-required-mark"> ({t('documentCollection.editor.required')})</span>}
          <textarea
            {...fieldProps('necessity_reason')}
            aria-required={draft.necessity_status === 'not_required'}
            rows={3}
            maxLength={5000}
            disabled={draft.necessity_status === 'undetermined'}
            value={draft.necessity_reason ?? ''}
            placeholder={draft.necessity_status === 'undetermined' ? t('documentCollection.editor.reasonDisabled') : t('documentCollection.editor.reasonPlaceholder')}
            onChange={event => update('necessity_reason', event.target.value || null)}
          />
          {fieldError('necessity_reason')}
        </label>
      </> : <dl className="dc-readable-facts"><dt>{t('documentCollection.editor.necessity')}</dt><dd><strong className={`dc-status-value is-${detail.necessity.status}`}>{t(`documentCollection.status.necessity.${detail.necessity.status}`)}</strong></dd>{detail.necessity.reason && <><dt>{t('documentCollection.editor.reason')}</dt><dd>{detail.necessity.reason}</dd></>}{detail.necessity.decided_by && <><dt>{t('documentCollection.editor.decidedBy')}</dt><dd>{detail.necessity.decided_by.display_name} · {formatDate(detail.necessity.decided_at, true)}</dd></>}</dl>}
    </section>

    {editing === 'conditions' ? <section className="dc-detail-section dc-inspector-section"><SectionHeading label="B" title={t('documentCollection.editor.collectionConditions')}/><div className="dc-form-grid">{textField('target_person', t('documentCollection.editor.targetPerson'), { max: 255 })}{textField('collection_source', t('documentCollection.editor.source'), { max: 255 })}{textField('collection_method', t('documentCollection.editor.method'), { area: true, wide: true, max: 10000 })}{textField('target_period_from', t('documentCollection.editor.periodFrom'), { type: 'date' })}{textField('target_period_to', t('documentCollection.editor.periodTo'), { type: 'date' })}{textField('target_scope', t('documentCollection.editor.scope'), { area: true, wide: true, max: 10000 })}</div></section> : <details className="dc-compact-section"><summary className="dc-compact-summary"><div className="dc-compact-head"><span>B</span>{t('documentCollection.editor.collectionConditions')}</div><div className="dc-compact-value">{[detail.collection.source, detail.collection.target_period_from ? formatDate(detail.collection.target_period_from) : null, detail.collection.method].filter(Boolean).join('・') || t('documentCollection.editor.conditionUnset')}</div><ChevronRight size={18} className="dc-compact-chevron" /></summary><div className="dc-compact-body"><dl className="dc-readable-facts"><dt>{t('documentCollection.editor.targetPerson')}</dt><dd>{detail.collection.target_person || '—'}</dd><dt>{t('documentCollection.editor.source')}</dt><dd>{detail.collection.source || '—'}</dd><dt>{t('documentCollection.editor.method')}</dt><dd>{detail.collection.method || '—'}</dd><dt>{t('documentCollection.editor.periodFrom')}</dt><dd>{formatDate(detail.collection.target_period_from)}</dd><dt>{t('documentCollection.editor.periodTo')}</dt><dd>{formatDate(detail.collection.target_period_to)}</dd><dt>{t('documentCollection.editor.scope')}</dt><dd>{detail.collection.target_scope || '—'}</dd></dl>{action('conditions', t('documentCollection.editor.editCollectionInfo'))}</div></details>}

    <section className="dc-detail-section dc-inspector-section">
      <SectionHeading label="C" title={t('documentCollection.editor.requestPreparation')} action={action('preparation', t('documentCollection.editor.editAssigneeDeadline'), 'preparation')}/>
      {editing === 'preparation' ? (
        <div className="dc-prep-form">
          <label className="dc-prep-field dc-prep-field--wide">
            <span className="dc-prep-label">{t('documentCollection.editor.assignee')}</span>
            <select {...fieldProps('assigned_employee_id')} disabled={!!employeeError} value={draft.assigned_employee_id ?? ''} onChange={event => update('assigned_employee_id', event.target.value ? Number(event.target.value) : null)}>
              <option value="">{t('documentCollection.list.unassigned')}</option>
              {assigneeOptions.map(employee => <option key={employee.id} value={employee.id}>{employee.display_name}</option>)}
            </select>
            {fieldError('assigned_employee_id')}
            {employeeError && <span className="dc-meta">{employeeError}</span>}
          </label>
          <hr className="dc-prep-divider" />
          <label className="dc-prep-field">
            <span className="dc-prep-label">{t('documentCollection.editor.responseDeadline')}</span>
            <input {...fieldProps('response_deadline')} type="datetime-local" value={toLocalDateTime(draft.response_deadline)} onChange={event => update('response_deadline', fromLocalDateTime(event.target.value))} />
            {fieldError('response_deadline')}
          </label>
          <label className="dc-prep-field">
            <span className="dc-prep-label">{t('documentCollection.editor.workPriority')}</span>
            <select {...fieldProps('collection_priority')} value={draft.collection_priority ?? ''} onChange={event => update('collection_priority', (event.target.value || null) as CollectionDraft['collection_priority'])}>
              {Object.keys(priorityLabels).map(value => <option key={value} value={value}>{t(`documentCollection.status.priority.${value}`)}</option>)}
            </select>
            {fieldError('collection_priority')}
          </label>
          <hr className="dc-prep-divider" />
          <label className="dc-prep-checkbox">
            <input {...fieldProps('preservation_priority')} type="checkbox" checked={draft.preservation_priority} onChange={event => update('preservation_priority', event.target.checked)} />
            <span>{t('documentCollection.preservationPriority')}</span>
            {fieldError('preservation_priority')}
          </label>
          {draft.preservation_priority && (
            <label className="dc-prep-field dc-prep-field--wide">
              <span className="dc-prep-label">{t('documentCollection.editor.preservationReason')}</span>
              <textarea {...fieldProps('preservation_reason')} rows={3} maxLength={5000} value={draft.preservation_reason ?? ''} onChange={event => update('preservation_reason', event.target.value || null)} />
              {fieldError('preservation_reason')}
            </label>
          )}
        </div>
      ) : <dl className="dc-readable-facts"><dt>{t('documentCollection.editor.assignee')}</dt><dd><strong>{detail.assigned_employee?.display_name ?? t('documentCollection.list.unassigned')}</strong></dd><dt>{t('documentCollection.editor.requestedAt')}</dt><dd>{formatDate(detail.collection.requested_at, true)}</dd><dt>{t('documentCollection.editor.responseDeadline')}</dt><dd>{formatDate(detail.collection.response_deadline, true)}</dd><dt>{t('documentCollection.editor.workPriority')}</dt><dd>{t(`documentCollection.status.priority.${detail.collection.priority}`)}</dd><dt>{t('documentCollection.preservationPriority')}</dt><dd>{detail.collection.preservation_priority ? t('documentCollection.editor.yes') : t('documentCollection.editor.no')}</dd>{detail.collection.preservation_priority && <><dt>{t('documentCollection.editor.preservationReason')}</dt><dd>{detail.collection.preservation_reason || t('documentCollection.editor.priorityReasonUnset')}</dd></>}</dl>}
    </section>

    {editing === 'receipt' ? <section className="dc-detail-section dc-inspector-section"><SectionHeading label="D" title={t('documentCollection.editor.receipt')} action={action('receipt', t('documentCollection.editor.changeReceipt'))}/><div className="dc-form-grid">{select('collection_status', t('documentCollection.filters.collection'), Object.fromEntries(Object.keys(collectionLabels).map(value => [value, t(`documentCollection.status.collection.${value}`)])))}</div>{receivedDocuments}</section> : <details className="dc-compact-section"><summary className="dc-compact-summary"><div className="dc-compact-head"><span>D</span>{t('documentCollection.editor.receipt')}</div><div className="dc-compact-value">{t('documentCollection.receivedDocuments.title')} {t('cases.count', { count: detail.received_document_count })}</div><ChevronRight size={18} className="dc-compact-chevron" /></summary><div className="dc-compact-body"><dl className="dc-readable-facts"><dt>{t('documentCollection.filters.collection')}</dt><dd><strong>{t(`documentCollection.status.collection.${detail.collection.status}`)}</strong></dd></dl>{receivedDocuments}<div style={{marginTop: 12}}>{action('receipt', t('documentCollection.editor.changeReceipt'))}</div></div></details>}

    {editing === 'review' ? <section className={`dc-detail-section dc-inspector-section ${detail.received_document_count === 0 ? 'is-secondary' : ''}`}><SectionHeading label="E" title={t('documentCollection.editor.fulfillmentReview')} action={action('review', canReviewDocuments ? t('documentCollection.editor.changeFulfillmentReview') : t('documentCollection.editor.changeFulfillment'))}/><div className="dc-form-grid">{select('fulfillment_status', t('documentCollection.editor.fulfillment'), Object.fromEntries(Object.keys(fulfillmentLabels).map(value => [value, t(`documentCollection.status.fulfillment.${value}`)])))}{canReviewDocuments ? select('review_status', t('documentCollection.editor.review'), Object.fromEntries(Object.keys(reviewLabels).map(value => [value, t(`documentCollection.status.review.${value}`)]))) : <div className="dc-readonly-field"><span>{t('documentCollection.editor.review')}</span><strong>{t(`documentCollection.status.review.${detail.review_status}`)}</strong></div>}</div></section> : <details className="dc-compact-section"><summary className="dc-compact-summary"><div className="dc-compact-head"><span>E</span>{t('documentCollection.editor.fulfillmentReview')}</div><div className="dc-compact-value">{t(`documentCollection.status.fulfillment.${detail.fulfillment_status}`)} / {t(`documentCollection.status.review.${detail.review_status}`)}</div><ChevronRight size={18} className="dc-compact-chevron" /></summary><div className="dc-compact-body"><dl className="dc-readable-facts"><dt>{t('documentCollection.editor.fulfillment')}</dt><dd><strong>{t(`documentCollection.status.fulfillment.${detail.fulfillment_status}`)}</strong></dd><dt>{t('documentCollection.editor.review')}</dt><dd><strong>{t(`documentCollection.status.review.${detail.review_status}`)}</strong></dd></dl><div style={{marginTop: 12}}>{action('review', canReviewDocuments ? t('documentCollection.editor.changeFulfillmentReview') : t('documentCollection.editor.changeFulfillment'))}</div></div></details>}

    {editing === 'exception' ? <section className="dc-detail-section dc-inspector-section"><SectionHeading label="F" title={t('documentCollection.editor.resultException')} action={action('exception', t('documentCollection.editor.changeException'))}/><div className="dc-form-grid">{select('collection_result', t('documentCollection.editor.resultException'), Object.fromEntries(Object.keys(resultLabels).map(value => [value, t(`documentCollection.status.result.${value}`)])))}</div></section> : <details className="dc-compact-section"><summary className="dc-compact-summary"><div className="dc-compact-head"><span>F</span>{t('documentCollection.editor.resultException')}</div><div className="dc-compact-value">{detail.collection.result ? <strong className="dc-danger">{t(`documentCollection.status.result.${detail.collection.result}`)}</strong> : t('documentCollection.toolbar.noException')}</div><ChevronRight size={18} className="dc-compact-chevron" /></summary><div className="dc-compact-body"><dl className="dc-readable-facts"><dt>{t('documentCollection.editor.resultException')}</dt><dd><strong className={detail.collection.result ? 'dc-danger' : undefined}>{detail.collection.result ? t(`documentCollection.status.result.${detail.collection.result}`) : t('documentCollection.toolbar.noException')}</strong></dd></dl><div style={{marginTop: 12}}>{action('exception', t('documentCollection.editor.changeException'))}</div></div></details>}
  </fieldset>
}

function SectionHeading({ label, title, action }: { label: string; title: string; action?: ReactNode }) {
  return <div className="dc-section-heading"><h3><span>{label}</span>{title}</h3>{action}</div>
}
