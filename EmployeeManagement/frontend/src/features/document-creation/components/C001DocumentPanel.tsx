import { Eye, FilePenLine, RotateCcw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { C001State } from '../../document-collection/types'

const statusLabels: Record<C001State['status'], string> = {
  missing: '未作成',
  draft: '下書き',
  pending_approval: '作成済み',
  complete: '承認済み',
  rejected: '差戻し',
}

const statusMessages: Record<C001State['status'], string> = {
  missing: 'まだ文書は作成されていません。',
  draft: '編集中の下書きがあります。',
  pending_approval: '文書が作成され、承認を待っています。',
  complete: '承認済みの文書が保存されています。',
  rejected: '差戻しされた文書があります。',
}

export default function C001DocumentPanel({ caseId, documentId, state, canUpdate, blocked = false, sectionLabel }: {
  caseId: number
  documentId: number
  state: C001State
  canUpdate: boolean
  blocked?: boolean
  sectionLabel?: string
  onChanged: (message: string) => void
}) {
  const navigate = useNavigate()
  const editorPath = `/quests/${caseId}/documents/${documentId}/edit`
  const latestVersion = state.latest_version ?? null
  const canView = latestVersion !== null
  const canEdit = canUpdate && state.status !== 'complete'

  return <section className="dc-c001" aria-labelledby="dc-c001-title">
    <div className="dc-c001-heading">
      <h3 id="dc-c001-title"><span className="dc-c001-section-label">{sectionLabel || 'D'}</span>文書作成</h3>
      <span className={`dc-c001-status is-${state.status}`}>{statusLabels[state.status]}</span>
    </div>

    <p className="dc-meta">{statusMessages[state.status]}{latestVersion !== null && <> 最新 v{latestVersion}</>}</p>

    <div className="dc-c001-actions">
      {canView && <button type="button" className="dc-button" disabled={blocked} onClick={() => navigate(`${editorPath}?mode=view&version=${latestVersion}`)}><Eye size={14}/>文書を見る</button>}
      {state.status === 'missing' && canEdit && <button type="button" className="dc-button dc-primary" disabled={blocked} onClick={() => navigate(editorPath)}><FilePenLine size={14}/>文書を自動作成</button>}
      {state.status === 'draft' && canEdit && <button type="button" className="dc-button dc-primary" disabled={blocked} onClick={() => navigate(editorPath)}><FilePenLine size={14}/>編集を再開</button>}
      {state.status === 'pending_approval' && canEdit && <button type="button" className="dc-button dc-primary" disabled={blocked} onClick={() => navigate(`${editorPath}?mode=edit`)}><FilePenLine size={14}/>文書を編集</button>}
      {state.status === 'rejected' && canEdit && <button type="button" className="dc-button dc-primary" disabled={blocked} onClick={() => navigate(editorPath)}><RotateCcw size={14}/>編集を再開</button>}
    </div>
    {!canUpdate && state.status === 'missing' && <p className="dc-meta">文書作成の操作権限がありません。</p>}
    {!canUpdate && state.status !== 'missing' && state.status !== 'complete' && <p className="dc-meta">文書の編集には案件更新権限が必要です。</p>}
  </section>
}
