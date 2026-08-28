import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { Check, ChevronDown, X } from 'lucide-react'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import CaseDetailPage from './business-quest/CaseDetailPage'
import CaseListView from './business-quest/CaseListView'
import { mapCaseFile } from './business-quest/helpers'
import type { ApiCaseFile, BusinessCase, CaseDetail, CaseQuickFilter, CaseStatus } from './business-quest/types'

const inputClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-[#0c1527] dark:text-slate-100 dark:focus:ring-indigo-500/20'

export default function BusinessQuest() {
  const { user } = useAuth()
  const [cases, setCases] = useState<BusinessCase[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<'all' | CaseStatus>('all')
  const [caseType, setCaseType] = useState('all')
  const [quickFilter, setQuickFilter] = useState<CaseQuickFilter>('all')
  const [selectedCase, setSelectedCase] = useState<CaseDetail | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isCreateClosing, setIsCreateClosing] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [availableCaseTypes, setAvailableCaseTypes] = useState<CaseTypeOption[]>([])
  const [assignableEmployees, setAssignableEmployees] = useState<AssignableEmployee[]>([])
  const [assigningCaseId, setAssigningCaseId] = useState<number | null>(null)
  const createCloseTimer = useRef<number | null>(null)
  const [newCase, setNewCase] = useState({ customerName: '', customerKana: '', clientType: 'individual', phone: '', email: '', address: '', nationality: '', notes: '', title: '', caseTypeId: '', caseTypeOther: '', status: 'intake' })
  const canCreateCase = user?.permission_names.includes('case.create') ?? false
  const canAssignCase = user?.role_names.some((role) => role === 'level_4' || role === 'level_5') ?? false

  const loadCases = async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const response = await api.get<{ case_files: ApiCaseFile[] }>('/case-files')
      setCases(response.data.case_files.map(mapCaseFile))
    } catch {
      setLoadError('案件データを読み込めませんでした。')
    } finally {
      setIsLoading(false)
    }
  }

  const loadCaseTypes = async () => {
    try {
      const response = await api.get<{ case_types: CaseTypeOption[] }>('/case-types')
      setAvailableCaseTypes(response.data.case_types)
    } catch {
      // Existing case types are still available as a fallback when the catalog is unavailable.
    }
  }

  const loadAssignableEmployees = async () => {
    if (!canAssignCase) return

    try {
      const response = await api.get<{ employees: AssignableEmployee[] }>('/organization')
      setAssignableEmployees(response.data.employees.filter((employee) => employee.employee_status === 'active'))
    } catch {
      setAssignableEmployees([])
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    const initialLoadTimer = window.setTimeout(() => {
      void loadCases()
      void loadCaseTypes()
      void loadAssignableEmployees()
    }, 0)

    return () => {
      window.clearTimeout(initialLoadTimer)
      if (createCloseTimer.current !== null) window.clearTimeout(createCloseTimer.current)
    }
  }, [])

  const caseTypes = useMemo(() => Array.from(new Set(cases.map((item) => item.caseType))), [cases])
  const filteredCases = useMemo(() => {
    const search = keyword.trim().toLowerCase()
    return cases.filter((item) => {
      const matchesKeyword = !search || [item.customerName, item.customerKana, item.code, item.title, item.caseType, item.assignee].some((value) => value.toLowerCase().includes(search))
      const matchesStatus = status === 'all' || item.status === status
      const matchesType = caseType === 'all' || item.caseType === caseType
      const matchesQuick = quickFilter === 'all' || (quickFilter === 'documents_complete' ? item.documentsTotal > 0 && item.documentsDone === item.documentsTotal : item.status === quickFilter)
      return matchesKeyword && matchesStatus && matchesType && matchesQuick
    })
  }, [cases, keyword, status, caseType, quickFilter])

  const openCase = async (id: number) => {
    setIsDetailLoading(true)
    setLoadError(null)
    try {
      const response = await api.get<{ case_file: CaseDetail }>(`/case-files/${id}`)
      setSelectedCase(response.data.case_file)
    } catch {
      setLoadError('案件詳細を読み込めませんでした。')
    } finally {
      setIsDetailLoading(false)
    }
  }

  const createCase = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsCreating(true)
    setCreateError(null)
    try {
      const caseResponse = await api.post<{ case_file: ApiCaseFile }>('/case-files', {
        client: {
          name: newCase.customerName,
          name_kana: newCase.customerKana || null,
          client_type: newCase.clientType,
          phone: newCase.phone || null,
          email: newCase.email || null,
          address: newCase.address || null,
          nationality: newCase.nationality || null,
          notes: newCase.notes || null,
        },
        title: newCase.title || `${availableCaseTypes.find((type) => String(type.id) === newCase.caseTypeId)?.name ?? '新規案件'}：${newCase.customerName}`,
        case_type_id: Number(newCase.caseTypeId),
        case_type_other: newCase.caseTypeOther || null,
        status: newCase.status,
      })
      const created = { ...caseResponse.data.case_file, documents_count: 0, confirmed_documents_count: 0 }
      setCases((current) => [mapCaseFile(created), ...current])
      setNewCase({ customerName: '', customerKana: '', clientType: 'individual', phone: '', email: '', address: '', nationality: '', notes: '', title: '', caseTypeId: '', caseTypeOther: '', status: 'intake' })
      closeCreateDialog(() => { void openCase(created.id) })
    } catch (error) {
      setCreateError(getApiError(error, '案件を登録できませんでした。入力内容を確認してください。'))
    } finally {
      setIsCreating(false)
    }
  }

  const openCreateDialog = () => {
    if (createCloseTimer.current !== null) window.clearTimeout(createCloseTimer.current)
    setCreateError(null)
    setIsCreateClosing(false)
    setIsCreateOpen(true)
  }

  const closeCreateDialog = (afterClose?: () => void) => {
    if (isCreateClosing) return
    setIsCreateClosing(true)
    createCloseTimer.current = window.setTimeout(() => {
      setIsCreateOpen(false)
      setIsCreateClosing(false)
      createCloseTimer.current = null
      afterClose?.()
    }, 320)
  }

  const updateCustomerName = (customerName: string) => {
    setNewCase((current) => ({
      ...current,
      customerName,
      customerKana: toVietnameseFurigana(customerName),
    }))
  }

  const updateCustomerKana = (customerKana: string) => {
    setNewCase((current) => ({ ...current, customerKana }))
  }

  const assignCase = async (caseId: number, employeeId: number | null) => {
    setAssigningCaseId(caseId)
    try {
      const response = await api.patch<{ case_file: ApiCaseFile }>(`/case-files/${caseId}/assignee`, {
        assigned_employee_id: employeeId,
      })
      setCases((current) => current.map((item) => item.id === caseId ? mapCaseFile(response.data.case_file) : item))
    } finally {
      setAssigningCaseId(null)
    }
  }

  if (selectedCase) return <CaseDetailPage caseFile={selectedCase} onBack={() => { setSelectedCase(null); void loadCases() }}/>

  return <>
    <CaseListView cases={cases} filteredCases={filteredCases} loading={isLoading || isDetailLoading} error={loadError} keyword={keyword} status={status} caseType={caseType} quickFilter={quickFilter} caseTypes={caseTypes} canCreate={canCreateCase} canAssign={canAssignCase} assignees={assignableEmployees} assigningCaseId={assigningCaseId} onKeywordChange={setKeyword} onStatusChange={setStatus} onCaseTypeChange={setCaseType} onQuickFilterChange={setQuickFilter} onRefresh={() => { void loadCases(); void loadCaseTypes(); void loadAssignableEmployees() }} onCreate={openCreateDialog} onOpen={(id) => void openCase(id)} onAssign={(caseId, employeeId) => { void assignCase(caseId, employeeId) }}/>
    {isCreateOpen && <CreateCaseDialog values={newCase} caseTypes={availableCaseTypes} error={createError} saving={isCreating} closing={isCreateClosing} onChange={setNewCase} onCustomerNameChange={updateCustomerName} onCustomerKanaChange={updateCustomerKana} onClose={closeCreateDialog} onSubmit={createCase}/>}
  </>
}

