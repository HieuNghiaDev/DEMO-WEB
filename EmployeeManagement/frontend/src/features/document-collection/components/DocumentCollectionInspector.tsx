import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import type { InspectorEditSection } from './CollectionEditor'
import ReceivedDocumentsList from './ReceivedDocumentsList'
import ReceivedDocumentRegistration from './ReceivedDocumentRegistration'

export default function DocumentCollectionInspector({ caseId, itemId, canUpdate, canReviewDocuments, employees, employeeError, activities, onHistory, onClose, onSaved, onEditState }: {
  caseId: number; itemId: number; canUpdate: boolean; canReviewDocuments: boolean; employees: EmployeeOption[]; employeeError: string | null
  activities: CaseActivity[]; onHistory: () => void; onClose: () => void; onSaved: () => void; onEditState?: (state: { dirty: boolean; saving: boolean }) => void
}) {
  const { t } = useTranslation()
  const [detail, setDetail] = useState<CollectionDetail | null>(null)
  const [draft, setDraft] = useState<CollectionDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<CollectionError | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<InspectorEditSection | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const saveLock = useRef(false)
  const dirty = detail !== null && draft !== null && Object.keys(changedFields(detail, draft)).length > 0

  useEffect(() => { if (onEditState) onEditState({ dirty, saving }) }, [dirty, saving, onEditState])
  useEffect(() => {
    let active = true
    const fetch = async () => {
      try { const result = await documentCollectionApi.detail(caseId, itemId); if (active) { setDetail(result); setDraft(draftFromDetail(result)) } }
      catch (requestError) { if (active) setError(collectionError(requestError)) }
      finally { if (active) setLoading(false) }
    }
    void fetch()
    return () => { active = false }
  }, [caseId, itemId, revision, t])

  const startEdit = (section: InspectorEditSection) => { setEditing(section); setErrors({}); setNotice('') }
  const cancelEdit = () => { if (detail) setDraft(draftFromDetail(detail)); setEditing(null); setErrors({}); setNotice('') }
  const save = async () => {
    if (!detail || !draft || saveLock.current) return
    const saveDraft = editing === 'preparation' && detail.collection.requested_at === null && draft.requested_at === null
      ? { ...draft, requested_at: new Date().toISOString() }
      : draft
    const validation = validateDraft(detail, saveDraft)
    setErrors(validation); setError(null); setNotice('')
    if (Object.keys(validation).length) return
    saveLock.current = true; setSaving(true)
    try {
      const result = await documentCollectionApi.update(caseId, itemId, changedFields(detail, saveDraft))
      setDetail(result); setDraft(draftFromDetail(result)); setEditing(null); setNotice(t('documentCollection.editor.saved')); onSaved()
      try { const latest = await documentCollectionApi.detail(caseId, itemId); setDetail(latest); setDraft(draftFromDetail(latest)) }
      catch { setNotice(t('documentCollection.editor.savedRefreshFailed')) }
    } catch (requestError) { const failure = collectionError(requestError); setError(failure); setErrors(failure.fields) }
    finally { saveLock.current = false; setSaving(false) }
  }
  const close = () => { if (!saving && (!dirty || window.confirm(t('documentCollection.editor.discardAndClose')))) onClose() }
  const history = activities.filter(activity => activity.metadata?.event === 'document_collection.updated' && activity.metadata.document_id === itemId)
  const overdue = !!detail?.collection.response_deadline && new Date(detail.collection.response_deadline).getTime() < Date.now() && !['received', 'closed'].includes(detail.collection.status)

  return <InspectorShell title={detail?.document_type?.name_ja ?? detail?.title ?? t('documentCollection.editor.detailTitle')} code={detail?.document_type?.code ?? '—'} subtitle={detail?.collection.source ?? t('documentCollection.list.sourceUnset')} onClose={close} footer={editing ? <>
    {Object.keys(errors).length > 0 && <p role="alert" className="dc-danger">{t('documentCollection.editor.invalid')}</p>}
    <div><span className="dc-meta">{dirty ? t('documentCollection.editor.unsaved') : t('documentCollection.editor.savedState')}</span><button type="button" className="dc-button" disabled={saving} onClick={cancelEdit}>{t('documentCollection.editor.cancel')}</button><button type="button" className="dc-button dc-primary" disabled={!dirty || saving || loading} onClick={() => void save()}>{saving ? t('documentCollection.editor.saving') : t('documentCollection.editor.save')}</button></div>
  </> : undefined}>
    {loading && <p className="dc-empty-results" role="status">{t('documentCollection.editor.loading')}</p>}
    {error && <CollectionFeedback error={error} onRetry={() => detail ? void save() : setRevision(value => value + 1)} />}
    {!loading && detail && draft && <>
      <div className="dc-access"><LockKeyhole size={14} />{canUpdate ? t('documentCollection.editor.editable') : t('documentCollection.viewOnly')}</div>
      {notice && <p className="dc-inspector-notice" role="status">{notice}</p>}
      <section className="dc-operational-summary" aria-label={t('documentCollection.editor.operationalSummary')}>
        <div><small>{t('documentCollection.editor.necessity')}</small><strong className={`is-${detail.necessity.status}`}>{t(`documentCollection.status.necessity.${detail.necessity.status}`)}</strong></div>
        <div><small>{t('documentCollection.filters.collection')}</small><strong>{t(`documentCollection.status.collection.${detail.collection.status}`)}</strong></div>
        <div><small>{t('documentCollection.editor.assignee')}</small><strong>{detail.assigned_employee?.display_name ?? t('documentCollection.list.unassigned')}</strong></div>
        <div className={overdue ? 'is-overdue' : undefined}><small>{t('documentCollection.editor.responseDeadline')}</small><strong>{formatDate(detail.collection.response_deadline, true)}</strong>{overdue && <em>{t('documentCollection.list.deadlineExceeded')}</em>}</div>
      </section>
      {detail.collection.preservation_priority && <div className="dc-priority-note"><ShieldAlert size={18} /><div><strong>{t('documentCollection.preservationPriority')}</strong><p>{detail.collection.preservation_reason || t('documentCollection.editor.priorityReasonUnset')}</p></div></div>}
      <CollectionEditor detail={detail} draft={draft} onChange={value => { setDraft(value); setNotice('') }} errors={errors} employees={employees} employeeError={employeeError} disabled={!canUpdate || saving} canReviewDocuments={canReviewDocuments} editing={editing} onStartEdit={startEdit} receivedDocuments={<><ReceivedDocumentsList caseId={caseId} itemId={itemId} files={detail.received_documents} hideTitle /><ReceivedDocumentRegistration caseId={caseId} itemId={itemId} canUpdate={canUpdate} onRegistered={updated => { setDetail(updated); setDraft(draftFromDetail(updated)); setNotice(t('documentCollection.receivedDocuments.registered')); onSaved() }} /></>} />
      <section className="dc-detail-section dc-inspector-section"><div className="dc-section-heading"><h3><span>G</span>{t('documentCollection.editor.history')}</h3></div>{history.length ? <ol className="dc-history">{history.slice(0, 3).map(entry => <li key={entry.id}><time>{formatDate(entry.occurred_at, true)}</time><strong>{entry.title}</strong><p>{entry.content}</p><span>{entry.created_by_employee?.full_name ?? '—'}</span></li>)}</ol> : <p className="dc-meta">{t('documentCollection.editor.noHistory')}</p>}<button type="button" className="dc-text-action" onClick={() => { if (!dirty || window.confirm(t('documentCollection.editor.discardAndOpenHistory'))) onHistory() }}>{t('documentCollection.editor.viewAllHistory')}</button></section>
      <details className="dc-rule-details dc-inspector-rule-details"><summary>{t('documentCollection.editor.ruleDetails')}</summary><dl className="dc-facts"><dt>{t('documentCollection.editor.purpose')}</dt><dd>{detail.purposes.length ? detail.purposes.map(p => <span key={p.id}>{p.code} · {p.name_ja}</span>) : '—'}</dd><dt>{t('documentCollection.editor.condition')}</dt><dd>{detail.rule.applicability_condition_snapshot ?? t('documentCollection.editor.conditionUnset')}</dd><dt>{t('documentCollection.editor.retentionRule')}</dt><dd>{detail.rule.version_snapshot === null ? '—' : `v${detail.rule.version_snapshot}`}<br /><small>{detail.rule.source_snapshot ?? t('documentCollection.editor.sourceUnset')}</small></dd></dl></details>
    </>}
  </InspectorShell>
}
