import { Check, ClipboardList, FolderSync, Plus, ShieldAlert } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CaseActivity } from '../case-workspace/types'
import { useDocumentCollection } from './hooks/useDocumentCollection'
import { collectionError } from './errors'
import { initializationMode, itemToRow } from './utils'
import type { NecessityStatus } from './types'
import CollectionListView from './components/CollectionListView'
import DocumentCollectionToolbar from './components/DocumentCollectionToolbar'
import CollectionFeedback from './components/CollectionFeedback'
import InitializationDialog from './components/InitializationDialog'
import DocumentCollectionInspector from './components/DocumentCollectionInspector'
import BulkNecessityDialog, { type BulkNecessityAction } from './components/BulkNecessityDialog'
import './documentCollection.css'

export default function DocumentCollectionPanel({ caseId, canUpdate, canReviewDocuments, canReadEmployees, activities, onHistory, onBack, onChanged }: {
  caseId: number; canUpdate: boolean; canReviewDocuments: boolean; canReadEmployees: boolean; activities: CaseActivity[]
  onHistory: () => void; onBack: () => void; onChanged: () => void
}) {
  const { t } = useTranslation()
  const state = useDocumentCollection(caseId, canReadEmployees)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [bulkSelectedIds, setBulkSelectedIds] = useState<number[]>([])
  const [bulkAction, setBulkAction] = useState<BulkNecessityAction | null>(null)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const editState = useRef({ dirty: false, saving: false })
  const viewBeforeSelection = useRef<{ query: typeof state.query; search: string } | null>(null)
  const { preview, data } = state
  const mode = preview ? initializationMode(preview) : null
  const canInitialize = canUpdate && preview?.initialization.available && preview.initialization.missing_candidate_count > 0
  const purposes = Array.from(new Map([...(preview?.purposes ?? []), ...(data?.documents.flatMap(item => item.purposes) ?? [])].map(p => [p.code, p])).values()).sort((a, b) => a.code.localeCompare(b.code))
  const saved = () => { state.refresh(); onChanged() }
  const clearBulkState = () => {
    setBulkSelectedIds([])
    setBulkAction(null)
    setBulkError(null)
  }
  const changeCollectionFilter = (patch: Parameters<typeof state.changeFilter>[0], reset?: boolean) => {
    clearBulkState()
    state.changeFilter(patch, reset)
  }
  const changeCollectionSearch = (value: string) => {
    clearBulkState()
    state.setSearch(value)
  }
  const toggleBulkSelection = (id: number) => setBulkSelectedIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])
  const setVisibleSelection = (ids: number[], selected: boolean) => setBulkSelectedIds(current => selected ? [...new Set([...current, ...ids])] : current.filter(id => !ids.includes(id)))
  const changeSelectionScope = (necessityStatus: NecessityStatus) => {
    clearBulkState()
    state.replaceView({ necessity_status: necessityStatus, page: 1, per_page: state.query.per_page }, '')
  }
  const changeSelectionMode = (enabled: boolean) => {
    if (enabled === selectionMode) return

    if (enabled) {
      if (editState.current.saving) return
      if (editState.current.dirty && !window.confirm(t('documentCollection.editor.discardAndClose'))) return
      viewBeforeSelection.current = { query: state.query, search: state.search }
      editState.current = { dirty: false, saving: false }
      setSelectedId(null)
      setSelectionMode(true)
      setBulkSelectedIds([])
      state.replaceView({ necessity_status: state.query.necessity_status ?? 'undetermined', page: 1, per_page: state.query.per_page }, '')
      return
    }

    setSelectionMode(false)
    setBulkSelectedIds([])
    setBulkAction(null)
    setBulkError(null)
    if (viewBeforeSelection.current) {
      state.replaceView(viewBeforeSelection.current.query, viewBeforeSelection.current.search)
      viewBeforeSelection.current = null
    }
  }
  const applyBulkAction = async (reason?: string) => {
    if (!bulkAction || bulkSelectedIds.length === 0) return
    setBulkError(null)
    try {
      const result = await state.bulkUpdateNecessity({
        case_document_ids: bulkSelectedIds,
        necessity_status: bulkAction,
        ...(bulkAction === 'not_required' ? { necessity_reason: reason ?? '' } : {}),
      })
      setBulkSelectedIds([])
      setBulkAction(null)
      state.setNotice(`${result.updated_count}件の資料を更新しました。`)
      onChanged()
    } catch (error) {
      setBulkError(collectionError(error).message)
    }
  }
  return <div className="dc-preview dc-production" aria-label={t('documentCollection.ariaLabel')}>
    <div className="dc-collection-heading">
      <div className="dc-collection-heading-content">
        <div className="dc-heading-title-row">
          <FolderSync size={18} className="dc-heading-icon" aria-hidden="true" />
          <h2>{t('documentCollection.title')}</h2>
        </div>
        <p>{t('documentCollection.description')}</p>
      </div>
      {!canUpdate && <span className="dc-meta dc-view-only-badge">{t('documentCollection.viewOnly')}</span>}
    </div>
    {state.notice && <p className="dc-feedback dc-success" role="status">{state.notice}</p>}
    {state.previewError && <CollectionFeedback error={state.previewError} onRetry={state.refresh} onBack={onBack} />}
    {!preview && state.previewLoading && <p className="dc-empty-results" role="status">{t('documentCollection.checking')}</p>}
    {preview && !state.previewError && <>
      {preview.warnings.map(warning => <p className="dc-context-note" key={warning.code}>{warning.message}</p>)}
      {mode === 'uninitialized' ? <section className="dc-uninitialized"><ClipboardList size={30} /><h3>{t('documentCollection.uninitialized.title')}</h3><p>{t('documentCollection.uninitialized.caseType')} <strong>{preview.case.case_type?.name ?? '—'}</strong><span>{t('documentCollection.uninitialized.candidateDocuments')} <strong>{t('cases.count', { count: preview.initialization.missing_candidate_count })}</strong></span></p><p>{t('documentCollection.uninitialized.guidance').split('\n').map((line, index) => <span key={line}>{index > 0 && <br />}{line}</span>)}</p>{canInitialize ? <button type="button" className="dc-button dc-primary" onClick={() => state.setConfirming(true)}><Plus size={17} />{t('documentCollection.uninitialized.create')}</button> : <p>{t('documentCollection.uninitialized.permissionHint')}</p>}</section> : <>
        {mode === 'unavailable' && <div className="dc-feedback"><p>{t('documentCollection.uninitialized.unavailable')}</p><button className="dc-button" type="button" onClick={state.refresh}>{t('documentCollection.uninitialized.recheck')}</button></div>}
        {mode === 'empty' && preview.initialization.candidate_count === 0 && <p className="dc-feedback">{t('documentCollection.uninitialized.noRules')}</p>}
        {mode === 'existing' && canInitialize && <div className="dc-candidate-notice"><span>{t('documentCollection.uninitialized.newCandidates', { count: preview.initialization.missing_candidate_count })}</span><button type="button" className="dc-button" onClick={() => state.setConfirming(true)}>{t('documentCollection.uninitialized.addCandidates')}</button></div>}
        {data && (
          <div className="dc-summary" aria-label={t('documentCollection.summaryAria')}>
            <span className="dc-summary-metric">
              <span className="dc-summary-label">{t('documentCollection.candidateTotal')}</span>
              <span className="dc-summary-val-group">
                <b className="dc-val-total">{data.summary.total}</b>
                <small className="dc-val-unit">{t('documentCollection.list.documentCountUnit')}</small>
              </span>
            </span>
            <i className="dc-summary-divider" aria-hidden="true" />
            <span className="dc-summary-metric">
              <span className="dc-summary-label">{t('documentCollection.status.necessity.required')}</span>
              <b className="dc-val-required">{data.summary.necessity.required}</b>
            </span>
            <span className="dc-summary-metric">
              <span className="dc-summary-label">{t('documentCollection.status.necessity.not_required')}</span>
              <b className="dc-val-not-required">{data.summary.necessity.not_required}</b>
            </span>
            <span className="dc-summary-metric">
              <span className="dc-summary-label">{t('documentCollection.status.necessity.undetermined')}</span>
              <b className="dc-val-undetermined">{data.summary.necessity.undetermined}</b>
            </span>
            <i className="dc-summary-divider" aria-hidden="true" />
            <button
              type="button"
              className={`dc-summary-metric dc-summary-action ${data.summary.overdue > 0 ? 'is-alert-overdue' : 'is-zero'}`}
              onClick={() => changeCollectionFilter({ overdue: true })}
            >
              <span className="dc-summary-label">{t('documentCollection.overdue')}</span>
              <b className="dc-val-overdue">{data.summary.overdue}</b>
            </button>
            <button
              type="button"
              className={`dc-summary-metric dc-summary-action ${data.summary.preservation_priority > 0 ? 'is-alert-preservation' : 'is-zero'}`}
              onClick={() => changeCollectionFilter({ preservation_priority: true })}
            >
              <ShieldAlert size={14} className="dc-val-preservation-icon" aria-hidden="true" />
              <span className="dc-summary-label">{t('documentCollection.preservationPriority')}</span>
              <b className="dc-val-preservation">{data.summary.preservation_priority}</b>
            </button>
          </div>
        )}
        <div className={`dc-workspace ${selectedId !== null ? 'has-inspector' : ''}`}>
          <div className="dc-master">
            <DocumentCollectionToolbar query={state.query} search={state.search} onSearch={changeCollectionSearch} onChange={changeCollectionFilter} purposes={purposes} employees={state.employees} employeeError={state.employeeError} />
            {canUpdate && selectionMode && bulkSelectedIds.length > 0 && (
              <div className="dc-bulk-action-bar" aria-label="選択した資料の一括操作">
                <div className="dc-bulk-count-box">
                  <span className="dc-bulk-indicator" aria-hidden="true"><Check size={11} strokeWidth={3} /></span>
                  <strong>{bulkSelectedIds.length}件選択中</strong>
                </div>
                <div className="dc-bulk-buttons">
                  <button type="button" className="dc-btn dc-btn-primary" onClick={() => setBulkAction('required')}>
                    必要にする
                  </button>
                  <button type="button" className="dc-btn dc-btn-not-required" onClick={() => setBulkAction('not_required')}>
                    不要にする
                  </button>
                  <button type="button" className="dc-btn dc-btn-secondary" onClick={() => setBulkAction('undetermined')}>
                    未判定に戻す
                  </button>
                  <button type="button" className="dc-btn dc-btn-ghost" onClick={() => setBulkSelectedIds([])}>
                    選択解除
                  </button>
                </div>
              </div>
            )}
            {state.listError ? <CollectionFeedback error={state.listError} onRetry={state.refresh} onBack={onBack} /> : state.listLoading ? <div className="dc-empty-results" role="status">{t('documentCollection.loadingList')}</div> : data && <CollectionListView items={data.documents.map(item => itemToRow(item))} totalCount={data.summary.total} filteredCount={data.summary.filtered_count} selectedId={selectedId === null ? null : String(selectedId)} canSelect={canUpdate} selectionMode={selectionMode} selectionScope={state.query.necessity_status ?? 'undetermined'} bulkSelectedIds={bulkSelectedIds} onSelectionModeChange={changeSelectionMode} onSelectionScopeChange={changeSelectionScope} onToggleBulkSelection={toggleBulkSelection} onSetVisibleSelection={setVisibleSelection} onSelect={id => { if (Number(id) === selectedId || editState.current.saving) return; if (!editState.current.dirty || window.confirm(t('documentCollection.editor.discardAndClose'))) setSelectedId(Number(id)) }} />}
          </div>
          {selectedId !== null && <DocumentCollectionInspector key={selectedId} caseId={caseId} itemId={selectedId} canUpdate={canUpdate} canReviewDocuments={canReviewDocuments} employees={state.employees} employeeError={state.employeeError} activities={activities} onHistory={onHistory} onClose={() => { editState.current = { dirty: false, saving: false }; setSelectedId(null) }} onSaved={saved} onEditState={value => { editState.current = value }} />}
        </div>
      </>}
    </>}
    {state.confirming && preview && <InitializationDialog preview={preview} busy={state.initializing} error={state.initializationError} onClose={() => state.setConfirming(false)} onConfirm={() => { if (canUpdate) void state.initialize().then(changed => { if (changed) onChanged() }) }} />}
    {bulkAction && <BulkNecessityDialog key={bulkAction} action={bulkAction} count={bulkSelectedIds.length} busy={state.bulkUpdating} error={bulkError} onClose={() => { if (!state.bulkUpdating) { setBulkAction(null); setBulkError(null) } }} onConfirm={reason => void applyBulkAction(reason)} />}
  </div>
}
