import { ClipboardList, Plus, ShieldAlert } from 'lucide-react'
import { useRef, useState } from 'react'
import type { CaseActivity } from '../case-workspace/types'
import { useDocumentCollection } from './hooks/useDocumentCollection'
import { initializationMode, itemToRow } from './utils'
import CollectionListView from './components/CollectionListView'
import DocumentCollectionToolbar from './components/DocumentCollectionToolbar'
import CollectionFeedback from './components/CollectionFeedback'
import InitializationDialog from './components/InitializationDialog'
import DocumentCollectionInspector from './components/DocumentCollectionInspector'
import './documentCollection.css'

export default function DocumentCollectionPanel({ caseId, canUpdate, canReadEmployees, activities, onHistory, onBack, onChanged }: {
  caseId: number; canUpdate: boolean; canReadEmployees: boolean; activities: CaseActivity[]
  onHistory: () => void; onBack: () => void; onChanged: () => void
}) {
  const state = useDocumentCollection(caseId, canReadEmployees)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const editState = useRef({ dirty: false, saving: false })
  const { preview, data } = state
  const mode = preview ? initializationMode(preview) : null
  const canInitialize = canUpdate && preview?.initialization.available && preview.initialization.missing_candidate_count > 0
  const purposes = Array.from(new Map([...(preview?.purposes ?? []), ...(data?.documents.flatMap(item => item.purposes) ?? [])].map(p => [p.code, p])).values()).sort((a, b) => a.code.localeCompare(b.code))
  const saved = () => { state.refresh(); onChanged() }
  return <div className="dc-preview dc-production" aria-label="資料収集ワークスペース">
    <div className="dc-collection-heading"><div><h2>資料収集</h2><p>必要性の判断から取得・確認まで、資料ごとに管理</p></div>{!canUpdate && <span className="dc-meta">閲覧のみ</span>}</div>
    {state.notice && <p className="dc-feedback dc-success" role="status">{state.notice}</p>}
    {state.previewError && <CollectionFeedback error={state.previewError} onRetry={state.refresh} onBack={onBack} />}
    {!preview && state.previewLoading && <p className="dc-empty-results" role="status">資料収集の状態を確認中…</p>}
    {preview && !state.previewError && <>
      {preview.warnings.map(warning => <p className="dc-context-note" key={warning.code}>{warning.message}</p>)}
      {mode === 'uninitialized' ? <section className="dc-uninitialized"><ClipboardList size={30} /><h3>資料収集リストはまだ作成されていません。</h3><p>事件類型 <strong>{preview.case.case_type?.name ?? '—'}</strong><span>候補資料 <strong>{preview.initialization.missing_candidate_count}件</strong></span></p><p>候補資料は自動的に「必要」には設定されません。<br />外部への連絡も行いません。</p>{canInitialize ? <button type="button" className="dc-button dc-primary" onClick={() => state.setConfirming(true)}><Plus size={17} />資料収集リストを作成</button> : <p>リスト作成は編集権限のある担当者に依頼してください。</p>}</section> : <>
        {mode === 'unavailable' && <div className="dc-feedback"><p>事件類型を設定してください。設定後に資料収集の状態を再確認できます。</p><button className="dc-button" type="button" onClick={state.refresh}>状態を再確認</button></div>}
        {mode === 'empty' && preview.initialization.candidate_count === 0 && <p className="dc-feedback">この事件類型には資料収集ルールが登録されていません。</p>}
        {mode === 'existing' && canInitialize && <div className="dc-candidate-notice"><span>新しい候補資料が {preview.initialization.missing_candidate_count}件あります。</span><button type="button" className="dc-button" onClick={() => state.setConfirming(true)}>候補を追加</button></div>}
        {data && <div className="dc-summary" aria-label="資料収集サマリー"><span>候補 / 全項目 <b>{data.summary.total}</b><small>件</small></span><i /><span>必要 <b>{data.summary.necessity.required}</b></span><span>不要 <b>{data.summary.necessity.not_required}</b></span><span>未判定 <b>{data.summary.necessity.undetermined}</b></span><i /><button type="button" className="dc-danger" onClick={() => state.changeFilter({ overdue: true })}>期限超過 <b>{data.summary.overdue}</b></button><button type="button" className="dc-warning" onClick={() => state.changeFilter({ preservation_priority: true })}><ShieldAlert size={14} />保全優先 <b>{data.summary.preservation_priority}</b></button></div>}
        <div className={`dc-workspace ${selectedId !== null ? 'has-inspector' : ''}`}>
          <div className="dc-master">
            <DocumentCollectionToolbar query={state.query} search={state.search} onSearch={state.setSearch} onChange={state.changeFilter} purposes={purposes} employees={state.employees} employeeError={state.employeeError} />
            {data && <div className="dc-list-caption"><span>確認目的別 <strong>{data.summary.filtered_count}</strong> / {data.summary.total}件</span><span>グループ件数は表示ページ内 · 複数目的は1行</span></div>}
            {state.listError ? <CollectionFeedback error={state.listError} onRetry={state.refresh} onBack={onBack} /> : state.listLoading ? <div className="dc-empty-results" role="status">資料一覧を読み込み中…</div> : data && <CollectionListView items={data.documents.map(item => itemToRow(item))} selectedId={selectedId === null ? null : String(selectedId)} onSelect={id => { if (Number(id) === selectedId || editState.current.saving) return; if (!editState.current.dirty || window.confirm('未保存の変更を破棄して別の資料を開きますか？')) setSelectedId(Number(id)) }} />}
            {data && <div className="dc-pagination"><span>{data.pagination.from ?? 0}–{data.pagination.to ?? 0} / {data.pagination.total}件</span><button type="button" className="dc-button" disabled={state.listLoading || data.pagination.current_page <= 1} onClick={() => state.setPage(data.pagination.current_page - 1)}>前へ</button><span>{data.pagination.current_page} / {data.pagination.last_page}</span><button type="button" className="dc-button" disabled={state.listLoading || data.pagination.current_page >= data.pagination.last_page} onClick={() => state.setPage(data.pagination.current_page + 1)}>次へ</button></div>}
            <div className="dc-list-footer">必要性・取得作業・内容充足・確認は、それぞれ独立して管理します。</div>
          </div>
          {selectedId !== null && <DocumentCollectionInspector key={selectedId} caseId={caseId} itemId={selectedId} canUpdate={canUpdate} employees={state.employees} employeeError={state.employeeError} activities={activities} onHistory={onHistory} onClose={() => { editState.current = { dirty: false, saving: false }; setSelectedId(null) }} onSaved={saved} onEditState={value => { editState.current = value }} />}
        </div>
      </>}
    </>}
    {state.confirming && preview && <InitializationDialog preview={preview} busy={state.initializing} error={state.initializationError} onClose={() => state.setConfirming(false)} onConfirm={() => { if (canUpdate) void state.initialize().then(changed => { if (changed) onChanged() }) }} />}
  </div>
}
