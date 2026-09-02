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
import ReceivedDocumentsList from './ReceivedDocumentsList'

export default function DocumentCollectionInspector({ caseId, itemId, canUpdate, employees, employeeError, activities, onHistory, onClose, onSaved, onEditState }: {
  caseId: number; itemId: number; canUpdate: boolean; employees: EmployeeOption[]; employeeError: string | null; activities: CaseActivity[]
  onHistory: () => void; onClose: () => void; onSaved: () => void
  onEditState: (state: { dirty: boolean; saving: boolean }) => void
}) {
  const { t } = useTranslation()
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
      setDetail(result); setDraft(draftFromDetail(result)); setNotice(t('documentCollection.editor.saved')); onSaved()
      // Refresh the saved detail too; a failed read must never be reported as a failed PATCH.
      try { const latest = await documentCollectionApi.detail(caseId, itemId); setDetail(latest); setDraft(draftFromDetail(latest)) }
      catch { setNotice(t('documentCollection.editor.savedRefreshFailed')) }
    } catch (requestError) { const failure = collectionError(requestError); setError(failure); setErrors(failure.fields) }
    finally { saveLock.current = false; setSaving(false) }
  }
  const close = () => { if (!saving && (!dirty || window.confirm(t('documentCollection.editor.discardAndClose')))) onClose() }
  const history = activities.filter(activity => activity.metadata?.event === 'document_collection.updated' && activity.metadata.document_id === itemId)
  return <InspectorShell title={detail?.document_type?.name_ja ?? detail?.title ?? t('documentCollection.editor.detailTitle')} code={detail?.document_type?.code ?? '—'} subtitle={detail?.collection.source ?? t('documentCollection.list.sourceUnset')} onClose={close} footer={<>
    {notice && <p role="status">{notice}</p>}{Object.keys(errors).length > 0 && <p role="alert" className="dc-danger">{t('documentCollection.editor.invalid')}</p>}
    <div><span className="dc-meta">{!canUpdate ? t('documentCollection.viewOnly') : dirty ? t('documentCollection.editor.unsaved') : t('documentCollection.editor.savedState')}</span><button type="button" className="dc-button" disabled={!dirty || saving} onClick={() => { if (detail) setDraft(draftFromDetail(detail)); setErrors({}); setError(null); setNotice('') }}>{t('documentCollection.editor.cancel')}</button><button type="button" className="dc-button dc-primary" disabled={!canUpdate || !dirty || saving || loading} onClick={() => void save()}>{saving ? t('documentCollection.editor.saving') : t('documentCollection.editor.save')}</button></div>
  </>}>
    {loading && <p className="dc-empty-results" role="status">{t('documentCollection.editor.loading')}</p>}
    {error && <CollectionFeedback error={error} onRetry={() => detail ? void save() : setRevision(value => value + 1)} />}
    {!loading && detail && draft && <>
      <div className="dc-access"><LockKeyhole size={14} />{canUpdate ? t('documentCollection.editor.editable') : t('documentCollection.viewOnly')}<span>{t('documentCollection.editor.permissions')}</span></div>
      {detail.collection.preservation_priority && <div className="dc-priority-note"><ShieldAlert size={18} /><div><strong>{t('documentCollection.preservationPriority')}</strong><p>{detail.collection.preservation_reason || t('documentCollection.editor.priorityReasonUnset')}</p></div></div>}
      <section className="dc-detail-section"><h3>{t('documentCollection.editor.premise')}</h3><dl className="dc-facts"><dt>{t('documentCollection.editor.purpose')}</dt><dd>{detail.purposes.length ? detail.purposes.map(p => <span key={p.id}>{p.code} · {p.name_ja}</span>) : '—'}</dd><dt>{t('documentCollection.editor.condition')}</dt><dd>{detail.rule.applicability_condition_snapshot ?? t('documentCollection.editor.conditionUnset')}</dd><dt>{t('documentCollection.editor.retentionRule')}</dt><dd>{detail.rule.version_snapshot === null ? '—' : `v${detail.rule.version_snapshot}`}<br /><small>{detail.rule.source_snapshot ?? t('documentCollection.editor.sourceUnset')}<br />{t('documentCollection.editor.snapshotHint')}</small></dd></dl></section>
      <CollectionEditor detail={detail} draft={draft} onChange={value => { setDraft(value); setNotice('') }} errors={errors} employees={employees} employeeError={employeeError} disabled={!canUpdate || saving} />
      <ReceivedDocumentsList files={detail.received_documents} />
      <section className="dc-detail-section"><h3><span>G</span>{t('documentCollection.editor.history')}</h3>{history.length ? <ol className="dc-history">{history.map(entry => <li key={entry.id}><time>{formatDate(entry.occurred_at, true)}</time><strong>{entry.title}</strong><p>{entry.content}</p><span>{entry.created_by_employee?.full_name ?? '—'}</span></li>)}</ol> : <p className="dc-meta">{t('documentCollection.editor.noHistory')}</p>}<p className="dc-meta">{t('documentCollection.editor.historyHint')}</p><button type="button" className="dc-button" onClick={() => { if (!dirty || window.confirm(t('documentCollection.editor.discardAndOpenHistory'))) onHistory() }}>{t('documentCollection.editor.openCaseHistory')}</button></section>
    </>}
  </InspectorShell>
}
