import { caseTypeOptions } from './helpers'
import type { CaseTypeOption } from './types'

export default function CaseTypeSelector({ types, value, currentName, error, onChange }: {
  types: CaseTypeOption[]; value: string; currentName?: string; error?: string; onChange: (id: string) => void
}) {
  const options = caseTypeOptions(types)
  const rootOf = (type: typeof options[number]) => {
    const visited = new Set<number>()
    while (type.parent_id && !visited.has(type.id)) {
      visited.add(type.id)
      const parent = options.find(option => option.id === type.parent_id)
      if (!parent) break
      type = parent
    }
    return type
  }
  const selected = options.find(type => String(type.id) === value)
  const parent = selected ? rootOf(selected) : undefined
  const children = parent ? options.filter(type => type.id !== parent.id && rootOf(type).id === parent.id) : []
  return <div className="cm-type-selector">
    <label><span id="case-type-label">事件類型 *</span><select name="case_type_id" aria-labelledby="case-type-label" required value={parent?.id ?? value}
      aria-invalid={!!error} aria-describedby={error ? 'case-type-error' : undefined} onChange={event => onChange(event.target.value)}>
      <option value="">事件類型を選択</option>
      {!selected && value && <option value={value}>{currentName ?? '現在の事件類型'}</option>}
      {options.filter(type => rootOf(type).id === type.id).map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
    </select></label>
    {!!children.length && <label>詳細類型（任意）<select value={selected?.id === parent?.id ? '' : value} onChange={event => onChange(event.target.value || String(parent?.id))}>
      <option value="">指定しない（{parent?.name}）</option>
      {children.map(type => <option key={type.id} value={type.id}>{type.label.replace((parent?.name ?? '') + ' / ', '')}</option>)}
    </select></label>}
    {error && <p role="alert" id="case-type-error" className="cm-field-error cm-wide">{error}</p>}
  </div>
}
