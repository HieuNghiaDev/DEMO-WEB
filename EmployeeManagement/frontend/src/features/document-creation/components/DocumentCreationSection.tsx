import { Eye, FilePenLine } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { documentDraftStore } from '../documentDraftStore'
import type { DocumentWorkflowStatus } from '../documentTemplates'
import '../c001DocumentEditor.css'
import DocumentWorkflowBadge from './DocumentWorkflowBadge'

const messages: Record<DocumentWorkflowStatus, string> = {
  not_created: 'まだ文書は作成されていません。',
  draft: '編集中の下書きがあります。',
  review: '入力内容の確認を待っています。',
  approved: '承認済みの文書が保存されています。',
}

export default function DocumentCreationSection({ caseId, documentId, canUpdate, blocked = false }: { caseId: number; documentId: number; canUpdate: boolean; blocked?: boolean }) {
  return <CreationStatus key={`${caseId}:${documentId}`} caseId={caseId} documentId={documentId} canUpdate={canUpdate} blocked={blocked}/>
}

function CreationStatus({ caseId, documentId, canUpdate, blocked }: { caseId: number; documentId: number; canUpdate: boolean; blocked: boolean }) {
  const navigate = useNavigate()
  const [status, setStatus] = useState<DocumentWorkflowStatus>('not_created')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    documentDraftStore.load({ caseId, documentId }, controller.signal)
      .then(state => {
        if (controller.signal.aborted) return
        if (!state.supported || !state.record) throw new Error('Unsupported document')
        setStatus(state.record.status)
      })
      .catch(() => { if (!controller.signal.aborted) setError('文書作成状況を取得できませんでした。') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [caseId, documentId, attempt])
  const navigationDisabled = loading || !!error || blocked
  const documentPath = `/quests/${caseId}/documents/${documentId}/edit`
  const hasDocument = status !== 'not_created'

  return <section className="dc-detail-section dc-inspector-section dc-document-creation-section">
    <div className="dc-section-heading">
      <h3><span>D</span>文書作成</h3>
      <span className="dc-office-document-label"><FilePenLine size={13}/>事務所作成書類</span>
    </div>
    <div className="dc-document-creation-status">
      <div className="dc-document-creation-copy">{!loading && !error && <><DocumentWorkflowBadge status={status}/><p>{messages[status]}</p></>}</div>
      <div className="dc-document-creation-actions">
        {loading && <button type="button" className="dc-button dc-primary" disabled>読込中…</button>}
        {!loading && !error && status === 'not_created' && canUpdate && <button type="button" className="dc-button dc-primary" disabled={navigationDisabled} onClick={() => navigate(documentPath)}><FilePenLine size={14}/>文書を作成</button>}
        {!loading && !error && hasDocument && <button type="button" className="dc-button" disabled={navigationDisabled} onClick={() => navigate(status === 'approved' ? documentPath : `${documentPath}?mode=view`)}><Eye size={14}/>文書を見る</button>}
        {!loading && !error && hasDocument && canUpdate && <button type="button" className="dc-button dc-primary" disabled={navigationDisabled} onClick={() => navigate(documentPath)}><FilePenLine size={14}/>文書を編集</button>}
      </div>
    </div>
    {error && <div><p className="dc-danger" role="alert">{error}</p><button type="button" className="dc-button" onClick={() => { setLoading(true); setError(''); setAttempt(value => value + 1) }}>再試行</button></div>}
    {!canUpdate && status === 'not_created' && <p className="dc-meta">文書作成の操作権限がありません。</p>}
    {!canUpdate && hasDocument && <p className="dc-meta">文書の編集には案件更新権限が必要です。</p>}
    {canUpdate && status === 'approved' && <p className="dc-meta">承認済みの版は保持されます。編集時は次の改訂版を作成します。</p>}
  </section>
}
