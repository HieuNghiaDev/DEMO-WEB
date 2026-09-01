import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, Search, UserRound, X } from 'lucide-react'
import { caseApi, caseError } from './api'
import { caseTypeOptions, generatedCaseTitle, newClientDraft, newDraft, validateClient } from './helpers'
import type { CaseClient, CaseDraft, CaseEmployee, CaseFieldErrors, CaseTypeOption, CaseViewer, ClientDraft } from './types'

type Props = { user: CaseViewer; onClose: () => void; onCreated: (id: number) => void }
const canonicalNames = new Set(['労災', '交通事故'])
const id = (field: string) => `new-case-${field}`

export default function NewCaseDialog({ user, onClose, onCreated }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const submitLock = useRef(false)
  const canAssign = (user?.role_names.some(role => role === 'level_4' || role === 'level_5') ?? false) && (user?.permission_names.includes('employee.view') ?? false)
  const [clients, setClients] = useState<CaseClient[]>([])
  const [types, setTypes] = useState<CaseTypeOption[]>([])
  const [employees, setEmployees] = useState<CaseEmployee[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [retry, setRetry] = useState(0)
  const [clientDraft, setClientDraft] = useState<ClientDraft>(newClientDraft)
  const [selectedClient, setSelectedClient] = useState<CaseClient | null>(null)
  const [draft, setDraft] = useState<CaseDraft>(newDraft)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [contactOpen, setContactOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [employeeQuery, setEmployeeQuery] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fields, setFields] = useState<CaseFieldErrors>({})

  useEffect(() => { const element = dialog.current; element?.showModal(); return () => { if (element?.open) element.close() } }, [])
  useEffect(() => {
    let active = true
    Promise.all([caseApi.clients(), caseApi.types(), canAssign ? caseApi.employees() : Promise.resolve([])])
      .then(([clientRows, typeRows, employeeRows]) => { if (active) { setClients(clientRows); setTypes(typeRows); setEmployees(employeeRows.filter(employee => employee.employee_status === 'active')) } })
      .catch(requestError => { if (active) setLoadError(caseError(requestError).message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [canAssign, retry])

  const options = useMemo(() => caseTypeOptions(types), [types])
  const quickTypes = useMemo(() => options.filter(option => !option.parent_id && canonicalNames.has(option.name)), [options])
  const selectedType = options.find(option => String(option.id) === draft.case_type_id)
  const suggestions = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase()
    if (!needle || selectedClient) return []
    return clients.filter(client => [client.name, client.name_kana, client.phone, client.email].some(value => value?.toLowerCase().includes(needle))).slice(0, 6)
  }, [clients, deferredQuery, selectedClient])
  const matchingEmployees = useMemo(() => employees.filter(employee => `${employee.full_name} ${employee.full_name_kana ?? ''} ${employee.department?.name ?? ''}`.toLowerCase().includes(employeeQuery.trim().toLowerCase())), [employees, employeeQuery])
  const selectedEmployee = employees.find(employee => String(employee.id) === draft.assigned_employee_id)
  const clientName = selectedClient?.name ?? clientDraft.name
  const title = generatedCaseTitle(clientName, selectedType?.name ?? '')

  const changeClient = <K extends keyof ClientDraft>(key: K, value: ClientDraft[K]) => {
    setClientDraft(current => ({ ...current, [key]: value }))
    setFields(current => { const next = { ...current }; delete next[key]; return next })
  }
  const changeCase = <K extends keyof CaseDraft>(key: K, value: CaseDraft[K]) => {
    setDraft(current => ({ ...current, [key]: value }))
    setFields(current => { const next = { ...current }; delete next[key]; return next })
  }
  const selectClient = (client: CaseClient) => { setSelectedClient(client); setQuery(''); setFields(current => { const next = { ...current }; delete next.name; return next }) }
  const showErrors = (next: CaseFieldErrors) => {
    setFields(next)
    if (Object.keys(next).some(field => ['phone', 'email', 'address'].includes(field))) setContactOpen(true)
    window.setTimeout(() => form.current?.querySelector<HTMLElement>('[aria-invalid=true]')?.focus(), 0)
  }
  const validateForReview = () => {
    const next = selectedClient ? {} : validateClient(clientDraft)
    if (!selectedClient && !clientDraft.name.trim()) next.name = clientDraft.client_type === 'corporate' ? '組織名を入力してください。' : '氏名を入力してください。'
    if (!draft.case_type_id || !selectedType) next.case_type_id = '事件類型を選択してください。'
    if (Array.from(draft.summary).length > 10000) next.summary = '10000文字以内で入力してください。'
    if (Object.keys(next).length) { showErrors(next); return false }
    setFields({}); setError(''); return true
  }
  const createPayload = (clientId: number) => ({
    client_id: clientId,
    title,
    case_type_id: Number(draft.case_type_id),
    summary: draft.summary.trim() || null,
    ...(canAssign && draft.assigned_employee_id ? { assigned_employee_id: Number(draft.assigned_employee_id) } : {}),
  })
  const confirmCreate = async () => {
    if (submitLock.current) return
    submitLock.current = true; setSaving(true); setError('')
    try {
      let client = selectedClient
      if (!client) {
        client = await caseApi.createClient(clientDraft)
        setSelectedClient(client); setClients(current => [client!, ...current.filter(item => item.id !== client!.id)])
      }
      const item = await caseApi.create(createPayload(client.id))
      onCreated(item.id)
    } catch (requestError) {
      const result = caseError(requestError)
      setReviewing(false); setError(result.message); showErrors(result.fields)
    } finally { submitLock.current = false; setSaving(false) }
  }
  const common = (field: string) => ({ id: id(field), name: field, 'aria-invalid': !!fields[field], 'aria-describedby': fields[field] ? `${id(field)}-error` : undefined })
  const errorFor = (field: string) => fields[field] && <p id={`${id(field)}-error`} role="alert" className="cm-field-error">{fields[field]}</p>
  const close = () => { if (!saving) onClose() }

  return <dialog ref={dialog} className="dc-confirm cm-new-case-dialog cm-simple-case-dialog" aria-labelledby="new-case-title" onCancel={event => { event.preventDefault(); close() }}>
    <header className="cm-simple-header"><div><h2 id="new-case-title">新規案件</h2><p>依頼者と案件の基本情報を登録します。</p></div><button type="button" className="cm-icon-button" aria-label="閉じる" disabled={saving} onClick={close}><X size={19}/></button></header>
    {loading ? <p role="status" className="cm-new-case-state">入力フォームを準備中…</p> : loadError ? <div role="alert" className="cm-new-case-state cm-message">{loadError}<button type="button" className="dc-button" onClick={() => { setLoading(true); setLoadError(''); setRetry(value => value + 1) }}>再試行</button></div> : <form ref={form} noValidate onSubmit={event => { event.preventDefault(); if (validateForReview()) setReviewing(true) }}>
      <fieldset disabled={saving}>
        {error && <p role="alert" className="cm-new-case-error">{error}</p>}
        <section className="cm-simple-section" aria-labelledby="new-client-heading"><h3 id="new-client-heading"><span>01</span>依頼者</h3>
          {selectedClient ? <div className="cm-chosen-client"><UserRound size={18}/><div><strong>{selectedClient.name}</strong><span>{selectedClient.name_kana || 'フリガナ未登録'} · 既存の依頼者</span></div><button type="button" className="dc-button" onClick={() => { setSelectedClient(null); setQuery(selectedClient.name) }}>変更</button></div> : <div className="cm-simple-fields">
            <label><span>{clientDraft.client_type === 'corporate' ? '組織名' : '氏名'} *</span><div className="cm-search-control"><Search size={16}/><input {...common('name')} autoComplete="name" maxLength={255} value={clientDraft.name} placeholder={clientDraft.client_type === 'corporate' ? '例：THEMIS合同事務所' : '例：NGUYEN VAN A'} onChange={event => { changeClient('name', event.target.value); setQuery(event.target.value) }}/></div>{errorFor('name')}
              {suggestions.length > 0 && <div className="cm-new-client-suggestions" role="listbox" aria-label="既存の依頼者候補">{suggestions.map(client => <button type="button" role="option" key={client.id} onClick={() => selectClient(client)}><strong>{client.name}</strong><span>{[client.name_kana, client.phone, client.email].filter(Boolean).join(' · ')}</span></button>)}</div>}
              {query.trim() && !suggestions.length && <p className="dc-meta cm-new-client-hint">一致する既存の依頼者はいません。入力内容で新規登録します。</p>}
            </label>
            <label><span>フリガナ</span><input {...common('name_kana')} maxLength={255} value={clientDraft.name_kana} placeholder="例：グエン・ヴァン・ア" onChange={event => changeClient('name_kana', event.target.value)}/>{errorFor('name_kana')}</label>
            <fieldset className="cm-client-kind"><legend>依頼者区分</legend><div><button type="button" aria-pressed={clientDraft.client_type === 'individual'} onClick={() => changeClient('client_type', 'individual')}>個人</button><button type="button" aria-pressed={clientDraft.client_type === 'corporate'} onClick={() => changeClient('client_type', 'corporate')}>組織</button></div></fieldset>
          </div>}
          {!selectedClient && <details className="cm-simple-contact" open={contactOpen} onToggle={event => setContactOpen(event.currentTarget.open)}><summary>依頼者情報を追加</summary><div className="cm-simple-fields"><label><span>電話番号</span><input {...common('phone')} inputMode="tel" maxLength={30} value={clientDraft.phone} onChange={event => changeClient('phone', event.target.value)}/>{errorFor('phone')}</label><label><span>メールアドレス</span><input {...common('email')} type="email" maxLength={255} value={clientDraft.email} onChange={event => changeClient('email', event.target.value)}/>{errorFor('email')}</label><label><span>住所</span><input {...common('address')} maxLength={255} value={clientDraft.address} onChange={event => changeClient('address', event.target.value)}/>{errorFor('address')}</label></div></details>}
        </section>
        <section className="cm-simple-section" aria-labelledby="new-type-heading"><h3 id="new-type-heading"><span>02</span>事件類型</h3><div className="cm-type-tiles cm-simple-type-tiles" role="group" aria-label="事件類型">{quickTypes.map(type => <button type="button" key={type.id} aria-pressed={draft.case_type_id === String(type.id)} onClick={() => changeCase('case_type_id', String(type.id))}><strong>{type.name}</strong><small>{type.name === '労災' ? '労働・通勤事故' : '交通事故案件'}</small></button>)}</div>{quickTypes.length === 0 && <p role="alert" className="cm-field-error">利用できる事件類型を取得できませんでした。</p>}{errorFor('case_type_id')}</section>
        <section className="cm-simple-section" aria-labelledby="new-assignee-heading"><h3 id="new-assignee-heading"><span>03</span>担当者</h3><div className="cm-assignee-picker"><button type="button" className="cm-picker-trigger cm-simple-picker" disabled={!canAssign} aria-expanded={pickerOpen} onClick={() => setPickerOpen(open => !open)}><span><UserRound size={17}/>{selectedEmployee?.full_name ?? '担当者を選択'}</span><ChevronRight size={17}/></button>{!canAssign && <p className="dc-meta">担当者の設定はレベル4以上が行います。</p>}{pickerOpen && <div className="cm-assignee-popover"><div className="cm-search-control"><Search size={15}/><input aria-label="担当者を検索" value={employeeQuery} placeholder="社員を検索" onChange={event => setEmployeeQuery(event.target.value)}/></div><button type="button" onClick={() => { changeCase('assigned_employee_id', ''); setPickerOpen(false) }}>未割当</button>{matchingEmployees.map(employee => <button type="button" key={employee.id} onClick={() => { changeCase('assigned_employee_id', String(employee.id)); setPickerOpen(false) }}><strong>{employee.full_name}</strong><span>{[employee.department?.name, employee.position_title].filter(Boolean).join(' · ')}</span></button>)}</div>}</div></section>
        <section className="cm-simple-section" aria-labelledby="new-summary-heading"><h3 id="new-summary-heading"><span>04</span>案件メモ <small>任意</small></h3><textarea {...common('summary')} aria-label="案件メモ" rows={3} maxLength={10000} placeholder="相談内容・事故の概要など" value={draft.summary} onChange={event => changeCase('summary', event.target.value)}/>{errorFor('summary')}</section>
      </fieldset>
      <footer className="cm-new-case-footer"><button type="button" className="dc-button" onClick={close}>キャンセル</button><button type="submit" className="dc-button dc-primary">入力内容を確認</button></footer>
    </form>}
    {reviewing && <ReviewDialog client={selectedClient} clientDraft={clientDraft} type={selectedType} employee={selectedEmployee} summary={draft.summary} onBack={() => setReviewing(false)} onConfirm={() => void confirmCreate()} saving={saving}/>} 
  </dialog>
}

function ReviewDialog({ client, clientDraft, type, employee, summary, onBack, onConfirm, saving }: { client: CaseClient | null; clientDraft: ClientDraft; type?: CaseTypeOption; employee?: CaseEmployee; summary: string; onBack: () => void; onConfirm: () => void; saving: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => { if (element?.open) element.close() } }, [])
  const source = client ?? clientDraft
  const contact = ([['電話番号', source.phone], ['メールアドレス', source.email], ['住所', source.address]] as [string, string | null | undefined][])
    .filter(([, value]) => Boolean(value)).map(([label, value]) => [label, value ?? ''])
  return <dialog ref={dialog} className="dc-confirm cm-review-dialog cm-simple-review" aria-labelledby="case-review-title" onCancel={event => { event.preventDefault(); if (!saving) onBack() }}>
    <header><div><h2 id="case-review-title">登録内容の確認</h2><p className="dc-meta">以下の内容で案件を作成します。内容をご確認ください。</p></div></header>
    <div className="cm-review-body"><ReviewBlock title="依頼者" rows={[[client ? '依頼者種別' : '登録方法', client ? '既存の依頼者' : '新規依頼者として登録'], ['氏名 / 組織名', source.name], ...(source.name_kana ? [['フリガナ', source.name_kana]] : []), ['区分', source.client_type === 'corporate' ? '組織' : '個人'], ...contact]}/><ReviewBlock title="案件" rows={[["事件類型", type?.name ?? ''], ['担当者', employee?.full_name ?? '未割当'], ...(summary.trim() ? [['案件メモ', summary.trim()]] : [])]}/></div>
    <footer><button type="button" className="dc-button" disabled={saving} onClick={onBack}>修正する</button><button type="button" className="dc-button dc-primary" disabled={saving} onClick={onConfirm}>{saving ? '作成中…' : 'この内容で案件を作成'}</button></footer>
  </dialog>
}

function ReviewBlock({ title, rows }: { title: string; rows: string[][] }) {
  return <section className="cm-review-block"><h3>{title}</h3><dl>{rows.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl></section>
}
