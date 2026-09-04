import { ChevronDown, ChevronRight, ChevronUp, Info, Search, ShieldAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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

export default function CollectionListView({
  items, selectedId, onSelect, canSelect = true, bulkSelectedIds = [],
  onToggleBulkSelection = () => {}, onSetVisibleSelection = () => {},
  selectionMode = false, selectionScope = 'undetermined',
  onSelectionModeChange = () => {}, onSelectionScopeChange = () => {},
  totalCount, filteredCount
}: {
  items: CollectionRowView[]; selectedId: string | null; onSelect: (id: string) => void
  canSelect?: boolean; bulkSelectedIds?: number[]; onToggleBulkSelection?: (id: number) => void
  onSetVisibleSelection?: (ids: number[], selected: boolean) => void
  selectionMode?: boolean; selectionScope?: NecessityStatus
  onSelectionModeChange?: (enabled: boolean) => void; onSelectionScopeChange?: (status: NecessityStatus) => void
  totalCount?: number; filteredCount?: number
}) {
  const { t } = useTranslation()
  const groupOf = (item: CollectionRowView) => item.unnecessary ? 'NOT_REQUIRED' : item.purposes[0]?.code ?? 'UNGROUPED'
  const groups = [...new Set(items.map(groupOf))].sort((a, b) => a === b ? 0 : a === 'NOT_REQUIRED' ? 1 : b === 'NOT_REQUIRED' ? -1 : a.localeCompare(b))

  const [expanded, setExpanded] = useState<string[]>([])
  const normalExpanded = useRef<string[]>([])
  const previousSelectionMode = useRef(selectionMode)
  const groupKey = groups.join('\u0000')

  useEffect(() => {
    const availableGroups = groupKey ? groupKey.split('\u0000') : []
    setExpanded(current => {
      if (selectionMode) {
        if (!previousSelectionMode.current) {
          normalExpanded.current = current.filter(group => availableGroups.includes(group))
        }
        return availableGroups
      }

      if (previousSelectionMode.current) {
        return normalExpanded.current.filter(group => availableGroups.includes(group))
      }

      return current.filter(group => availableGroups.includes(group))
    })
    previousSelectionMode.current = selectionMode
  }, [groupKey, selectionMode])

  const visibleIds = items.map(item => Number(item.id))
  const isAllVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => bulkSelectedIds.includes(id))

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
      <div className="dc-command-row">
        <div className="dc-command-left">
          <label className="dc-command-check-label">
            <input
              type="checkbox"
              checked={selectionMode}
              disabled={!total || !canSelect}
              onChange={event => onSelectionModeChange(event.target.checked)}
              aria-label="一括選択"
            />
            <span className="dc-command-title">一括選択</span>
          </label>

          {selectionMode && (
            <>
              <div className="dc-selection-scope" role="group" aria-label="選択対象の必要性">
                {(['undetermined', 'required', 'not_required'] as const).map(status => (
                  <button
                    key={status}
                    type="button"
                    className={`dc-scope-button is-${status} ${selectionScope === status ? 'is-active' : ''}`}
                    aria-pressed={selectionScope === status}
                    onClick={() => onSelectionScopeChange(status)}
                  >
                    {t(`documentCollection.status.necessity.${status}`)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="dc-command-select-all-btn"
                disabled={!visibleIds.length || !canSelect}
                onClick={() => onSetVisibleSelection(visibleIds, !isAllVisibleSelected)}
              >
                {isAllVisibleSelected ? '表示中の資料の選択を解除' : `表示中の資料をすべて選択（${visibleIds.length}件）`}
              </button>
            </>
          )}

          {selectionMode && bulkSelectedIds.length > 0 && (
            <span className="dc-bulk-badge" aria-live="polite">
              {bulkSelectedIds.length}件選択中
            </span>
          )}
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

      {/* 3. COLUMN HEADER ROW */}
      <div className={`dc-table-head ${selectionMode ? 'has-selection' : ''}`}>
        {selectionMode ? (
          <label className="dc-th-check-label" aria-label="全資料を選択">
            <input
              type="checkbox"
              checked={isAllVisibleSelected}
              disabled={!visibleIds.length || !canSelect}
              onChange={event => onSetVisibleSelection(visibleIds, event.target.checked)}
            />
          </label>
        ) : <span className="dc-th-check-spacer" aria-hidden="true" />}
        <span className="dc-th-doc">{t('documentCollection.list.documentAndSource')}</span>
        <span className="dc-th-axes">{t('documentCollection.list.axes')}</span>
        <span className="dc-th-owner">{t('documentCollection.list.assigneeAndDeadline')}</span>
        <span className="dc-th-chevron" aria-hidden="true" />
      </div>

      {/* 4. GROUPS */}
      <div className="dc-groups-container">
        {groups.map(purpose => {
          const rows = items.filter(item => groupOf(item) === purpose)
          const open = expanded.includes(purpose)
          const selectedInGroup = rows.filter(item => bulkSelectedIds.includes(Number(item.id))).length
          const label = purpose === 'NOT_REQUIRED' ? t('documentCollection.list.notRequiredGroup') : rows[0]?.purposes[0]?.label ?? t('documentCollection.list.purposeUnset')
          return (
            <section className={`dc-group ${open ? 'is-open' : 'is-closed'}`} key={purpose} aria-label={label}>
              <button
                type="button"
                className="dc-group-title"
                aria-expanded={open}
                onClick={() => setExpanded(current => open ? current.filter(value => value !== purpose) : [...current, purpose])}
              >
                <span className="dc-group-chevron" aria-hidden="true">
                  {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
                <span className="dc-group-code">
                  {purpose === 'NOT_REQUIRED' || purpose === 'UNGROUPED' ? '—' : purpose === 'COMMON' ? t('documentCollection.list.commonGroup') : purpose}
                </span>
                <strong className="dc-group-name">{label}</strong>
                <span className={`dc-count ${selectedInGroup > 0 ? 'has-selected' : ''}`}>
                  {selectedInGroup > 0 ? `${selectedInGroup} / ${rows.length}件` : `${rows.length}件`}
                </span>
              </button>
              {open && (
                <div className="dc-group-body">
                  {rows.map(item => (
                    <CollectionRow
                      key={item.id}
                      item={item}
                      selected={item.id === selectedId}
                      selectedForBulk={bulkSelectedIds.includes(Number(item.id))}
                      canSelect={canSelect}
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
              {selectionMode
                ? `「${t(`documentCollection.status.necessity.${selectionScope}`)}」の資料はありません`
                : t('documentCollection.list.noDocuments')}
            </h3>
            <p>
              {selectionMode
                ? '上の必要性を切り替えて、選択する資料を表示してください。'
                : t('documentCollection.list.changeSearch')}
            </p>
          </div>
        )}
      </div>

      {/* 5. BOTTOM INFORMATIONAL NOTE */}
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

  return (
    <div
      data-document-id={item.id}
      className={`dc-row ${selectionMode ? 'has-selection' : ''} ${selected ? 'is-selected' : ''} ${selectedForBulk ? 'is-bulk-selected' : ''} ${item.unnecessary ? 'is-unnecessary' : ''}`}
    >
      {/* Column 0: Checkbox */}
      {selectionMode ? (
        <label className="dc-row-check" onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selectedForBulk}
            disabled={!canSelect}
            onChange={onToggleBulkSelection}
            aria-label={`${item.title}を一括操作の対象に選択`}
          />
        </label>
      ) : <span className="dc-row-check-spacer" aria-hidden="true" />}

      {/* Main Row Content (Clickable to open inspector) */}
      <div
        className="dc-row-content"
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
        aria-pressed={selected}
        aria-label={t('documentCollection.list.detailAria', { code: item.code, title: item.title, source: item.source ?? '' })}
      >
        {/* Column 1: Document Identity */}
        <div className="dc-col-doc">
          <div className="dc-code-row">
            <span className="dc-doc-code">{item.code}</span>
            {item.purposes.length > 0 && (
              <span className="dc-doc-purposes" title={item.purposes.map(p => `${p.code} · ${p.label}`).join(' / ')}>
                {item.purposes.map(p => p.code).join(' · ')}
              </span>
            )}
            {item.origin && <span className="dc-doc-origin">{item.origin}</span>}
          </div>
          <strong className="dc-doc-title">{item.title}</strong>
          <span className="dc-source">
            {item.source || '事務所で作成'} ／ {item.target ? `対象：${item.target}` : '依頼者から回収・対象：未指定'}
          </span>
          {item.period && <span className="dc-doc-period">{item.period}</span>}
          {item.preservation && (
            <span className="dc-warning dc-preservation">
              <ShieldAlert size={13} aria-hidden="true" />
              <span>{t('documentCollection.preservationPriority')}{item.preservationText && ` · ${item.preservationText}`}</span>
            </span>
          )}
        </div>

        {/* Column 2: 2x2 Operational Status Module */}
        <div className="dc-col-status-module" aria-label="状態マトリクス">
          {/* Row 1 Left: 要否 */}
          <div className="dc-status-cell">
            <span className="dc-status-lbl">{t('documentCollection.list.necessityShort')}</span>
            {item.necessityStatus === 'required' ? (
              <span className="dc-pill dc-pill-required">{item.necessity}</span>
            ) : item.necessityStatus === 'not_required' ? (
              <span className="dc-pill dc-pill-not-required">{item.necessity}</span>
            ) : (
              <span className="dc-status-plain dc-text-muted">{item.necessity}</span>
            )}
          </div>

          {/* Row 1 Right: 取得 */}
          <div className="dc-status-cell">
            <span className="dc-status-lbl">{t('documentCollection.list.collectionShort')}</span>
            {item.collectionStatus === 'preparing' ? (
              <span className="dc-pill dc-pill-amber">{item.collection}</span>
            ) : item.collectionStatus === 'not_started' ? (
              <span className="dc-status-plain dc-text-dark">{item.collection}</span>
            ) : item.collectionStatus === 'received' ? (
              <span className="dc-pill dc-pill-green">{item.collection}</span>
            ) : item.collectionStatus === 'requested' ? (
              <span className="dc-pill dc-pill-indigo">{item.collection}</span>
            ) : item.collectionStatus === 'partially_received' ? (
              <span className="dc-pill dc-pill-amber">{item.collection}</span>
            ) : (
              <span className="dc-status-plain dc-text-slate">{item.collection}</span>
            )}
          </div>

          {/* Row 2 Left: 充足 */}
          <div className="dc-status-cell">
            <span className="dc-status-lbl">{t('documentCollection.list.fulfillmentShort')}</span>
            {item.fulfillmentStatus === 'satisfied' || item.fulfillmentStatus === 'satisfied_by_alternative' ? (
              <span className="dc-pill dc-pill-green">{item.fulfillment}</span>
            ) : item.fulfillmentStatus === 'insufficient' ? (
              <span className="dc-pill dc-pill-amber">{item.fulfillment}</span>
            ) : (
              <span className="dc-status-plain dc-text-muted">{item.fulfillment}</span>
            )}
          </div>

          {/* Row 2 Right: 確認 */}
          <div className="dc-status-cell">
            <span className="dc-status-lbl">{t('documentCollection.list.reviewShort')}</span>
            {item.reviewStatus === 'reviewed' ? (
              <span className="dc-pill dc-pill-green">{item.review}</span>
            ) : item.reviewStatus === 'returned' ? (
              <span className="dc-pill dc-pill-red">{item.review}</span>
            ) : (
              <span className="dc-status-plain dc-text-muted">{item.review}</span>
            )}
          </div>
        </div>

        {/* Column 3: Assignee & Deadline (Sub-divided by hairline) */}
        <div className="dc-col-owner-deadline">
          <div className="dc-owner-block">
            <div className="dc-owner-row">
              <span className="dc-owner-lbl">取得担当</span>
              <strong className="dc-owner-val">
                {item.hasAssignee ? item.assignee : (item.collectionStatus === 'not_started' ? '未着手' : '未割当')}
              </strong>
            </div>
            <div className="dc-owner-row">
              <span className="dc-owner-lbl">確認担当</span>
              <span className={`dc-reviewer-val ${item.reviewStatus === 'reviewed' ? 'is-reviewed' : ''}`}>
                {item.review}
              </span>
            </div>
          </div>

          <div className="dc-owner-divider" aria-hidden="true" />

          <div className="dc-deadline-block">
            <span className="dc-deadline-lbl">回答期限</span>
            <span className={`dc-deadline-val ${item.overdue ? 'is-overdue' : ''}`}>
              {item.deadline}
            </span>
          </div>
        </div>

        {/* Column 4: Right Chevron */}
        <div className="dc-col-chevron" aria-hidden="true">
          <ChevronRight size={18} className="dc-row-chevron" />
        </div>
      </div>
    </div>
  )
}
