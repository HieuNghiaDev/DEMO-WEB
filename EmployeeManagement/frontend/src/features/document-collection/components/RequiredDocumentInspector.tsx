import { CheckCircle2, History, Pencil, ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CaseActivity } from '../../case-workspace/types'
import { documentCollectionApi } from '../api'
import { collectionError } from '../errors'
import { collectionLabels, fulfillmentLabels, priorityLabels, resultLabels, reviewLabels } from '../labels'
import type { CollectionDetail, CollectionDraft, CollectionPatch, EmployeeOption } from '../types'
import { changedFields, draftFromDetail, formatDate, fromLocalDateTime, toLocalDateTime, validateDraft } from '../utils'
import CollectionFeedback from './CollectionFeedback'
import InspectorShell from './InspectorShell'
import ReceivedDocumentsList from './ReceivedDocumentsList'

export default function RequiredDocumentInspector({ caseId, itemId, canUpdate, employees, activities, onCandidates, onHistory, onClose, onSaved }: {
  caseId: number; itemId: number; canUpdate: boolean; employees: EmployeeOption[]; activities: CaseActivity[]
  onCandidates: () => void; onHistory: () => void; onClose: () => void; onSaved: () => void
}) {
  const [detail, setDetail] = useState<CollectionDetail | null>(null)
  const [draft, setDraft] = useState<CollectionDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<ReturnType<typeof collectionError> | null>(null)
  const [notice, setNotice] = useState('')
  const [editingCollectionStatus, setEditingCollectionStatus] = useState(false)
  const [editingFulfillment, setEditingFulfillment] = useState(false)
  const [editingConditions, setEditingConditions] = useState(false)
  const [editingException, setEditingException] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    void documentCollectionApi.detail(caseId, itemId, controller.signal).then(value => {
      if (!controller.signal.aborted) { setDetail(value); setDraft(draftFromDetail(value)); setLoading(false) }
    }).catch(requestError => { if (!controller.signal.aborted) { setError(collectionError(requestError)); setLoading(false) } })
    return () => controller.abort()
  }, [caseId, itemId, revision])

  const patch = async (payload: CollectionPatch, message: string) => {
    if (!canUpdate || saving || !detail) return false
    setSaving(true); setError(null); setNotice('')
    try {
      const updated = await documentCollectionApi.update(caseId, itemId, payload)
      setDetail(updated); setDraft(draftFromDetail(updated)); setNotice(message); onSaved()
      return true
    } catch (requestError) { const failure = collectionError(requestError); setError(failure); setErrors(failure.fields); return false }
    finally { setSaving(false) }
  }
  const saveConditions = async () => {
    if (!detail || !draft) return
    const validation = validateDraft(detail, draft); setErrors(validation)
    if (Object.keys(validation).length) return
    const allowed = ['target_person', 'collection_source', 'collection_method', 'target_period_from', 'target_period_to', 'target_scope', 'assigned_employee_id', 'response_deadline', 'collection_priority', 'preservation_priority', 'preservation_reason']
    const payload = Object.fromEntries(Object.entries(changedFields(detail, draft)).filter(([key]) => allowed.includes(key))) as CollectionPatch
    if (Object.keys(payload).length && !await patch(payload, '取得条件を保存しました。')) return
    setEditingConditions(false)
  }
  const updateDraft = <K extends keyof CollectionDraft>(key: K, value: CollectionDraft[K]) => draft && setDraft({ ...draft, [key]: value })
  const relevantHistory = activities.filter(activity => activity.metadata?.event === 'document_collection.updated' && activity.metadata.document_id === itemId).length

  return <InspectorShell breakpoint={1560} title={detail?.document_type?.name_ja ?? detail?.title ?? '必要資料'} code={detail?.document_type?.code ?? '—'} subtitle={detail ? '必要' : undefined} onClose={onClose} footer={<div><span className="dc-meta">{notice || (canUpdate ? '変更は明示的に保存されます。' : '閲覧のみ')}</span><button type="button" className="dc-button" onClick={onClose}>閉じる</button></div>}>
    {loading && <p className="dc-empty-results" role="status">必要資料の詳細を読み込み中…</p>}
    {error && <CollectionFeedback error={error} onRetry={() => { setLoading(true); setError(null); setRevision(value => value + 1) }}/>} 
    {!loading && detail && draft && <>
      {notice && <p className="dc-feedback dc-success" role="status">{notice}</p>}
      <section className="dc-required-overview"><div><small>必要性</small><strong className="dc-blue">必要</strong></div><button type="button" className="dc-text-action" onClick={onCandidates}>必要性を変更</button></section>
      <section className="dc-required-action-summary" aria-label="取得状況の概要"><div><small>取得作業</small><strong>{collectionLabels[detail.collection.status]}</strong></div><div><small>担当</small><strong>{detail.assigned_employee?.display_name ?? '未割当'}</strong></div><div><small>回答期限</small><strong>{formatDate(detail.collection.response_deadline)}</strong></div></section>
      <section className="dc-required-section dc-required-received"><ReceivedDocumentsList files={detail.received_documents}/>{canUpdate && <p className="dc-api-gap">受領文書の登録・外部リンク追加は、現在のAPIでは未対応です。</p>}</section>
      <section className="dc-required-section"><div className="dc-section-heading"><h3>取得作業</h3>{canUpdate && <button type="button" className="dc-text-action" onClick={() => setEditingCollectionStatus(value => !value)}>{editingCollectionStatus ? '変更を閉じる' : '取得状況を変更'}</button>}</div>{editingCollectionStatus ? <div className="dc-compact-editor"><select aria-label="必要資料の取得作業" disabled={saving} value={detail.collection.status} onChange={event => void patch({ collection_status: event.target.value as CollectionPatch['collection_status'] }, '取得作業を更新しました。').then(saved => { if (saved) setEditingCollectionStatus(false) })}>{Object.entries(collectionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button type="button" className="dc-button" onClick={() => setEditingCollectionStatus(false)}>キャンセル</button></div> : <strong>{collectionLabels[detail.collection.status]}</strong>}</section>
      <section className="dc-required-section"><h3>確認</h3><div className="dc-status-line"><strong>{reviewLabels[detail.review_status]}</strong>{canUpdate && <ReviewActions status={detail.review_status} saving={saving} onChange={(review_status, message) => void patch({ review_status }, message)}/>}</div></section>
      <section className="dc-required-section"><div className="dc-section-heading"><h3>内容充足</h3>{canUpdate && <button type="button" className="dc-text-action" onClick={() => setEditingFulfillment(value => !value)}>{editingFulfillment ? '判定を閉じる' : '内容充足を判定'}</button>}</div>{editingFulfillment ? <div className="dc-compact-editor"><select aria-label="必要資料の内容充足" disabled={saving} value={detail.fulfillment_status} onChange={event => void patch({ fulfillment_status: event.target.value as CollectionPatch['fulfillment_status'] }, '内容充足を更新しました。').then(saved => { if (saved) setEditingFulfillment(false) })}>{Object.entries(fulfillmentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button type="button" className="dc-button" onClick={() => setEditingFulfillment(false)}>キャンセル</button></div> : <strong className={detail.fulfillment_status === 'insufficient' ? 'dc-warning' : detail.fulfillment_status === 'satisfied' ? 'dc-success' : ''}>{fulfillmentLabels[detail.fulfillment_status]}</strong>}{detail.fulfillment_status === 'insufficient' && <p className="dc-followup-gap">不足内容の記録・追加依頼の作成は、現在のAPIでは未対応です。</p>}</section>
      <section className="dc-required-section"><div className="dc-section-heading"><h3>取得条件</h3>{canUpdate && <button type="button" className="dc-text-action" onClick={() => setEditingConditions(value => !value)}><Pencil size={13}/>{editingConditions ? '編集を閉じる' : '編集'}</button>}</div>
        {!editingConditions ? <dl className="dc-readable-facts"><dt>取得先</dt><dd>{detail.collection.source || '未設定'}</dd><dt>取得方法</dt><dd>{detail.collection.method || '未設定'}</dd><dt>対象者</dt><dd>{detail.collection.target_person || '未指定'}</dd><dt>対象期間</dt><dd>{detail.collection.target_period_from || detail.collection.target_period_to ? `${formatDate(detail.collection.target_period_from)} ～ ${formatDate(detail.collection.target_period_to)}` : detail.collection.target_scope || '未指定'}</dd><dt>担当</dt><dd>{detail.assigned_employee?.display_name ?? '未割当'}</dd><dt>回答期限</dt><dd>{formatDate(detail.collection.response_deadline)}</dd>{detail.collection.preservation_priority && <><dt>保全</dt><dd className="dc-warning"><ShieldAlert size={13}/>保全優先{detail.collection.preservation_reason && ` · ${detail.collection.preservation_reason}`}</dd></>}</dl> : <ConditionEditor draft={draft} employees={employees} errors={errors} disabled={saving} onChange={updateDraft} onCancel={() => { setDraft(draftFromDetail(detail)); setErrors({}); setEditingConditions(false) }} onSave={() => void saveConditions()}/>} 
      </section>
      <section className="dc-required-section"><div className="dc-section-heading"><h3>結果・例外</h3>{canUpdate && <button type="button" className="dc-text-action" onClick={() => setEditingException(value => !value)}>{detail.collection.result ? '変更' : '例外を記録'}</button>}</div>{detail.collection.result && !editingException ? <strong className="dc-warning">{resultLabels[detail.collection.result]}</strong> : !editingException ? <p className="dc-meta">例外なし</p> : <div className="dc-inline-control"><select aria-label="必要資料の結果・例外" value={draft.collection_result ?? ''} onChange={event => updateDraft('collection_result', (event.target.value || null) as CollectionDraft['collection_result'])}><option value="">例外なし</option>{Object.entries(resultLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button type="button" className="dc-button" onClick={() => { setDraft(draftFromDetail(detail)); setEditingException(false) }}>キャンセル</button><button type="button" className="dc-button dc-primary" disabled={saving} onClick={() => void patch({ collection_result: draft.collection_result }, '結果・例外を更新しました。').then(saved => { if (saved) setEditingException(false) })}>保存</button></div>}</section>
      <details className="dc-rule-details"><summary>ルール・詳細情報</summary><dl className="dc-readable-facts"><dt>確認目的</dt><dd>{detail.purposes.map(purpose => `${purpose.code} · ${purpose.name_ja}`).join(' / ') || '未設定'}</dd><dt>適用条件</dt><dd>{detail.rule.applicability_condition_snapshot || '記載なし'}</dd><dt>ルール版</dt><dd>{detail.rule.version_snapshot === null ? '—' : `v${detail.rule.version_snapshot}`}</dd><dt>出典</dt><dd>{detail.rule.source_snapshot || '未設定'}</dd></dl></details>
      <section className="dc-required-section"><button type="button" className="dc-button" onClick={onHistory}><History size={15}/>履歴を見る{relevantHistory > 0 && ` (${relevantHistory})`}</button></section>
    </>}
  </InspectorShell>
}

function ReviewActions({ status, saving, onChange }: { status: CollectionDetail['review_status']; saving: boolean; onChange: (status: CollectionPatch['review_status'], message: string) => void }) {
  if (status === 'unreviewed' || status === 'returned') return <div className="dc-action-row"><button type="button" className="dc-button dc-primary" disabled={saving} onClick={() => onChange('reviewing', '確認を開始しました。')}>確認を開始</button></div>
  if (status === 'reviewing') return <div className="dc-action-row"><button type="button" className="dc-button dc-primary" disabled={saving} onClick={() => onChange('reviewed', '確認済みに更新しました。')}><CheckCircle2 size={14}/>確認済みにする</button><button type="button" className="dc-button" disabled={saving} onClick={() => onChange('returned', '差戻しに更新しました。')}>差戻し</button></div>
  return <div className="dc-action-row"><button type="button" className="dc-button" disabled={saving} onClick={() => onChange('reviewing', '確認を再開しました。')}>確認を再開</button></div>
}

function ConditionEditor({ draft, employees, errors, disabled, onChange, onCancel, onSave }: { draft: CollectionDraft; employees: EmployeeOption[]; errors: Record<string, string>; disabled: boolean; onChange: <K extends keyof CollectionDraft>(key: K, value: CollectionDraft[K]) => void; onCancel: () => void; onSave: () => void }) {
  return <div className="dc-condition-editor"><label>取得先<input disabled={disabled} value={draft.collection_source ?? ''} onChange={event => onChange('collection_source', event.target.value || null)}/></label><label>取得方法<textarea disabled={disabled} rows={2} value={draft.collection_method ?? ''} onChange={event => onChange('collection_method', event.target.value || null)}/></label><label>対象者<input disabled={disabled} value={draft.target_person ?? ''} onChange={event => onChange('target_person', event.target.value || null)}/></label><div className="dc-form-grid"><label>対象期間・開始<input type="date" disabled={disabled} value={draft.target_period_from ?? ''} onChange={event => onChange('target_period_from', event.target.value || null)}/></label><label>対象期間・終了<input type="date" disabled={disabled} aria-invalid={!!errors.target_period_to} value={draft.target_period_to ?? ''} onChange={event => onChange('target_period_to', event.target.value || null)}/>{errors.target_period_to && <span className="dc-danger">{errors.target_period_to}</span>}</label></div><label>対象範囲<textarea disabled={disabled} rows={2} value={draft.target_scope ?? ''} onChange={event => onChange('target_scope', event.target.value || null)}/></label><label>担当者<select disabled={disabled} value={draft.assigned_employee_id ?? ''} onChange={event => onChange('assigned_employee_id', event.target.value ? Number(event.target.value) : null)}><option value="">未割当</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.display_name}</option>)}</select></label><label>回答期限<input type="datetime-local" disabled={disabled} value={toLocalDateTime(draft.response_deadline)} onChange={event => onChange('response_deadline', fromLocalDateTime(event.target.value))}/></label><label>作業優先度<select disabled={disabled} value={draft.collection_priority} onChange={event => onChange('collection_priority', event.target.value as CollectionDraft['collection_priority'])}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="dc-checkbox"><input type="checkbox" disabled={disabled} checked={draft.preservation_priority} onChange={event => onChange('preservation_priority', event.target.checked)}/>保全優先</label>{draft.preservation_priority && <label>保全理由<textarea disabled={disabled} rows={2} value={draft.preservation_reason ?? ''} onChange={event => onChange('preservation_reason', event.target.value || null)}/></label>}<div className="dc-action-row"><button type="button" className="dc-button" onClick={onCancel}>キャンセル</button><button type="button" className="dc-button dc-primary" disabled={disabled} onClick={onSave}>保存</button></div></div>
}
