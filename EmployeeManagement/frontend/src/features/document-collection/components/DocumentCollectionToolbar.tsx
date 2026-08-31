import { useId, useState } from 'react'
import { Search, ShieldAlert, SlidersHorizontal } from 'lucide-react'
import type { CollectionQuery, EmployeeOption } from '../types'
import { statusGroups } from '../labels'

export default function DocumentCollectionToolbar({ query, search, onSearch, onChange, purposes, employees, employeeError }: {
  query: CollectionQuery; search: string; onSearch: (value: string) => void; onChange: (patch: CollectionQuery, reset?: boolean) => void
  purposes: Array<{ code: string; name_ja: string }>; employees: EmployeeOption[]; employeeError: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const filterId = useId()
  const count = Object.entries(query).filter(([key, value]) => !['search', 'page', 'per_page', 'sort', 'direction'].includes(key) && value !== undefined).length
  return <div className="dc-toolbar">
    <div className="dc-search-row"><label className="dc-search"><Search size={17} aria-hidden="true" /><input maxLength={255} aria-label="資料名・コードを検索" placeholder="資料名・コードで検索" value={search} onChange={event => onSearch(event.target.value)} /></label><button type="button" className={`dc-button ${expanded ? 'is-active' : ''}`} onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-controls={filterId}><SlidersHorizontal size={16} />絞り込み{count > 0 && ` (${count})`}</button></div>
    <div className="dc-quick" aria-label="クイックフィルター">
      <button type="button" aria-pressed={!count && !search} className={!count && !search ? 'is-active' : ''} onClick={() => onChange({}, true)}>すべて</button>
      <button type="button" aria-pressed={query.necessity_status === 'undetermined'} className={query.necessity_status === 'undetermined' ? 'is-active' : ''} onClick={() => onChange({ necessity_status: query.necessity_status === 'undetermined' ? undefined : 'undetermined' })}>未判定</button>
      <button type="button" aria-pressed={query.overdue === true} className={query.overdue ? 'is-active' : ''} onClick={() => onChange({ overdue: query.overdue ? undefined : true })}>期限超過</button>
      <button type="button" aria-pressed={query.preservation_priority === true} className={query.preservation_priority ? 'is-active' : ''} onClick={() => onChange({ preservation_priority: query.preservation_priority ? undefined : true })}><ShieldAlert size={14} />保全優先</button>
      {(count > 0 || search) && <button type="button" className="dc-clear" onClick={() => onChange({}, true)}>条件をクリア</button>}
    </div>
    {expanded && <div className="dc-filter-grid" id={filterId}>
      <label>確認目的<select value={query.purpose ?? ''} onChange={event => onChange({ purpose: event.target.value || undefined })}><option value="">すべての目的</option>{purposes.map(p => <option key={p.code} value={p.code}>{p.code} · {p.name_ja}</option>)}</select></label>
      <label>取得先<input placeholder="取得先の名称（完全一致）" maxLength={255} defaultValue={query.source ?? ''} key={query.source ?? ''} onBlur={event => { if (event.target.value !== (query.source ?? '')) onChange({ source: event.target.value || undefined }) }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} /></label>
      <label>担当者<select value={query.assignee_id ?? ''} disabled={!!employeeError} onChange={event => onChange({ assignee_id: event.target.value ? Number(event.target.value) : undefined })}><option value="">すべての担当者</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.display_name}</option>)}</select></label>
      {statusGroups.map(group => <label key={group.field}>{group.label}<select value={query[group.field] ?? '__all'} onChange={event => onChange({ [group.field]: event.target.value === '__all' ? undefined : event.target.value })}><option value="__all">すべての状態</option>{group.field === 'collection_result' && <option value="">例外なし</option>}{Object.entries(group.labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}
      <label>回答期限・開始<input type="date" value={query.deadline_from ?? ''} onChange={event => onChange({ deadline_from: event.target.value || undefined })} /></label>
      <label>回答期限・終了<input type="date" value={query.deadline_to ?? ''} min={query.deadline_from} onChange={event => onChange({ deadline_to: event.target.value || undefined })} /></label>
      <label>並び順<select value={query.sort ?? ''} onChange={event => onChange({ sort: (event.target.value || undefined) as CollectionQuery['sort'] })}><option value="">標準順</option><option value="document_code">資料コード</option><option value="document_name">資料名</option><option value="deadline">回答期限</option><option value="assignee">担当者</option><option value="priority">優先度</option><option value="updated_at">更新日時</option></select></label>
      <label>順序<select value={query.direction ?? 'asc'} disabled={!query.sort} onChange={event => onChange({ direction: event.target.value as 'asc' | 'desc' })}><option value="asc">昇順</option><option value="desc">降順</option></select></label>
      {employeeError && <p className="dc-meta dc-wide">{employeeError}</p>}
    </div>}
  </div>
}
