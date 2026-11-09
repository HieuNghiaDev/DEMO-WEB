import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SlidersHorizontal, X } from 'lucide-react'
import type { CollectionQuery, EmployeeOption } from '../types'
import { statusGroups } from '../labels'

type Props = {
  open: boolean
  query: CollectionQuery
  purposes: Array<{ code: string; name_ja: string }>
  employees: EmployeeOption[]
  employeeError: string | null
  onClose: () => void
  onApply: (query: CollectionQuery) => void
  onClear: () => void
}

const editableQuery = (query: CollectionQuery): CollectionQuery => ({ ...query, page: 1 })

export default function DocumentCollectionFilterDrawer({ open, query, purposes, employees, employeeError, onClose, onApply, onClear }: Props) {
  const [draft, setDraft] = useState<CollectionQuery>(() => editableQuery(query))
  const titleId = useId()
  const panel = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    const origin = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    panel.current?.focus({ preventScroll: true })
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      origin?.focus({ preventScroll: true })
    }
  }, [open, onClose, query])

  if (!open) return null
  const set = (patch: CollectionQuery) => setDraft(current => ({ ...current, ...patch, page: 1 }))

  return createPortal(<div className="dc-filter-drawer-layer">
    <div className="dc-backdrop" aria-hidden="true" onClick={onClose}/>
    <aside ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className="dc-filter-drawer">
      <header className="dc-filter-drawer-head"><div><SlidersHorizontal size={18}/><h2 id={titleId}>絞り込み</h2></div><button type="button" className="dc-icon-button" aria-label="閉じる" onClick={onClose}><X size={19}/></button></header>
      <div className="dc-filter-drawer-body">
        <label>目的<select value={draft.purpose ?? ''} onChange={event => set({ purpose: event.target.value || undefined })}><option value="">すべて</option>{purposes.map(purpose => <option key={purpose.code} value={purpose.code}>{purpose.code} · {purpose.name_ja}</option>)}</select></label>
        <label>取得先<input value={draft.source ?? ''} onChange={event => set({ source: event.target.value || undefined })} placeholder="取得先で絞り込み" maxLength={255}/></label>
        <label>担当者<select value={draft.assignee_id ?? ''} disabled={!!employeeError} onChange={event => set({ assignee_id: event.target.value ? Number(event.target.value) : undefined })}><option value="">すべて</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.display_name}</option>)}</select></label>
        {statusGroups.map(group => {
          const label = group.field === 'necessity_status' ? '必要性' : group.field === 'collection_status' ? '取得状況' : group.field === 'collection_result' ? '取得結果' : group.field === 'fulfillment_status' ? '内容充足' : '確認状態'
          return <label key={group.field}>{label}<select value={draft[group.field] ?? '__all'} onChange={event => set({ [group.field]: event.target.value === '__all' ? undefined : event.target.value })}><option value="__all">すべて</option>{group.field === 'collection_result' && <option value="">例外なし</option>}{Object.entries(group.labels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
        })}
        <div className="dc-filter-dates"><label>期限（開始）<input type="date" value={draft.deadline_from ?? ''} onChange={event => set({ deadline_from: event.target.value || undefined })}/></label><label>期限（終了）<input type="date" value={draft.deadline_to ?? ''} min={draft.deadline_from} onChange={event => set({ deadline_to: event.target.value || undefined })}/></label></div>
        <label className="dc-filter-check"><input type="checkbox" checked={draft.overdue === true} onChange={event => set({ overdue: event.target.checked || undefined })}/><span>期限超過のみ</span></label>
        <label className="dc-filter-check"><input type="checkbox" checked={draft.preservation_priority === true} onChange={event => set({ preservation_priority: event.target.checked || undefined })}/><span>保全優先のみ</span></label>
        <label>並び順<select value={draft.sort ?? ''} onChange={event => set({ sort: (event.target.value || undefined) as CollectionQuery['sort'] })}><option value="">既定</option><option value="document_code">資料コード</option><option value="document_name">資料名</option><option value="deadline">期限</option><option value="assignee">担当者</option><option value="priority">優先度</option><option value="updated_at">更新日時</option></select></label>
      </div>
      <footer className="dc-filter-drawer-footer"><button type="button" className="dc-button" onClick={() => { onClear(); onClose() }}>クリア</button><button type="button" className="dc-button dc-primary" onClick={() => { onApply(draft); onClose() }}>適用</button></footer>
    </aside>
  </div>, document.body)
}
