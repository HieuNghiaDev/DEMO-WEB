import { useId } from 'react'
import { UserPlus, X } from 'lucide-react'
import type { CaseDelegationCandidate, CaseTaskDelegation } from './api'
import { caseTaskDelegationPermissions } from './caseTaskDelegation'

export default function CaseTaskDelegationFields({ candidates, rows, onChange }: {
  candidates: CaseDelegationCandidate[]
  rows: CaseTaskDelegation[]
  onChange: (rows: CaseTaskDelegation[]) => void
}) {
  const fieldId = useId()
  const available = candidates.filter(candidate => !rows.some(row => row.user_id === candidate.user_id))

  return <div className="space-y-3 pt-3">
    <label htmlFor={fieldId} className="cm-delegation-label text-sm font-semibold text-tm-text-primary"><UserPlus size={16} aria-hidden/>案件内の委任権限</label>
    <p id={`${fieldId}-help`} className="text-xs text-tm-text-muted">この案件で許可する操作を社員ごとに選択してください。必要資料の選定は弁護士が行います。</p>
    <select id={fieldId} aria-describedby={`${fieldId}-help`} className="w-full rounded-lg border border-tm-border bg-tm-surface px-3 py-2 text-sm text-tm-text-primary" value="" disabled={!available.length} onChange={event => {
      const userId = Number(event.target.value)
      if (available.some(candidate => candidate.user_id === userId)) {
        onChange([...rows, { user_id: userId, create_tasks: false, review_tasks: false, edit_overview: false }])
      }
    }}>
      <option value="" disabled>{available.length ? '社員を追加' : '追加できる社員はいません'}</option>
      {available.map(candidate => <option key={candidate.user_id} value={candidate.user_id}>{candidate.name}</option>)}
    </select>
    {rows.length > 0 && <div className="divide-y divide-tm-border rounded-lg border border-tm-border">
      {rows.map(row => {
        const name = candidates.find(candidate => candidate.user_id === row.user_id)?.name
        const label = name ?? `対象外のアカウント #${row.user_id}`
        return <fieldset key={row.user_id} aria-label={label} className="min-w-0 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="break-all text-sm font-semibold text-tm-text-primary">{label}</span>
            <button type="button" className="rounded-md p-2 text-tm-text-muted hover:bg-tm-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--tm-focus-ring)]" aria-label={`${label}の委任を解除`} onClick={() => onChange(rows.filter(item => item.user_id !== row.user_id))}><X size={16} aria-hidden/></button>
          </div>
          {name && <div className="grid gap-x-4 gap-y-1 pb-1 sm:grid-cols-2">
            {caseTaskDelegationPermissions.map(([key, title]) => <label className="cm-delegation-label min-h-8 text-sm text-tm-text-primary" key={key}>
              <input type="checkbox" className="size-4 shrink-0 accent-tm-primary" checked={row[key]} onChange={event => {
                onChange(rows.map(item => item.user_id === row.user_id ? { ...item, [key]: event.target.checked } : item))
              }}/>
              <span>{title}</span>
            </label>)}
          </div>}
        </fieldset>
      })}
    </div>}
  </div>
}
