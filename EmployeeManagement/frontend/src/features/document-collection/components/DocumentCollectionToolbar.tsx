import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, ShieldAlert, SlidersHorizontal } from 'lucide-react'
import type { CollectionQuery, EmployeeOption } from '../types'
import { statusGroups } from '../labels'

export default function DocumentCollectionToolbar({ query, search, onSearch, onChange, purposes, employees, employeeError }: {
  query: CollectionQuery; search: string; onSearch: (value: string) => void; onChange: (patch: CollectionQuery, reset?: boolean) => void
  purposes: Array<{ code: string; name_ja: string }>; employees: EmployeeOption[]; employeeError: string | null
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const filterId = useId()
  const count = Object.entries(query).filter(([key, value]) => !['search', 'page', 'per_page', 'sort', 'direction'].includes(key) && value !== undefined).length
  return <div className="dc-toolbar">
    <div className="dc-search-row">
      <label className="dc-search">
        <Search size={15} aria-hidden="true" className="dc-search-icon" />
        <input maxLength={255} aria-label={t('documentCollection.toolbar.searchAria')} placeholder={t('documentCollection.toolbar.searchPlaceholder')} value={search} onChange={event => onSearch(event.target.value)} />
      </label>
      <button type="button" className={`dc-button dc-toolbar-filter-btn ${expanded ? 'is-active' : ''}`} onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-controls={filterId}>
        <SlidersHorizontal size={14} aria-hidden="true" />
        <span>{t('documentCollection.toolbar.filter')}</span>
        {count > 0 && <span className="dc-filter-badge">{count}</span>}
      </button>
    </div>
    <div className="dc-quick" aria-label={t('documentCollection.toolbar.quickFilters')}>
      <button type="button" aria-pressed={!count && !search} className={`dc-filter-chip dc-filter-chip--all ${!count && !search ? 'is-active' : ''}`} onClick={() => onChange({}, true)}>{t('documentCollection.toolbar.all')}</button>
      <button type="button" aria-pressed={query.necessity_status === 'undetermined'} className={`dc-filter-chip dc-filter-chip--undetermined ${query.necessity_status === 'undetermined' ? 'is-active' : ''}`} onClick={() => onChange({ necessity_status: query.necessity_status === 'undetermined' ? undefined : 'undetermined' })}>{t('documentCollection.status.necessity.undetermined')}</button>
      <button type="button" aria-pressed={query.necessity_status === 'required'} className={`dc-filter-chip dc-filter-chip--required ${query.necessity_status === 'required' ? 'is-active' : ''}`} onClick={() => onChange({ necessity_status: query.necessity_status === 'required' ? undefined : 'required' })}>{t('documentCollection.status.necessity.required')}</button>
      <button type="button" aria-pressed={query.necessity_status === 'not_required'} className={`dc-filter-chip dc-filter-chip--not_required ${query.necessity_status === 'not_required' ? 'is-active' : ''}`} onClick={() => onChange({ necessity_status: query.necessity_status === 'not_required' ? undefined : 'not_required' })}>{t('documentCollection.status.necessity.not_required')}</button>
      <button type="button" aria-pressed={query.overdue === true} className={`dc-filter-chip dc-filter-chip--overdue ${query.overdue ? 'is-active' : ''}`} onClick={() => onChange({ overdue: query.overdue ? undefined : true })}>{t('documentCollection.overdue')}</button>
      <button type="button" aria-pressed={query.preservation_priority === true} className={`dc-filter-chip dc-filter-chip--preservation ${query.preservation_priority ? 'is-active' : ''}`} onClick={() => onChange({ preservation_priority: query.preservation_priority ? undefined : true })}><ShieldAlert size={13} aria-hidden="true" /><span>{t('documentCollection.preservationPriority')}</span></button>
      {(count > 0 || search) && <button type="button" className="dc-clear-btn" onClick={() => onChange({}, true)}>{t('documentCollection.toolbar.clear')}</button>}
    </div>
    {expanded && <div className="dc-filter-grid" id={filterId}>
      <label>{t('documentCollection.toolbar.purpose')}<select value={query.purpose ?? ''} onChange={event => onChange({ purpose: event.target.value || undefined })}><option value="">{t('documentCollection.toolbar.allPurposes')}</option>{purposes.map(p => <option key={p.code} value={p.code}>{p.code} · {p.name_ja}</option>)}</select></label>
      <label>{t('documentCollection.toolbar.source')}<input placeholder={t('documentCollection.toolbar.sourcePlaceholder')} maxLength={255} defaultValue={query.source ?? ''} key={query.source ?? ''} onBlur={event => { if (event.target.value !== (query.source ?? '')) onChange({ source: event.target.value || undefined }) }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} /></label>
      <label>{t('documentCollection.toolbar.assignee')}<select value={query.assignee_id ?? ''} disabled={!!employeeError} onChange={event => onChange({ assignee_id: event.target.value ? Number(event.target.value) : undefined })}><option value="">{t('documentCollection.toolbar.allAssignees')}</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.display_name}</option>)}</select></label>
      {statusGroups.map(group => { const axis = group.field.replace('_status', '').replace('collection_result', 'result') as 'necessity' | 'collection' | 'result' | 'fulfillment' | 'review'; return <label key={group.field}>{t(`documentCollection.filters.${axis}`)}<select value={query[group.field] ?? '__all'} onChange={event => onChange({ [group.field]: event.target.value === '__all' ? undefined : event.target.value })}><option value="__all">{t('documentCollection.toolbar.allStatuses')}</option>{group.field === 'collection_result' && <option value="">{t('documentCollection.toolbar.noException')}</option>}{Object.keys(group.labels).map(value => <option key={value} value={value}>{t(`documentCollection.status.${axis}.${value}`)}</option>)}</select></label> })}
      <label>{t('documentCollection.toolbar.deadlineFrom')}<input type="date" value={query.deadline_from ?? ''} onChange={event => onChange({ deadline_from: event.target.value || undefined })} /></label>
      <label>{t('documentCollection.toolbar.deadlineTo')}<input type="date" value={query.deadline_to ?? ''} min={query.deadline_from} onChange={event => onChange({ deadline_to: event.target.value || undefined })} /></label>
      <label>{t('documentCollection.toolbar.sort')}<select value={query.sort ?? ''} onChange={event => onChange({ sort: (event.target.value || undefined) as CollectionQuery['sort'] })}><option value="">{t('documentCollection.toolbar.sortDefault')}</option><option value="document_code">{t('documentCollection.toolbar.sortCode')}</option><option value="document_name">{t('documentCollection.toolbar.sortName')}</option><option value="deadline">{t('documentCollection.toolbar.sortDeadline')}</option><option value="assignee">{t('documentCollection.toolbar.sortAssignee')}</option><option value="priority">{t('documentCollection.toolbar.sortPriority')}</option><option value="updated_at">{t('documentCollection.toolbar.sortUpdatedAt')}</option></select></label>
      <label>{t('documentCollection.toolbar.direction')}<select value={query.direction ?? 'asc'} disabled={!query.sort} onChange={event => onChange({ direction: event.target.value as 'asc' | 'desc' })}><option value="asc">{t('documentCollection.toolbar.ascending')}</option><option value="desc">{t('documentCollection.toolbar.descending')}</option></select></label>
      {employeeError && <p className="dc-meta dc-wide">{employeeError}</p>}
    </div>}
  </div>
}
