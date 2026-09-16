import { useState } from 'react'
import { BriefcaseBusiness, ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import type { ClientEmploymentDraft, ClientEmploymentStatus } from './types'
import { newEmploymentDraft } from './clientEmployment'

type Props = {
  value: ClientEmploymentDraft[]
  onChange: (value: ClientEmploymentDraft[]) => void
  recommended?: boolean
}

const statusLabels: Record<ClientEmploymentStatus, string> = {
  employed: '在職中', leave: '休職中', former: '退職済み', unknown: '未確認',
}

export default function ClientEmploymentEditor({ value, onChange, recommended = false }: Props) {
  const [open, setOpen] = useState(value.length > 0)
  const [recommendationDismissed, setRecommendationDismissed] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draft, setDraft] = useState<ClientEmploymentDraft>(() => newEmploymentDraft())
  const [errors, setErrors] = useState<Record<string, string>>({})

  const beginAdd = () => { const next = newEmploymentDraft(); setDraft(next); setEditingKey(next.key); setErrors({}); setOpen(true) }
  const beginEdit = (item: ClientEmploymentDraft) => { setDraft({ ...item }); setEditingKey(item.key); setErrors({}); setOpen(true) }
  const update = <K extends keyof ClientEmploymentDraft>(key: K, next: ClientEmploymentDraft[K]) => {
    setDraft(current => ({ ...current, [key]: next }))
    setErrors(current => { const copy = { ...current }; delete copy[key]; return copy })
  }
  const save = () => {
    const nextErrors: Record<string, string> = {}
    if (!draft.company_name.trim()) nextErrors.company_name = '勤務先名を入力してください。'
    if (!draft.company_address.trim()) nextErrors.company_address = '勤務先住所を入力してください。'
    if (draft.start_date && draft.end_date && draft.end_date < draft.start_date) nextErrors.end_date = '終了日は開始日以降を指定してください。'
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return }
    const normalized = { ...draft, end_date: draft.is_current ? '' : draft.end_date, employment_status: draft.is_current && draft.employment_status === 'former' ? 'employed' as const : !draft.is_current && draft.employment_status === 'employed' ? 'former' as const : draft.employment_status }
    onChange(value.some(item => item.key === normalized.key) ? value.map(item => item.key === normalized.key ? normalized : item) : [...value, normalized])
    setEditingKey(null)
  }

  const expanded = open || (recommended && !recommendationDismissed)

  return <div className={`cm-employment-editor${recommended ? ' is-recommended' : ''}`}>
    <button type="button" className="cm-employment-disclosure" aria-expanded={expanded} onClick={() => { if (recommended && !recommendationDismissed) setRecommendationDismissed(true); else setOpen(current => !current) }}>
      <span className="cm-employment-disclosure-main"><BriefcaseBusiness size={17}/><span><strong>勤務先情報</strong><small>任意 · 後から追加・修正できます</small></span></span>
      <span className="cm-employment-disclosure-side">{recommended && <em>労災案件で推奨</em>}<ChevronDown size={17}/></span>
    </button>
    {expanded && <div className="cm-employment-content">
      {recommended && value.length === 0 && <p className="cm-employment-guidance">勤務先情報があると、労災案件の資料準備がスムーズです。未確認でも案件は作成できます。</p>}
      {value.length > 0 && <div className="cm-employment-list">{value.map(item => <article key={item.key} className="cm-employment-row"><div><strong>{item.company_name}</strong><span>{statusLabels[item.employment_status]} · {item.company_address}</span><small>{formatPeriod(item)}</small></div><div><button type="button" aria-label={`${item.company_name}を編集`} onClick={() => beginEdit(item)}><Pencil size={14}/></button><button type="button" aria-label={`${item.company_name}を削除`} onClick={() => onChange(value.filter(record => record.key !== item.key))}><Trash2 size={14}/></button></div></article>)}</div>}
      {editingKey ? <div className="cm-employment-form" aria-label="勤務先情報の入力">
        <div className="cm-employment-current-choice" role="group" aria-label="在職状況"><button type="button" aria-pressed={draft.is_current} onClick={() => { update('is_current', true); update('employment_status', 'employed'); update('end_date', '') }}>現在の勤務先</button><button type="button" aria-pressed={!draft.is_current} onClick={() => { update('is_current', false); update('employment_status', 'former') }}>過去の勤務先</button></div>
        <label><span>勤務先名 *</span><input value={draft.company_name} maxLength={255} aria-invalid={!!errors.company_name} onChange={event => update('company_name', event.target.value)}/>{errors.company_name && <small role="alert">{errors.company_name}</small>}</label>
        <label><span>勤務先住所 *</span><input value={draft.company_address} maxLength={255} aria-invalid={!!errors.company_address} onChange={event => update('company_address', event.target.value)}/>{errors.company_address && <small role="alert">{errors.company_address}</small>}</label>
        <div className="cm-employment-form-grid"><label><span>電話番号</span><input value={draft.company_phone ?? ''} maxLength={30} inputMode="tel" onChange={event => update('company_phone', event.target.value)}/></label><label><span>状況</span><select value={draft.employment_status} onChange={event => update('employment_status', event.target.value as ClientEmploymentStatus)}><option value="employed">在職中</option><option value="leave">休職中</option><option value="former">退職済み</option><option value="unknown">未確認</option></select></label><label><span>開始日</span><input type="date" value={draft.start_date ?? ''} onChange={event => update('start_date', event.target.value)}/></label>{!draft.is_current && <label><span>終了日</span><input type="date" value={draft.end_date ?? ''} aria-invalid={!!errors.end_date} onChange={event => update('end_date', event.target.value)}/>{errors.end_date && <small role="alert">{errors.end_date}</small>}</label>}</div>
        <label><span>補足</span><textarea rows={2} maxLength={2000} value={draft.notes ?? ''} onChange={event => update('notes', event.target.value)}/></label>
        <div className="cm-employment-form-actions"><button type="button" className="dc-button" onClick={() => setEditingKey(null)}>キャンセル</button><button type="button" className="dc-button dc-primary" onClick={save}>勤務先を保存</button></div>
      </div> : <button type="button" className="cm-employment-add" onClick={beginAdd}><Plus size={15}/>勤務先を追加</button>}
    </div>}
  </div>
}

function formatPeriod(item: ClientEmploymentDraft) {
  if (!item.start_date && !item.end_date) return '在籍期間 未登録'
  return `${item.start_date || '開始日未登録'} 〜 ${item.is_current ? '現在' : item.end_date || '終了日未登録'}`
}
