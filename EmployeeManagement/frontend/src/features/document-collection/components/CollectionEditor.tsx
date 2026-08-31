import { Check } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import type { CollectionDetail, CollectionDraft, EmployeeOption } from '../types'
import { collectionLabels, fulfillmentLabels, necessityLabels, priorityLabels, resultLabels, reviewLabels } from '../labels'
import { formatDate, fromLocalDateTime, toLocalDateTime } from '../utils'

export default function CollectionEditor({ detail, draft, onChange, errors, employees, employeeError, disabled }: {
  detail: CollectionDetail; draft: CollectionDraft; onChange: (draft: CollectionDraft) => void
  errors: Record<string, string>; employees: EmployeeOption[]; employeeError: string | null; disabled: boolean
}) {
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
  const select = <K extends 'collection_status' | 'collection_result' | 'fulfillment_status' | 'review_status' | 'collection_priority'>(key: K, label: string, labels: Record<string, string>) => <label>{label}<select {...fieldProps(key)} value={draft[key] ?? ''} onChange={event => update(key, (event.target.value || null) as CollectionDraft[K])}>{key === 'collection_result' && <option value="">例外なし</option>}{Object.entries(labels).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select>{fieldError(key)}</label>
  const assigneeOptions = detail.assigned_employee && !employees.some(employee => employee.id === detail.assigned_employee?.id) ? [detail.assigned_employee, ...employees] : employees
  return <fieldset ref={editor} className="dc-editor" disabled={disabled}>
    <section className="dc-detail-section"><h3><span>B</span>必要性</h3>
      <div className="dc-necessity" aria-label="取得要否">{Object.entries(necessityLabels).map(([value, label]) => <button type="button" key={value} aria-pressed={draft.necessity_status === value} className={draft.necessity_status === value ? 'is-active' : ''} onClick={() => update('necessity_status', value as CollectionDraft['necessity_status'])}>{draft.necessity_status === value && <Check size={14} />}{label}</button>)}</div>
      {fieldError('necessity_status')}<p className="dc-meta">条件は判断の参考です。候補は自動的に必要になりません。</p>
      <label>判断理由 {draft.necessity_status === 'not_required' && '（必須）'}<textarea {...fieldProps('necessity_reason')} aria-required={draft.necessity_status === 'not_required'} rows={2} maxLength={5000} disabled={draft.necessity_status === 'undetermined'} value={draft.necessity_reason ?? ''} onChange={event => update('necessity_reason', event.target.value || null)} />{fieldError('necessity_reason')}</label>
      {draft.necessity_status === 'undetermined' && detail.necessity.status !== 'undetermined' && <p className="dc-meta">保存時に現在の判断理由・判断者・日時がクリアされます。履歴は保持されます。</p>}
      <p className="dc-meta">判断者: {detail.necessity.decided_by?.display_name ?? '—'} · {formatDate(detail.necessity.decided_at, true)}</p>
    </section>
    <section className="dc-detail-section"><h3><span>C</span>取得条件</h3><div className="dc-form-grid">
      {textField('target_person', '対象者', { max: 255 })}{textField('collection_source', '取得先', { max: 255 })}
      {textField('collection_method', '取得方法', { area: true, wide: true, max: 10000 })}
      {textField('target_period_from', '対象期間・開始', { type: 'date' })}{textField('target_period_to', '対象期間・終了', { type: 'date' })}
      {textField('target_scope', '対象範囲', { area: true, wide: true, max: 10000 })}
    </div></section>
    <section className="dc-detail-section"><h3><span>D</span>担当・期限</h3><div className="dc-form-grid">
      <label className="dc-wide">担当者<select {...fieldProps('assigned_employee_id')} disabled={!!employeeError} value={draft.assigned_employee_id ?? ''} onChange={event => update('assigned_employee_id', event.target.value ? Number(event.target.value) : null)}><option value="">未割当</option>{assigneeOptions.map(employee => <option key={employee.id} value={employee.id}>{employee.display_name}</option>)}</select>{fieldError('assigned_employee_id')}{employeeError && <span className="dc-meta">{employeeError}</span>}</label>
      {(['requested_at', 'response_deadline'] as const).map(key => <label className="dc-wide" key={key}>{key === 'requested_at' ? '依頼日時' : '回答期限'}<input {...fieldProps(key)} type="datetime-local" value={toLocalDateTime(draft[key])} onChange={event => update(key, fromLocalDateTime(event.target.value))} />{fieldError(key)}</label>)}
      {select('collection_priority', '作業優先度', priorityLabels)}
      <label className="dc-checkbox"><input {...fieldProps('preservation_priority')} type="checkbox" checked={draft.preservation_priority} onChange={event => update('preservation_priority', event.target.checked)} />保全優先{fieldError('preservation_priority')}</label>
      {textField('preservation_reason', '保全理由', { area: true, wide: true, max: 5000 })}
    </div><p className="dc-meta">日時は端末のタイムゾーンで表示・入力します。保全優先は作業優先度とは別に管理します。</p></section>
    <section className="dc-detail-section"><h3><span>E</span>状態</h3><div className="dc-form-grid">
      {select('collection_status', '取得作業', collectionLabels)}{select('fulfillment_status', '内容充足', fulfillmentLabels)}{select('review_status', '確認', reviewLabels)}{select('collection_result', '結果・例外', resultLabels)}
    </div><p className="dc-meta">受領済み ≠ 確認済み。不存在・不開示は「不要」とは別に記録します。</p><div className="dc-authority"><h4>外部請求・弁護士承認</h4><p className="dc-meta">外部請求・承認の連携は未対応です。この画面から文案作成・送信・提出は行いません。</p></div></section>
  </fieldset>
}
