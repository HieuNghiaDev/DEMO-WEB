import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Briefcase, Calendar, Car, CheckCircle2, ChevronRight, FilePlus, FileText, FolderOpen, Mail, MapPin, NotebookPen, Phone, Search, User, UserRound, Users, X } from 'lucide-react'
import { caseApi, caseError } from './api'
import { caseTypeOptions, generatedCaseTitle, newClientDraft, newDraft, validateClient } from './helpers'
import type { CaseClient, CaseDraft, CaseEmployee, CaseFieldErrors, CaseTypeOption, CaseViewer, ClientDraft } from './types'
import { ButtonSpinner, SectionSkeleton } from '../../components/loading'

type Props = { user: CaseViewer; onClose: () => void; onCreated: (id: number) => void }
const canonicalNames = new Set(['労災', '交通事故'])
const id = (field: string) => `new-case-${field}`
const normalizeBirthDate = (value: string): string | null => {
  const match = value.trim().match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/)
  if (!match) return null
  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() + 1 === Number(month) && date.getUTCDate() === Number(day)
    ? `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` : null
}

// Icon map for case type cards
const caseTypeIcon = (name: string) =>
  name === '労災' ? <Briefcase size={22} /> : name === '交通事故' ? <Car size={22} /> : <FileText size={22} />

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
  const [dob, setDob] = useState('')
  const [selectedClient, setSelectedClient] = useState<CaseClient | null>(null)
  const [draft, setDraft] = useState<CaseDraft>(newDraft)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
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
    window.setTimeout(() => form.current?.querySelector<HTMLElement>('[aria-invalid=true]')?.focus(), 0)
  }
  const validateForReview = () => {
    const next = selectedClient ? {} : validateClient(clientDraft)
    if (!selectedClient && !clientDraft.name.trim()) next.name = clientDraft.client_type === 'corporate' ? '組織名を入力してください。' : '氏名を入力してください。'
    if (!selectedClient && dob.trim() && !normalizeBirthDate(dob)) next['client.birth_date'] = '生年月日は年/月/日の形式で入力してください。'
    if (!draft.case_type_id || !selectedType) next.case_type_id = '事件類型を選択してください。'
    if (Array.from(draft.summary).length > 10000) next.summary = '10000文字以内で入力してください。'
    if (Object.keys(next).length) { showErrors(next); return false }
    setFields({}); setError(''); return true
  }
  const createPayload = () => ({
    ...(selectedClient ? { client_id: selectedClient.id } : { client: {
      ...Object.fromEntries(Object.entries(clientDraft).map(([key, value]) => [key, value.trim() || null])),
      birth_date: dob.trim() ? normalizeBirthDate(dob) : null,
    } }),
    title,
    case_type_id: Number(draft.case_type_id),
    summary: draft.summary.trim() || null,
    ...(canAssign && draft.assigned_employee_id ? { assigned_employee_id: Number(draft.assigned_employee_id) } : {}),
  })
  const confirmCreate = async () => {
    if (submitLock.current) return
    submitLock.current = true; setSaving(true); setError('')
    try {
      const item = await caseApi.create(createPayload())
      onCreated(item.id)
    } catch (requestError) {
      const result = caseError(requestError)
      setReviewing(false); setError(result.message); showErrors(result.fields)
    } finally { submitLock.current = false; setSaving(false) }
  }
  const common = (field: string) => ({ id: id(field), name: field, 'aria-invalid': !!fields[field], 'aria-describedby': fields[field] ? `${id(field)}-error` : undefined })
  const errorFor = (field: string) => fields[field] && <p id={`${id(field)}-error`} role="alert" className="cm-field-error">{fields[field]}</p>
  const close = () => { if (!saving) onClose() }

  return <dialog ref={dialog} className="dc-confirm cm-new-case-dialog cm-ncf-dialog" aria-labelledby="new-case-title" onCancel={event => { event.preventDefault(); close() }}>
    {/* ── Sticky header ── */}
    <header className="cm-ncf-header">
      <div className="cm-ncf-header-intro">
        <span className="cm-ncf-header-icon" aria-hidden="true"><FilePlus size={28}/></span>
        <div className="cm-ncf-header-text">
          <h2 id="new-case-title">新規案件</h2>
          <p>依頼者と案件の基本情報を登録します。</p>
        </div>
      </div>
      <button type="button" className="cm-ncf-close-btn" aria-label="閉じる" disabled={saving} onClick={close}><X size={18}/></button>
    </header>

    {loading ? <SectionSkeleton className="m-5 border-0" label="入力フォームを準備中…" rows={4} /> : loadError ? (
      <div role="alert" className="cm-new-case-state cm-message">{loadError}<button type="button" className="dc-button" onClick={() => { setLoading(true); setLoadError(''); setRetry(value => value + 1) }}>再試行</button></div>
    ) : (
      <form ref={form} noValidate className="cm-ncf-form" onSubmit={event => { event.preventDefault(); if (validateForReview()) setReviewing(true) }}>
        <fieldset disabled={saving}>
          {error && <p role="alert" className="cm-ncf-error-banner">{error}</p>}

          {/* ── Section 01: 依頼者 ── */}
          <section className="cm-ncf-section" aria-labelledby="ncf-client-heading">
            <div className="cm-ncf-section-head">
              <span className="cm-ncf-num-badge">01</span>
              <span className="cm-ncf-section-icon"><User size={14}/></span>
              <div><h3 id="ncf-client-heading">依頼者</h3><p>依頼者（お客様）の基本情報を入力してください。</p></div>
            </div>

            {selectedClient ? (
              <div className="cm-ncf-chosen-client">
                <span className="cm-ncf-chosen-avatar"><UserRound size={18}/></span>
                <div className="cm-ncf-chosen-info">
                  <strong>{selectedClient.name}</strong>
                  <span>{selectedClient.name_kana || 'フリガナ未登録'} · 既存の依頼者</span>
                </div>
                <button type="button" className="cm-ncf-change-btn" onClick={() => { setSelectedClient(null); setQuery(selectedClient.name) }}>変更</button>
              </div>
            ) : (
              <div className="cm-ncf-fields">
                {/* 氏名 / 組織名 — full width, with search */}
                <label className="cm-ncf-field cm-ncf-field--search-wrap">
                  <span className="cm-ncf-label">{clientDraft.client_type === 'corporate' ? '組織名' : '氏名'} <em className="cm-ncf-required">*</em></span>
                  <div className="cm-ncf-input-icon-wrap">
                    <span className="cm-ncf-input-icon cm-ncf-input-icon--left"><User size={15}/></span>
                    <input {...common('name')} className="cm-ncf-input cm-ncf-input--icon-l" autoComplete="name" maxLength={255}
                      value={clientDraft.name}
                      placeholder={clientDraft.client_type === 'corporate' ? '例：THEMIS合同事務所' : '例：NGUYEN VAN A'}
                      onChange={event => { changeClient('name', event.target.value); setQuery(event.target.value) }}/>
                  </div>
                  {errorFor('name')}
                  {suggestions.length > 0 && (
                    <div className="cm-ncf-suggestions" role="listbox" aria-label="既存の依頼者候補">
                      {suggestions.map(client => (
                        <button type="button" role="option" key={client.id} className="cm-ncf-suggestion-item" onClick={() => selectClient(client)}>
                          <strong>{client.name}</strong>
                          <span>{[client.name_kana, client.phone, client.email].filter(Boolean).join(' · ')}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {query.trim() && !suggestions.length && <p className="cm-ncf-hint">一致する既存の依頼者はいません。入力内容で新規登録します。</p>}
                </label>

                {/* フリガナ */}
                <label className="cm-ncf-field">
                  <span className="cm-ncf-label">フリガナ</span>
                  <input {...common('name_kana')} className="cm-ncf-input" maxLength={255} value={clientDraft.name_kana} placeholder="例：グエン・ヴァン・ア" onChange={event => changeClient('name_kana', event.target.value)}/>
                  {errorFor('name_kana')}
                </label>

                {/* 生年月日 */}
                <label className="cm-ncf-field">
                  <span className="cm-ncf-label">生年月日</span>
                  <div className="cm-ncf-input-icon-wrap">
                    <span className="cm-ncf-input-icon cm-ncf-input-icon--left"><Calendar size={14}/></span>
                    <input type="text" inputMode="numeric" className="cm-ncf-input cm-ncf-input--icon-l" id="ncf-dob" value={dob} onChange={event => { setDob(event.target.value); setFields(current => { const next = { ...current }; delete next['client.birth_date']; return next }) }} placeholder="年 / 月 / 日" autoComplete="bday" aria-invalid={!!fields['client.birth_date']}/>
                  </div>
                  {errorFor('client.birth_date')}
                </label>

                {/* 依頼者区分 segmented control */}
                <div className="cm-ncf-field">
                  <span className="cm-ncf-label">依頼者区分</span>
                  <div className="cm-ncf-segment" role="group" aria-label="依頼者区分">
                    <button type="button" className={`cm-ncf-segment-btn${clientDraft.client_type === 'individual' ? ' is-active' : ''}`} aria-pressed={clientDraft.client_type === 'individual'} onClick={() => changeClient('client_type', 'individual')}>
                      <User size={13}/>個人
                    </button>
                    <button type="button" className={`cm-ncf-segment-btn${clientDraft.client_type === 'corporate' ? ' is-active' : ''}`} aria-pressed={clientDraft.client_type === 'corporate'} onClick={() => changeClient('client_type', 'corporate')}>
                      <Users size={13}/>組織
                    </button>
                  </div>
                </div>

                {/* 電話番号 */}
                <label className="cm-ncf-field">
                  <span className="cm-ncf-label">電話番号</span>
                  <div className="cm-ncf-input-icon-wrap">
                    <span className="cm-ncf-input-icon cm-ncf-input-icon--left"><Phone size={14}/></span>
                    <input {...common('phone')} className="cm-ncf-input cm-ncf-input--icon-l" inputMode="tel" maxLength={30} value={clientDraft.phone} onChange={event => changeClient('phone', event.target.value)} placeholder="例：090-1234-5678"/>
                  </div>
                  {errorFor('phone')}
                </label>

                {/* メールアドレス */}
                <label className="cm-ncf-field">
                  <span className="cm-ncf-label">メールアドレス</span>
                  <div className="cm-ncf-input-icon-wrap">
                    <span className="cm-ncf-input-icon cm-ncf-input-icon--left"><Mail size={14}/></span>
                    <input {...common('email')} type="email" className="cm-ncf-input cm-ncf-input--icon-l" maxLength={255} value={clientDraft.email} onChange={event => changeClient('email', event.target.value)} placeholder="例：tanaka@example.com"/>
                  </div>
                  {errorFor('email')}
                </label>

                {/* 住所 — full width */}
                <label className="cm-ncf-field cm-ncf-field--full">
                  <span className="cm-ncf-label">住所</span>
                  <div className="cm-ncf-input-icon-wrap">
                    <span className="cm-ncf-input-icon cm-ncf-input-icon--left"><MapPin size={14}/></span>
                    <input {...common('address')} className="cm-ncf-input cm-ncf-input--icon-l" maxLength={255} value={clientDraft.address} onChange={event => changeClient('address', event.target.value)} placeholder="例：東京都新宿区西新宿2-8-1"/>
                  </div>
                  {errorFor('address')}
                </label>
              </div>
            )}
          </section>

          {/* ── Section 02: 案件 ── */}
          <section className="cm-ncf-section" aria-labelledby="ncf-case-heading">
            <div className="cm-ncf-section-head">
              <span className="cm-ncf-num-badge">02</span>
              <span className="cm-ncf-section-icon"><FolderOpen size={16}/></span>
              <div><h3 id="ncf-case-heading">案件</h3><p>案件の種類を選択してください。</p></div>
            </div>

            {/* Case type cards */}
            <div className="cm-ncf-type-grid" role="group" aria-label="事件類型">
              {quickTypes.map(type => (
                <button type="button" key={type.id}
                  className={`cm-ncf-type-card${draft.case_type_id === String(type.id) ? ' is-selected' : ''}`}
                  aria-pressed={draft.case_type_id === String(type.id)}
                  onClick={() => changeCase('case_type_id', String(type.id))}>
                  <span className="cm-ncf-type-icon">{caseTypeIcon(type.name)}</span>
                  <span className="cm-ncf-type-name">{type.name}</span>
                  <span className="cm-ncf-type-sub">{type.name === '労災' ? '労働・通勤事故' : '交通事故案件'}</span>
                  {draft.case_type_id === String(type.id) && <span className="cm-ncf-type-check"><CheckCircle2 size={15}/></span>}
                </button>
              ))}
            </div>
            {quickTypes.length === 0 && <p role="alert" className="cm-field-error">利用できる事件類型を取得できませんでした。</p>}
            {errorFor('case_type_id')}

            {/* 担当者 selector */}
            <div className="cm-ncf-assignee-wrap">
              <span className="cm-ncf-label">担当者</span>
              <div className="cm-assignee-picker">
                <button type="button"
                  className="cm-ncf-assignee-btn"
                  disabled={!canAssign}
                  aria-expanded={pickerOpen}
                  onClick={() => setPickerOpen(open => !open)}>
                  <span className="cm-ncf-assignee-inner">
                    <span className="cm-ncf-assignee-icon"><UserRound size={16}/></span>
                    <span className="cm-ncf-assignee-name">{selectedEmployee?.full_name ?? '担当者を選択'}</span>
                    {selectedEmployee && <span className="cm-ncf-assignee-dept">{[selectedEmployee.department?.name, selectedEmployee.position_title].filter(Boolean).join(' · ')}</span>}
                  </span>
                  <ChevronRight size={16} className={`cm-ncf-assignee-chevron${pickerOpen ? ' is-open' : ''}`}/>
                </button>
                {!canAssign && <p className="cm-ncf-assignee-hint">担当者は作成後にレベル4以上の担当者が設定できます。</p>}
                {pickerOpen && (
                  <div className="cm-assignee-popover">
                    <div className="cm-search-control"><Search size={15}/><input aria-label="担当者を検索" value={employeeQuery} placeholder="社員を検索" onChange={event => setEmployeeQuery(event.target.value)}/></div>
                    <button type="button" onClick={() => { changeCase('assigned_employee_id', ''); setPickerOpen(false) }}>未割当</button>
                    {matchingEmployees.map(employee => (
                      <button type="button" key={employee.id} onClick={() => { changeCase('assigned_employee_id', String(employee.id)); setPickerOpen(false) }}>
                        <strong>{employee.full_name}</strong>
                        <span>{[employee.department?.name, employee.position_title].filter(Boolean).join(' · ')}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ── Section 04: 案件メモ ── */}
          <section className="cm-ncf-section" aria-labelledby="ncf-memo-heading">
            <div className="cm-ncf-section-head">
              <span className="cm-ncf-num-badge">04</span>
              <span className="cm-ncf-section-icon"><NotebookPen size={16}/></span>
              <div><h3 id="ncf-memo-heading">案件メモ <small className="cm-ncf-optional">任意</small></h3><p>相談内容・事故の概要などを入力してください。</p></div>
            </div>
            <div className="cm-ncf-memo-wrap">
              <textarea {...common('summary')} className="cm-ncf-textarea" aria-label="案件メモ" maxLength={10000}
                placeholder="相談内容・事故の概要など" value={draft.summary}
                onChange={event => changeCase('summary', event.target.value)}/>
              <span className="cm-ncf-char-count">{Array.from(draft.summary).length} / 1000</span>
            </div>
            {errorFor('summary')}
          </section>
        </fieldset>

        {/* ── Sticky footer ── */}
        <footer className="cm-ncf-footer">
          <button type="button" className="cm-ncf-cancel-btn" disabled={saving} onClick={close}>
            <X size={14}/>キャンセル
          </button>
          <button type="submit" className="cm-ncf-submit-btn">
            <CheckCircle2 size={15}/>入力内容を確認<ChevronRight size={15}/>
          </button>
        </footer>
      </form>
    )}

    {reviewing && (
      <ReviewDialog client={selectedClient} clientDraft={clientDraft} birthDate={dob.trim() ? normalizeBirthDate(dob) : null} type={selectedType} employee={selectedEmployee} summary={draft.summary} onBack={() => setReviewing(false)} onConfirm={() => void confirmCreate()} saving={saving}/>
    )}
  </dialog>
}

function ReviewDialog({ client, clientDraft, birthDate, type, employee, summary, onBack, onConfirm, saving }: { client: CaseClient | null; clientDraft: ClientDraft; birthDate: string | null; type?: CaseTypeOption; employee?: CaseEmployee; summary: string; onBack: () => void; onConfirm: () => void; saving: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => { if (element?.open) element.close() } }, [])
  const source = client ?? clientDraft
  const contact = ([['電話番号', source.phone], ['メールアドレス', source.email], ['住所', source.address]] as [string, string | null | undefined][])
    .filter(([, value]) => Boolean(value)).map(([label, value]) => [label, value ?? ''])
  return <dialog ref={dialog} className="dc-confirm cm-review-dialog cm-simple-review" aria-labelledby="case-review-title" onCancel={event => { event.preventDefault(); if (!saving) onBack() }}>
    <header><div><h2 id="case-review-title">登録内容の確認</h2><p className="dc-meta">以下の内容で案件を作成します。内容をご確認ください。</p></div></header>
    <div className="cm-review-body"><ReviewBlock title="依頼者" rows={[[client ? '依頼者種別' : '登録方法', client ? '既存の依頼者' : '新規依頼者として登録'], ['氏名 / 組織名', source.name], ...(source.name_kana ? [['フリガナ', source.name_kana]] : []), ...(birthDate && !client ? [['生年月日', birthDate]] : []), ['区分', source.client_type === 'corporate' ? '組織' : '個人'], ...contact]}/><ReviewBlock title="案件" rows={[["事件類型", type?.name ?? ''], ['担当者', employee?.full_name ?? '未割当'], ...(summary.trim() ? [['案件メモ', summary.trim()]] : [])]}/></div>
    <footer><button type="button" className="dc-button" disabled={saving} onClick={onBack}>修正する</button><button type="button" className="dc-button dc-primary" disabled={saving} onClick={onConfirm}>{saving && <ButtonSpinner size={14} />}{saving ? '作成中…' : 'この内容で案件を作成'}</button></footer>
  </dialog>
}

function ReviewBlock({ title, rows }: { title: string; rows: string[][] }) {
  return <section className="cm-review-block"><h3>{title}</h3><dl>{rows.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl></section>
}
