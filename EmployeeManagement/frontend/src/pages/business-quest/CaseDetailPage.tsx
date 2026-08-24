import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { CalendarClock, ChevronDown, ChevronLeft, ExternalLink, FileText, Landmark, Mail, MessageSquare, Pencil, Phone, Plus, StickyNote, Trash2, UserRound, X } from 'lucide-react'
import api from '../../services/api'
import { caseStatusOptions, formatDateTime, interactionLabels, japanDateValue, statusConfig, statusMap } from './helpers'
import type { CaseDetail, CaseDocument, CaseMeetingLog, CasePrecedent, DetailTab, InteractionType } from './types'

const inputClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-[#0c1527] dark:text-slate-100 dark:focus:ring-indigo-500/20'
const textareaClass = 'min-h-28 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-[#0c1527] dark:text-slate-100 dark:focus:ring-indigo-500/20'

type DialogMode = 'document' | 'precedent' | 'meeting' | null
const emptyDocument = () => ({ title: '', category: '', version: '1', status: 'draft', file_url: '' })

export default function CaseDetailPage({ caseFile, onBack }: { caseFile: CaseDetail; onBack: () => void }) {
  const [currentCase, setCurrentCase] = useState(caseFile)
  const [tab, setTab] = useState<DetailTab>('documents')
  const [dialog, setDialog] = useState<DialogMode>(null)
  const [isDocumentDrawerClosing, setIsDocumentDrawerClosing] = useState(false)
  const [document, setDocument] = useState(emptyDocument())
  const [editingDocumentId, setEditingDocumentId] = useState<number | null>(null)
  const [selectedDocument, setSelectedDocument] = useState<CaseDocument | null>(null)
  const [precedent, setPrecedent] = useState({ title: '', citation: '', summary: '', relevance: '', source_url: '' })
  const [meeting, setMeeting] = useState({ meeting_date: japanDateValue(), interaction_type: 'meeting' as InteractionType, attendees: '', content: '', next_action: '', next_action_due_at: '', status: 'draft' })
  const [expandedPrecedentId, setExpandedPrecedentId] = useState<number | null>(null)
  const [meetingFilter, setMeetingFilter] = useState<'all' | InteractionType>('all')
  const [isSaving, setIsSaving] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [isDeletingClient, setIsDeletingClient] = useState(false)
  const [isClientDeleteOpen, setIsClientDeleteOpen] = useState(false)
  const [isClientDeleteClosing, setIsClientDeleteClosing] = useState(false)
  const [deletingDocumentId, setDeletingDocumentId] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const documentDrawerTimer = useRef<number | null>(null)
  const clientDeleteTimer = useRef<number | null>(null)

  const status = statusConfig[statusMap[currentCase.status]]
  const code = `CASE-${new Date(currentCase.updated_at).getFullYear()}-${String(currentCase.id).padStart(3, '0')}`
  const filteredMeetings = useMemo(() => [...currentCase.meeting_logs]
    .filter((item) => meetingFilter === 'all' || (item.interaction_type ?? 'meeting') === meetingFilter)
    .sort((a, b) => b.meeting_date.localeCompare(a.meeting_date)), [currentCase.meeting_logs, meetingFilter])

  useEffect(() => () => {
    if (documentDrawerTimer.current !== null) window.clearTimeout(documentDrawerTimer.current)
    if (clientDeleteTimer.current !== null) window.clearTimeout(clientDeleteTimer.current)
  }, [])

  const openDocument = (record?: CaseDocument) => {
    if (documentDrawerTimer.current !== null) window.clearTimeout(documentDrawerTimer.current)
    setIsDocumentDrawerClosing(false)
    setSaveError(null)
    setEditingDocumentId(record?.id ?? null)
    setDocument(record ? { title: record.title, category: record.category, version: record.version, status: record.status, file_url: record.file_url ?? '' } : emptyDocument())
    setDialog('document')
  }
  const closeDialog = () => {
    if (isSaving) return
    if (isDocumentDrawerClosing) return
    if (dialog !== 'document') {
      setDialog(null)
      setEditingDocumentId(null)
      setSaveError(null)
      return
    }

    setIsDocumentDrawerClosing(true)
    documentDrawerTimer.current = window.setTimeout(() => {
      setDialog(null)
      setEditingDocumentId(null)
      setSaveError(null)
      setIsDocumentDrawerClosing(false)
      documentDrawerTimer.current = null
    }, 340)
  }

  const deleteDocument = async (record: CaseDocument) => {
    if (!window.confirm(`「${record.title}」を削除しますか？`)) return
    try {
      setDeletingDocumentId(record.id)
      await api.delete(`/case-files/${currentCase.id}/documents/${record.id}`)
      setCurrentCase((value) => ({ ...value, documents: value.documents.filter((item) => item.id !== record.id), documents_count: Math.max(0, value.documents_count - 1), confirmed_documents_count: Math.max(0, value.confirmed_documents_count - (record.status === 'confirmed' ? 1 : 0)) }))
      if (selectedDocument?.id === record.id) setSelectedDocument(null)
    } catch (error) { setSaveError(getApiError(error, '資料を削除できませんでした。')) } finally { setDeletingDocumentId(null) }
  }

  const deleteClient = async () => {
    try {
      setIsDeletingClient(true)
      await api.delete(`/clients/${currentCase.client.id}`, { params: { delete_case_files: true } })
      onBack()
    } catch (error) {
      setSaveError(getApiError(error, '依頼者を削除できませんでした。'))
    } finally {
      setIsDeletingClient(false)
    }
  }

  const closeClientDeleteDialog = () => {
    if (isDeletingClient || isClientDeleteClosing) return
    setIsClientDeleteClosing(true)
    clientDeleteTimer.current = window.setTimeout(() => {
      setIsClientDeleteOpen(false)
      setIsClientDeleteClosing(false)
      clientDeleteTimer.current = null
    }, 320)
  }

  const updateCaseStatus = async (nextStatus: CaseDetail['status']) => {
    if (nextStatus === currentCase.status || isUpdatingStatus) return
    const previousStatus = currentCase.status
    setIsUpdatingStatus(true)
    setSaveError(null)
    setCurrentCase((value) => ({ ...value, status: nextStatus }))
    try {
      const response = await api.patch<{ case_file: Pick<CaseDetail, 'status' | 'updated_at'> }>(`/case-files/${currentCase.id}`, { status: nextStatus })
      setCurrentCase((value) => ({ ...value, status: response.data.case_file.status, updated_at: response.data.case_file.updated_at ?? value.updated_at }))
    } catch (error) {
      setCurrentCase((value) => ({ ...value, status: previousStatus }))
      setSaveError(getApiError(error, 'ステータスを更新できませんでした。'))
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  const saveRecord = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!dialog) return
    setIsSaving(true); setSaveError(null)
    try {
      if (dialog === 'document') {
        const payload = { ...document, file_url: document.file_url || null }
        if (editingDocumentId !== null) {
          const old = currentCase.documents.find((item) => item.id === editingDocumentId)
          const response = await api.patch<{ document: CaseDocument }>(`/case-files/${currentCase.id}/documents/${editingDocumentId}`, payload)
          setCurrentCase((value) => ({ ...value, documents: value.documents.map((item) => item.id === editingDocumentId ? response.data.document : item), confirmed_documents_count: Math.max(0, value.confirmed_documents_count + (response.data.document.status === 'confirmed' ? 1 : 0) - (old?.status === 'confirmed' ? 1 : 0)) }))
        } else {
          const response = await api.post<{ document: CaseDocument }>(`/case-files/${currentCase.id}/documents`, payload)
          setCurrentCase((value) => ({ ...value, documents: [response.data.document, ...value.documents], documents_count: value.documents_count + 1, confirmed_documents_count: value.confirmed_documents_count + (response.data.document.status === 'confirmed' ? 1 : 0) }))
        }
      } else if (dialog === 'precedent') {
        const response = await api.post<{ precedent: CasePrecedent }>(`/case-files/${currentCase.id}/precedents`, { ...precedent, citation: precedent.citation || null, summary: precedent.summary || null, relevance: precedent.relevance || null, source_url: precedent.source_url || null })
        setCurrentCase((value) => ({ ...value, precedents: [response.data.precedent, ...value.precedents] })); setPrecedent({ title: '', citation: '', summary: '', relevance: '', source_url: '' })
      } else {
        const response = await api.post<{ meeting_log: CaseMeetingLog }>(`/case-files/${currentCase.id}/meeting-logs`, { ...meeting, attendees: meeting.attendees || null, next_action: meeting.next_action || null, next_action_due_at: meeting.next_action_due_at || null })
        setCurrentCase((value) => ({ ...value, meeting_logs: [response.data.meeting_log, ...value.meeting_logs] })); setMeeting({ meeting_date: japanDateValue(), interaction_type: 'meeting', attendees: '', content: '', next_action: '', next_action_due_at: '', status: 'draft' })
      }
      setDialog(null)
      setEditingDocumentId(null)
    } catch (error) {
      setSaveError(getApiError(error, '保存できませんでした。必須項目とリンク形式を確認してください。'))
    } finally {
      setIsSaving(false)
    }
  }

  return <div className="w-full min-w-0 max-w-full overflow-x-hidden px-3 pb-10 pt-3 sm:px-4 lg:px-6 lg:pt-5">
    <button type="button" onClick={onBack} className="mb-4 inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-bold text-slate-700 shadow-sm transition hover:border-indigo-200 hover:text-indigo-700 active:scale-[.98] dark:border-slate-700 dark:bg-[#111a2e] dark:text-slate-200"><ChevronLeft size={17}/>案件一覧に戻る</button>
    <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-[#111a2e]">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div className="flex min-w-0 items-center gap-4"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-lg font-bold text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20">{currentCase.client.name.charAt(0)}</div><div className="min-w-0"><p className="text-[10px] font-bold tracking-[.14em] text-indigo-500">{code}</p><h1 className="mt-1 truncate text-xl font-bold text-slate-950 dark:text-white">{currentCase.client.name}</h1><p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">{currentCase.title}</p></div></div><div className="flex flex-wrap items-center gap-2"><label className="relative"><span className="sr-only">案件ステータスを更新</span><select aria-label="案件ステータスを更新" value={currentCase.status} disabled={isUpdatingStatus} onChange={(event) => void updateCaseStatus(event.target.value as CaseDetail['status'])} className={`h-9 cursor-pointer appearance-none rounded-xl border bg-white py-0 pl-3 pr-8 text-xs font-bold outline-none transition focus:ring-2 focus:ring-indigo-200 disabled:cursor-wait disabled:opacity-60 dark:bg-[#111a2e] ${status.badge}`}><option value={currentCase.status}>{isUpdatingStatus ? '更新中…' : `● ${status.label}`}</option>{caseStatusOptions.filter((option) => option.value !== currentCase.status).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"/></label><button type="button" disabled={isDeletingClient} onClick={() => setIsClientDeleteOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-200 px-3 text-xs font-bold text-rose-600 transition hover:border-rose-400 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"><Trash2 size={14}/>依頼者を削除</button></div></div>
      <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-3 text-[11px] dark:border-slate-800 sm:px-6"><Meta label="案件種別" value={currentCase.case_type === 'その他' && currentCase.case_type_other ? `その他：${currentCase.case_type_other}` : currentCase.case_type ?? '未分類'}/><Meta label="登録者" value={currentCase.created_by_employee?.full_name ?? '未記録'}/>{currentCase.created_at && <Meta label="登録" value={formatDateTime(currentCase.created_at)}/>}<Meta label="最終更新" value={formatDateTime(currentCase.updated_at)}/></div>
    </header>

    <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-[#111a2e]">
      <nav className="flex overflow-x-auto border-b border-slate-200 px-3 dark:border-slate-700">{([['documents', '資料・書面', FileText], ['precedents', '判例・法令メモ', Landmark], ['meetings', '打合せ記録', MessageSquare]] as const).map(([id, label, Icon]) => <button key={id} type="button" onClick={() => setTab(id)} className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3.5 text-sm font-bold transition ${tab === id ? 'border-indigo-600 text-indigo-600 dark:text-indigo-300' : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}><Icon size={16}/>{label}</button>)}</nav>
      <div className="p-4 sm:p-5">
        {saveError && !dialog && <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{saveError}</p>}
        {tab === 'documents' && <DocumentsTab documents={currentCase.documents} selected={selectedDocument} onSelect={setSelectedDocument} onAdd={() => openDocument()} onEdit={openDocument} onDelete={deleteDocument} deletingId={deletingDocumentId}/>} 
        {tab === 'precedents' && <PrecedentsTab items={currentCase.precedents} expandedId={expandedPrecedentId} onToggle={(id) => setExpandedPrecedentId((current) => current === id ? null : id)} onAdd={() => { setSaveError(null); setDialog('precedent') }}/>} 
        {tab === 'meetings' && <MeetingsTab caseFile={currentCase} items={filteredMeetings} filter={meetingFilter} onFilter={setMeetingFilter} onAdd={() => { setSaveError(null); setDialog('meeting') }}/>} 
      </div>
    </section>

    {dialog === 'document' && <Drawer title={editingDocumentId ? '資料・書面を編集' : '資料・書面を追加'} closing={isDocumentDrawerClosing} onClose={closeDialog}><form onSubmit={saveRecord} className="space-y-4"><Field label="資料名 *"><input required value={document.title} onChange={(event) => setDocument({ ...document, title: event.target.value })} className={inputClass}/></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="種類 *"><input required value={document.category} onChange={(event) => setDocument({ ...document, category: event.target.value })} className={inputClass}/></Field><Field label="バージョン"><input value={document.version} onChange={(event) => setDocument({ ...document, version: event.target.value })} className={inputClass}/></Field></div><Field label="ステータス"><select value={document.status} onChange={(event) => setDocument({ ...document, status: event.target.value })} className={inputClass}><option value="draft">下書き</option><option value="submitted">提出済み</option><option value="confirmed">確認済み</option></select></Field><Field label="資料リンク"><input type="url" value={document.file_url} onChange={(event) => setDocument({ ...document, file_url: event.target.value })} className={inputClass} placeholder="https://..."/></Field><p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">Box / Google Drive 等のリンクを登録します。ファイル本体のアップロードは Phase 2 です。</p><Actions onClose={closeDialog} saving={isSaving}/></form></Drawer>}
    {(dialog === 'precedent' || dialog === 'meeting') && <Modal title={dialog === 'precedent' ? '判例・法令メモを追加' : '打合せ記録を追加'} onClose={closeDialog}><form onSubmit={saveRecord} className="space-y-4">{dialog === 'precedent' ? <><Field label="タイトル *"><input required value={precedent.title} onChange={(event) => setPrecedent({ ...precedent, title: event.target.value })} className={inputClass}/></Field><Field label="引用・法令番号"><input value={precedent.citation} onChange={(event) => setPrecedent({ ...precedent, citation: event.target.value })} className={inputClass}/></Field><Field label="要約"><textarea value={precedent.summary} onChange={(event) => setPrecedent({ ...precedent, summary: event.target.value })} className={textareaClass}/></Field><Field label="案件との関連"><input value={precedent.relevance} onChange={(event) => setPrecedent({ ...precedent, relevance: event.target.value })} className={inputClass}/></Field><Field label="参照リンク"><input type="url" value={precedent.source_url} onChange={(event) => setPrecedent({ ...precedent, source_url: event.target.value })} className={inputClass}/></Field></> : <><div className="grid gap-3 sm:grid-cols-2"><Field label="日付 *"><input required type="date" value={meeting.meeting_date} onChange={(event) => setMeeting({ ...meeting, meeting_date: event.target.value })} className={inputClass}/></Field><Field label="記録種別"><select value={meeting.interaction_type} onChange={(event) => setMeeting({ ...meeting, interaction_type: event.target.value as InteractionType })} className={inputClass}>{Object.entries(interactionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div><Field label="出席者"><input value={meeting.attendees} onChange={(event) => setMeeting({ ...meeting, attendees: event.target.value })} className={inputClass}/></Field><Field label="内容 *"><textarea required value={meeting.content} onChange={(event) => setMeeting({ ...meeting, content: event.target.value })} className={textareaClass}/></Field><Field label="次の対応"><input value={meeting.next_action} onChange={(event) => setMeeting({ ...meeting, next_action: event.target.value })} className={inputClass}/></Field><Field label="対応期限（任意）"><input type="datetime-local" value={meeting.next_action_due_at} onChange={(event) => setMeeting({ ...meeting, next_action_due_at: event.target.value })} className={inputClass}/></Field></>}{saveError && <p className="text-sm text-rose-600">{saveError}</p>}<Actions onClose={closeDialog} saving={isSaving}/></form></Modal>}
    {isClientDeleteOpen && <ClientDeleteDialog clientName={currentCase.client.name} deleting={isDeletingClient} closing={isClientDeleteClosing} onClose={closeClientDeleteDialog} onConfirm={() => void deleteClient()}/>} 
  </div>
}

function DocumentsTab({ documents, selected, onSelect, onAdd, onEdit, onDelete, deletingId }: { documents: CaseDocument[]; selected: CaseDocument | null; onSelect: (item: CaseDocument | null) => void; onAdd: () => void; onEdit: (item: CaseDocument) => void; onDelete: (item: CaseDocument) => void; deletingId: number | null }) {
  return <>
    <SectionTop text="案件に必要な資料と外部ファイルのリンクを管理します。" action="資料・書面を追加" onAction={onAdd}/>
    {documents.length === 0 ? <Empty icon={FileText} text="資料・書面はまだ登録されていません。" onAdd={onAdd}/> : <div className="min-w-0">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-[#111a2e]">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold text-slate-800 dark:text-white">資料・書面一覧</p><p className="mt-0.5 text-[10px] text-slate-400">クリックすると詳細を開きます</p></div><span className="rounded-lg bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">{documents.length} 件</span></div>
        <div className="grid grid-cols-[minmax(0,1fr)_94px_96px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[10px] font-bold text-slate-400 dark:border-slate-700 dark:bg-[#0c1527] sm:grid-cols-[minmax(0,1fr)_110px_120px_112px_30px]"><span>資料・書面</span><span>状態</span><span className="hidden sm:block">更新者</span><span className="hidden sm:block">最終更新</span><span/></div>
        {documents.map((item) => {
          const open = selected?.id === item.id
          return <article key={item.id} className={`group relative border-b border-slate-100 transition duration-300 last:border-b-0 dark:border-slate-800 ${open ? 'bg-indigo-50/60 dark:bg-indigo-500/[.08]' : 'hover:z-10 hover:bg-indigo-50/50 hover:shadow-[inset_3px_0_0_#6366f1] dark:hover:bg-indigo-500/[.06]'}`}>
            <button type="button" onClick={() => onSelect(open ? null : item)} className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_94px_96px] items-center gap-3 px-4 py-3.5 text-left sm:grid-cols-[minmax(0,1fr)_110px_120px_112px_30px]">
              <span className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20"><FileText size={18}/></span><span className="min-w-0"><strong className="block truncate text-xs text-slate-900 dark:text-white">{item.title}</strong><span className="mt-1 block truncate text-[10px] text-slate-400">{item.category} ・ v{item.version}{item.file_url ? ' ・ Link' : ''}</span></span></span>
              <DocumentStatus status={item.status}/><span className="hidden truncate text-[10px] text-slate-500 dark:text-slate-400 sm:block">{item.created_by_employee?.full_name ?? '—'}</span><span className="hidden text-[10px] text-slate-400 sm:block">{item.updated_at ? formatDateTime(item.updated_at) : '—'}</span><ChevronDown size={16} className={`hidden text-slate-400 transition duration-300 sm:block ${open ? 'rotate-180 text-indigo-500' : ''}`}/>
            </button>
            <div className={`grid transition-all duration-500 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}><div className="overflow-hidden"><div className="grid gap-3 border-t border-indigo-100 bg-white/75 px-4 py-4 dark:border-indigo-500/15 dark:bg-[#0c1527]/65 md:grid-cols-[minmax(0,1fr)_250px]">{item.file_url ? <a href={item.file_url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-left transition hover:border-indigo-300 dark:border-indigo-500/20 dark:bg-indigo-500/[.08]"><ExternalLink size={18} className="shrink-0 text-indigo-600 dark:text-indigo-300"/><span><strong className="block text-xs text-indigo-700 dark:text-indigo-200">資料リンクを開く</strong><span className="mt-1 block truncate text-[10px] text-indigo-500 dark:text-indigo-300">外部ファイルを新しいタブで表示します</span></span></a> : <div className="rounded-xl border border-dashed border-slate-300 p-3 text-xs text-slate-400 dark:border-slate-600">資料リンクはまだ登録されていません。</div>}<div className="flex items-center justify-end gap-2"><button type="button" onClick={() => onEdit(item)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 text-xs font-bold text-indigo-600 transition hover:border-indigo-400 dark:border-indigo-500/30 dark:bg-[#111a2e] dark:text-indigo-300"><Pencil size={14}/>編集</button><button type="button" disabled={deletingId === item.id} onClick={() => onDelete(item)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 text-xs font-bold text-rose-500 transition hover:border-rose-400 disabled:opacity-50 dark:border-rose-500/30 dark:bg-[#111a2e]"><Trash2 size={14}/>{deletingId === item.id ? '削除中…' : '削除'}</button></div></div></div></div>
          </article>
        })}
      </section>
    </div>}
  </>
}

function ClientDeleteDialog({ clientName, deleting, closing, onClose, onConfirm }: { clientName: string; deleting: boolean; closing: boolean; onClose: () => void; onConfirm: () => void }) {
  const locked = deleting || closing
  return <div className={`business-quest-dialog-backdrop fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:items-center sm:p-6${closing ? ' is-closing' : ''}`} onMouseDown={() => !locked && onClose()}><section role="alertdialog" aria-modal="true" aria-labelledby="delete-client-title" onMouseDown={(event) => event.stopPropagation()} className={`business-quest-dialog-panel w-full max-w-md rounded-3xl border border-rose-200 bg-white shadow-2xl dark:border-rose-500/30 dark:bg-[#111a2e]${closing ? ' is-closing' : ''}`}><div className="p-6"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300"><Trash2 size={22}/></span><p className="mt-5 text-[10px] font-bold tracking-[.15em] text-rose-500">PERMANENT DELETE</p><h2 id="delete-client-title" className="mt-2 text-lg font-black text-slate-900 dark:text-white">依頼者を削除しますか？</h2><p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">「{clientName}」と、この依頼者に紐づくすべての案件・資料・メモが完全に削除されます。この操作は元に戻せません。</p><div className="mt-5 rounded-xl border border-rose-100 bg-rose-50/70 p-3 text-xs font-semibold leading-5 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">削除前に必要な資料・記録を確認してください。</div><div className="mt-6 flex justify-end gap-2"><button type="button" disabled={locked} onClick={onClose} className="h-10 rounded-xl px-4 text-sm font-bold text-slate-500 transition hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800">キャンセル</button><button type="button" disabled={locked} onClick={onConfirm} className="inline-flex h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white transition hover:bg-rose-500 disabled:opacity-60"><Trash2 size={15}/>{deleting ? '削除中…' : '完全に削除'}</button></div></div></section></div>
}

function PrecedentsTab({ items, expandedId, onToggle, onAdd }: { items: CasePrecedent[]; expandedId: number | null; onToggle: (id: number) => void; onAdd: () => void }) {
  return <>
    <SectionTop text="判例・法令・調査メモを案件ごとに整理します。" action="判例・メモを追加" onAction={onAdd}/>
    {items.length === 0 ? <Empty icon={Landmark} text="該当する判例・法令メモはありません。" onAdd={onAdd}/> : <div className="space-y-2.5">{items.map((item, index) => {
      const open = expandedId === item.id
      return <article key={item.id} className={`overflow-hidden rounded-2xl border bg-white transition duration-300 dark:bg-[#111a2e] ${open ? 'border-indigo-300 shadow-[0_10px_30px_rgba(79,70,229,.1)] dark:border-indigo-500/50' : 'border-slate-200 hover:border-indigo-200 hover:shadow-sm dark:border-slate-700 dark:hover:border-indigo-500/40'}`}>
        <button type="button" onClick={() => onToggle(item.id)} className="grid w-full grid-cols-[34px_minmax(0,1fr)_22px] items-start gap-3 p-4 text-left sm:grid-cols-[40px_minmax(0,1fr)_24px]">
          <span className="pt-0.5 text-base font-black text-slate-400 dark:text-slate-500">{String(index + 1).padStart(2, '0')}</span>
          <span className="min-w-0"><strong className="block text-sm leading-6 text-slate-900 dark:text-white">{item.title}</strong><span className="mt-1 block truncate text-[10px] text-slate-400">{item.citation ?? '引用・法令番号なし'}</span><span className="mt-2 flex flex-wrap gap-1"><em className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold not-italic text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">法令・判例</em>{item.relevance && <em className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-bold not-italic text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">案件関連</em>}</span><span className="mt-2 line-clamp-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">{item.summary || '要約は登録されていません。詳細を開いて内容を確認してください。'}</span></span>
          <ChevronDown size={17} className={`mt-1 text-slate-400 transition duration-300 ${open ? 'rotate-180 text-indigo-500' : ''}`}/>
        </button>
        <div className={`grid transition-all duration-500 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}><div className="overflow-hidden"><div className="grid gap-4 border-t border-slate-100 bg-slate-50/70 px-4 pb-4 pt-3 dark:border-slate-800 dark:bg-slate-950/20 lg:grid-cols-[minmax(0,1fr)_280px]"><div><p className="text-[10px] font-bold tracking-wider text-indigo-500">メモ・要点</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{item.summary || '要約は登録されていません。'}</p></div><div className="rounded-xl border border-indigo-100 bg-white p-3 text-xs dark:border-indigo-500/20 dark:bg-[#111a2e]">{item.relevance ? <><p className="font-bold text-indigo-600 dark:text-indigo-300">案件との関連</p><p className="mt-1.5 leading-5 text-slate-600 dark:text-slate-300">{item.relevance}</p></> : <p className="text-slate-400">案件との関連は未登録です。</p>}{item.source_url && <a href={item.source_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 font-bold text-indigo-600 dark:text-indigo-300"><ExternalLink size={14}/>参照元を開く</a>}</div></div></div></div>
      </article>
    })}</div>}
  </>
}

function MeetingsTab({ caseFile, items, filter, onFilter, onAdd }: { caseFile: CaseDetail; items: CaseMeetingLog[]; filter: 'all' | InteractionType; onFilter: (value: 'all' | InteractionType) => void; onAdd: () => void }) { const latestNext = items.find((item) => item.next_action); return <><SectionTop text="顧客・社内との連絡履歴を時系列で確認します。" action="打合せ記録を追加" onAction={onAdd}/><div className="mb-4 flex gap-1.5 overflow-x-auto">{(['all', 'meeting', 'phone', 'email', 'internal_note'] as const).map((value) => <button key={value} type="button" onClick={() => onFilter(value)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${filter === value ? 'border-indigo-500 bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300' : 'border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400'}`}>{value === 'all' ? 'すべて' : interactionLabels[value]}</button>)}</div><div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]"><div>{items.length === 0 ? <Empty icon={MessageSquare} text="打合せ記録はまだありません。" onAdd={onAdd}/> : <div className="relative space-y-0 before:absolute before:bottom-5 before:left-[19px] before:top-5 before:w-px before:bg-slate-200 dark:before:bg-slate-700">{items.map((item) => <TimelineItem key={item.id} item={item}/>)}</div>}</div><aside className="space-y-3"><div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700"><p className="text-[10px] font-bold tracking-wider text-indigo-500">案件サマリー</p><dl className="mt-3 space-y-3 text-xs"><InfoLine label="案件名" value={caseFile.title}/><InfoLine label="ステータス" value={statusConfig[statusMap[caseFile.status]].label}/><InfoLine label="担当者" value={caseFile.assigned_employee?.full_name ?? '未割当'}/><InfoLine label="記録件数" value={`${caseFile.meeting_logs.length}件`}/><InfoLine label="資料件数" value={`${caseFile.documents.length}件`}/></dl></div>{latestNext?.next_action && <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 dark:border-indigo-500/20 dark:bg-indigo-500/[.06]"><p className="text-[10px] font-bold tracking-wider text-indigo-500">次のアクション</p><p className="mt-2 text-sm font-bold leading-6 text-slate-800 dark:text-slate-100">{latestNext.next_action}</p>{latestNext.next_action_due_at && <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><CalendarClock size={14}/>{formatDateTime(latestNext.next_action_due_at)}</p>}</div>}</aside></div></> }

function TimelineItem({ item }: { item: CaseMeetingLog }) { const type = item.interaction_type ?? 'meeting'; const icons = { meeting: MessageSquare, phone: Phone, email: Mail, internal_note: StickyNote }; const Icon = icons[type]; return <article className="relative flex gap-4 pb-5"><span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-4 border-white bg-indigo-100 text-indigo-600 dark:border-[#111a2e] dark:bg-indigo-500/20 dark:text-indigo-300"><Icon size={15}/></span><div className="min-w-0 flex-1 rounded-2xl border border-slate-200 p-4 transition hover:border-indigo-200 hover:shadow-sm dark:border-slate-700 dark:hover:border-indigo-500/40"><div className="flex flex-wrap items-center justify-between gap-2"><div><span className="text-[10px] font-bold text-indigo-500">{interactionLabels[type]}</span><p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{item.meeting_date}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${item.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}>{item.status === 'confirmed' ? '確定済み' : '下書き'}</span></div>{item.attendees && <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400"><UserRound size={13}/>{item.attendees}</p>}<p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{item.content}</p>{item.next_action && <div className="mt-3 rounded-xl bg-indigo-50/70 p-3 text-xs text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"><strong>次の対応：</strong>{item.next_action}{item.next_action_due_at && <span className="mt-1 block text-[10px] text-slate-500">期限 {formatDateTime(item.next_action_due_at)}</span>}</div>}</div></article> }

function SectionTop({ text, action, onAction }: { text: string; action: string; onAction: () => void }) { return <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-slate-500 dark:text-slate-400">{text}</p><button type="button" onClick={onAction} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white transition hover:bg-indigo-500 active:scale-[.98]"><Plus size={15}/>{action}</button></div> }
function Empty({ icon: Icon, text, onAdd }: { icon: typeof FileText; text: string; onAdd: () => void }) { return <div className="rounded-2xl border border-dashed border-slate-300 py-12 text-center dark:border-slate-600"><Icon size={28} className="mx-auto text-slate-300"/><p className="mt-3 text-sm text-slate-500">{text}</p><button type="button" onClick={onAdd} className="mt-3 text-xs font-bold text-indigo-600">＋ 追加する</button></div> }
function DocumentStatus({ status }: { status: string }) { return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${status === 'confirmed' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : status === 'submitted' ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}>{documentStatusLabel(status)}</span> }
function documentStatusLabel(status: string) { return status === 'confirmed' ? '確認済み' : status === 'submitted' ? '提出済み' : '下書き' }
function InfoLine({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-3"><dt className="shrink-0 text-slate-400">{label}</dt><dd className="text-right font-semibold text-slate-700 dark:text-slate-200">{value}</dd></div> }
function Meta({ label, value }: { label: string; value: string }) { return <span className="rounded-full bg-slate-50 px-3 py-1.5 font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300"><span className="mr-1 text-slate-400">{label}</span>{value}</span> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700 dark:text-slate-200">{label}</span>{children}</label> }
function Actions({ onClose, saving }: { onClose: () => void; saving: boolean }) { return <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-700"><button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-xl px-4 text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">キャンセル</button><button type="submit" disabled={saving} className="h-10 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-60">{saving ? '保存中…' : '保存する'}</button></div> }
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-3 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={onClose}><section onMouseDown={(event) => event.stopPropagation()} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[#111a2e]"><DialogHeader title={title} onClose={onClose}/><div className="p-5">{children}</div></section></div> }
function Drawer({ title, children, closing, onClose }: { title: string; children: React.ReactNode; closing: boolean; onClose: () => void }) { return <div className={`case-document-modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-3 backdrop-blur-sm sm:items-center sm:p-6${closing ? ' is-closing' : ''}`} onMouseDown={onClose}><section onMouseDown={(event) => event.stopPropagation()} className={`case-document-modal-panel max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[#111a2e]${closing ? ' is-closing' : ''}`}><DialogHeader title={title} onClose={onClose}/><div className="p-5">{children}</div></section></div> }
function DialogHeader({ title, onClose }: { title: string; onClose: () => void }) { return <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-700 dark:bg-[#111a2e]/95"><h2 className="font-bold text-slate-900 dark:text-white">{title}</h2><button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18}/></button></header> }

function getApiError(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) return fallback
  if (error.response?.status === 403) return 'この操作を行う権限がありません。アクセスレベルを確認してください。'

  const validationErrors = error.response?.data?.errors as Record<string, string[]> | undefined
  const firstValidationError = validationErrors ? Object.values(validationErrors).flat()[0] : null

  return firstValidationError ?? error.response?.data?.message ?? fallback
}
