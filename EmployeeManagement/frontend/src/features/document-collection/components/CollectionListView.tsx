import { ChevronDown, ChevronRight, Search, ShieldAlert } from 'lucide-react'
import { useState } from 'react'

/** Presentation only; both adapters supply explicit labels and state. No fixtures or API logic. */
export interface CollectionRowView {
  id: string; code: string; title: string; purposes: Array<{ code: string; label: string }>
  source: string | null; target: string | null; period: string | null; origin: string | null
  preservation: boolean; preservationText?: string | null; unnecessary: boolean
  necessity: string; collection: string; fulfillment: string; review: string; result: string | null
  approval?: string; assignee: string; deadline: string; overdue: boolean
}
export default function CollectionListView({ items, selectedId, onSelect }: { items: CollectionRowView[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const [collapsed, setCollapsed] = useState<string[]>([])
  const groupOf = (item: CollectionRowView) => item.unnecessary ? 'NOT_REQUIRED' : item.purposes[0]?.code ?? 'UNGROUPED'
  const groups = [...new Set(items.map(groupOf))].sort((a, b) => a === b ? 0 : a === 'NOT_REQUIRED' ? 1 : b === 'NOT_REQUIRED' ? -1 : a.localeCompare(b))
  return <div className="dc-list">
    <div className="dc-table-head"><span>資料 / 取得先・対象</span><span>必要性・取得・充足・確認</span><span>担当 / 回答期限</span></div>
    {groups.map(purpose => {
      const rows = items.filter(item => groupOf(item) === purpose)
      const closed = collapsed.includes(purpose)
      const label = purpose === 'NOT_REQUIRED' ? '不要な資料 · この案件では取得しません' : rows[0]?.purposes[0]?.label ?? '目的 未設定'
      return <section className="dc-group" key={purpose} aria-label={label}>
        <button type="button" className="dc-group-title" aria-expanded={!closed} onClick={() => setCollapsed(closed ? collapsed.filter(value => value !== purpose) : [...collapsed, purpose])}>
          {closed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}<span className="dc-group-code">{purpose === 'NOT_REQUIRED' || purpose === 'UNGROUPED' ? '—' : purpose === 'COMMON' ? '共通' : purpose}</span><strong>{label}</strong><span className="dc-count">{rows.length}</span>
        </button>
        {!closed && rows.map(item => <CollectionRow key={item.id} item={item} selected={item.id === selectedId} onSelect={() => onSelect(item.id)} />)}
      </section>
    })}
    {!items.length && <div className="dc-empty-results"><Search size={24} /><h3>該当する資料がありません</h3><p>検索語または絞り込み条件を変更してください。</p></div>}
  </div>
}
function CollectionRow({ item, selected, onSelect }: { item: CollectionRowView; selected: boolean; onSelect: () => void }) {
  return <button type="button" data-document-id={item.id} className={`dc-row ${selected ? 'is-selected' : ''} ${item.unnecessary ? 'is-unnecessary' : ''}`} onClick={onSelect} aria-pressed={selected} aria-label={`${item.code} ${item.title} ${item.source ?? ''} の詳細`}>
    <span className="dc-document">
      <span className="dc-code">{item.code}<span title={item.purposes.map(p => `${p.code} · ${p.label}`).join(' / ')}>{item.purposes.map(p => p.code).join(' · ')}</span>{item.origin && <span>{item.origin}</span>}</span>
      <strong>{item.title}</strong><span className="dc-source">{item.source || '取得先 未設定'} · 対象: {item.target || '未指定'}</span>
      {item.period && <span className="dc-meta">{item.period}</span>}
      {item.preservation && <span className="dc-warning dc-preservation"><ShieldAlert size={14} />保全優先{item.preservationText && ` · ${item.preservationText}`}</span>}
    </span>
    <span className="dc-axes">
      <span><small>要否</small><b className={item.necessity === '必要' ? 'dc-blue' : ''}>{item.necessity}</b></span>
      <span><small>取得</small><b>{item.collection}</b></span>
      <span><small>充足</small><b className={item.fulfillment === '不足あり' ? 'dc-warning' : ''}>{item.fulfillment}</b></span>
      <span><small>確認</small><b className={item.review === '確認済み' ? 'dc-success' : item.review === '差戻し' ? 'dc-warning' : ''}>{item.review}</b></span>
      {item.result && <span className="dc-result">結果: {item.result}</span>}
      {item.approval && <span className="dc-result dc-warning">{item.approval}</span>}
    </span>
    <span className="dc-owner"><span>{item.assignee}</span><span className={item.overdue ? 'dc-danger' : 'dc-meta'}>{item.deadline}</span>{item.overdue && <small className="dc-danger">期限超過</small>}<ChevronRight size={15} aria-hidden="true" /></span>
  </button>
}
