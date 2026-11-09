import { useState } from 'react'
import { Search, ShieldAlert, SlidersHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CollectionQuery, EmployeeOption } from '../types'
import DocumentCollectionFilterDrawer from './DocumentCollectionFilterDrawer'

export default function DocumentCollectionToolbar({ query, search, onSearch, onChange, purposes, employees, employeeError }: {
  query: CollectionQuery; search: string; onSearch: (value: string) => void; onChange: (patch: CollectionQuery, reset?: boolean) => void
  purposes: Array<{ code: string; name_ja: string }>; employees: EmployeeOption[]; employeeError: string | null
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const count = Object.entries(query).filter(([key, value]) => !['search', 'page', 'per_page'].includes(key) && value !== undefined).length
  return <div className="dc-toolbar">
    <div className="dc-search-row">
      <label className="dc-search"><Search className="dc-search-icon" size={15} aria-hidden="true"/><input maxLength={255} aria-label={t('documentCollection.toolbar.searchAria')} placeholder={t('documentCollection.toolbar.searchPlaceholder')} value={search} onChange={event => onSearch(event.target.value)}/></label>
    </div>
    <div className="dc-quick" aria-label={t('documentCollection.toolbar.quickFilters')}>
      <button type="button" aria-pressed={!count && !search} className={`dc-filter-chip dc-filter-chip--all ${!count && !search ? 'is-active' : ''}`} onClick={() => onChange({}, true)}>{t('documentCollection.toolbar.all')}</button>
      {(['required', 'not_required', 'undetermined'] as const).map(value => <button key={value} type="button" aria-pressed={query.necessity_status === value} className={`dc-filter-chip dc-filter-chip--${value} ${query.necessity_status === value ? 'is-active' : ''}`} onClick={() => onChange({ necessity_status: query.necessity_status === value ? undefined : value })}>{t(`documentCollection.status.necessity.${value}`)}</button>)}
      <button type="button" aria-pressed={query.overdue === true} className={`dc-filter-chip dc-filter-chip--overdue ${query.overdue ? 'is-active' : ''}`} onClick={() => onChange({ overdue: query.overdue ? undefined : true })}>{t('documentCollection.overdue')}</button>
      <button type="button" aria-pressed={query.preservation_priority === true} className={`dc-filter-chip dc-filter-chip--preservation ${query.preservation_priority ? 'is-active' : ''}`} onClick={() => onChange({ preservation_priority: query.preservation_priority ? undefined : true })}><ShieldAlert size={13} aria-hidden="true"/>{t('documentCollection.preservationPriority')}</button>
    </div>
    <button type="button" className={`dc-button dc-toolbar-filter-btn ${count ? 'is-active' : ''}`} onClick={() => setOpen(true)} aria-haspopup="dialog"><SlidersHorizontal size={14} aria-hidden="true"/><span>{t('documentCollection.toolbar.filter')}</span>{count > 0 && <span className="dc-filter-badge">{count}</span>}</button>
    {(count > 0 || search) && <button type="button" className="dc-clear-btn" onClick={() => onChange({}, true)}>{t('documentCollection.toolbar.clear')}</button>}
    {open && <DocumentCollectionFilterDrawer open query={query} purposes={purposes} employees={employees} employeeError={employeeError} onClose={() => setOpen(false)} onApply={next => onChange(next)} onClear={() => onChange({}, true)}/>}
  </div>
}
