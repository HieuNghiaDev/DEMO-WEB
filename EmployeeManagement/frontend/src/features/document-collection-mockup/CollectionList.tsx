import { Search, ShieldAlert, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { collections, necessities, sufficiencies, reviews, exceptions, approvals } from './types'
import type { CollectionFilters, CollectionItem } from './types'
import CollectionListView from '../document-collection/components/CollectionListView'
import { emptyFilters, isOverdue, purposeNames } from './mockData'

const necessityStatus = { '未判定': 'undetermined', '必要': 'required', '不要': 'not_required' } as const
const collectionStatus = { '未着手': 'not_started', '準備中': 'preparing', '依頼済み': 'requested', '一部受領': 'partially_received', '受領済み': 'received', '取得困難': 'difficult', '終了': 'closed' } as const
const fulfillmentStatus = { '未判定': 'undetermined', '不足あり': 'insufficient', '充足': 'satisfied', '代替資料で充足': 'satisfied_by_alternative' } as const
const reviewStatus = { '未確認': 'unreviewed', '確認中': 'reviewing', '確認済み': 'reviewed', '差戻し': 'returned' } as const
const resultStatus = { 'なし': null, '不存在': 'not_exist', '不開示': 'not_disclosed', '一部不開示': 'partially_disclosed', '保管先不明': 'custodian_unknown', 'その他': 'other' } as const

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

export default function CollectionList({ items, selectedId, onSelect }: { items: CollectionItem[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return <CollectionListView selectedId={selectedId} onSelect={onSelect} items={items.map(item => ({
    id: item.id, code: item.code, title: item.title,
    purposes: item.purposes.map(code => ({ code, label: purposeNames[code] })),
    source: item.source, target: item.target,
    period: item.periodStart ? `${item.periodStart.replaceAll('-', '/')} — ${item.periodEnd.replaceAll('-', '/')}` : null,
    origin: item.origin === '案件で追加' ? '別取得先' : null,
    preservation: item.priority === '保全優先', preservationText: '保存期間の確認が必要',
    unnecessary: item.necessity === '不要', necessity: item.necessity, necessityStatus: necessityStatus[item.necessity],
    collection: item.collection, collectionStatus: collectionStatus[item.collection], fulfillment: item.sufficiency, fulfillmentStatus: fulfillmentStatus[item.sufficiency], review: item.review, reviewStatus: reviewStatus[item.review],
    result: item.exception === 'なし' ? null : item.exception, resultStatus: resultStatus[item.exception],
    approval: item.approval === '承認待ち' ? '外部請求 · 承認待ち' : undefined,
    assignee: item.assignee === 'LE HIEU NGHIA' ? 'L.H. NGHIA' : item.assignee, hasAssignee: true,
    deadline: item.deadline ? item.deadline.replaceAll('-', '/') : '期限 未設定', overdue: isOverdue(item),
  }))} />
}
