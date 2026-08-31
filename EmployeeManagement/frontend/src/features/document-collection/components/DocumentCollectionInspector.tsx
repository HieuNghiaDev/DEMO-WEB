import { useEffect, useRef, useState } from 'react'
import { LockKeyhole, ShieldAlert } from 'lucide-react'
import type { CaseActivity } from '../../case-workspace/types'
import { documentCollectionApi } from '../api'
import type { CollectionDetail, CollectionDraft, EmployeeOption } from '../types'
import { collectionError } from '../errors'
import type { CollectionError } from '../errors'
import { changedFields, draftFromDetail, formatDate, validateDraft } from '../utils'
import InspectorShell from './InspectorShell'
import CollectionFeedback from './CollectionFeedback'
import CollectionEditor from './CollectionEditor'
import ReceivedDocumentsList from './ReceivedDocumentsList'

export default function DocumentCollectionInspector({ caseId, itemId, canUpdate, employees, employeeError, activities, onHistory, onClose, onSaved, onEditState }: {
  caseId: number; itemId: number; canUpdate: boolean; employees: EmployeeOption[]; employeeError: string | null; activities: CaseActivity[]
  onHistory: () => void; onClose: () => void; onSaved: () => void
  onEditState: (state: { dirty: boolean; saving: boolean }) => void
}) {
  const [detail, setDetail] = useState<CollectionDetail | null>(null)
  const [draft, setDraft] = useState<CollectionDraft | null>(null)
  const [error, setError] = useState<CollectionError | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const saveLock = useRef(false)
  const dirty = !!detail && !!draft && Object.keys(changedFields(detail, draft)).length > 0
  useEffect(() => { onEditState({ dirty, saving }) }, [dirty, saving, onEditState])
  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true); setError(null)
      try { const result = await documentCollectionApi.detail(caseId, itemId, controller.signal); if (!controller.signal.aborted) { setDetail(result); setDraft(draftFromDetail(result)) } }
      catch (error) { if (!controller.signal.aborted) setError(collectionError(error)) }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [caseId, itemId, revision])

  const save = async () => {
    if (!detail || !draft || !dirty || !canUpdate || saveLock.current) return
    const validation = validateDraft(detail, draft)
    setErrors(validation); setError(null); setNotice('')
    if (Object.keys(validation).length) return
    saveLock.current = true; setSaving(true)
    try {
      const result = await documentCollectionApi.update(caseId, itemId, changedFields(detail, draft))
      setDetail(result); setDraft(draftFromDetail(result)); setNotice('保存しました。'); onSaved()
      // Refresh the saved detail too; a failed read must never be reported as a failed PATCH.
      try { const latest = await documentCollectionApi.detail(caseId, itemId); setDetail(latest); setDraft(draftFromDetail(latest)) }
      catch { setNotice('保存しました。最新情報の再取得はできませんでした。詳細を開き直して確認してください。') }
    } catch (requestError) { const failure = collectionError(requestError); setError(failure); setErrors(failure.fields) }
    finally { saveLock.current = false; setSaving(false) }
  }
  const close = () => { if (!saving && (!dirty || window.confirm('未保存の変更を破棄して詳細を閉じますか？'))) onClose() }
  const history = activities.filter(activity => activity.metadata?.event === 'document_collection.updated' && activity.metadata.document_id === itemId)
  return <InspectorShell title={detail?.document_type?.name_ja ?? detail?.title ?? '資料の詳細'} code={detail?.document_type?.code ?? '—'} subtitle={detail?.collection.source ?? '取得先 未設定'} onClose={close} footer={<>
    {notice && <p role="status">{notice}</p>}{Object.keys(errors).length > 0 && <p role="alert" className="dc-danger">入力内容を確認してください。</p>}
    <div><span className="dc-meta">{!canUpdate ? '閲覧のみ' : dirty ? '未保存の変更あり' : '保存済み'}</span><button type="button" className="dc-button" disabled={!dirty || saving} onClick={() => { if (detail) setDraft(draftFromDetail(detail)); setErrors({}); setError(null); setNotice('') }}>キャンセル</button><button type="button" className="dc-button dc-primary" disabled={!canUpdate || !dirty || saving || loading} onClick={() => void save()}>{saving ? '保存中…' : '保存'}</button></div>
  </>}>
    {loading && <p className="dc-empty-results" role="status">資料の詳細を読み込み中…</p>}
    {error && <CollectionFeedback error={error} onRetry={() => detail ? void save() : setRevision(value => value + 1)} />}
    {!loading && detail && draft && <>
      <div className="dc-access"><LockKeyhole size={14} />{canUpdate ? '閲覧・編集可能' : '閲覧のみ'}<span>案件ワークスペースの権限</span></div>
      {detail.collection.preservation_priority && <div className="dc-priority-note"><ShieldAlert size={18} /><div><strong>保全優先</strong><p>{detail.collection.preservation_reason || '保全理由は未設定です。'}</p></div></div>}
      <section className="dc-detail-section"><h3><span>A</span>基本情報</h3><dl className="dc-facts"><dt>確認目的</dt><dd>{detail.purposes.length ? detail.purposes.map(p => <span key={p.id}>{p.code} · {p.name_ja}</span>) : '—'}</dd><dt>適用条件</dt><dd>{detail.rule.applicability_condition_snapshot ?? '条件の記載なし。案件担当者が必要性を判断します。'}</dd><dt>保存ルール</dt><dd>{detail.rule.version_snapshot === null ? '—' : `v${detail.rule.version_snapshot}`}<br /><small>{detail.rule.source_snapshot ?? '出典 未設定'}<br />マスター更新後も、この案件の条件・版は保持します。</small></dd></dl></section>
      <CollectionEditor detail={detail} draft={draft} onChange={value => { setDraft(value); setNotice('') }} errors={errors} employees={employees} employeeError={employeeError} disabled={!canUpdate || saving} />
      <ReceivedDocumentsList files={detail.received_documents} />
      <section className="dc-detail-section"><h3><span>G</span>履歴</h3>{history.length ? <ol className="dc-history">{history.map(entry => <li key={entry.id}><time>{formatDate(entry.occurred_at, true)}</time><strong>{entry.title}</strong><p>{entry.content}</p><span>{entry.created_by_employee?.full_name ?? '—'}</span></li>)}</ol> : <p className="dc-meta">この資料に紐づく履歴はありません。</p>}<p className="dc-meta">案件履歴の資料IDに一致する更新を表示しています。</p><button type="button" className="dc-button" onClick={() => { if (!dirty || window.confirm('未保存の変更を破棄して案件履歴を開きますか？')) onHistory() }}>案件の連絡・履歴へ</button></section>
    </>}
  </InspectorShell>
}
