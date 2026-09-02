import { ChevronDown, ChevronRight, Search, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CollectionResult, CollectionStatus, FulfillmentStatus, NecessityStatus, ReviewStatus } from '../types'

/** Presentation only; both adapters supply explicit labels and state. No fixtures or API logic. */
export interface CollectionRowView {
  id: string; code: string; title: string; purposes: Array<{ code: string; label: string }>
  source: string | null; target: string | null; period: string | null; origin: string | null
  preservation: boolean; preservationText?: string | null; unnecessary: boolean
  necessity: string; collection: string; fulfillment: string; review: string; result: string | null
  necessityStatus: NecessityStatus; collectionStatus: CollectionStatus; fulfillmentStatus: FulfillmentStatus; reviewStatus: ReviewStatus; resultStatus: CollectionResult | null
  approval?: string; assignee: string; hasAssignee: boolean; deadline: string; overdue: boolean
}
export default function CollectionListView({ items, selectedId, onSelect }: { items: CollectionRowView[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const { t } = useTranslation()
  // Start compact: operators expand only the document-purpose groups they need to review.
  const [expanded, setExpanded] = useState<string[]>([])
  const groupOf = (item: CollectionRowView) => item.unnecessary ? 'NOT_REQUIRED' : item.purposes[0]?.code ?? 'UNGROUPED'
  const groups = [...new Set(items.map(groupOf))].sort((a, b) => a === b ? 0 : a === 'NOT_REQUIRED' ? 1 : b === 'NOT_REQUIRED' ? -1 : a.localeCompare(b))
  return <div className="dc-list">
    <div className="dc-table-head"><span>{t('documentCollection.list.documentAndSource')}</span><span>{t('documentCollection.list.axes')}</span><span>{t('documentCollection.list.assigneeAndDeadline')}</span></div>
    {groups.map(purpose => {
      const rows = items.filter(item => groupOf(item) === purpose)
      const open = expanded.includes(purpose)
      const label = purpose === 'NOT_REQUIRED' ? t('documentCollection.list.notRequiredGroup') : rows[0]?.purposes[0]?.label ?? t('documentCollection.list.purposeUnset')
      return <section className="dc-group" key={purpose} aria-label={label}>
        <button type="button" className="dc-group-title" aria-expanded={open} onClick={() => setExpanded(current => open ? current.filter(value => value !== purpose) : [...current, purpose])}>
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<span className="dc-group-code">{purpose === 'NOT_REQUIRED' || purpose === 'UNGROUPED' ? '—' : purpose === 'COMMON' ? t('documentCollection.list.commonGroup') : purpose}</span><strong>{label}</strong><span className="dc-count">{rows.length}</span>
        </button>
        {open && rows.map(item => <CollectionRow key={item.id} item={item} selected={item.id === selectedId} onSelect={() => onSelect(item.id)} />)}
      </section>
    })}
    {!items.length && <div className="dc-empty-results"><Search size={24} /><h3>{t('documentCollection.list.noDocuments')}</h3><p>{t('documentCollection.list.changeSearch')}</p></div>}
  </div>
}
function CollectionRow({ item, selected, onSelect }: { item: CollectionRowView; selected: boolean; onSelect: () => void }) {
  const { t } = useTranslation()
  return <button type="button" data-document-id={item.id} className={`dc-row ${selected ? 'is-selected' : ''} ${item.unnecessary ? 'is-unnecessary' : ''}`} onClick={onSelect} aria-pressed={selected} aria-label={t('documentCollection.list.detailAria', { code: item.code, title: item.title, source: item.source ?? '' })}>
    <span className="dc-document">
      <span className="dc-code">{item.code}<span title={item.purposes.map(p => `${p.code} · ${p.label}`).join(' / ')}>{item.purposes.map(p => p.code).join(' · ')}</span>{item.origin && <span>{item.origin}</span>}</span>
      <strong>{item.title}</strong><span className="dc-source">{item.source || t('documentCollection.list.sourceUnset')} · {t('documentCollection.list.target')}: {item.target || t('documentCollection.list.targetUnset')}</span>
      {item.period && <span className="dc-meta">{item.period}</span>}
      {item.preservation && <span className="dc-warning dc-preservation"><ShieldAlert size={14} />{t('documentCollection.preservationPriority')}{item.preservationText && ` · ${item.preservationText}`}</span>}
    </span>
    <span className="dc-axes">
      <span><small>{t('documentCollection.list.necessityShort')}</small><b className={item.necessityStatus === 'required' ? 'dc-blue' : ''}>{t(`documentCollection.status.necessity.${item.necessityStatus}`)}</b></span>
      <span><small>{t('documentCollection.list.collectionShort')}</small><b>{t(`documentCollection.status.collection.${item.collectionStatus}`)}</b></span>
      <span><small>{t('documentCollection.list.fulfillmentShort')}</small><b className={item.fulfillmentStatus === 'insufficient' ? 'dc-warning' : ''}>{t(`documentCollection.status.fulfillment.${item.fulfillmentStatus}`)}</b></span>
      <span><small>{t('documentCollection.list.reviewShort')}</small><b className={item.reviewStatus === 'reviewed' ? 'dc-success' : item.reviewStatus === 'returned' ? 'dc-warning' : ''}>{t(`documentCollection.status.review.${item.reviewStatus}`)}</b></span>
      {item.resultStatus && <span className="dc-result">{t('documentCollection.list.result')}: {t(`documentCollection.status.result.${item.resultStatus}`)}</span>}
      {item.approval && <span className="dc-result dc-warning">{item.approval}</span>}
    </span>
    <span className="dc-owner"><span>{item.hasAssignee ? item.assignee : t('documentCollection.list.unassigned')}</span><span className={item.overdue ? 'dc-danger' : 'dc-meta'}>{item.deadline}</span>{item.overdue && <small className="dc-danger">{t('documentCollection.list.deadlineExceeded')}</small>}<ChevronRight size={15} aria-hidden="true" /></span>
  </button>
}
