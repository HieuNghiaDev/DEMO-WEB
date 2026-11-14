import { useEffect, useId, useRef, useState } from 'react'
import axios from 'axios'
import { CalendarClock, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, FileText, FolderOpen, Mail, MapPin, MessageSquareText, Package, Paperclip, Pencil, Phone, Plus, RotateCcw, Save, Search, Upload, UserRound, Users, Video, X } from 'lucide-react'
import { Button, ModalShell } from '../../components/ui'
import { UserAvatar } from '../../components/ui/UserAvatar'
import { caseWorkspaceApi, type CommunicationUploadProgress } from './api'
import { HistoryAttachmentList, HistoryAttachmentPicker } from './HistoryAttachments'
import { communicationLabels, type Communication, type CommunicationType, type HistoryEntry, type HistoryOptions, type HistoryPerson, type HistoryResponse } from './historyTypes'
import { changeHistoryFilter, changeLabel, compactHistoryChange, durationLabel, groupHistoryDays, HISTORY_PAGE_SIZES, historyCategory, historyDate, historyOperationIcon, historyPageNumbers, historyRange, historyTime, historyTypeLabel, historyValue, initialHistoryFilters, localDateInput, type HistoryFilters } from './historyPresentation'
import './caseHistory.css'

const icons = { phone: Phone, email: Mail, chat: MessageSquareText, online_meeting: Video, office_meeting: Users, visit: MapPin, postal_mail: Package, other: MessageSquareText }
const operationIcons = { confirmed: CheckCheck, return: RotateCcw, upload: Upload, deadline: CalendarClock, person: UserRound, task: ClipboardCheck, document: FileText, case: FolderOpen, edit: Pencil }
const errorText = (error: unknown) => axios.isAxiosError(error) ? error.response?.data?.message ?? '保存・取得できませんでした。接続を確認して再試行してください。' : '保存・取得できませんでした。再試行してください。'

