import { useState } from 'react'
import { BriefcaseBusiness, Pencil, Plus, Trash2, X } from 'lucide-react'
import { ButtonSpinner } from '../../components/loading'
import { caseApi, caseError } from '../case-management/api'
import { employmentPayload, newEmploymentDraft } from '../case-management/clientEmployment'
import type { ClientEmployment, ClientEmploymentDraft, ClientEmploymentStatus } from '../case-management/types'

type EditableEmployment = ClientEmploymentDraft & { id?: number }

const labels: Record<ClientEmploymentStatus, string> = {
  employed: '在職中', leave: '休職中', former: '退職済み', unknown: '未確認',
}

export default function ClientEmploymentPanel({ clientId, records, canUpdate, onChanged }: { clientId: number; records: ClientEmployment[]; canUpdate: boolean; onChanged: () => void | Promise<void> }) {
  const [editing, setEditing] = useState<EditableEmployment | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})

  const startEdit = (record?: ClientEmployment) => {
    setError(''); setFields({})
    setEditing(record ? {
      id: record.id, key: String(record.id), company_name: record.company_name,
      company_address: record.company_address, company_phone: record.company_phone ?? '',
      employment_status: record.employment_status, start_date: record.start_date?.slice(0, 10) ?? '',
      end_date: record.end_date?.slice(0, 10) ?? '', is_current: record.is_current, notes: record.notes ?? '',
    } : newEmploymentDraft())
  }
  const update = <K extends keyof EditableEmployment>(key: K, value: EditableEmployment[K]) => {
    setEditing(current => current ? { ...current, [key]: value } : current)
    setFields(current => { const next = { ...current }; delete next[key]; return next })
  }
  const save = async () => {
    if (!editing || saving) return
    const next: Record<string, string> = {}
    if (!editing.company_name.trim()) next.company_name = '勤務先名を入力してください。'
    if (!editing.company_address.trim()) next.company_address = '勤務先住所を入力してください。'
    if (editing.start_date && editing.end_date && editing.end_date < editing.start_date) next.end_date = '終了日は開始日以降を指定してください。'
    if (Object.keys(next).length) { setFields(next); return }
    setSaving(true); setError('')
    try {
      await (editing.id
        ? caseApi.updateEmployment(clientId, editing.id, employmentPayload(editing))
        : caseApi.createEmployment(clientId, employmentPayload(editing)))
      setEditing(null)
      await onChanged()
    } catch (requestError) {
      const result = caseError(requestError); setError(result.message); setFields(result.fields)
    } finally { setSaving(false) }
  }
  const remove = async (record: ClientEmployment) => {
    if (deletingId !== null || !window.confirm(`「${record.company_name}」の勤務先・職歴を削除しますか？`)) return
    setDeletingId(record.id); setError('')
    try {
      await caseApi.deleteEmployment(clientId, record.id)
      if (editing?.id === record.id) setEditing(null)
      await onChanged()
    } catch (requestError) { setError(caseError(requestError).message) } finally { setDeletingId(null) }
  }

  return <section id="client-employment-management" className="cm-profile-employment" aria-labelledby="client-employment-title">
    <div className="cm-profile-employment-head"><div><h2 id="client-employment-title"><BriefcaseBusiness size={16}/>勤務先・職歴</h2><p>依頼者プロフィールとして、現在・過去の勤務先を管理します。</p></div><div className="cm-profile-employment-actions"><span className={records.length ? 'is-complete' : 'is-missing'}>{records.length ? `登録済み ${records.length}件` : 'プロフィール未登録'}</span>{canUpdate && <button type="button" onClick={() => startEdit()}><Plus size={15}/>追加</button>}</div></div>
    {error && <p className="cm-profile-employment-error" role="alert">{error}</p>}
    {records.length ? <div className="cm-profile-employment-list">{records.map(item => <article key={item.id}><div className="cm-profile-employment-primary"><strong>{item.company_name}</strong><span>{labels[item.employment_status]}</span></div><p>{item.company_address}</p><div className="cm-profile-employment-meta"><span>{period(item)}</span>{item.company_phone && <span>{item.company_phone}</span>}</div>{canUpdate && <div className="cm-profile-employment-row-actions"><button type="button" aria-label={`${item.company_name}を編集`} onClick={() => startEdit(item)}><Pencil size={14}/></button><button type="button" disabled={deletingId === item.id} aria-label={`${item.company_name}を削除`} onClick={() => void remove(item)}>{deletingId === item.id ? <ButtonSpinner size={13}/> : <Trash2 size={14}/>}</button></div>}</article>)}</div> : <div className="cm-profile-employment-empty"><BriefcaseBusiness size={18}/><div><strong>勤務先情報はまだ登録されていません。</strong><span>案件作成を妨げません。必要になった時点で追加できます。</span></div></div>}
    {editing && <div className="cm-profile-employment-form"><div className="cm-profile-employment-form-head"><strong>{editing.id ? '勤務先を編集' : '勤務先を追加'}</strong><button type="button" aria-label="入力を閉じる" disabled={saving} onClick={() => setEditing(null)}><X size={16}/></button></div><div className="cm-employment-current-choice" role="group" aria-label="在職状況"><button type="button" aria-pressed={editing.is_current} onClick={() => { update('is_current', true); update('employment_status', 'employed'); update('end_date', '') }}>現在の勤務先</button><button type="button" aria-pressed={!editing.is_current} onClick={() => { update('is_current', false); update('employment_status', 'former') }}>過去の勤務先</button></div><div className="cm-profile-employment-form-grid"><EmploymentField label="勤務先名 *" error={fields.company_name}><input value={editing.company_name} onChange={event => update('company_name', event.target.value)}/></EmploymentField><EmploymentField label="勤務先住所 *" error={fields.company_address}><input value={editing.company_address} onChange={event => update('company_address', event.target.value)}/></EmploymentField><EmploymentField label="電話番号"><input inputMode="tel" value={editing.company_phone ?? ''} onChange={event => update('company_phone', event.target.value)}/></EmploymentField><EmploymentField label="状況"><select value={editing.employment_status} onChange={event => update('employment_status', event.target.value as ClientEmploymentStatus)}><option value="employed">在職中</option><option value="leave">休職中</option><option value="former">退職済み</option><option value="unknown">未確認</option></select></EmploymentField><EmploymentField label="開始日"><input type="date" value={editing.start_date ?? ''} onChange={event => update('start_date', event.target.value)}/></EmploymentField>{!editing.is_current && <EmploymentField label="終了日" error={fields.end_date}><input type="date" value={editing.end_date ?? ''} onChange={event => update('end_date', event.target.value)}/></EmploymentField>}<EmploymentField label="補足" wide><textarea rows={2} value={editing.notes ?? ''} onChange={event => update('notes', event.target.value)}/></EmploymentField></div><div className="cm-profile-employment-form-actions"><button type="button" disabled={saving} onClick={() => setEditing(null)}>キャンセル</button><button type="button" disabled={saving} onClick={() => void save()}>{saving && <ButtonSpinner size={13}/>}保存</button></div></div>}
  </section>
}

function EmploymentField({ label, error, wide = false, children }: { label: string; error?: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? 'is-wide' : undefined}><span>{label}</span>{children}{error && <small role="alert">{error}</small>}</label>
}

function period(item: ClientEmployment) {
  if (!item.start_date && !item.end_date) return '在籍期間 未登録'
  return `${item.start_date?.slice(0, 10) ?? '開始日未登録'} 〜 ${item.is_current ? '現在' : item.end_date?.slice(0, 10) ?? '終了日未登録'}`
}
