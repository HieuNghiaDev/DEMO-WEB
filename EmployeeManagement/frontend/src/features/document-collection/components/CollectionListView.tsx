import { ChevronDown, ChevronRight, ChevronUp, FileText, Folder, FolderOpen, Info, Search, ShieldAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../components/ui/Button'
import type { CollectionResult, CollectionStatus, FulfillmentStatus, NecessityStatus, ReviewStatus } from '../types'
import './collectionRows.css'

/** Presentation only; both adapters supply explicit labels and state. No fixtures or API logic. */
export interface CollectionRowView {
  id: string; code: string; title: string; purposes: Array<{ code: string; label: string }>
  source: string | null; target: string | null; period: string | null; origin: string | null
  preservation: boolean; preservationText?: string | null; unnecessary: boolean
  necessity: string; collection: string; fulfillment: string; review: string; result: string | null
  necessityStatus: NecessityStatus; collectionStatus: CollectionStatus; fulfillmentStatus: FulfillmentStatus; reviewStatus: ReviewStatus; resultStatus: CollectionResult | null
  approval?: string; assignee: string; hasAssignee: boolean; deadline: string; overdue: boolean
}

export default function CollectionListView({
  items, selectedId, onSelect, canSelect = true, bulkSelectedIds = [],
  onToggleBulkSelection = () => {}, onSetVisibleSelection = () => {},
  selectionMode = false, selectionBusy = false, onSelectionModeChange,
  totalCount, filteredCount
}: {
  items: CollectionRowView[]; selectedId: string | null; onSelect: (id: string) => void
  canSelect?: boolean; bulkSelectedIds?: number[]; onToggleBulkSelection?: (id: number) => void
  onSetVisibleSelection?: (ids: number[], selected: boolean) => void
  selectionMode?: boolean; selectionBusy?: boolean; onSelectionModeChange?: (enabled: boolean) => void
  totalCount?: number; filteredCount?: number
}) {
  const { t } = useTranslation()
  const groupOf = (item: CollectionRowView) => item.unnecessary ? 'NOT_REQUIRED' : item.purposes[0]?.code ?? 'UNGROUPED'
  const groups = [...new Set(items.map(groupOf))].sort((a, b) => a === b ? 0 : a === 'NOT_REQUIRED' ? 1 : b === 'NOT_REQUIRED' ? -1 : a.localeCompare(b))

  const groupKey = groups.join('\u0000')
  const [expanded, setExpanded] = useState<string[]>([])
  const [previousGroupKey, setPreviousGroupKey] = useState(groupKey)
  if (groupKey !== previousGroupKey) {
    setPreviousGroupKey(groupKey)
    const availableGroups = groupKey ? groupKey.split('\u0000') : []
    // Selection mode never owns expansion; only prune groups removed by the view.
    setExpanded(current => current.filter(group => availableGroups.includes(group)))
  }

  const visibleIds = items.map(item => Number(item.id))
  const isAllVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => bulkSelectedIds.includes(id))
  const isSomeVisibleSelected = !isAllVisibleSelected && visibleIds.some(id => bulkSelectedIds.includes(id))

  const total = totalCount ?? items.length
  const filtered = filteredCount ?? items.length

  return (
    <div className="dc-list">
      {/* 1. TOP INFORMATION ROW */}
      <div className="dc-list-caption-row">
        <div className="dc-caption-left">
          <span>確認目的別</span>
          <strong className="dc-caption-counts">{filtered} / {total}件</strong>
        </div>
        <div className="dc-caption-right">
          <span>グループ件数は表示中の全資料・複数目的は1行</span>
        </div>
      </div>

      {/* 2. BULK / OPERATIONAL COMMAND ROW */}
      <div className={`dc-command-row ${selectionMode ? 'is-bulk-mode' : 'is-browser-mode'}`}>
        <div className="dc-command-left">
          {selectionMode && <>
            <label className="dc-command-check-label">
              <SelectionCheckbox
                checked={isAllVisibleSelected}
                indeterminate={isSomeVisibleSelected}
                disabled={!visibleIds.length || !canSelect || selectionBusy}
                onChange={event => onSetVisibleSelection(visibleIds, event.target.checked)}
                label="表示中の資料をすべて選択"
              />
              <span className="dc-command-title">すべて選択</span>
            </label>
            <span className="dc-bulk-badge" role="status" aria-live="polite" aria-atomic="true">{bulkSelectedIds.length}件選択</span>
          </>}
          {(canSelect || selectionMode) && onSelectionModeChange && <Button type="button" size="sm" variant="outline" aria-pressed={selectionMode} onClick={() => onSelectionModeChange(!selectionMode)} disabled={selectionBusy || (!selectionMode && !items.length)}>
            {selectionMode ? '一括操作を終了' : '一括操作'}
          </Button>}
        </div>

        <div className="dc-command-right">
          <button type="button" className="dc-expand-btn" onClick={() => setExpanded(groups)}>
            <ChevronDown size={14} aria-hidden="true" />
            <span>すべて展開</span>
          </button>
          <button type="button" className="dc-expand-btn" onClick={() => setExpanded([])}>
            <ChevronUp size={14} aria-hidden="true" />
            <span>すべて折りたたむ</span>
          </button>
        </div>
      </div>

      {/* 3. GROUPS */}
      <div className="dc-groups-container">
        {groups.map(purpose => {
          const rows = items.filter(item => groupOf(item) === purpose)
          const open = expanded.includes(purpose)
          const selectedInGroup = selectionMode ? rows.filter(item => bulkSelectedIds.includes(Number(item.id))).length : 0
          const groupIds = rows.map(item => Number(item.id))
          const label = purpose === 'NOT_REQUIRED' ? t('documentCollection.list.notRequiredGroup') : rows[0]?.purposes[0]?.label ?? t('documentCollection.list.purposeUnset')
          // Metrics describe these same visible, representative-purpose rows.
          const metrics = [
            { tone: 'required', label: t('documentCollection.status.necessity.required'), count: rows.filter(item => item.necessityStatus === 'required').length },
            { tone: 'not-required', label: t('documentCollection.status.necessity.not_required'), count: rows.filter(item => item.necessityStatus === 'not_required').length },
            { tone: 'undetermined', label: t('documentCollection.status.necessity.undetermined'), count: rows.filter(item => item.necessityStatus === 'undetermined').length },
            { tone: 'overdue', label: t('documentCollection.overdue'), count: rows.filter(item => item.overdue).length },
            { tone: 'preservation', label: t('documentCollection.preservationPriority'), count: rows.filter(item => item.preservation).length },
          ]
          return (
            <section className={`dc-group ${open ? 'is-open' : 'is-closed'}`} key={purpose} aria-label={label}>
              <div className={`dc-group-header ${selectionMode ? 'has-selection' : ''}`}>
                {selectionMode && <label className="dc-group-check" onClick={event => event.stopPropagation()}>
                  <SelectionCheckbox
                    checked={groupIds.length > 0 && selectedInGroup === groupIds.length}
                    indeterminate={selectedInGroup > 0 && selectedInGroup < groupIds.length}
                    disabled={!canSelect || selectionBusy || !groupIds.length}
                    onChange={event => onSetVisibleSelection(groupIds, event.target.checked)}
                    label={`「${label}」の資料をすべて選択`}
                  />
                </label>}
              <button
                type="button"
                className="dc-group-title"
                aria-expanded={open}
                onClick={() => setExpanded(current => open ? current.filter(value => value !== purpose) : [...current, purpose])}
              >
                <span className="dc-group-folder" aria-hidden="true">{open ? <FolderOpen size={22}/> : <Folder size={22}/>}</span>
                <span className="dc-group-code">
                  {purpose === 'NOT_REQUIRED' || purpose === 'UNGROUPED' ? '—' : purpose === 'COMMON' ? t('documentCollection.list.commonGroup') : purpose}
                </span>
                <strong className="dc-group-name" title={label}>{label}</strong>
                <span className="dc-group-metrics">
                  {metrics.map(metric => <span key={metric.tone} className={`dc-group-metric is-${metric.tone}`} title={`${metric.label} ${metric.count}件`} aria-label={`${metric.label} ${metric.count}件`}>
                    {metric.tone === 'preservation' ? <ShieldAlert size={15} aria-hidden="true"/> : <span className={`dc-metric-dot is-${metric.tone}`} aria-hidden="true"/>}
                    <span aria-hidden="true">{metric.count}</span>
                  </span>)}
                </span>
                <span className={`dc-count ${selectedInGroup > 0 ? 'has-selected' : ''}`}>
                  {selectedInGroup > 0 ? `${selectedInGroup} / ${rows.length}件` : `${rows.length}件`}
                </span>
                <span className="dc-group-end-chevron" aria-hidden="true">{open ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</span>
              </button>
              </div>
              {open && (
                <div className="dc-group-body">
                  {rows.map(item => (
                    <CollectionRow
                      key={item.id}
                      item={item}
                      selected={!selectionMode && item.id === selectedId}
                      selectedForBulk={selectionMode && bulkSelectedIds.includes(Number(item.id))}
                      canSelect={canSelect && !selectionBusy}
                      selectionMode={selectionMode}
                      onToggleBulkSelection={() => onToggleBulkSelection(Number(item.id))}
                      onSelect={() => onSelect(item.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          )
        })}

        {!items.length && (
          <div className="dc-empty-results">
            <Search size={24} />
            <h3>
              {t('documentCollection.list.noDocuments')}
            </h3>
            <p>
              {t('documentCollection.list.changeSearch')}
            </p>
          </div>
        )}
      </div>

      {/* 4. BOTTOM INFORMATIONAL NOTE */}
      <div className="dc-list-footer">
        <Info size={14} className="dc-footer-icon" aria-hidden="true" />
        <span>複数目的に該当する資料は、代表目的で表示しています。</span>
      </div>
    </div>
  )
}

function CollectionRow({
  item, selected, selectedForBulk, canSelect, selectionMode, onToggleBulkSelection, onSelect
}: {
  item: CollectionRowView; selected: boolean; selectedForBulk: boolean; canSelect: boolean
  selectionMode: boolean
  onToggleBulkSelection: () => void; onSelect: () => void
}) {
  const { t } = useTranslation()
  const activate = () => {
    if (selectionMode) { if (canSelect) onToggleBulkSelection() }
    else onSelect()
  }
  // Screening rows show one stored metadata value; full details stay in the inspector.
  const metadata = item.source?.trim() || (item.target?.trim() ? `対象：${item.target.trim()}` : '')

  return (
    <div
      data-document-id={item.id}
      data-necessity={item.necessityStatus}
      className={`dc-row dc-screening-row ${selectionMode ? 'has-selection' : ''} ${selected ? 'is-selected' : ''} ${selectedForBulk ? 'is-bulk-selected' : ''} ${item.unnecessary ? 'is-unnecessary' : ''}`}
      onClick={activate}
    >
      {selectionMode && (
        <label className="dc-row-check" onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selectedForBulk}
            disabled={!canSelect}
            onChange={onToggleBulkSelection}
            aria-label={`「${item.title}」を選択`}
          />
        </label>
      )}
      <span className="dc-row-file-icon" aria-hidden="true"><FileText size={18}/></span>

      {/* Clicks delegate to the row; checkbox labels stop propagation. */}
      <div
        className="dc-row-content"
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate() } }}
        aria-pressed={selectionMode ? selectedForBulk : selected}
        aria-disabled={selectionMode && !canSelect ? true : undefined}
        aria-label={selectionMode ? `「${item.title}」を選択` : [t('documentCollection.list.detailAria', { code: item.code, title: item.title, source: item.source ?? '' }), item.necessity, item.preservation ? t('documentCollection.preservationPriority') : null].filter(Boolean).join(' · ')}
      >
        <span className="dc-screening-code" title={item.code}>{item.code}</span>
        <strong className="dc-screening-title" title={item.title}>
          <span className="dc-screening-title-text">{item.title}</span>
          {item.preservation && <span className="dc-screening-preservation" role="img" aria-label={t('documentCollection.preservationPriority')} title={[t('documentCollection.preservationPriority'), item.preservationText].filter(Boolean).join(' · ')}><ShieldAlert size={14} aria-hidden="true" /></span>}
        </strong>
        <span className="dc-screening-meta" title={metadata}>{metadata}</span>
        <span className="dc-screening-status">{item.necessity}</span>
        <span className="dc-screening-chevron" aria-hidden="true">
          {!selectionMode && <ChevronRight size={16} />}
        </span>
      </div>
    </div>
  )
}

function SelectionCheckbox({ checked, indeterminate, disabled, label, onChange }: {
  checked: boolean
  indeterminate: boolean
  disabled: boolean
  label: string
  onChange: React.ChangeEventHandler<HTMLInputElement>
}) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (input.current) input.current.indeterminate = indeterminate
  }, [indeterminate])

  return <input ref={input} type="checkbox" checked={checked} disabled={disabled} onChange={onChange} aria-checked={indeterminate ? 'mixed' : checked} aria-label={label}/>
}
