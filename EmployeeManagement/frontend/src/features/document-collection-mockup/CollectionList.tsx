import { ChevronDown, ChevronRight, Search, ShieldAlert, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { collections, necessities, sufficiencies, reviews, exceptions, approvals } from './types'
import type { CollectionFilters, CollectionItem } from './types'
import { emptyFilters, isOverdue, purposeNames } from './mockData'

const statusGroups: Array<{ axis: string; label: string; values: readonly string[] }> = [
  { axis: 'necessity', label: '必要性', values: necessities }, { axis: 'collection', label: '取得作業', values: collections },
  { axis: 'sufficiency', label: '内容充足', values: sufficiencies }, { axis: 'review', label: '確認', values: reviews },
  { axis: 'exception', label: '結果', values: exceptions }, { axis: 'approval', label: '外部請求', values: approvals },
]

export function CollectionToolbar({ items, filters, onChange }: { items: CollectionItem[]; filters: CollectionFilters; onChange: (filters: CollectionFilters) => void }) {
  const [expanded, setExpanded] = useState(false)
  const update = (field: keyof CollectionFilters, value: string) => onChange({ ...filters, [field]: value })
  const filterCount = Object.entries(filters).filter(([key, value]) => key !== 'query' && key !== 'quick' && value).length
  return <div className="dc-toolbar">
    <div className="dc-search-row">
      <label className="dc-search"><Search size={17} aria-hidden="true" /><input aria-label="資料名・コードを検索" placeholder="資料名・コードで検索" value={filters.query} onChange={event => update('query', event.target.value)} /></label>
      <button className={`dc-button ${expanded ? 'is-active' : ''}`} onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-controls="dc-filters"><SlidersHorizontal size={16} />絞り込み{filterCount > 0 && ` (${filterCount})`}</button>
    </div>
    <div className="dc-quick" aria-label="クイックフィルター">
      {['', '要対応', '期限超過', '保全優先', '未判定'].map(value => <button key={value} aria-pressed={filters.quick === value} className={filters.quick === value ? 'is-active' : ''} onClick={() => update('quick', value)}>{value === '保全優先' && <ShieldAlert size={14} />}{value || 'すべて'}</button>)}
      {Object.values(filters).some(Boolean) && <button className="dc-clear" onClick={() => onChange({ ...emptyFilters })}>条件をクリア</button>}
    </div>
    {expanded && <div className="dc-filter-grid" id="dc-filters">
      <label>確認目的<select value={filters.purpose} onChange={event => update('purpose', event.target.value)}><option value="">すべての目的</option>{[...new Set(items.flatMap(item => item.purposes))].map(purpose => <option key={purpose} value={purpose}>{purpose} · {purposeNames[purpose]}</option>)}</select></label>
      <label>取得先<select value={filters.source} onChange={event => update('source', event.target.value)}><option value="">すべての取得先</option>{[...new Set(items.map(item => item.source).filter((source): source is string => !!source))].map(source => <option key={source}>{source}</option>)}</select></label>
      <label>状態<select value={filters.status} onChange={event => update('status', event.target.value)}><option value="">すべての状態</option>{statusGroups.map(group => <optgroup key={group.axis} label={group.label}>{group.values.map(value => <option key={value} value={`${group.axis}:${value}`}>{group.label}：{value}</option>)}</optgroup>)}</select></label>
      <label>担当者<select value={filters.assignee} onChange={event => update('assignee', event.target.value)}><option value="">すべての担当者</option>{[...new Set(items.map(item => item.assignee))].map(person => <option key={person}>{person}</option>)}</select></label>
      <label>回答期限<select value={filters.deadline} onChange={event => update('deadline', event.target.value)}><option value="">すべての期限</option><option value="overdue">期限超過</option><option value="week">7日以内</option><option value="unset">未設定</option></select></label>
    </div>}
  </div>
}

function CollectionRow({ item, selected, onSelect }: { item: CollectionItem; selected: boolean; onSelect: () => void }) {
  const overdue = isOverdue(item)
  return <button type="button" className={`dc-row ${selected ? 'is-selected' : ''} ${item.necessity === '不要' ? 'is-unnecessary' : ''}`} onClick={onSelect} aria-pressed={selected} aria-label={`${item.code} ${item.title} ${item.source ?? ''} の詳細`}>
    <span className="dc-document">
      <span className="dc-code">{item.code}<span>{item.purposes.join(' · ')}</span>{item.origin === '案件で追加' && <span>別取得先</span>}</span>
      <strong>{item.title}</strong>
      <span className="dc-source">{item.source || '取得先 未設定'} · 対象: {item.target || '未指定'}</span>
      {item.periodStart && <span className="dc-meta">{item.periodStart.replaceAll('-', '/')} — {item.periodEnd.replaceAll('-', '/')}</span>}
      {item.priority === '保全優先' && <span className="dc-warning dc-preservation"><ShieldAlert size={14} />保全優先 · 保存期間の確認が必要</span>}
    </span>
    <span className="dc-axes">
      <span><small>要否</small><b className={item.necessity === '必要' ? 'dc-blue' : ''}>{item.necessity}</b></span>
      <span><small>取得</small><b>{item.collection}</b></span>
      <span><small>充足</small><b className={item.sufficiency === '不足あり' ? 'dc-warning' : ''}>{item.sufficiency}</b></span>
      <span><small>確認</small><b className={item.review === '確認済み' ? 'dc-success' : item.review === '差戻し' ? 'dc-warning' : ''}>{item.review}</b></span>
      {item.exception !== 'なし' && <span className="dc-result">結果: {item.exception}</span>}
      {item.approval === '承認待ち' && <span className="dc-result dc-warning">外部請求 · 承認待ち</span>}
    </span>
    <span className="dc-owner"><span>{item.assignee === 'LE HIEU NGHIA' ? 'L.H. NGHIA' : item.assignee}</span><span className={overdue ? 'dc-danger' : 'dc-meta'}>{item.deadline ? item.deadline.replaceAll('-', '/') : '期限 未設定'}</span>{overdue && <small className="dc-danger">期限超過</small>}<ChevronRight size={15} aria-hidden="true" /></span>
  </button>
}

export default function CollectionList({ items, selectedId, onSelect }: { items: CollectionItem[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const [collapsed, setCollapsed] = useState<string[]>([])
  const groups = [...new Set(items.map(item => item.necessity === '不要' ? 'NOT_REQUIRED' : item.purposes[0]))]
  groups.sort((a, b) => a === 'NOT_REQUIRED' ? 1 : b === 'NOT_REQUIRED' ? -1 : a.localeCompare(b))
  return <div className="dc-list">
    <div className="dc-table-head"><span>資料 / 取得先・対象</span><span>必要性・取得・充足・確認</span><span>担当 / 回答期限</span></div>
    {groups.map(purpose => {
      const rows = items.filter(item => (item.necessity === '不要' ? 'NOT_REQUIRED' : item.purposes[0]) === purpose)
      const closed = collapsed.includes(purpose)
      return <section className="dc-group" key={purpose} aria-label={purposeNames[purpose] || '不要な資料'}>
        <button className="dc-group-title" aria-expanded={!closed} onClick={() => setCollapsed(closed ? collapsed.filter(value => value !== purpose) : [...collapsed, purpose])}>
          {closed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}<span className="dc-group-code">{purpose === 'NOT_REQUIRED' ? '—' : purpose === 'COMMON' ? '共通' : purpose}</span><strong>{purposeNames[purpose] || '不要な資料 · この案件では取得しません'}</strong><span className="dc-count">{rows.length}</span>
        </button>
        {!closed && rows.map(item => <CollectionRow key={item.id} item={item} selected={item.id === selectedId} onSelect={() => onSelect(item.id)} />)}
      </section>
    })}
    {!items.length && <div className="dc-empty-results"><Search size={24} /><h3>該当する資料がありません</h3><p>検索語または絞り込み条件を変更してください。</p></div>}
  </div>
}
