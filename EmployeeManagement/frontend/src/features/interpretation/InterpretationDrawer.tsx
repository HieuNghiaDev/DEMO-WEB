import { useCallback, useEffect, useRef, useState } from 'react'
import { Languages, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { ModalShell } from '../../components/ui/ModalShell'
import { interpretationApi } from './api'
import { initialForm, interpretationError, interpretationLabels, interpretationModes, interpretationPayload, interpretationTones, nextStatus, officeDate, validateInterpretation, workTypes } from './presentation'
import type { InterpretationCapabilities, InterpretationEvent, InterpretationItem, InterpretationOptions, InterpretationStatus } from './types'

type Props = { caseId: number; caseLabel: string; clientName: string; itemId?: number; capabilities?: InterpretationCapabilities; onClose: () => void; onSaved: (message: string) => Promise<void> }

export default function InterpretationDrawer({ caseId, caseLabel, clientName, itemId, capabilities, onClose, onSaved }: Props) {
  const [item, setItem] = useState<InterpretationItem>()
  const [caps, setCaps] = useState(capabilities)
  const [form, setForm] = useState(() => initialForm())
  const [options, setOptions] = useState<InterpretationOptions>({ interpreters: [], employees: [] })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [events, setEvents] = useState<InterpretationEvent[]>([])
  const [historyPage, setHistoryPage] = useState(1)
  const [lastHistoryPage, setLastHistoryPage] = useState(1)
  const [registrationKind, setRegistrationKind] = useState<'external' | 'employee'>('external')
  const [registrationName, setRegistrationName] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [showRegistration, setShowRegistration] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [showCancel, setShowCancel] = useState(false)
  const busy = useRef(false)
  const requestKey = useRef(crypto.randomUUID())
  const registrationKey = useRef(crypto.randomUUID())
  const errorRef = useRef<HTMLDivElement>(null)
  const mounted = useRef(true)
  const initialCapabilities = useRef(capabilities)
  const title = itemId ? '通訳依頼の詳細' : '新規通訳依頼'
  const terminal = item?.status === 'completed' || item?.status === 'cancelled'
  const canEdit = !terminal && (itemId ? !!item && !!caps?.can_update : !!caps?.can_create)
  const canAssign = !terminal && !!caps?.can_assign

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const detail = itemId ? await interpretationApi.show(caseId, itemId) : null
      if (!mounted.current) return
      const currentCaps = detail?.capabilities ?? initialCapabilities.current
      if (detail) { setItem(detail.item); setForm(initialForm(detail.item)); setCaps(detail.capabilities) }
      const choices = currentCaps?.can_create || currentCaps?.can_assign ? await interpretationApi.options(caseId) : { interpreters: [], employees: [] }
      if (!mounted.current) return
      setOptions(choices)
      if (itemId) {
        const history = await interpretationApi.history(caseId, itemId)
        if (!mounted.current) return
        setEvents(history.events); setHistoryPage(1); setLastHistoryPage(history.pagination.last_page)
      }
    } catch (failure) { if (mounted.current) { setError(interpretationError(failure).message); setItem(undefined) } }
    finally { if (mounted.current) setLoading(false) }
  }, [caseId, itemId])
  useEffect(() => {
    mounted.current = true
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => { mounted.current = false; window.clearTimeout(timer) }
  }, [load])

  const action = async (fn: () => Promise<unknown>, message: string, close = false, refresh = true) => {
    if (busy.current) return
    busy.current = true; setSaving(true); setError(''); setFields({})
    try {
      await fn()
      if (!mounted.current) return
      // A failed refresh is reported separately; a committed mutation is never automatically retried.
      await onSaved(message)
      if (close) onClose()
      else if (refresh) await load()
    } catch (failure) {
      if (!mounted.current) return
      const problem = interpretationError(failure); setError(problem.message); setFields(problem.fields)
      window.setTimeout(() => errorRef.current?.focus(), 0)
    } finally { busy.current = false; if (mounted.current) setSaving(false) }
  }
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const invalid = validateInterpretation(form)
    if (Object.keys(invalid).length) { setFields(invalid); setError('入力内容を確認してください。'); window.setTimeout(() => errorRef.current?.focus(), 0); return }
    void action(() => interpretationApi.save(caseId, interpretationPayload(form, item, requestKey.current, canAssign), itemId), itemId ? '通訳依頼を更新しました。' : '通訳依頼を追加しました。', true)
  }
  const changeStatus = (status: InterpretationStatus) => void action(() => interpretationApi.transition(caseId, item!, status, status === 'cancelled' ? cancelReason.trim() : undefined), '通訳依頼の状態を更新しました。')
  const register = () => {
    if (registrationKind === 'external' ? !registrationName.trim() : !employeeId) { setError('通訳者の名前または社員を指定してください。'); return }
    void action(async () => {
      const profile = await interpretationApi.register(caseId, { kind: registrationKind, registration_key: registrationKey.current, ...(registrationKind === 'external' ? { display_name: registrationName.trim() } : { employee_id: Number(employeeId) }) })
      if (!mounted.current) return
      setOptions(current => ({ ...current, interpreters: [...current.interpreters.filter(p => p.id !== profile.id), profile] }))
      setForm(current => ({ ...current, interpreter_id: String(profile.id) }))
      registrationKey.current = crypto.randomUUID(); setShowRegistration(false); setRegistrationName('')
    }, '通訳者を登録しました。', false, false)
  }
  const field = (name: keyof typeof form, label: string, type = 'text', required = false) => <label className="ip-field" htmlFor={`ip-${name}`}><span>{label}{required && <b aria-hidden="true"> *</b>}</span>
    <input id={`ip-${name}`} type={type} value={form[name]} maxLength={name === 'language' ? 80 : name === 'location' ? 255 : undefined} required={required} disabled={!canEdit || saving} onChange={event => setForm(current => ({ ...current, [name]: event.target.value }))} aria-invalid={!!fields[name]} aria-describedby={fields[name] ? `ip-${name}-error` : undefined}/>
    {fields[name] && <small className="ip-field-error" id={`ip-${name}-error`}>{fields[name]}</small>}</label>
  const select = (name: 'work_type' | 'mode', label: string, choices: Record<string, string>) => <label className="ip-field" htmlFor={`ip-${name}`}><span>{label} *</span><select id={`ip-${name}`} value={form[name]} disabled={!canEdit || saving} onChange={event => setForm(current => ({ ...current, [name]: event.target.value }))}>{Object.entries(choices).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>

  return <ModalShell isOpen title={title} customContent dismissible={!saving} onClose={onClose} overlayClassName="ip-drawer-layer">
    <div className="ip-backdrop" onClick={() => { if (!saving) onClose() }} aria-hidden="true"/>
    <aside className="ip-drawer" role="dialog" aria-modal="true" aria-labelledby="ip-drawer-title">
      <header className="ip-drawer-header"><div><h2 id="ip-drawer-title"><Languages size={18} aria-hidden="true"/>{title}</h2><p>{caseLabel} · {clientName || '依頼者未登録'}</p></div><Button size="sm" variant="ghost" disabled={saving} onClick={onClose} aria-label="閉じる"><X size={17}/></Button></header>
      <div className="ip-drawer-body">
        {error && <div className="ip-error" role="alert" tabIndex={-1} ref={errorRef}><p>{error}</p>{Object.entries(fields).map(([name, text]) => <a key={name} href={`#ip-${name}`}>{text}</a>)}<Button size="sm" disabled={saving} onClick={() => void load()}>再取得</Button></div>}
        {loading ? <div className="ip-skeleton" role="status" aria-label="依頼を読み込み中"><div/><div/><div/></div> : (!itemId || item) && <>
          {item && <div className="ip-detail-state"><StatusBadge size="sm" variant={interpretationTones[item.status]} dot>{interpretationLabels[item.status]}</StatusBadge><span>更新 {officeDate(item.updated_at ?? item.starts_at)}</span></div>}
          <form id="ip-request-form" onSubmit={submit} noValidate>
            <p className="ip-help">日時は日本時間（JST）です。案件・依頼者は自動で関連付けられます。</p>
            {field('language', '対応言語', 'text', true)}
            <div className="ip-form-grid">{select('work_type', '業務区分', workTypes)}{select('mode', '通訳形式', interpretationModes)}</div>
            <label className="ip-field" htmlFor="ip-content"><span>通訳内容 *</span><textarea id="ip-content" maxLength={3000} value={form.content} disabled={!canEdit || saving} onChange={event => setForm(current => ({ ...current, content: event.target.value }))} aria-invalid={!!fields.content} aria-describedby={fields.content ? 'ip-content-error' : undefined}/>{fields.content && <small id="ip-content-error" className="ip-field-error">{fields.content}</small>}</label>
            <div className="ip-form-grid">{field('starts_at', '開始日時', 'datetime-local', true)}{field('ends_at', '終了日時', 'datetime-local', true)}</div>
            {field('location', '実施場所')}
            <label className="ip-field" htmlFor="ip-notes"><span>備考</span><textarea id="ip-notes" maxLength={2000} value={form.notes} disabled={!canEdit || saving} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))}/></label>
          </form>
          <section className="ip-detail-section" aria-label="通訳者の割当"><h3>通訳者</h3><label className="ip-field" htmlFor="ip-interpreter_id"><span>担当通訳者</span><select id="ip-interpreter_id" value={form.interpreter_id} disabled={!canAssign || saving} onChange={event => setForm(current => ({ ...current, interpreter_id: event.target.value }))}>
            <option value="">未割当</option>{item?.interpreter && !options.interpreters.some(p => p.id === item.interpreter?.id) && <option value={item.interpreter.id}>{item.interpreter.name}（現在の割当）</option>}{options.interpreters.map(profile => <option key={profile.id} value={profile.id}>{profile.name}（{profile.kind === 'employee' ? '社内' : '外部'}）</option>)}
          </select>{fields.interpreter_id && <small className="ip-field-error">{fields.interpreter_id}</small>}</label>
          <div className="ip-actions">{canAssign && item && <Button size="sm" disabled={saving || form.interpreter_id === String(item.interpreter?.id ?? '')} onClick={() => void action(() => interpretationApi.assign(caseId, item, form.interpreter_id ? Number(form.interpreter_id) : null), '通訳者を変更しました。')}>割当を保存</Button>}
            {canAssign && <Button size="sm" variant="ghost" disabled={saving} onClick={() => setShowRegistration(!showRegistration)}>通訳者を登録</Button>}</div>
          {showRegistration && canAssign && <div className="ip-registration"><label className="ip-field"><span>区分</span><select value={registrationKind} disabled={saving} onChange={event => setRegistrationKind(event.target.value as 'employee' | 'external')}><option value="external">外部通訳者</option>{options.employees.length > 0 && <option value="employee">社員から選択</option>}</select></label>
            {registrationKind === 'external' ? <label className="ip-field"><span>通訳者名 *</span><input maxLength={120} value={registrationName} disabled={saving} onChange={event => setRegistrationName(event.target.value)}/></label> : <label className="ip-field"><span>社員 *</span><select value={employeeId} disabled={saving} onChange={event => setEmployeeId(event.target.value)}><option value="">選択してください</option>{options.employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>}
            <Button size="sm" disabled={saving} onClick={register}>登録する</Button></div>}
          </section>
          {item && !terminal && <section className="ip-detail-section"><h3>状態の変更</h3><div className="ip-actions">{caps?.can_transition && nextStatus[item.status] && <Button size="sm" variant="primary" disabled={saving || (item.status === 'arranging' && !item.interpreter)} onClick={() => changeStatus(nextStatus[item.status]!)}>{interpretationLabels[nextStatus[item.status]!] }にする</Button>}{caps?.can_cancel && <Button size="sm" variant="outline" disabled={saving} onClick={() => setShowCancel(!showCancel)}>キャンセルにする</Button>}</div>
            {showCancel && caps?.can_cancel && <div className="ip-registration"><label className="ip-field"><span>キャンセル理由 *</span><textarea maxLength={500} value={cancelReason} disabled={saving} onChange={event => setCancelReason(event.target.value)}/></label><Button size="sm" variant="danger" disabled={saving || !cancelReason.trim()} onClick={() => changeStatus('cancelled')}>キャンセルを確定</Button></div>}
          </section>}
          {item?.cancellation_reason && <p className="ip-help">キャンセル理由：{item.cancellation_reason}</p>}
          {itemId && <section className="ip-detail-section"><h3>変更履歴</h3>{events.length ? <ol className="ip-history">{events.map(event => <li key={event.id}><strong>{event.title}</strong><span>{officeDate(event.occurred_at)}{event.actor_name && ` · ${event.actor_name}`}{typeof event.after.status === 'string' && ` · ${interpretationLabels[event.after.status as InterpretationStatus] ?? ''}`}</span></li>)}</ol> : <p className="ip-help">変更履歴はありません。</p>}
            {historyPage < lastHistoryPage && <Button size="sm" disabled={saving} onClick={async () => {
              if (busy.current) return
              busy.current = true; setSaving(true)
              try { const response = await interpretationApi.history(caseId, itemId, historyPage + 1); if (mounted.current) { setEvents(current => [...current, ...response.events]); setHistoryPage(response.pagination.page) } }
              catch (failure) { if (mounted.current) setError(interpretationError(failure).message) }
              finally { busy.current = false; if (mounted.current) setSaving(false) }
            }}>以前の履歴を表示</Button>}
          </section>}
        </>}
      </div>
      <footer className="ip-drawer-footer"><Button size="sm" disabled={saving} onClick={onClose}>閉じる</Button>{!loading && canEdit && <Button size="sm" variant="primary" form="ip-request-form" type="submit" loading={saving}>{itemId ? '変更を保存' : '依頼を登録'}</Button>}</footer>
    </aside>
  </ModalShell>
}
