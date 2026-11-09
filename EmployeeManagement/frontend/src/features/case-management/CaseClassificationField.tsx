import { useId } from 'react'
import type { CaseClassification } from './types'

export default function CaseClassificationField({ value, onChange, error }: {
  value: CaseClassification; onChange: (value: CaseClassification) => void; error?: string
}) {
  const id = useId()
  return <div className="cm-ncf-field cm-wide">
    <label className="cm-ncf-label" htmlFor={id}>案件区分 <span className="cm-ncf-required">必須</span></label>
    <select id={id} name="classification" className="cm-ncf-input" required value={value}
      aria-invalid={!!error} aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
      onChange={event => onChange(event.target.value as CaseClassification)}>
      <option value="">案件区分を選択</option>
      <option value="normal">通常案件</option>
      <option value="confidential">機密案件（現在利用不可）</option>
    </select>
    <p id={`${id}-help`} className="dc-meta">{value === 'confidential'
      ? '明示的に許可されたメンバーのみアクセスできます。機密案件のアクセスメンバー設定は現在準備中です。'
      : '通常案件：権限を持つ担当者が通常の案件としてアクセスできます。機密案件は現在作成できません。'}</p>
    {error && <p id={`${id}-error`} role="alert" className="cm-field-error">{error}</p>}
  </div>
}
