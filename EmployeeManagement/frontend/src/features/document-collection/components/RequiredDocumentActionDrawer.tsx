import { useEffect, useRef, useState } from 'react'
import { caseWorkspaceApi } from '../../case-workspace/api'
import type { CaseTaskEmployeeOption } from '../../case-workspace/types'
import { documentCollectionApi } from '../api'
import { collectionError } from '../errors'
import { collectionLabels, fulfillmentLabels, necessityLabels } from '../labels'
import type { CollectionDetail, CollectionPatch } from '../types'
import EditSideDrawer from './EditSideDrawer'

export type RequiredDocumentAction = 'necessity' | 'task' | 'acquisition' | 'collection' | 'fulfillment'

const titles: Record<RequiredDocumentAction, string> = {
  necessity: '必要性を変更', task: '担当・期限を変更', acquisition: '取得情報を確認',
  collection: '取得作業を変更', fulfillment: '内容充足を判定',
}

export default function RequiredDocumentActionDrawer({ action, detail, caseId, canUpdate, onClose, onSaved }: {
  action: RequiredDocumentAction; detail: CollectionDetail; caseId: number; canUpdate: boolean
  onClose: () => void; onSaved: (detail: CollectionDetail, message: string) => void
}) {
  const [necessity, setNecessity] = useState(detail.necessity.status)
  const [reason, setReason] = useState(detail.necessity.reason ?? '')
  const [source, setSource] = useState(detail.collection.source ?? '')
  const [method, setMethod] = useState(detail.collection.method ?? '')
  const [target, setTarget] = useState(detail.collection.target_person ?? '')
  const [scope, setScope] = useState(detail.collection.target_scope ?? '')
  const [periodFrom, setPeriodFrom] = useState(detail.collection.target_period_from ?? '')
  const [periodTo, setPeriodTo] = useState(detail.collection.target_period_to ?? '')
  const [collection, setCollection] = useState(detail.collection.status)
  const [fulfillment, setFulfillment] = useState(detail.fulfillment_status)
  const [employee, setEmployee] = useState(String(detail.active_task?.assigned_employee?.id ?? ''))
  const [due, setDue] = useState(() => localDateTime(detail.active_task?.due_at))
  const [employees, setEmployees] = useState<CaseTaskEmployeeOption[]>([])
  const [loading, setLoading] = useState(action === 'task')
  const [error, setError] = useState('')
  const taskSaved = useRef(false)
  useEffect(() => {
    if (action !== 'task') return
    const controller = new AbortController()
    void caseWorkspaceApi.taskOptions(caseId, controller.signal).then(options => {
      if (!controller.signal.aborted) { setEmployees(options.employees); setLoading(false) }
    }).catch(requestError => {
      if (!controller.signal.aborted) { setError(collectionError(requestError).message); setLoading(false) }
    })
    return () => controller.abort()
  }, [action, caseId])

  const save = async () => {
    setError('')
    try {
      let updated: CollectionDetail
      if (action === 'task') {
        if (!detail.active_task && (!employee || !due)) {
          setError('担当者と期限を設定してください。')
          return false
        }
        if (!taskSaved.current && detail.active_task) {
          await caseWorkspaceApi.updateTask(caseId, detail.active_task.id, {
            assigned_employee_id: employee ? Number(employee) : null,
            due_at: due ? new Date(due).toISOString() : null,
          })
        } else if (!taskSaved.current) {
          await caseWorkspaceApi.createTaskBatch(caseId, [{
            case_document_id: detail.id, assigned_employee_id: Number(employee), due_date: due.slice(0, 10),
          }])
        }
        // A refresh failure must not create a second task when the user retries.
        taskSaved.current = true
        updated = await documentCollectionApi.detail(caseId, detail.id)
      } else {
        const payload: CollectionPatch = action === 'necessity' ? { necessity_status: necessity, necessity_reason: reason.trim() || null }
          : action === 'collection' ? { collection_status: collection }
            : action === 'fulfillment' ? { fulfillment_status: fulfillment }
              : { collection_source: source.trim() || null, collection_method: method.trim() || null, target_person: target.trim() || null, target_scope: scope.trim() || null, target_period_from: periodFrom || null, target_period_to: periodTo || null }
        updated = await documentCollectionApi.update(caseId, detail.id, payload)
      }
      onSaved(updated, `${titles[action]}を保存しました。`)
      return true
    } catch (requestError) { setError(collectionError(requestError).message); return false }
  }
  const name = detail.document_type?.name_ja ?? detail.title
  return <EditSideDrawer title={titles[action]} subtitle={`${name}の${action === 'task' ? '担当者と期限を設定します。' : '情報を確認・変更します。'}`} onClose={onClose} onSave={canUpdate ? save : undefined} disabled={loading}>
    <section className="cm-incident-group"><strong>{detail.document_type?.code} {name}</strong>
      {action === 'necessity' && <>
        <p className="cm-incident-helper">現在の必要性：{necessityLabels[detail.necessity.status]}</p>
        <label>変更後<select value={necessity} onChange={event => setNecessity(event.target.value as typeof necessity)}>{Object.entries(necessityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>判定理由<textarea maxLength={5000} rows={3} value={reason} onChange={event => setReason(event.target.value)}/></label>
      </>}
      {action === 'task' && <>
        {loading && <p role="status">担当者を読み込み中…</p>}
        <label>担当者<select disabled={loading} value={employee} onChange={event => setEmployee(event.target.value)}><option value="">未割当</option>{detail.active_task?.assigned_employee && !employees.some(option => option.id === detail.active_task?.assigned_employee?.id) && <option value={detail.active_task.assigned_employee.id}>{detail.active_task.assigned_employee.display_name}</option>}{employees.map(option => <option key={option.id} value={option.id}>{option.full_name}</option>)}</select></label>
        <label>回答期限<input type={detail.active_task ? 'datetime-local' : 'date'} value={detail.active_task ? due : due.slice(0, 10)} onChange={event => setDue(event.target.value)}/></label>
      </>}
      {action === 'acquisition' && <>
        <label>取得先<input maxLength={255} value={source} onChange={event => setSource(event.target.value)}/></label>
        <label>取得方法<textarea maxLength={10000} rows={3} value={method} onChange={event => setMethod(event.target.value)}/></label>
        <label>対象者<input maxLength={255} value={target} onChange={event => setTarget(event.target.value)}/></label>
        <label>対象期間（開始）<input type="date" value={periodFrom} onChange={event => setPeriodFrom(event.target.value)}/></label>
        <label>対象期間（終了）<input type="date" value={periodTo} onChange={event => setPeriodTo(event.target.value)}/></label>
        <label>対象範囲<textarea rows={3} maxLength={10000} value={scope} onChange={event => setScope(event.target.value)}/></label>
      </>}
      {action === 'collection' && <label>取得作業<select value={collection} onChange={event => setCollection(event.target.value as typeof collection)}>{Object.entries(collectionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      {action === 'fulfillment' && <label>内容充足<select value={fulfillment} onChange={event => setFulfillment(event.target.value as typeof fulfillment)}>{Object.entries(fulfillmentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
    </section>
    {error && <p className="dc-feedback dc-error" role="alert">{error}</p>}
  </EditSideDrawer>
}

function localDateTime(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}
