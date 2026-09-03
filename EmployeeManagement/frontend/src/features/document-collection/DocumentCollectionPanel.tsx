import { ClipboardList, Plus, ShieldAlert } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CaseActivity } from '../case-workspace/types'
import { useDocumentCollection } from './hooks/useDocumentCollection'
import { initializationMode, itemToRow } from './utils'
import CollectionListView from './components/CollectionListView'
import DocumentCollectionToolbar from './components/DocumentCollectionToolbar'
import CollectionFeedback from './components/CollectionFeedback'
import InitializationDialog from './components/InitializationDialog'
import DocumentCollectionInspector from './components/DocumentCollectionInspector'
import './documentCollection.css'

export default function DocumentCollectionPanel({ caseId, canUpdate, canReviewDocuments, canReadEmployees, activities, onHistory, onBack, onChanged }: {
  caseId: number; canUpdate: boolean; canReviewDocuments: boolean; canReadEmployees: boolean; activities: CaseActivity[]
  onHistory: () => void; onBack: () => void; onChanged: () => void
}) {
  const { t } = useTranslation()
  const state = useDocumentCollection(caseId, canReadEmployees)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const editState = useRef({ dirty: false, saving: false })
  const { preview, data } = state
  const mode = preview ? initializationMode(preview) : null
  const canInitialize = canUpdate && preview?.initialization.available && preview.initialization.missing_candidate_count > 0
  const purposes = Array.from(new Map([...(preview?.purposes ?? []), ...(data?.documents.flatMap(item => item.purposes) ?? [])].map(p => [p.code, p])).values()).sort((a, b) => a.code.localeCompare(b.code))
  const saved = () => { state.refresh(); onChanged() }
  return <div className="dc-preview dc-production" aria-label={t('documentCollection.ariaLabel')}>
    <div className="dc-collection-heading"><div><h2>{t('documentCollection.title')}</h2><p>{t('documentCollection.description')}</p></div>{!canUpdate && <span className="dc-meta">{t('documentCollection.viewOnly')}</span>}</div>
    {state.notice && <p className="dc-feedback dc-success" role="status">{state.notice}</p>}
    {state.previewError && <CollectionFeedback error={state.previewError} onRetry={state.refresh} onBack={onBack} />}
    {!preview && state.previewLoading && <p className="dc-empty-results" role="status">{t('documentCollection.checking')}</p>}
    {preview && !state.previewError && <>
      {preview.warnings.map(warning => <p className="dc-context-note" key={warning.code}>{warning.message}</p>)}
      {mode === 'uninitialized' ? <section className="dc-uninitialized"><ClipboardList size={30} /><h3>{t('documentCollection.uninitialized.title')}</h3><p>{t('documentCollection.uninitialized.caseType')} <strong>{preview.case.case_type?.name ?? '—'}</strong><span>{t('documentCollection.uninitialized.candidateDocuments')} <strong>{t('cases.count', { count: preview.initialization.missing_candidate_count })}</strong></span></p><p>{t('documentCollection.uninitialized.guidance').split('\n').map((line, index) => <span key={line}>{index > 0 && <br />}{line}</span>)}</p>{canInitialize ? <button type="button" className="dc-button dc-primary" onClick={() => state.setConfirming(true)}><Plus size={17} />{t('documentCollection.uninitialized.create')}</button> : <p>{t('documentCollection.uninitialized.permissionHint')}</p>}</section> : <>
        {mode === 'unavailable' && <div className="dc-feedback"><p>{t('documentCollection.uninitialized.unavailable')}</p><button className="dc-button" type="button" onClick={state.refresh}>{t('documentCollection.uninitialized.recheck')}</button></div>}
        {mode === 'empty' && preview.initialization.candidate_count === 0 && <p className="dc-feedback">{t('documentCollection.uninitialized.noRules')}</p>}
        {mode === 'existing' && canInitialize && <div className="dc-candidate-notice"><span>{t('documentCollection.uninitialized.newCandidates', { count: preview.initialization.missing_candidate_count })}</span><button type="button" className="dc-button" onClick={() => state.setConfirming(true)}>{t('documentCollection.uninitialized.addCandidates')}</button></div>}
        {data && <div className="dc-summary" aria-label={t('documentCollection.summaryAria')}><span>{t('documentCollection.candidateTotal')} <b>{data.summary.total}</b><small>{t('documentCollection.list.documentCountUnit')}</small></span><i /><span>{t('documentCollection.status.necessity.required')} <b className="dc-blue">{data.summary.necessity.required}</b></span><span>{t('documentCollection.status.necessity.not_required')} <b className="dc-muted">{data.summary.necessity.not_required}</b></span><span className="dc-muted">{t('documentCollection.status.necessity.undetermined')} <b className="dc-ink">{data.summary.necessity.undetermined}</b></span><i /><button type="button" className="dc-danger" onClick={() => state.changeFilter({ overdue: true })}>{t('documentCollection.overdue')} <b>{data.summary.overdue}</b></button><button type="button" className="dc-warning" onClick={() => state.changeFilter({ preservation_priority: true })}><ShieldAlert size={14} />{t('documentCollection.preservationPriority')} <b>{data.summary.preservation_priority}</b></button></div>}
        <div className={`dc-workspace ${selectedId !== null ? 'has-inspector' : ''}`}>
          <div className="dc-master">
            <DocumentCollectionToolbar query={state.query} search={state.search} onSearch={state.setSearch} onChange={state.changeFilter} purposes={purposes} employees={state.employees} employeeError={state.employeeError} />
            {data && <div className="dc-list-caption"><span>{t('documentCollection.filteredCount', { filtered: data.summary.filtered_count, total: data.summary.total })}</span><span>{t('documentCollection.groupHint')}</span></div>}
            {state.listError ? <CollectionFeedback error={state.listError} onRetry={state.refresh} onBack={onBack} /> : state.listLoading ? <div className="dc-empty-results" role="status">{t('documentCollection.loadingList')}</div> : data && <CollectionListView items={data.documents.map(item => itemToRow(item))} selectedId={selectedId === null ? null : String(selectedId)} onSelect={id => { if (Number(id) === selectedId || editState.current.saving) return; if (!editState.current.dirty || window.confirm(t('documentCollection.editor.discardAndClose'))) setSelectedId(Number(id)) }} />}
            <div className="dc-list-footer">{t('documentCollection.independentAxes')}</div>
          </div>
          {selectedId !== null && <DocumentCollectionInspector key={selectedId} caseId={caseId} itemId={selectedId} canUpdate={canUpdate} canReviewDocuments={canReviewDocuments} employees={state.employees} employeeError={state.employeeError} activities={activities} onHistory={onHistory} onClose={() => { editState.current = { dirty: false, saving: false }; setSelectedId(null) }} onSaved={saved} onEditState={value => { editState.current = value }} />}
        </div>
      </>}
    </>}
    {state.confirming && preview && <InitializationDialog preview={preview} busy={state.initializing} error={state.initializationError} onClose={() => state.setConfirming(false)} onConfirm={() => { if (canUpdate) void state.initialize().then(changed => { if (changed) onChanged() }) }} />}
  </div>
}
