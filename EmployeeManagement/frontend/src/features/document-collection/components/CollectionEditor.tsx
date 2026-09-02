import { Check } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { CollectionDetail, CollectionDraft, EmployeeOption } from '../types'
import { collectionLabels, fulfillmentLabels, necessityLabels, priorityLabels, resultLabels, reviewLabels } from '../labels'
import { formatDate, fromLocalDateTime, toLocalDateTime } from '../utils'

export default function CollectionEditor({ detail, draft, onChange, errors, employees, employeeError, disabled }: {
  detail: CollectionDetail; draft: CollectionDraft; onChange: (draft: CollectionDraft) => void
  errors: Record<string, string>; employees: EmployeeOption[]; employeeError: string | null; disabled: boolean
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
  return <fieldset ref={editor} className="dc-editor" disabled={disabled}>
    <section className="dc-detail-section"><h3><span>A</span>{t('documentCollection.editor.necessity')}</h3>
      <div className="dc-necessity" aria-label={t('documentCollection.editor.necessityAria')}>{Object.keys(necessityLabels).map(value => <button type="button" key={value} aria-pressed={draft.necessity_status === value} className={draft.necessity_status === value ? 'is-active' : ''} onClick={() => update('necessity_status', value as CollectionDraft['necessity_status'])}>{draft.necessity_status === value && <Check size={14} />}{t(`documentCollection.status.necessity.${value}`)}</button>)}</div>
      {fieldError('necessity_status')}<p className="dc-meta">{t('documentCollection.editor.necessityHint')}</p>
      <label>{t('documentCollection.editor.reason')} {draft.necessity_status === 'not_required' && `(${t('documentCollection.editor.required')})`}<textarea {...fieldProps('necessity_reason')} aria-required={draft.necessity_status === 'not_required'} rows={2} maxLength={5000} disabled={draft.necessity_status === 'undetermined'} value={draft.necessity_reason ?? ''} onChange={event => update('necessity_reason', event.target.value || null)} />{fieldError('necessity_reason')}</label>
      {draft.necessity_status === 'undetermined' && detail.necessity.status !== 'undetermined' && <p className="dc-meta">{t('documentCollection.editor.decisionResetHint')}</p>}
      <p className="dc-meta">{t('documentCollection.editor.decidedBy')}: {detail.necessity.decided_by?.display_name ?? '—'} · {formatDate(detail.necessity.decided_at, true)}</p>
    </section>
    <section className="dc-detail-section"><h3><span>B</span>{t('documentCollection.editor.collectionConditions')}</h3><div className="dc-form-grid">
      {textField('target_person', t('documentCollection.editor.targetPerson'), { max: 255 })}{textField('collection_source', t('documentCollection.editor.source'), { max: 255 })}
      {textField('collection_method', t('documentCollection.editor.method'), { area: true, wide: true, max: 10000 })}
      {textField('target_period_from', t('documentCollection.editor.periodFrom'), { type: 'date' })}{textField('target_period_to', t('documentCollection.editor.periodTo'), { type: 'date' })}
      {textField('target_scope', t('documentCollection.editor.scope'), { area: true, wide: true, max: 10000 })}
    </div></section>
    <section className="dc-detail-section"><h3><span>C</span>{t('documentCollection.editor.requestPreparation')}</h3><div className="dc-form-grid">
      <label className="dc-wide">{t('documentCollection.editor.assignee')}<select {...fieldProps('assigned_employee_id')} disabled={!!employeeError} value={draft.assigned_employee_id ?? ''} onChange={event => update('assigned_employee_id', event.target.value ? Number(event.target.value) : null)}><option value="">{t('documentCollection.list.unassigned')}</option>{assigneeOptions.map(employee => <option key={employee.id} value={employee.id}>{employee.display_name}</option>)}</select>{fieldError('assigned_employee_id')}{employeeError && <span className="dc-meta">{employeeError}</span>}</label>
      {(['requested_at', 'response_deadline'] as const).map(key => <label className="dc-wide" key={key}>{key === 'requested_at' ? t('documentCollection.editor.requestedAt') : t('documentCollection.editor.responseDeadline')}<input {...fieldProps(key)} type="datetime-local" value={toLocalDateTime(draft[key])} onChange={event => update(key, fromLocalDateTime(event.target.value))} />{fieldError(key)}</label>)}
      {select('collection_priority', t('documentCollection.editor.workPriority'), Object.fromEntries(Object.keys(priorityLabels).map(value => [value, t(`documentCollection.status.priority.${value}`)])))}
      <label className="dc-checkbox"><input {...fieldProps('preservation_priority')} type="checkbox" checked={draft.preservation_priority} onChange={event => update('preservation_priority', event.target.checked)} />{t('documentCollection.preservationPriority')}{fieldError('preservation_priority')}</label>
      {textField('preservation_reason', t('documentCollection.editor.preservationReason'), { area: true, wide: true, max: 5000 })}
    </div><p className="dc-meta">{t('documentCollection.editor.timezoneHint')}</p>
      <div className="dc-authority"><h4>{t('documentCollection.editor.externalApproval')}</h4><p className="dc-meta">{t('documentCollection.editor.externalApprovalHint')}</p></div>
    </section>
    <section className="dc-detail-section"><h3><span>D</span>{t('documentCollection.editor.receipt')}</h3><div className="dc-form-grid">{select('collection_status', t('documentCollection.filters.collection'), Object.fromEntries(Object.keys(collectionLabels).map(value => [value, t(`documentCollection.status.collection.${value}`)])))}</div>
      <p className="dc-meta">{t('documentCollection.editor.collectionHint')}</p>
    </section>
    <section className="dc-detail-section"><h3><span>E</span>{t('documentCollection.editor.fulfillmentReview')}</h3><div className="dc-form-grid">{select('fulfillment_status', t('documentCollection.editor.fulfillment'), Object.fromEntries(Object.keys(fulfillmentLabels).map(value => [value, t(`documentCollection.status.fulfillment.${value}`)])))}{select('review_status', t('documentCollection.editor.review'), Object.fromEntries(Object.keys(reviewLabels).map(value => [value, t(`documentCollection.status.review.${value}`)])))}</div>
      <p className="dc-meta">{t('documentCollection.editor.fulfillmentHint')}</p>
    </section>
    <section className="dc-detail-section"><h3><span>F</span>{t('documentCollection.editor.resultException')}</h3><div className="dc-form-grid">{select('collection_result', t('documentCollection.editor.resultException'), Object.fromEntries(Object.keys(resultLabels).map(value => [value, t(`documentCollection.status.result.${value}`)])))}</div>
      <p className="dc-meta">{t('documentCollection.editor.resultHint')}</p>
    </section>
  </fieldset>
}