type NewCase = { customerName: string; customerKana: string; clientType: string; phone: string; email: string; address: string; nationality: string; notes: string; title: string; caseTypeId: string; caseTypeOther: string; status: string }
type CaseTypeOption = { id: number; name: string; name_kana: string | null }
type AssignableEmployee = { id: number; full_name: string; full_name_kana: string | null; position_title: string | null; employee_status: string }

function CreateCaseDialog({ values, caseTypes, error, saving, closing, onChange, onCustomerNameChange, onCustomerKanaChange, onClose, onSubmit }: { values: NewCase; caseTypes: CaseTypeOption[]; error: string | null; saving: boolean; closing: boolean; onChange: (value: NewCase) => void; onCustomerNameChange: (value: string) => void; onCustomerKanaChange: (value: string) => void; onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  const isLocked = saving || closing
  const isOther = caseTypes.find((type) => String(type.id) === values.caseTypeId)?.name === 'その他'
  const [activeTab, setActiveTab] = useState(0)
  const tabs = ['基本情報', '連絡先・メモ', '案件情報']
  return <div className={`business-quest-dialog-backdrop fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:items-center sm:p-6${closing ? ' is-closing' : ''}`} onMouseDown={() => !isLocked && onClose()}><section role="dialog" aria-modal="true" aria-labelledby="create-case-title" onMouseDown={(event) => event.stopPropagation()} className={`business-quest-dialog-panel max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[#111a2e]${closing ? ' is-closing' : ''}`}><header className="sticky top-0 z-20 border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-[#111a2e]"><div className="flex items-start justify-between px-5 pb-4 pt-5 sm:px-6"><div><p className="text-[10px] font-bold tracking-[.14em] text-indigo-600 dark:text-indigo-300">CLIENT & CASE INTAKE</p><h2 id="create-case-title" className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">顧客・案件を新規登録</h2></div><button type="button" disabled={isLocked} onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800"><X size={18}/></button></div><div className="flex overflow-x-auto border-t border-slate-100 px-3 dark:border-slate-800">{tabs.map((label, index) => <button key={label} type="button" onClick={() => setActiveTab(index)} className={`relative flex h-11 shrink-0 items-center gap-2 px-3.5 text-xs font-semibold transition ${activeTab === index ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}><span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${activeTab === index ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>{index + 1}</span>{label}{activeTab === index && <span className="absolute inset-x-3 bottom-0 h-0.5 bg-indigo-600"/>}</button>)}</div></header><form onSubmit={onSubmit} className="p-5 sm:p-6">{activeTab === 0 && <section><SectionLabel step="01 / 03" title="依頼者の基本情報" description="担当者が依頼者の基本情報を入力します。"/><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="顧客名 *"><input required disabled={isLocked} value={values.customerName} onChange={(event) => onCustomerNameChange(event.target.value)} className={inputClass} placeholder="例：NGUYEN VAN A"/></Field><Field label="フリガナ"><input disabled={isLocked} value={values.customerKana} onChange={(event) => onCustomerKanaChange(event.target.value)} className={inputClass} placeholder="グエン・ヴァン・ア"/></Field><Field label="顧客区分 *"><select disabled={isLocked} value={values.clientType} onChange={(event) => onChange({ ...values, clientType: event.target.value })} className={inputClass}><option value="individual">個人</option><option value="corporate">法人</option></select></Field><Field label="国籍"><input disabled={isLocked} value={values.nationality} onChange={(event) => onChange({ ...values, nationality: event.target.value })} className={inputClass} placeholder="例：VN / JP"/></Field></div></section>}{activeTab === 1 && <section><SectionLabel step="02 / 03" title="連絡先・補足情報" description="案件担当者が確認する連絡先と注意事項を登録します。"/><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="電話番号"><input disabled={isLocked} type="tel" value={values.phone} onChange={(event) => onChange({ ...values, phone: event.target.value })} className={inputClass} placeholder="090-0000-0000"/></Field><Field label="メールアドレス"><input disabled={isLocked} type="email" value={values.email} onChange={(event) => onChange({ ...values, email: event.target.value })} className={inputClass} placeholder="name@example.com"/></Field></div><div className="mt-4"><Field label="住所"><input disabled={isLocked} value={values.address} onChange={(event) => onChange({ ...values, address: event.target.value })} className={inputClass} placeholder="例：東京都千代田区1-2-3"/></Field></div><div className="mt-4"><Field label="依頼者メモ"><textarea disabled={isLocked} value={values.notes} onChange={(event) => onChange({ ...values, notes: event.target.value })} className="min-h-32 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-[#0c1527] dark:text-slate-100 dark:focus:ring-indigo-500/20" placeholder="連絡時の注意、通訳の要否、補足事項など"/></Field></div></section>}{activeTab === 2 && <section><SectionLabel step="03 / 03" title="案件情報" description="案件種別と受付時の状態を決めます。案件名は種別と顧客名から自動設定されます。"/><div className="mt-5"><Field label="案件ステータス"><select disabled={isLocked} value={values.status} onChange={(event) => onChange({ ...values, status: event.target.value })} className={inputClass}><option value="intake">受付</option><option value="active">対応中</option><option value="waiting_documents">書類待ち</option><option value="reviewing">確認中</option><option value="waiting_payment">支払待ち</option><option value="on_hold">保留</option><option value="closed">完了</option></select></Field></div><div className="mt-4"><Field label="案件種別 *"><CaseTypePicker disabled={isLocked} value={values.caseTypeId} options={caseTypes} onChange={(value) => onChange({ ...values, caseTypeId: value, caseTypeOther: value === values.caseTypeId ? values.caseTypeOther : '' })}/></Field></div>{isOther && <div className="mt-4"><Field label="案件種別の詳細 *"><input required disabled={isLocked} value={values.caseTypeOther} onChange={(event) => onChange({ ...values, caseTypeOther: event.target.value })} className={inputClass} placeholder="例：その他の在留手続き"/></Field></div>}</section>}{error && <p className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}<footer className="mt-7 flex items-center justify-between border-t border-slate-200 pt-5 dark:border-slate-700"><button type="button" disabled={isLocked || activeTab === 0} onClick={() => setActiveTab((value) => value - 1)} className="h-10 rounded-lg px-4 text-sm font-medium text-slate-500 transition hover:bg-slate-100 disabled:invisible dark:text-slate-300 dark:hover:bg-slate-800">戻る</button>{activeTab < 2 ? <button type="button" disabled={isLocked} onClick={() => setActiveTab((value) => value + 1)} className="h-10 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60">次へ</button> : <button type="submit" disabled={isLocked} className="h-10 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60">{saving ? '登録中…' : '顧客・案件を登録'}</button>}</footer></form></section></div>
  return (
    <div className={`business-quest-dialog-backdrop fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:items-center sm:p-6${closing ? ' is-closing' : ''}`} onMouseDown={() => !isLocked && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="create-case-title" onMouseDown={(event) => event.stopPropagation()} className={`business-quest-dialog-panel max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[#111a2e]${closing ? ' is-closing' : ''}`}>
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-700 dark:bg-[#111a2e] sm:px-6"><div><p className="text-[10px] font-bold tracking-[.14em] text-indigo-600 dark:text-indigo-300">CLIENT & CASE INTAKE</p><h2 id="create-case-title" className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">顧客・案件を新規登録</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">依頼者の情報と案件の初期状態を、ひとつの登録として保存します。</p></div><button type="button" disabled={isLocked} onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800"><X size={18}/></button></header>
        <form onSubmit={onSubmit} className="space-y-7 p-5 sm:p-6">
          <section><SectionLabel step="01" title="依頼者の基本情報" description="氏名と区分は必須です。フリガナは自動入力後も編集できます。"/><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="顧客名 *"><input required disabled={isLocked} value={values.customerName} onChange={(event) => onCustomerNameChange(event.target.value)} className={inputClass} placeholder="例：NGUYEN VAN A"/></Field><Field label="フリガナ"><input disabled={isLocked} value={values.customerKana} onChange={(event) => onCustomerKanaChange(event.target.value)} className={inputClass} placeholder="グエン・ヴァン・ア"/></Field><Field label="顧客区分 *"><select disabled={isLocked} value={values.clientType} onChange={(event) => onChange({ ...values, clientType: event.target.value })} className={inputClass}><option value="individual">個人</option><option value="corporate">法人</option></select></Field><Field label="国籍"><input disabled={isLocked} value={values.nationality} onChange={(event) => onChange({ ...values, nationality: event.target.value })} className={inputClass} placeholder="例：VN / JP"/></Field></div></section>
          <section className="border-y border-slate-200 py-6 dark:border-slate-700"><SectionLabel step="02" title="連絡先・補足情報" description="案件担当者がすぐ連絡できる情報を登録します。"/><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="電話番号"><input disabled={isLocked} type="tel" value={values.phone} onChange={(event) => onChange({ ...values, phone: event.target.value })} className={inputClass} placeholder="090-0000-0000"/></Field><Field label="メールアドレス"><input disabled={isLocked} type="email" value={values.email} onChange={(event) => onChange({ ...values, email: event.target.value })} className={inputClass} placeholder="name@example.com"/></Field></div><div className="mt-4"><Field label="住所"><input disabled={isLocked} value={values.address} onChange={(event) => onChange({ ...values, address: event.target.value })} className={inputClass} placeholder="例：東京都千代田区1-2-3"/></Field></div><div className="mt-4"><Field label="依頼者メモ"><textarea disabled={isLocked} value={values.notes} onChange={(event) => onChange({ ...values, notes: event.target.value })} className="min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-[#0c1527] dark:text-slate-100 dark:focus:ring-indigo-500/20" placeholder="連絡時の注意、通訳の要否、補足事項など"/></Field></div></section>
          <section><SectionLabel step="03" title="案件情報" description="案件名と種別を選択して、受付時の状態を決めます。"/><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="案件名・依頼内容 *"><input required disabled={isLocked} value={values.title} onChange={(event) => onChange({ ...values, title: event.target.value })} className={inputClass} placeholder="例：在留期間更新の申請"/></Field><Field label="案件ステータス"><select disabled={isLocked} value={values.status} onChange={(event) => onChange({ ...values, status: event.target.value })} className={inputClass}><option value="intake">受付</option><option value="active">対応中</option><option value="waiting_documents">書類待ち</option><option value="reviewing">確認中</option><option value="waiting_payment">支払待ち</option><option value="on_hold">保留</option><option value="closed">完了</option></select></Field></div><div className="mt-4"><Field label="案件種別 *"><CaseTypePicker disabled={isLocked} value={values.caseTypeId} options={caseTypes} onChange={(value) => onChange({ ...values, caseTypeId: value, caseTypeOther: value === values.caseTypeId ? values.caseTypeOther : '' })}/></Field></div>{isOther && <div className="mt-4"><Field label="案件種別の詳細 *"><input required disabled={isLocked} value={values.caseTypeOther} onChange={(event) => onChange({ ...values, caseTypeOther: event.target.value })} className={inputClass} placeholder="例：その他の在留手続き"/></Field></div>}</section>
          {error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-end dark:border-slate-700"><button type="button" disabled={isLocked} onClick={onClose} className="h-10 rounded-lg px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800">キャンセル</button><button type="submit" disabled={isLocked} className="h-10 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60">{saving ? '登録中…' : '顧客・案件を登録'}</button></footer>
        </form>
      </section>
    </div>
  )
  return <div className={`business-quest-dialog-backdrop fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-3 backdrop-blur-sm sm:items-center sm:p-6${closing ? ' is-closing' : ''}`} onMouseDown={() => !isLocked && onClose()}><section role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()} className={`business-quest-dialog-panel max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[#111a2e]${closing ? ' is-closing' : ''}`}><header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-700 dark:bg-[#111a2e]/95"><div><h2 className="font-bold text-slate-900 dark:text-white">新規案件を登録</h2><p className="mt-1 text-xs text-slate-400">顧客と案件の基本情報を登録します。</p></div><button type="button" disabled={isLocked} onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800"><X size={18}/></button></header><form onSubmit={onSubmit} className="space-y-4 p-5"><div className="grid gap-3 sm:grid-cols-2"><Field label="顧客名 *"><input required value={values.customerName} onChange={(event) => onCustomerNameChange(event.target.value)} className={inputClass} placeholder="例：NGUYEN VAN A"/></Field><Field label="フリガナ（自動入力・編集可）"><input value={values.customerKana} onChange={(event) => onCustomerKanaChange(event.target.value)} className={inputClass} placeholder="グエン・ヴァン・ア"/></Field><Field label="顧客区分"><select value={values.clientType} onChange={(event) => onChange({ ...values, clientType: event.target.value })} className={inputClass}><option value="individual">個人</option><option value="corporate">法人</option></select></Field><Field label="国籍"><input value={values.nationality} onChange={(event) => onChange({ ...values, nationality: event.target.value })} className={inputClass} placeholder="例：VN / JP"/></Field></div><div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><p className="text-xs font-bold text-slate-700 dark:text-slate-200">連絡先情報</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="電話番号"><input type="tel" value={values.phone} onChange={(event) => onChange({ ...values, phone: event.target.value })} className={inputClass} placeholder="090-0000-0000"/></Field><Field label="メールアドレス"><input type="email" value={values.email} onChange={(event) => onChange({ ...values, email: event.target.value })} className={inputClass} placeholder="name@example.com"/></Field></div><div className="mt-3"><Field label="住所"><input value={values.address} onChange={(event) => onChange({ ...values, address: event.target.value })} className={inputClass} placeholder="例：東京都…"/></Field></div></div><div className="grid gap-3 sm:grid-cols-2"><Field label="案件ステータス"><select value={values.status} onChange={(event) => onChange({ ...values, status: event.target.value })} className={inputClass}><option value="intake">受付</option><option value="active">対応中</option><option value="waiting_documents">書類待ち</option><option value="reviewing">確認中</option><option value="waiting_payment">支払待ち</option><option value="on_hold">保留</option><option value="closed">完了</option></select></Field><Field label="案件名・依頼内容 *"><input required value={values.title} onChange={(event) => onChange({ ...values, title: event.target.value })} className={inputClass}/></Field></div><Field label="案件種別 *"><CaseTypePicker disabled={isLocked} value={values.caseTypeId} options={caseTypes} onChange={(value) => onChange({ ...values, caseTypeId: value, caseTypeOther: value === values.caseTypeId ? values.caseTypeOther : '' })}/></Field>{isOther && <Field label="案件種別の詳細 *"><input required value={values.caseTypeOther} onChange={(event) => onChange({ ...values, caseTypeOther: event.target.value })} className={inputClass} placeholder="例：その他の在留手続き"/></Field>}{error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}<div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-700"><button type="button" disabled={isLocked} onClick={onClose} className="h-10 rounded-xl px-4 text-sm font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800">キャンセル</button><button type="submit" disabled={isLocked} className="h-10 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-60">{saving ? '登録中…' : '案件を登録'}</button></div></form></section></div>
}

function CaseTypePicker({ value, options, disabled, onChange }: { value: string; options: CaseTypeOption[]; disabled: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const selected = options.find((item) => String(item.id) === value)

  return <div className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <button type="button" disabled={disabled} onClick={() => setOpen((current) => !current)} aria-haspopup="listbox" aria-expanded={open} className={`${inputClass} flex items-center justify-between text-left disabled:opacity-50`}><span className={selected ? '' : 'text-slate-400'}>{selected?.name ?? '案件種別を選択'}</span><ChevronDown size={17} className={`shrink-0 text-slate-400 transition duration-300 ${open ? 'rotate-180 text-indigo-500' : ''}`}/></button>
    {open && <div role="listbox" className="case-type-picker-menu relative z-30 mt-2 max-h-52 overflow-y-auto rounded-2xl border border-indigo-100 bg-white p-1.5 shadow-[0_18px_45px_rgba(15,23,42,.18)] dark:border-indigo-500/25 dark:bg-[#111a2e]">{options.map((option) => { const selectedOption = String(option.id) === value; return <button key={option.id} type="button" role="option" aria-selected={selectedOption} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(String(option.id)); setOpen(false) }} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${selectedOption ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`}><span>{option.name}</span>{selectedOption && <Check size={16}/>}</button> })}</div>}
  </div>
}
function SectionLabel({ step, title, description }: { step: string; title: string; description: string }) { const helper = title === '依頼者の基本情報' ? '担当者が依頼者の情報を入力します。フリガナも必要に応じて入力してください。' : description; return <div><div className="flex items-center gap-2"><span className="text-[10px] font-bold tracking-[.14em] text-indigo-600 dark:text-indigo-300">{step}</span><h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3></div><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{helper}</p></div> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { if (label === '案件名・依頼内容 *') return null; return <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700 dark:text-slate-200">{label}</span>{children}</label> }

function getApiError(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) return fallback
  if (error.response?.status === 403) return 'このアカウントには案件を登録する権限がありません。レベル3以上の権限が必要です。'

  const validationErrors = error.response?.data?.errors as Record<string, string[]> | undefined
  const firstValidationError = validationErrors ? Object.values(validationErrors).flat()[0] : null

  return firstValidationError ?? error.response?.data?.message ?? fallback
}

export function toVietnameseFurigana(name: string) {
  if (!name.trim() || /[\u3040-\u30ff\u3400-\u9fff]/.test(name)) return ''

  const wordMap: Record<string, string> = {
    nguyen: 'グエン', tran: 'チャン', le: 'レ', pham: 'ファム', phan: 'ファン',
    vu: 'ヴー', vo: 'ヴォ', do: 'ド', bui: 'ブイ', dang: 'ダン', ho: 'ホ',
    huynh: 'フイン', truong: 'チュオン', than: 'タン', van: 'ヴァン', thi: 'ティ',
    thu: 'トゥ', huong: 'フオン', ngoc: 'ゴック', bich: 'ビック', minh: 'ミン',
    anh: 'アイン', bao: 'バオ', gia: 'ザ', hieu: 'ヒエウ', nghia: 'ギア', say: 'サイ',
    quang: 'クアン', tuan: 'トゥアン', linh: 'リン', ha: 'ハ', nhat: 'ニャット', nam: 'ナム',
    thanh: 'タイン', binh: 'ビン', khanh: 'カイン', mai: 'マイ', lan: 'ラン', my: 'ミー',
    oanh: 'オアイン', yen: 'イエン', son: 'ソン', long: 'ロン', duc: 'ドゥック', hai: 'ハイ',
    kien: 'キエン', nhu: 'ニュー', thao: 'タオ', chau: 'チャウ', cuong: 'クオン', hong: 'ホン',
    loan: 'ロアン', tuyet: 'トゥエット', vy: 'ヴィー', xuan: 'スアン', diem: 'ディエム',
    viet: 'ヴィエット', dao: 'ダオ', thai: 'タイ', an: 'アン', tu: 'トゥ', dung: 'ズン',
    dat: 'ダット', thuy: 'トゥイ', quyen: 'クエン', nghiem: 'ギエム', khang: 'カン', hien: 'ヒエン',
    quy: 'クイ', phuc: 'フック', tam: 'タム', hanh: 'ハイン', nhung: 'ニュン', kim: 'キム',
    trinh: 'チン', hoa: 'ホア', ly: 'リー', tuy: 'トゥイ', nga: 'ガー', trieu: 'チエウ',
    thang: 'タン', trung: 'チュン', quan: 'クアン', hoang: 'ホアン', tuong: 'トゥオン',
    canh: 'カイン', nhan: 'ニャン', tai: 'タイ', khiet: 'キエット', phong: 'フォン',
  }

  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => wordMap[word] ?? word.toUpperCase())
    .join('・')
}
