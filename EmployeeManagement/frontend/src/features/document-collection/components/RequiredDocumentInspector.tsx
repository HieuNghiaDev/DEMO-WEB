import { CheckCircle2, History } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CaseActivity } from '../../case-workspace/types'
import { documentCollectionApi } from '../api'
import { collectionError } from '../errors'
import { collectionLabels, fulfillmentLabels, reviewLabels } from '../labels'
import type { CollectionDetail, CollectionPatch } from '../types'
import { formatDate } from '../utils'
import CollectionFeedback from './CollectionFeedback'
import InspectorShell from './InspectorShell'
import ReceivedDocumentsList from './ReceivedDocumentsList'
import ReceivedDocumentRegistration from './ReceivedDocumentRegistration'

export default function RequiredDocumentInspector({ caseId, itemId, canUpdate, canReviewDocuments, activities, onCandidates, onHistory, onClose, onSaved }: {
  caseId: number; itemId: number; canUpdate: boolean; canReviewDocuments: boolean; activities: CaseActivity[]
  onCandidates: () => void; onHistory: () => void; onClose: () => void; onSaved: () => void
}) {
  const { t } = useTranslation()
  const [detail, setDetail] = useState<CollectionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<ReturnType<typeof collectionError> | null>(null)
  const [notice, setNotice] = useState('')
  const [editingCollectionStatus, setEditingCollectionStatus] = useState(false)
  const [editingFulfillment, setEditingFulfillment] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    void documentCollectionApi.detail(caseId, itemId, controller.signal).then(value => {
      if (!controller.signal.aborted) { setDetail(value); setLoading(false) }
    }).catch(requestError => { if (!controller.signal.aborted) { setError(collectionError(requestError)); setLoading(false) } })
    return () => controller.abort()
  }, [caseId, itemId, revision])

  const patch = async (payload: CollectionPatch, message: string) => {
    if (!canUpdate || saving || !detail) return false
    setSaving(true); setError(null); setNotice('')
    try {
      const updated = await documentCollectionApi.update(caseId, itemId, payload)
      setDetail(updated); setNotice(message); onSaved()
      return true
    } catch (requestError) { setError(collectionError(requestError)); return false }
    finally { setSaving(false) }
  }
  const relevantHistory = activities.filter(activity => activity.metadata?.event === 'document_collection.updated' && activity.metadata.document_id === itemId).length

  return <InspectorShell breakpoint={1560} title={detail?.document_type?.name_ja ?? detail?.title ?? '必要資料'} code={detail?.document_type?.code ?? '—'} subtitle={detail ? '必要' : undefined} onClose={onClose} footer={<div><span className="dc-meta">{notice || (canUpdate ? '変更は明示的に保存されます。' : '閲覧のみ')}</span><button type="button" className="dc-button" onClick={onClose}>閉じる</button></div>}>
    {loading && <p className="dc-empty-results" role="status">必要資料の詳細を読み込み中…</p>}
    {error && <CollectionFeedback error={error} onRetry={() => { setLoading(true); setError(null); setRevision(value => value + 1) }}/>} 
    {!loading && detail && <>
      {notice && <p className="dc-feedback dc-success" role="status">{notice}</p>}
      <section className="dc-required-overview"><div><small>必要性</small><strong className="dc-blue">必要</strong></div><button type="button" className="dc-text-action" onClick={onCandidates}>必要性を変更</button></section>
      <section className={`dc-required-action-summary ${canReviewDocuments ? 'has-review' : ''}`} aria-label="取得状況の概要"><div><small>取得作業</small><strong>{collectionLabels[detail.collection.status]}</strong></div><div><small>担当</small><strong>{detail.assigned_employee?.display_name ?? '未割当'}</strong></div><div><small>回答期限</small><strong>{formatDate(detail.collection.response_deadline)}</strong></div>{canReviewDocuments && <div className="dc-required-review-summary"><small>確認</small><strong>{reviewLabels[detail.review_status]}</strong><ReviewActions compact status={detail.review_status} saving={saving} onChange={(review_status, message) => void patch({ review_status }, message)}/></div>}</section>
      <section className="dc-required-section"><div className="dc-section-heading"><h3>取得作業</h3>{canUpdate && <button type="button" className="dc-text-action" onClick={() => setEditingCollectionStatus(value => !value)}>{editingCollectionStatus ? '変更を閉じる' : '取得状況を変更'}</button>}</div>{editingCollectionStatus ? <div className="dc-compact-editor"><select aria-label="必要資料の取得作業" disabled={saving} value={detail.collection.status} onChange={event => void patch({ collection_status: event.target.value as CollectionPatch['collection_status'] }, '取得作業を更新しました。').then(saved => { if (saved) setEditingCollectionStatus(false) })}>{Object.entries(collectionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button type="button" className="dc-button" onClick={() => setEditingCollectionStatus(false)}>キャンセル</button></div> : <strong>{collectionLabels[detail.collection.status]}</strong>}</section>
      <section className="dc-required-section"><div className="dc-section-heading"><h3>内容充足</h3>{canUpdate && <button type="button" className="dc-text-action" onClick={() => setEditingFulfillment(value => !value)}>{editingFulfillment ? '判定を閉じる' : '内容充足を判定'}</button>}</div>{editingFulfillment ? <div className="dc-compact-editor"><select aria-label="必要資料の内容充足" disabled={saving} value={detail.fulfillment_status} onChange={event => void patch({ fulfillment_status: event.target.value as CollectionPatch['fulfillment_status'] }, '内容充足を更新しました。').then(saved => { if (saved) setEditingFulfillment(false) })}>{Object.entries(fulfillmentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button type="button" className="dc-button" onClick={() => setEditingFulfillment(false)}>キャンセル</button></div> : <strong className={detail.fulfillment_status === 'insufficient' ? 'dc-warning' : detail.fulfillment_status === 'satisfied' ? 'dc-success' : ''}>{fulfillmentLabels[detail.fulfillment_status]}</strong>}{detail.fulfillment_status === 'insufficient' && <p className="dc-followup-gap">不足内容の記録・追加依頼の作成は、現在のAPIでは未対応です。</p>}</section>
      <details className="dc-rule-details dc-operational-details">
        <summary>{t('documentCollection.editor.operationalDetails')}</summary>
        <dl className="dc-readable-facts">
          <dt>{t('documentCollection.editor.targetPerson')}</dt><dd>{detail.collection.target_person || '—'}</dd>
          <dt>{t('documentCollection.editor.source')}</dt><dd>{detail.collection.source || '—'}</dd>
          <dt>{t('documentCollection.editor.method')}</dt><dd>{detail.collection.method || '—'}</dd>
          <dt>{t('documentCollection.editor.targetPeriod')}</dt><dd>{detail.collection.target_period_from || detail.collection.target_period_to ? `${formatDate(detail.collection.target_period_from)} ～ ${formatDate(detail.collection.target_period_to)}` : '—'}</dd>
          <dt>{t('documentCollection.editor.scope')}</dt><dd>{detail.collection.target_scope || '—'}</dd>
          <dt>{t('documentCollection.editor.requestedAt')}</dt><dd>{detail.collection.requested_at ? formatDate(detail.collection.requested_at, true) : '—'}</dd>
          <dt>{t('documentCollection.editor.workPriority')}</dt><dd>{t(`documentCollection.status.priority.${detail.collection.priority}`)} {detail.collection.preservation_priority ? `(${t('documentCollection.preservationPriority')})` : ''}</dd>
          {detail.collection.preservation_reason && <><dt>{t('documentCollection.editor.preservationReason')}</dt><dd>{detail.collection.preservation_reason}</dd></>}
          <dt>{t('documentCollection.receivedDocuments.title')}</dt><dd>{t('cases.count', { count: detail.received_document_count })}</dd>
          <dt>{t('documentCollection.editor.resultException')}</dt><dd><strong className={detail.collection.result ? 'dc-danger' : undefined}>{detail.collection.result ? t(`documentCollection.status.result.${detail.collection.result}`) : '—'}</strong></dd>
        </dl>
        <ReceivedDocumentsList caseId={caseId} itemId={itemId} files={detail.received_documents} hideTitle />
        <ReceivedDocumentRegistration caseId={caseId} itemId={itemId} canUpdate={canUpdate} onRegistered={updated => { setDetail(updated); setNotice(t('documentCollection.receivedDocuments.registered')); onSaved() }} />
        {canUpdate && <div style={{ marginTop: 12 }}><button type="button" className="dc-text-action" onClick={onCandidates}>{t('documentCollection.editor.editInCollection')}</button></div>}
      </details>
      <details className="dc-rule-details"><summary>ルール・詳細情報</summary><dl className="dc-readable-facts"><dt>確認目的</dt><dd>{detail.purposes.map(purpose => `${purpose.code} · ${purpose.name_ja}`).join(' / ') || '未設定'}</dd><dt>適用条件</dt><dd>{detail.rule.applicability_condition_snapshot || '記載なし'}</dd><dt>ルール版</dt><dd>{detail.rule.version_snapshot === null ? '—' : `v${detail.rule.version_snapshot}`}</dd><dt>出典</dt><dd>{detail.rule.source_snapshot || '未設定'}</dd></dl></details>
      <section className="dc-required-section"><button type="button" className="dc-button" onClick={onHistory}><History size={15}/>履歴を見る{relevantHistory > 0 && ` (${relevantHistory})`}</button></section>
    </>}
  </InspectorShell>
}

function ReviewActions({ status, saving, compact = false, onChange }: { status: CollectionDetail['review_status']; saving: boolean; compact?: boolean; onChange: (status: CollectionPatch['review_status'], message: string) => void }) {
  if (status === 'unreviewed' || status === 'returned') return <div className="dc-action-row"><button type="button" className="dc-button dc-primary" disabled={saving} aria-label="確認を開始" onClick={() => onChange('reviewing', '確認を開始しました。')}>{compact ? '開始' : '確認を開始'}</button></div>
  if (status === 'reviewing') return <div className="dc-action-row"><button type="button" className="dc-button dc-primary" disabled={saving} aria-label="確認済みにする" onClick={() => onChange('reviewed', '確認済みに更新しました。')}><CheckCircle2 size={14}/>{compact ? '済み' : '確認済みにする'}</button><button type="button" className="dc-button" disabled={saving} onClick={() => onChange('returned', '差戻しに更新しました。')}>差戻し</button></div>
  return <div className="dc-action-row"><button type="button" className="dc-button" disabled={saving} aria-label="確認を再開" onClick={() => onChange('reviewing', '確認を再開しました。')}>{compact ? '再開' : '確認を再開'}</button></div>
}
