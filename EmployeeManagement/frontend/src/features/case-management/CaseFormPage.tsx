import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { caseStatusOptions } from '../../pages/business-quest/helpers'
import { CaseFormSection, CasePageHeader } from './CasePrimitives'
import ClientSelector from './ClientSelector'
import CaseTypeSelector from './CaseTypeSelector'
import QuickClientDialog from './QuickClientDialog'
import { caseApi, caseError } from './api'
import { caseDraft, casePayload, caseTypeOptions, generatedCaseTitle, newDraft, priorityLabels, validateCase } from './helpers'
import type { CaseClient, CaseDraft, CaseEmployee, CaseFieldErrors, CaseTypeOption, CaseViewer, EditableCase } from './types'

export default function CaseFormPage({ user }: { user: CaseViewer }) {
  const { caseId } = useParams()
  const navigate = useNavigate()
  const editing = caseId !== undefined
  const allowed = user?.permission_names.includes(editing ? 'case.update' : 'case.create') ?? false
  const canCreateClient = user?.permission_names.includes('case.create') ?? false
  const canReadEmployees = user?.permission_names.includes('employee.view') ?? false
  const canAssign = (user?.role_names.some(role => ['level_4', 'level_5'].includes(role)) ?? false) && canReadEmployees
  const [initial, setInitial] = useState<CaseDraft | null>(null)
  const [draft, setDraft] = useState<CaseDraft>(newDraft)
  const [clients, setClients] = useState<CaseClient[]>([])
  const [types, setTypes] = useState<CaseTypeOption[]>([])
  const [employees, setEmployees] = useState<CaseEmployee[]>([])
  const [original, setOriginal] = useState<EditableCase | null>(null)
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [employeeError, setEmployeeError] = useState(false)
  const [fields, setFields] = useState<CaseFieldErrors>({})
  const [advanced, setAdvanced] = useState(false)
  const [quickClient, setQuickClient] = useState(false)
  const [clientNotice, setClientNotice] = useState('')
  const lock = useRef(false)
  const form = useRef<HTMLFormElement>(null)
  const dirty = initial !== null && JSON.stringify(initial) !== JSON.stringify(draft)
  const dirtyRef = useRef(false)
  useEffect(() => { dirtyRef.current = dirty }, [dirty])

  useEffect(() => {
    if (!allowed) return
    let active = true
    Promise.all([caseApi.clients(), caseApi.types(), editing ? caseApi.get(Number(caseId)) : Promise.resolve(null),
      canReadEmployees ? caseApi.employees().catch(() => { if (active) setEmployeeError(true); return [] }) : Promise.resolve([])])
      .then(([clientList, typeList, item, employeeList]) => {
        if (!active) return
        setClients(item && !clientList.some(client => client.id === item.client.id) ? [item.client, ...clientList] : clientList)
        setTypes(typeList); setOriginal(item); setEmployees(employeeList)
        const values = item ? caseDraft(item) : newDraft()
        setDraft(values); setInitial(values); setError('')
      }).catch(requestError => { if (active) setError(caseError(requestError).message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [allowed, canReadEmployees, caseId, editing, retry])

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirtyRef.current || lock.current) event.preventDefault() }
    const guardLink = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest('a[href]') as HTMLAnchorElement | null
      if (!anchor || anchor.target === '_blank' || anchor.href === window.location.href) return
      if (lock.current || (dirtyRef.current && !window.confirm('未保存の入力があります。破棄して移動しますか？'))) { event.preventDefault(); event.stopPropagation() }
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', guardLink, true)
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', guardLink, true) }
  }, [])

  const cancel = () => { if (!lock.current && (!dirty || window.confirm('未保存の入力を破棄しますか？'))) navigate(editing ? '/quests/' + caseId : '/quests') }
  const change = <K extends keyof CaseDraft>(key: K, value: CaseDraft[K]) => setDraft(current => ({ ...current, [key]: value }))
  const selectedType = caseTypeOptions(types).find(type => String(type.id) === draft.case_type_id)
  const selectedClient = clients.find(client => String(client.id) === draft.client_id)
  const selectedEmployee = employees.find(employee => String(employee.id) === draft.assigned_employee_id)
  const departments = [...new Map(employees.flatMap(employee => employee.department ? [[employee.department.id, employee.department] as const] : [])).values()]
  if (original?.department && !departments.some(department => department.id === original.department?.id)) departments.push(original.department)
  const showErrors = (errors: CaseFieldErrors) => {
    setFields(errors)
    if (Object.keys(errors).some(key => ['title', 'status', 'department_id', 'opened_at', 'target_completion_at'].includes(key))) setAdvanced(true)
    window.setTimeout(() => form.current?.querySelector<HTMLElement>('[aria-invalid=true]')?.focus(), 0)
  }
  const submit = async () => {
    if (lock.current || quickClient) return
    const submission = editing ? draft : { ...draft, title: generatedCaseTitle(selectedClient?.name ?? '', selectedType?.name ?? '') }
    const errors = validateCase(submission, types)
    if (!selectedClient) errors.client_id = '依頼者を選択してください。'
    if (!editing && !selectedType) errors.case_type_id = '事件類型を選択してください。'
    if (!editing && (!selectedClient || !selectedType)) delete errors.title
    if (Object.keys(errors).length) return showErrors(errors)
    lock.current = true; setSaving(true); setError(''); setFields({})
    try {
      const payload = casePayload(submission, canAssign && !employeeError)
      const item = editing ? await caseApi.update(Number(caseId), payload) : await caseApi.create(payload)
      dirtyRef.current = false
      navigate('/quests/' + item.id, { replace: true, state: { caseNotice: editing ? '案件情報を保存しました。' : '案件を作成しました。資料収集候補は「資料収集」から確認できます。' } })
    } catch (requestError) {
      const result = caseError(requestError); setError(result.message); showErrors(result.fields)
    } finally { lock.current = false; setSaving(false) }
  }
  const field = (key: string, label: string, children: ReactNode, wide = false) => <label className={wide ? 'cm-wide' : ''}><span id={'case-label-' + key}>{label}</span>{children}{fields[key] && <span role="alert" id={'case-error-' + key} className="cm-field-error">{fields[key]}</span>}</label>
  const attrs = (key: string) => ({ name: key, 'aria-labelledby': 'case-label-' + key, 'aria-invalid': !!fields[key], 'aria-describedby': fields[key] ? 'case-error-' + key : undefined })

  return <main className="dc-preview cm-page"><div className="cm-form cm-surface">
    <CasePageHeader title={editing ? '案件を編集' : '新規案件'} description={editing ? '案件の基本情報を変更します。' : '案件の登録に必要な基本情報を入力してください。'} onBack={cancel}/>
    {!allowed ? <p role="alert" className="cm-message">この操作を行う権限がありません。</p> : loading ? <p role="status" className="cm-empty">案件情報を読み込み中…</p> : !initial ? <div role="alert" className="cm-message">{error}<button className="dc-button" onClick={() => { setLoading(true); setRetry(value => value + 1) }}>再試行</button></div> : <>
      {error && <p role="alert" className="cm-message">{error}{!editing && fields.title && <span> {fields.title}</span>}</p>}
      <form ref={form} noValidate onSubmit={event => { event.preventDefault(); void submit() }}>
        <fieldset disabled={saving}>
          <CaseFormSection title="① 誰の案件ですか？">
            <div className="cm-wide"><ClientSelector clients={clients} value={draft.client_id} error={fields.client_id}
              onChange={value => { change('client_id', value); setClientNotice('') }} onCreate={canCreateClient ? () => setQuickClient(true) : undefined}/>
              {clientNotice && <p className="dc-meta" role="status">{clientNotice}</p>}
            </div>
          </CaseFormSection>
          <CaseFormSection title="② どのような事件ですか？">
            <div className="cm-wide"><CaseTypeSelector types={types} value={draft.case_type_id} currentName={original?.case_type ?? undefined} error={fields.case_type_id}
              onChange={value => setDraft(current => ({ ...current, case_type_id: value, case_type_other: '' }))}/></div>
            {selectedType?.name === 'その他' && field('case_type_other', '事件類型の詳細 *', <input {...attrs('case_type_other')} required maxLength={255} value={draft.case_type_other} onChange={event => change('case_type_other', event.target.value)}/>, true)}
            <p className="dc-meta cm-wide">資料収集候補は案件作成後に「資料収集」で確認できます。</p>
            {editing && draft.case_type_id !== initial.case_type_id && <p role="status" className="cm-message cm-wide">事件類型を変更しても、既存の資料収集項目は自動削除・再生成されません。</p>}
          </CaseFormSection>
          <CaseFormSection title="③ 誰が対応しますか？">
            {field('assigned_employee_id', '担当者', <><select {...attrs('assigned_employee_id')} disabled={!canAssign || employeeError} value={draft.assigned_employee_id} onChange={event => change('assigned_employee_id', event.target.value)}>
              <option value="">未割当</option>{!selectedEmployee && draft.assigned_employee_id && <option value={draft.assigned_employee_id}>{original?.assigned_employee?.full_name ?? '現在の担当者'}</option>}
              {employees.filter(employee => employee.employee_status === 'active' || String(employee.id) === draft.assigned_employee_id).map(employee => <option key={employee.id} value={employee.id}>{employee.full_name}{employee.employee_status !== 'active' ? '（現在の担当・非在籍）' : ''}</option>)}
            </select>{(!canAssign || employeeError) && <small>{employeeError ? '担当者一覧を取得できませんでした。現在の担当を保持して保存します。' : '担当者の設定はレベル4以上が行います。'}</small>}</>)}
            {field('priority', '案件優先度', <select {...attrs('priority')} value={draft.priority} onChange={event => change('priority', event.target.value as CaseDraft['priority'])}>{Object.entries(priorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>)}
            {field('summary', '案件概要（任意）', <textarea {...attrs('summary')} maxLength={10000} rows={3} value={draft.summary} placeholder="事故・相談内容・現在の状況など、必要な場合のみ入力してください。" onChange={event => change('summary', event.target.value)}/>, true)}
          </CaseFormSection>
          <details className="cm-advanced cm-case-advanced" open={advanced} onToggle={event => setAdvanced(event.currentTarget.open)}>
            <summary>詳細設定</summary><div className="cm-fields">
              {editing && field('title', '案件名', <input {...attrs('title')} required maxLength={255} value={draft.title} onChange={event => change('title', event.target.value)}/>, true)}
              {field('status', '案件状態', <select {...attrs('status')} value={draft.status} onChange={event => change('status', event.target.value as CaseDraft['status'])}>{caseStatusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>)}
              {field('department_id', '部署', <select {...attrs('department_id')} disabled={!canReadEmployees || employeeError} value={draft.department_id} onChange={event => change('department_id', event.target.value)}><option value="">未設定</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select>)}
              {field('opened_at', '開始日', <input {...attrs('opened_at')} type="date" value={draft.opened_at} onChange={event => change('opened_at', event.target.value)}/>)}
              {field('target_completion_at', '目標完了日', <input {...attrs('target_completion_at')} type="date" value={draft.target_completion_at} onChange={event => change('target_completion_at', event.target.value)}/>)}
            </div>
          </details>
        </fieldset>
        <footer className="cm-form-actions"><button type="button" className="dc-button" disabled={saving} onClick={cancel}>キャンセル</button><button className="dc-button dc-primary" type="submit" disabled={saving}>{saving ? '保存中…' : editing ? '保存' : '案件を作成'}</button></footer>
      </form>
      {quickClient && <QuickClientDialog onClose={() => setQuickClient(false)} onCreated={client => {
        setClients(current => [client, ...current.filter(item => item.id !== client.id)])
        change('client_id', String(client.id)); setFields(current => { const rest = { ...current }; delete rest.client_id; return rest })
        setQuickClient(false); setClientNotice('依頼者を登録して選択しました。')
      }}/>}
    </>}
  </div></main>
}