export default function CaseHistoryPanel({ caseId, onChanged, onOpenTask }: { caseId: number; onChanged: () => Promise<unknown>; onOpenTask: (id: number) => void }) {
  const [result, setResult] = useState<HistoryResponse | null>(null)
  const [options, setOptions] = useState<HistoryOptions | null>(null)
  const [filters, setFilters] = useState(initialHistoryFilters)
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadedKey, setLoadedKey] = useState('')
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<HistoryEntry | 'new' | null>(null)
  const [taskEntry, setTaskEntry] = useState<HistoryEntry | null>(null)
  const [saved, setSaved] = useState<HistoryEntry | null>(null)
  const requestKey = JSON.stringify([caseId, filters, refresh])
  useEffect(() => {
    const abort = new AbortController()
    void caseWorkspaceApi.historyOptions(caseId, abort.signal).then(setOptions).catch(e => { if (!abort.signal.aborted) setError(errorText(e)) })
    return () => abort.abort()
  }, [caseId, refresh])
  useEffect(() => {
    const abort = new AbortController()
    const timeout = window.setTimeout(() => {
      setLoading(true); setError('')
      const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ''))
      void caseWorkspaceApi.history(caseId, params, abort.signal).then(data => {
        if (!abort.signal.aborted) { setResult(data); setLoadedKey(requestKey); setLoading(false) }
      }).catch(e => { if (!abort.signal.aborted) { setResult(null); setLoadedKey(requestKey); setError(errorText(e)); setLoading(false) } })
    }, 200)
    return () => { abort.abort(); window.clearTimeout(timeout) }
  }, [caseId, filters, refresh, requestKey])
  const filter = <K extends Exclude<keyof HistoryFilters, 'page'>>(field: K, value: HistoryFilters[K]) => setFilters(current => changeHistoryFilter(current, field, value))
  const clearFilters = () => setFilters(current => ({ ...initialHistoryFilters, per_page: current.per_page }))
  const pending = loading || loadedKey !== requestKey
  const changed = (entry?: HistoryEntry) => {
    setEditing(null); setTaskEntry(null)
    if (entry) setSaved(entry)
    setRefresh(value => value + 1)
    void onChanged().catch(() => setError('保存は完了しました。案件情報の再取得に失敗しました。再読み込みしてください。'))
  }
  const permissions = result?.permissions ?? options?.permissions
  const visibleGroups = groupHistoryDays(result?.entries ?? [])
  const loadingGroups: Array<Array<HistoryEntry | null>> = visibleGroups.length ? visibleGroups.map(group => group.entries) : [Array.from({ length: 5 }, () => null)]
  return <section className="cm-history" aria-label="案件履歴">
    <header className="cm-history-heading"><div><h2>履歴</h2><p>案件に関する操作と連絡・面談の記録を時系列で確認できます。</p></div>
      {permissions?.can_add_communication && options && <Button variant="primary" size="sm" icon={<Plus size={15} aria-hidden/>} onClick={() => setEditing('new')}>連絡・面談を追加</Button>}
    </header>
    <div className="cm-history-switch" aria-label="履歴の種類">{([['', 'すべて', 'all'], ['system', '操作履歴', 'system'], ['communication', '連絡・面談履歴', 'communication']] as const).map(([value, label, count]) => <button key={value} type="button" aria-pressed={filters.kind === value} onClick={() => filter('kind', value)}>{label}<span>{result?.counts[count] ?? '—'}</span></button>)}</div>
    <div className="cm-history-filters">
      <label className="cm-history-filter"><span>種類</span><select value={filters.type} onChange={e => filter('type', e.target.value)}><option value="">すべて</option>{Object.entries(communicationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="cm-history-filter"><span>担当者</span><select value={filters.actor_id} onChange={e => filter('actor_id', e.target.value)}><option value="">すべて</option>{options?.people.filter(p => p.type === 'employee').map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}</select></label>
      <div className="cm-history-period" role="group" aria-label="期間"><span aria-hidden>期間</span><label><span className="sr-only">開始日</span><input type="date" value={filters.from} max={filters.to || undefined} onChange={e => filter('from', e.target.value)}/></label><span aria-hidden>～</span><label><span className="sr-only">終了日</span><input type="date" value={filters.to} min={filters.from || undefined} onChange={e => filter('to', e.target.value)}/></label></div>
      <label className="cm-history-search"><span className="sr-only">検索</span><Search size={15} aria-hidden/><input type="search" placeholder="キーワードで検索..." maxLength={255} value={filters.search} onChange={e => filter('search', e.target.value)}/></label>
    </div>
    {saved?.permissions.can_create_task && <div className="cm-history-next" role="status"><div><strong>タスクを作成しますか？</strong><p>{saved.communication?.next_action ?? saved.title}{saved.communication?.next_action_due_at && ` ・ ${historyDate(saved.communication.next_action_due_at)}`}</p></div><Button size="sm" onClick={() => setTaskEntry(saved)}>タスクを作成</Button><Button size="sm" variant="ghost" onClick={() => setSaved(null)}>後で</Button></div>}
    {error && <div role="alert" className="cm-history-error">{error}<Button size="sm" onClick={() => setRefresh(value => value + 1)}>再試行</Button></div>}
    {result && <div className="cm-history-result-summary"><span aria-live="polite">{pending ? '履歴を読み込み中…' : historyRange(result.pagination)}</span><button type="button" onClick={clearFilters}>条件をクリア</button></div>}
    <div className="cm-history-results" aria-busy={pending}>
      {pending ? <div role="status" aria-label="履歴を読み込み中" className="cm-history-skeleton">{loadingGroups.map((group, groupIndex) => <section key={groupIndex} aria-hidden><div className="cm-history-skeleton-date"/>{group.map((entry, index) => <div key={entry?.id ?? index} className={`cm-history-skeleton-row${entry?.kind === 'communication' ? ' is-communication' : ''}`}><span/><span/><span/></div>)}</section>)}</div> : !error && result?.entries.length === 0 ? <div className="cm-history-empty"><p>該当する履歴はありません。</p><Button size="sm" onClick={clearFilters}>条件をクリア</Button></div> : !error &&
        <div className="cm-history-list">{visibleGroups.map(group => <section key={group.date} aria-label={`${group.date}の履歴`}><h3 className="cm-history-date"><span>{group.date}</span><span aria-label={`このページの${group.date}の履歴 ${group.entries.length}件`}>{group.entries.length}件</span></h3>{group.entries.map(entry => <TimelineEntry key={entry.id} entry={entry} caseId={caseId} onEdit={() => setEditing(entry)} onTask={() => setTaskEntry(entry)} onOpenTask={onOpenTask}/>)}</section>)}</div>}
    </div>
    {result && !error && <footer className="cm-history-pagination">
      <span>{historyRange(result.pagination)}</span>
      <nav aria-label="履歴のページ切り替え"><Button size="sm" aria-label="前のページ" disabled={pending || result.pagination.current_page <= 1} onClick={() => setFilters(f => ({ ...f, page: result.pagination.current_page - 1 }))}><ChevronLeft size={15} aria-hidden/></Button>
        {historyPageNumbers(result.pagination.current_page, result.pagination.last_page).map((page, index) => page === 'ellipsis' ? <span key={`gap-${index}`} className="cm-history-page-gap">…</span> : <Button key={page} size="sm" variant={page === result.pagination.current_page ? 'primary' : 'secondary'} aria-label={`${page}ページ`} aria-current={page === result.pagination.current_page ? 'page' : undefined} disabled={pending} onClick={() => setFilters(f => ({ ...f, page }))}>{page}</Button>)}
        <Button size="sm" aria-label="次のページ" disabled={pending || result.pagination.current_page >= result.pagination.last_page} onClick={() => setFilters(f => ({ ...f, page: result.pagination.current_page + 1 }))}><ChevronRight size={15} aria-hidden/></Button></nav>
      <label>表示件数<select value={filters.per_page} onChange={e => filter('per_page', Number(e.target.value))}>{HISTORY_PAGE_SIZES.map(size => <option key={size} value={size}>{size}件</option>)}</select></label>
    </footer>}
    {editing && options && <CommunicationDialog caseId={caseId} entry={editing === 'new' ? null : editing} people={options.people} canAttach={options.permissions.can_upload_attachments === true} onClose={() => setEditing(null)} onSaved={changed}/>}
    {taskEntry && options && <NextActionTaskDialog caseId={caseId} entry={taskEntry} people={options.people} onClose={() => setTaskEntry(null)} onSaved={() => { setSaved(null); changed() }}/ >}
  </section>
}

export function TimelineEntry({ entry, caseId, onEdit, onTask, onOpenTask }: { entry: HistoryEntry; caseId?: number; onEdit: () => void; onTask: () => void; onOpenTask: (id: number) => void }) {
  const operation = historyOperationIcon(entry)
  const Icon = entry.kind === 'system' ? operationIcons[operation] : icons[entry.type as keyof typeof icons] ?? MessageSquareText
  const communication = entry.communication
  const detailId = useId()
  const [expanded, setExpanded] = useState(false)
  const change = compactHistoryChange(entry)
  const actor = entry.actor?.full_name ?? '記録なし／システム'
  const category = historyCategory(entry)
  const tone = entry.kind === 'communication' ? 'communication' : operation
  return <article className={`cm-history-entry is-${entry.kind} tone-${tone}`} data-history-id={entry.id}>
    <time className="cm-history-time" dateTime={entry.occurred_at}>{historyTime(entry.occurred_at, entry.kind === 'system')}</time>
    <span className="cm-history-track" aria-hidden/>
    <span className={`cm-history-icon is-${tone}`}><Icon size={19} aria-hidden/></span>
    <div className="cm-history-content">
      <div className="cm-history-event-heading">{entry.kind === 'communication' ? <div className="cm-history-communication-type">{historyTypeLabel(entry)}{communication?.duration_minutes != null && <span className="cm-history-duration">{durationLabel(communication.duration_minutes)}</span>}</div> : <h4>{entry.title}</h4>}{category && <span className="cm-history-category">{category}</span>}</div>
      {entry.kind === 'communication' && <p className="cm-history-subject">{entry.title}</p>}
      {communication ? <><p className="cm-history-summary">相手：{communication.counterparties.map(p => p.name).join('、')}</p>{(communication.participants.length > 0 || communication.next_action_due_at) && <div className="cm-history-communication-meta">{communication.participants.length > 0 && <span><Users size={12} aria-hidden/>参加者 {communication.participants.length}名</span>}{communication.next_action_due_at && <span className="cm-history-next-date"><CalendarClock size={12} aria-hidden/>次回対応 {historyDate(communication.next_action_due_at)}</span>}</div>}</> : <div className="cm-history-secondary">{entry.summary && <p className="cm-history-summary" title={entry.summary}>{entry.summary}</p>}{change && <p className="cm-history-change" title={`${change.field}：${change.before} → ${change.after}`}>{change.before} <span aria-hidden>→</span> <strong>{change.after}</strong>{change.more > 0 && <small> +{change.more}</small>}</p>}</div>}
    </div>
    <div className="cm-history-actor"><UserAvatar name={entry.actor?.full_name} stableKey={entry.actor?.id} size="sm" shape="circle" className="cm-history-actor-avatar"/><span>{actor}</span></div>
    <Button type="button" variant="secondary" size="sm" className="cm-history-details-toggle" aria-expanded={expanded} aria-controls={detailId} icon={<ChevronRight size={13} aria-hidden/>} iconPosition="right" onClick={() => setExpanded(value => !value)}>{expanded ? '詳細を閉じる' : '詳細を見る'}</Button>
    {expanded && <div id={detailId} className="cm-history-detail">
        <h5 className="cm-history-detail-heading">{entry.title}</h5>
        <p className="cm-history-meta">{historyDate(entry.occurred_at, true, entry.kind === 'system')}{communication?.ended_at && ` ～ ${historyDate(communication.ended_at, true)}`} ・ {entry.kind === 'system' ? '操作ユーザー' : '登録者'}：{actor}{entry.legacy && ' ・ 旧形式の記録（読み取り専用）'}</p>
        {communication && <dl>{[
          ['相手', communication.counterparties.map(p => p.name).join('、')],
          ['参加者', communication.participants.map(p => p.name).join('、')], ['概要', communication.summary], ['詳細', communication.details], ['対応結果', communication.outcome],
          ['次回対応', communication.next_action], ['次回対応期限', communication.next_action_due_at && historyDate(communication.next_action_due_at, true)],
          ['作成日時', entry.created_at && historyDate(entry.created_at, true)], ['最終更新', entry.updated_at && historyDate(entry.updated_at, true)],
        ].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
        {entry.summary && !communication && <p className="cm-history-fulltext">{entry.summary}</p>}
        {Object.entries(entry.legacy_detail ?? {}).filter(([, value]) => value).map(([label, value]) => <p key={label}>{label}：{value}</p>)}
        {caseId != null && !!entry.attachments?.length && <HistoryAttachmentList attachments={entry.attachments} caseId={caseId} communicationId={entry.record_id}/>}
        {Object.keys(entry.changes).length > 0 && <dl>{Object.entries(entry.changes).map(([field, change]) => <div key={field}><dt>{changeLabel(field)}</dt><dd><span>{historyValue(change.before)}</span><span aria-label="変更後"> → </span><strong>{historyValue(change.after)}</strong></dd></div>)}</dl>}
        {entry.linked_task && <Button variant="ghost" size="sm" onClick={() => onOpenTask(entry.linked_task!.id)}>関連タスク：{entry.linked_task.title} ›</Button>}
        <div className="cm-history-detail-actions">{entry.permissions.can_edit && <Button size="sm" onClick={onEdit}>編集</Button>}{entry.permissions.can_create_task && <Button size="sm" onClick={onTask}>次回対応からタスクを作成</Button>}</div>
      </div>}
  </article>
}

const personKey = (person: HistoryPerson) => `${person.type}:${person.id ?? person.name}`
const personTypeLabels = { client: '依頼者', party: '関係者', employee: '社員', external: '外部' } as const

function HistoryPeopleField({ id, label, required, people, selected, error, onPick }: {
  id: string; label: string; required?: boolean; people: HistoryPerson[]; selected: HistoryPerson[]; error: string;
  onPick: (person: HistoryPerson, checked: boolean) => void;
}) {
  const [query, setQuery] = useState('')
  const pickerRef = useRef<HTMLDetailsElement>(null)
  const optionsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const picker = pickerRef.current
      if (picker?.open && event.target instanceof Node && !picker.contains(event.target)) picker.open = false
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [])
  const selectedKeys = new Set(selected.map(personKey))
  const choices = new Map(people.map(person => [personKey(person), person]))
  for (const person of selected) {
    if (!choices.has(personKey(person))) choices.set(personKey(person), person)
  }
  const normalize = (value: string) => value.normalize('NFKC').toLowerCase()
  const keyword = normalize(query.trim())
  const visible = [...choices.values()].filter(person => normalize(person.name).includes(keyword))

  return <fieldset className="cm-history-people" id={id} tabIndex={-1} aria-describedby={error ? `${id}-error` : undefined}>
    <legend>{label}{required && <span className="cm-history-required"> *</span>}</legend>
    <details ref={pickerRef} className="cm-history-people-picker" onToggle={event => {
      const picker = event.currentTarget
      const options = optionsRef.current
      if (!picker.open || !options) return

      const body = picker.closest('.cm-history-drawer-body')
      if (!body) return
      const trigger = picker.getBoundingClientRect()
      const bounds = body.getBoundingClientRect()
      const below = bounds.bottom - trigger.bottom
      const above = trigger.top - bounds.top
      picker.classList.toggle('opens-up', below < options.offsetHeight + 6 && above > below)
      const menu = options.getBoundingClientRect()
      if (menu.top < bounds.top) body.scrollTop += menu.top - bounds.top
      else if (menu.bottom > bounds.bottom) body.scrollTop += menu.bottom - bounds.bottom
    }}>
      <summary>
        <span className="cm-history-people-preview" title={selected.map(person => person.name).join('、')}>
          {selected[0]?.name ?? `${label}を選択`}
        </span>
        {selected.length > 1 && <span className="cm-history-people-count">+{selected.length - 1}</span>}
        <ChevronDown size={15} aria-hidden/>
      </summary>
      <div ref={optionsRef} className="cm-history-people-options">
        <label className="cm-history-people-search"><Search size={14} aria-hidden/><input type="search" value={query} aria-label={`${label}を検索`} placeholder="名前で検索" onChange={event => setQuery(event.target.value)}/></label>
        <div className="cm-history-people-results">
          {visible.map(person => <label key={personKey(person)}>
            <input type="checkbox" checked={selectedKeys.has(personKey(person))} onChange={event => onPick(person, event.target.checked)}/>
            <span>{person.name}</span><small>{personTypeLabels[person.type]}</small>
          </label>)}
          {visible.length === 0 && <p>該当する候補はありません。</p>}
        </div>
      </div>
    </details>
    {error && <small id={`${id}-error`} className="cm-history-field-error">{error}</small>}
  </fieldset>
}

function CommunicationDialog({ caseId, entry, people, canAttach, onClose, onSaved }: { caseId: number; entry: HistoryEntry | null; people: HistoryPerson[]; canAttach: boolean; onClose: () => void; onSaved: (entry: HistoryEntry) => void }) {
  const formId = useId()
  const titleId = useId()
  const [form, setForm] = useState<Communication>(() => entry?.communication ?? { communication_type: 'phone', direction: 'outbound', started_at: new Date().toISOString(), ended_at: null,
    subject: '', summary: '', details: null, outcome: null, next_action: null, next_action_due_at: null,
    counterparties: people.filter(p => p.type === 'client'), participants: [] })
  const [external, setExternal] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [progress, setProgress] = useState<CommunicationUploadProgress | null>(null)
  const [error, setError] = useState('')
  const [validation, setValidation] = useState<Record<string, string[]>>({})
  const [busy, setBusy] = useState(false)
  const flight = useRef(false)
  const errorRef = useRef<HTMLDivElement>(null)
  const fieldErrors = (field: string) => Object.entries(validation).filter(([name]) => name === field || name.startsWith(`${field}.`)).flatMap(([, messages]) => messages).join(' ')
  const update = <K extends keyof Communication>(field: K, value: Communication[K]) => setForm(f => ({ ...f, [field]: value }))
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (flight.current) return
    flight.current = true; setBusy(true); setError(''); setValidation({})
    try {
      // Whitelist input fields: API-computed duration/task flags are never writable.
      const { duration_minutes: _duration, has_linked_task: _linked, ...payload } = form
      void _duration; void _linked
      const result = await caseWorkspaceApi.saveCommunication(caseId, payload, entry?.record_id, files, setProgress)
      onSaved(result)
    } catch (e) {
      setError(errorText(e)); setValidation(axios.isAxiosError(e) ? e.response?.data?.errors ?? {} : {})
      window.setTimeout(() => errorRef.current?.focus(), 0)
    } finally { flight.current = false; setBusy(false); setProgress(null) }
  }
  const timed = !['email', 'chat', 'postal_mail'].includes(form.communication_type)
  const minutes = timed && form.ended_at ? Math.floor((Date.parse(form.ended_at) - Date.parse(form.started_at)) / 60000) : null
  const pick = (field: 'counterparties' | 'participants', person: HistoryPerson, checked: boolean) => setForm(current => ({
    ...current, [field]: checked ? [...current[field], person] : current[field].filter(p => personKey(p) !== personKey(person)),
  }))
  const title = entry ? '連絡・面談を編集' : '連絡・面談を追加'
  const dismiss = () => { if (!flight.current) onClose() }
  const showAttachments = canAttach || Boolean(entry?.attachments?.length)
  const TypeIcon = icons[form.communication_type]
  const sections = [
    ['basic', '基本情報', CalendarClock], ['people', '参加者', Users], ['record', '記録内容', FileText],
    ...(showAttachments ? [['files', '添付', Paperclip] as const] : []), ['follow-up', '次回対応', ClipboardCheck],
  ] as const
  return <ModalShell isOpen customContent onClose={dismiss} dismissible={!busy} title={title} overlayClassName="cm-history-drawer-layer">
    <aside className="cm-history-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="cm-history-drawer-header">
        <div className="cm-history-drawer-title">
          <span className="cm-history-drawer-icon"><MessageSquareText size={21} aria-hidden/></span>
          <div><p>案件履歴</p><h2 id={titleId}>{title}</h2></div>
          <Button type="button" size="sm" variant="ghost" disabled={busy} aria-label="閉じる" onClick={dismiss}><X size={19} aria-hidden/></Button>
        </div>
        <nav className="cm-history-drawer-nav" aria-label="入力項目">
          {sections.map(([id, label, Icon]) => <a key={id} href={`#${formId}-section-${id}`} onClick={event => {
            event.preventDefault()
            const section = document.getElementById(`${formId}-section-${id}`)
            const body = section?.closest('.cm-history-drawer-body')
            if (section && body) {
              body.scrollTop += section.getBoundingClientRect().top - body.getBoundingClientRect().top - 12
              section.focus({ preventScroll: true })
            }
          }}><Icon size={14} aria-hidden/>{label}</a>)}
        </nav>
      </header>
      <div className="cm-history-drawer-body" aria-busy={busy}>
        <form id={formId} className="cm-history-form" onSubmit={e => void save(e)}>
          {error && <div ref={errorRef} tabIndex={-1} role="alert" className="cm-history-error">{error}{Object.entries(validation).map(([field, errors]) => <a href={`#${formId}-${field.split('.')[0]}`} key={field}>{errors.join(' ')}</a>)}</div>}
          <fieldset disabled={busy}>
          <section className="cm-history-form-section" id={`${formId}-section-basic`} tabIndex={-1} aria-label="基本情報">
          <h3>基本情報</h3>
          <div className="cm-history-form-grid">
            <label><span>種類 <span className="cm-history-required">*</span></span><span className="cm-history-type-select"><TypeIcon size={15} aria-hidden/><select id={`${formId}-communication_type`} value={form.communication_type} onChange={e => {
              const type = e.target.value as CommunicationType
              setForm(f => ({ ...f, communication_type: type, ended_at: ['email', 'chat', 'postal_mail'].includes(type) ? null : f.ended_at,
                direction: ['phone', 'email', 'chat', 'postal_mail'].includes(type) ? f.direction : null }))
            }}>{Object.entries(communicationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></span></label>
            {['phone', 'email', 'chat', 'postal_mail'].includes(form.communication_type) && <label>方向<select value={form.direction ?? ''} onChange={e => update('direction', (e.target.value || null) as Communication['direction'])}><option value="">該当なし</option><option value="outbound">{form.communication_type === 'phone' ? '発信' : '送信'}</option><option value="inbound">受信</option></select></label>}
            <label className="cm-history-form-date"><span>開始日時 <span className="cm-history-required">*</span></span><input id={`${formId}-started_at`} type="datetime-local" required aria-invalid={Boolean(fieldErrors('started_at'))} value={localDateInput(form.started_at)} onChange={e => update('started_at', e.target.value ? new Date(e.target.value).toISOString() : '')}/>{fieldErrors('started_at') && <small className="cm-history-field-error">{fieldErrors('started_at')}</small>}</label>
            {timed && <label className="cm-history-form-date">終了日時<input id={`${formId}-ended_at`} type="datetime-local" aria-invalid={Boolean(fieldErrors('ended_at'))} min={localDateInput(form.started_at)} value={form.ended_at ? localDateInput(form.ended_at) : ''} onChange={e => update('ended_at', e.target.value ? new Date(e.target.value).toISOString() : null)}/>{minutes != null && minutes >= 0 && <small>所要時間：{durationLabel(minutes)}</small>}{fieldErrors('ended_at') && <small className="cm-history-field-error">{fieldErrors('ended_at')}</small>}</label>}
          </div>
          </section>
          <section className="cm-history-form-section" id={`${formId}-section-people`} tabIndex={-1} aria-label="相手・参加者">
          <h3>相手・参加者</h3>
          <div className="cm-history-people-grid">
            <HistoryPeopleField id={`${formId}-counterparties`} label="相手" required people={people.filter(p => p.type !== 'employee')} selected={form.counterparties} error={fieldErrors('counterparties')} onPick={(person, checked) => pick('counterparties', person, checked)}/>
            <HistoryPeopleField id={`${formId}-participants`} label="参加者" people={people} selected={form.participants} error={fieldErrors('participants')} onPick={(person, checked) => pick('participants', person, checked)}/>
          </div>
          <div className="cm-history-external"><label>未登録の外部参加者<input maxLength={255} placeholder="氏名・組織名を入力" value={external} onChange={e => setExternal(e.target.value)}/></label><Button type="button" variant="outline" icon={<Plus size={14} aria-hidden/>} disabled={!external.trim()} onClick={() => { const p: HistoryPerson = { type: 'external', id: null, name: external.trim() }; if (!form.counterparties.some(v => personKey(v) === personKey(p))) pick('counterparties', p, true); if (!form.participants.some(v => personKey(v) === personKey(p))) pick('participants', p, true); setExternal('') }}>追加</Button></div>
          </section>
          <section className="cm-history-form-section" id={`${formId}-section-record`} tabIndex={-1} aria-label="連絡・面談内容">
          <h3>連絡・面談内容</h3>
          {(['subject', 'summary', 'details', 'outcome'] as const).map(field => <label key={field}>{changeLabel(field)}{['subject', 'summary'].includes(field) && ' *'}{field === 'subject' ? <input id={`${formId}-${field}`} aria-invalid={Boolean(fieldErrors(field))} required maxLength={255} value={form[field] ?? ''} onChange={e => update(field, e.target.value)}/> : <textarea id={`${formId}-${field}`} aria-invalid={Boolean(fieldErrors(field))} required={field === 'summary'} rows={field === 'summary' ? 3 : 2} maxLength={field === 'details' ? 10000 : 5000} value={form[field] ?? ''} onChange={e => update(field, e.target.value)}/>}{fieldErrors(field) && <small className="cm-history-field-error">{fieldErrors(field)}</small>}</label>)}
          </section>
          {showAttachments && <section className="cm-history-form-section cm-history-form-files" id={`${formId}-section-files`} tabIndex={-1} aria-label="添付ファイル">
          <h3>添付ファイル</h3>
          {entry && !!entry.attachments?.length && <HistoryAttachmentList attachments={entry.attachments} caseId={caseId} communicationId={entry.record_id}/>}
          {canAttach && <HistoryAttachmentPicker id={`${formId}-attachments`} files={files} onChange={setFiles} existingCount={entry?.attachments?.length ?? 0} serverError={fieldErrors('attachments')}/>}
          </section>}
          <section className="cm-history-form-section" id={`${formId}-section-follow-up`} tabIndex={-1} aria-label="次回対応">
          <h3>次回対応</h3>
          <label>対応内容<input id={`${formId}-next_action`} maxLength={255} value={form.next_action ?? ''} onChange={e => update('next_action', e.target.value)}/></label>
          <label>次回対応期限<input type="datetime-local" id={`${formId}-next_action_due_at`} value={form.next_action_due_at ? localDateInput(form.next_action_due_at) : ''} onChange={e => update('next_action_due_at', e.target.value ? new Date(e.target.value).toISOString() : null)}/></label>
          </section>
          </fieldset>
        </form>
      </div>
      <footer className="cm-history-drawer-footer">
        {progress && <div className="cm-history-upload-progress" role="status">
          {progress.phase === 'uploading' ? <><span>添付ファイルを送信中… {progress.percent}%</span><progress aria-label="添付ファイルの送信状況" max={100} value={progress.percent}/></> : <span>Google Drive に保存中…</span>}
        </div>}
        <div className="cm-history-drawer-actions">
          <span><span className="cm-history-required">*</span> 必須項目</span>
          <Button type="button" variant="outline" disabled={busy} onClick={dismiss}>キャンセル</Button>
          <Button form={formId} type="submit" variant="primary" icon={<Save size={15} aria-hidden/>} loading={busy}>{busy ? '保存中' : '保存する'}</Button>
        </div>
      </footer>
    </aside>
  </ModalShell>
}

function NextActionTaskDialog({ caseId, entry, people, onClose, onSaved }: { caseId: number; entry: HistoryEntry; people: HistoryPerson[]; onClose: () => void; onSaved: () => void }) {
  const titleId = useId()
  const [title, setTitle] = useState(entry.communication?.next_action ?? entry.title)
  const [due, setDue] = useState(entry.communication?.next_action_due_at ? localDateInput(entry.communication.next_action_due_at) : '')
  const [employee, setEmployee] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const flight = useRef(false)
  const save = async () => {
    if (flight.current || !employee || !title.trim()) return
    flight.current = true; setBusy(true); setError('')
    try { await caseWorkspaceApi.communicationTask(caseId, entry.record_id, { title, due_at: due ? new Date(due).toISOString() : null, assigned_employee_id: Number(employee), priority: 'normal' }); onSaved() }
    catch (e) { setError(errorText(e)) } finally { flight.current = false; setBusy(false) }
  }
  return <ModalShell isOpen title="次回対応からタスクを作成" titleId={titleId} onClose={() => { if (!flight.current) onClose() }} dismissible={!busy} className="cm-history-modal"
    footer={<><Button disabled={busy} onClick={onClose}>キャンセル</Button><Button variant="primary" loading={busy} disabled={!employee || !title.trim()} onClick={() => void save()}>タスクを作成</Button></>}>
    <div className="cm-history-form">{error && <p role="alert" className="cm-history-error">{error}</p>}<label>タスク名 *<input value={title} maxLength={255} disabled={busy} onChange={e => setTitle(e.target.value)}/></label><label>担当者 *<select value={employee} disabled={busy} onChange={e => setEmployee(e.target.value)}><option value="">選択してください</option>{people.filter(p => p.type === 'employee').map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}</select></label><label>期限<input disabled={busy} type="datetime-local" value={due} onChange={e => setDue(e.target.value)}/></label><p>この連絡・面談に紐づく案件タスクを作成します。自動作成は行いません。</p></div>
  </ModalShell>
}
