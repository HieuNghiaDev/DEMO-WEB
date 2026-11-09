import { Sparkles } from 'lucide-react'
import { ButtonSpinner } from '../../../components/loading'

export default function AutoGenerateButton({ onClick, disabled = false, loading = false }: {
  onClick: () => void; disabled?: boolean; loading?: boolean
}) {
  return <button type="button" className="dc-button dc-primary dc-auto-create-primary" onClick={onClick} disabled={disabled || loading} aria-busy={loading || undefined}>
    <span className="dc-auto-create-reflection" aria-hidden="true"/>
    <span className="dc-auto-create-glint" aria-hidden="true"/>
    <span className="dc-auto-create-energy" aria-hidden="true"/>
    <span className="dc-auto-create-content">
      {loading ? <ButtonSpinner size={17}/> : <Sparkles className="dc-auto-create-icon" size={17} aria-hidden="true"/>}
      <span>{loading ? '自動作成中…' : '自動作成'}</span>
    </span>
  </button>
}
