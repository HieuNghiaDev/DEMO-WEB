import { Fragment, lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import axios from 'axios'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowLeft, ArrowRight, Building2, CheckCircle2,
  Clock3, Mail, MoreHorizontal, Phone,
  Plus, RefreshCw, Shield, ShieldCheck, Trash2, UserRound, Users, X,
  CalendarDays, Folder, ChevronRight, Languages,
  LayoutGrid, ClipboardList, SquareCheckBig, History
} from 'lucide-react'

import { useAuth } from '../../contexts/AuthContext'
import { Button } from '../../components/ui/Button'
import { reviewActionError } from '../document-creation/legalApproval'
import i18n from '../../i18n'
import { ButtonSpinner } from '../../components/loading'
import type { CaseViewer } from '../case-management/types'
import { caseWorkspaceApi } from './api'
import './caseWorkspace.css'
import RelatedEntityDrawer from './RelatedEntityDrawer'
import IncidentSummaryEditDrawer from './IncidentSummaryEditDrawer'
import { RelatedEntityAddDrawer } from './RelatedEntityAddDrawer'
import ClientEditDrawer from './ClientEditDrawer'
import CreateCaseTasksDrawer from './CreateCaseTasksDrawer'
import TasksPanel from './TasksPanel'
import CaseHistoryPanel from './CaseHistoryPanel'
import {
  WorkspaceHeader,
  IncidentSummaryCard,
  RelatedEntitiesSection,
  RecentHistoryCard,
  QuickInfoSidebar,
  buildRelatedEntities,
} from './CaseWorkspaceComponents'
import type {
  CaseDeadline, CaseParty, CaseTask, CaseWorkspace,
  RelatedEntity, WorkspaceDocument, WorkspaceResponse, WorkspaceSummary, WorkspaceTab,
} from './types'

type DialogKind = 'deadline' | 'party'
type Props = { caseId: number; user?: CaseViewer; onBack: () => void; onEdit?: () => void; initialNotice?: string; initialTab?: WorkspaceTab; initialCollectionItemId?: number; initialTaskId?: number; initialDocumentId?: number }
const DocumentCollectionPanel = lazy(() => import('../document-collection/DocumentCollectionPanel'))
const RequiredDocumentsPanel = lazy(() => import('../document-collection/components/RequiredDocumentsPanel'))
const InterpretationPanel = lazy(() => import('../interpretation/InterpretationPanel'))

const inputClass = 'h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 dark:border-tm-border dark:bg-tm-control dark:text-[var(--tm-text-primary)] dark:placeholder:text-[var(--tm-text-muted)] dark:focus:border-indigo-400'
const textareaClass = `${inputClass} min-h-24 py-2`
const primaryButton = 'inline-flex h-9 items-center justify-center gap-2 rounded-md bg-indigo-600 px-3.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 active:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-500'
const secondaryButton = 'inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 text-xs font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 dark:border-tm-border dark:bg-tm-surface-elevated dark:text-[var(--tm-text-secondary)] dark:shadow-none dark:hover:bg-tm-surface-hover dark:hover:text-white'

const tabs: Array<{ id: WorkspaceTab; icon: typeof LayoutGrid }> = [
  { id: 'overview', icon: LayoutGrid },
  { id: 'collection', icon: ClipboardList },
  { id: 'documents', icon: Folder },
  { id: 'tasks', icon: SquareCheckBig },
  { id: 'interpretation', icon: Languages },
  { id: 'parties', icon: Users },
  { id: 'timeline', icon: History },
]

export function CaseWorkspaceView(props: Props) {
  return <CaseWorkspacePage {...props} />
}

export default function CaseWorkspacePage(props: Props) {
  const { caseId, onBack, initialNotice, initialTab, initialCollectionItemId, initialTaskId, initialDocumentId } = props
  const { user } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [tab, selectTab] = useState<WorkspaceTab>(initialTab ?? 'overview')
  const [documentToOpen, setDocumentToOpen] = useState(initialDocumentId)
  const setTab = (next: WorkspaceTab) => {
    if (next !== 'documents') setDocumentToOpen(undefined)
    selectTab(next)
  }
  const [data, setData] = useState<WorkspaceResponse | null>(null)
  const [loadedScope, setLoadedScope] = useState('')
  const requestRevision = useRef(0)
  const workspaceScope = `${caseId}:${user?.id ?? 'signed-out'}`
  const activeScope = useRef(workspaceScope)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(initialNotice ?? null)
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const [selectedEntity, setSelectedEntity] = useState<RelatedEntity | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isAddEntityDrawerOpen, setIsAddEntityDrawerOpen] = useState(false)
  const [editingEntity, setEditingEntity] = useState<RelatedEntity | null>(null)
  const [isIncidentDrawerOpen, setIsIncidentDrawerOpen] = useState(false)
  const [isClientEditDrawerOpen, setIsClientEditDrawerOpen] = useState(false)
  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false)
  const [taskDrawerDocumentIds, setTaskDrawerDocumentIds] = useState<number[]>([])
  const [taskToOpen, setTaskToOpen] = useState<number | null>(initialTaskId ?? null)
  const canUpdate = user?.permission_names.includes('case.update') ?? false
  const canManageTasks = user?.permission_names.includes('task.manage') ?? false
  const canReviewTasks = user?.permission_names.includes('task.review') ?? false
  const canReviewDocuments = canUpdate && (user?.permission_names.includes('task.review') ?? false)
  const openTaskDrawer = (documentIds: number[] = []) => {
    setTaskDrawerDocumentIds(documentIds)
    setIsTaskDrawerOpen(true)
  }

  const openEntityDrawer = (entity: RelatedEntity) => {
    setSelectedEntity(entity)
    setIsDrawerOpen(true)
  }

  const reload = async (quiet = false) => {
    if (activeScope.current !== workspaceScope) return false
    const revision = ++requestRevision.current
    if (!quiet) setLoading(true)
    setError(null)
    try {
      const response = await caseWorkspaceApi.show(caseId)
      if (revision !== requestRevision.current) return false
      setData(response)
      setLoadedScope(workspaceScope)
      return true
    } catch (requestError) {
      if (revision !== requestRevision.current) return false
      if (loadedScope !== workspaceScope || (axios.isAxiosError(requestError) && [401, 403, 404].includes(requestError.response?.status ?? 0))) setData(null)
      setLoadedScope(workspaceScope)
      setError(apiError(requestError, t('cases.workspace.loadFailed')))
      return false
    } finally {
      if (revision === requestRevision.current) setLoading(false)
    }
  }

  useEffect(() => {
    activeScope.current = workspaceScope
    const timer = window.setTimeout(() => { setWorking(false); void reload() }, 0)
    return () => { window.clearTimeout(timer); requestRevision.current += 1 }
    // Scope refreshes prevent a newly signed-in account seeing the previous account's tasks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceScope])

  const run = async (action: () => Promise<unknown>, success?: string, contextualError = false, reviewError = false) => {
    const actionScope = workspaceScope
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      await action()
      if (activeScope.current !== actionScope) return false
      if (success) setNotice(success)
      setDialog(null)
      await reload(true)
      return true
    } catch (requestError) {
      if (activeScope.current !== actionScope) return false
      if (contextualError) throw requestError
      const message = apiError(requestError, '処理を完了できませんでした。入力内容を確認してください。')
      setError(reviewError ? reviewActionError(requestError, message) : message)
      return false
    } finally {
      if (activeScope.current === actionScope) setWorking(false)
    }
  }

  const clearNotice = useCallback(() => setNotice(null), [])

  const runTask = (taskId: number, action: () => Promise<CaseTask | null | { task: CaseTask } | void>, success: string, contextualError = false, reviewError = false) => run(async () => {
    const result = await action()
    if (activeScope.current !== workspaceScope) return
    if (result === undefined) return
    const updated = result && 'task' in result ? result.task : result
    // Apply only the server-confirmed task response. Keep the full workspace
    // refresh so linked required-document state and history also stay current.
    setData(current => current ? { ...current, case_file: { ...current.case_file, case_tasks: updated
      ? current.case_file.case_tasks.map(task => task.id === taskId ? { ...task, ...updated } : task)
      : current.case_file.case_tasks.filter(task => task.id !== taskId) } } : current)
  }, success, contextualError, reviewError)

  if (loading || loadedScope !== workspaceScope) return <WorkspaceSkeleton onBack={onBack} taskView={tab === 'tasks'}/>
  if (!data) return <WorkspaceFailure error={error} onBack={onBack} onRetry={() => void reload()}/>

  const caseFile = data.case_file
  const canDecideNecessity = data.can_decide_document_necessity === true
  const openRelatedTask = (taskId: number) => {
    if (!caseFile.case_tasks.some(task => task.id === taskId)) return
    setTaskToOpen(taskId)
    setTab('tasks')
  }
  const dialogTitle: Record<DialogKind, string> = {
    deadline: '期限を追加',
    party: '関係者を追加',
  }

  return <main className="dc-preview cm-page cm-case-detail">
    <nav className="cm-ws-backbar" aria-label="案件ナビゲーション">
      <Button type="button" size="sm" variant="secondary" onClick={onBack} className="cm-ws-backlink" icon={<ArrowLeft size={16} aria-hidden/>}>戻る</Button>
    </nav>

    {error && <div className="cm-alert-banner is-error">{error}</div>}
    {notice && <SuccessToast key={notice} message={notice} onDismiss={clearNotice} />}

    <div className="cm-workspace-shell">
      <WorkspaceHeader
        caseFile={caseFile}
        canUpdate={canUpdate}
        onEdit={canUpdate ? () => setIsClientEditDrawerOpen(true) : undefined}
        onSelectEntity={openEntityDrawer}
      />

      <section className="cm-ws-section cm-ws-navigation" aria-label="案件ナビゲーション">
        <div className="cm-ws-tab-strip">
          <nav className="cm-command-rail cm-ws-tab-rail" aria-label={t('cases.workspace.ariaLabel')} role="tablist">
            {tabs.map(({ id, icon: Icon }, index) => {
              const isActive = tab === id
              const showSeparator = index > 0 && !isActive && tab !== tabs[index - 1].id
              return (
                <Fragment key={id}>
                  {showSeparator && <span className="cm-tab-separator" aria-hidden="true" />}
                  <button
                    type="button"
                    role="tab"
                    className={`cm-rail-tab cm-ws-tab ${isActive ? 'is-active is-selected' : ''}`}
                    onClick={() => setTab(id)}
                    aria-selected={isActive}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon size={19} className="cm-rail-icon cm-ws-tab-icon"/>
                    <span className="cm-ws-tab-label">{t(`cases.tabs.${id}`)}</span>
                    {isActive && <span className="cm-ws-tab-indicator" aria-hidden="true" />}
                  </button>
                </Fragment>
              )
            })}
          </nav>
        </div>
      </section>

      <div className={`cm-tab-content cm-ws-section cm-ws-content-surface ${tab === 'documents' ? 'cm-ws-required-content' : ''}`}>
        {tab === 'collection' && <Suspense fallback={<p role="status" className="py-8 text-center text-sm text-slate-500">{t('cases.workspace.loadingCollection')}</p>}><DocumentCollectionPanel key={caseId} caseId={caseId} initialSelectedId={initialCollectionItemId} canUpdate={canUpdate} canDecideNecessity={canDecideNecessity} canReviewDocuments={canReviewDocuments} canReadEmployees={user?.permission_names.includes('employee.view') ?? false} activities={caseFile.activities} onHistory={() => setTab('timeline')} onBack={onBack} onChanged={() => void reload(true)} /></Suspense>}
        {tab === 'overview' && (
          <OverviewPanel
            caseFile={caseFile}
            summary={data.summary}
            canUpdate={canUpdate}
            onOpenTab={setTab}
            onSelectEntity={openEntityDrawer}
            onOpenAddEntity={() => { setEditingEntity(null); setIsAddEntityDrawerOpen(true) }}
            onEditIncident={() => setIsIncidentDrawerOpen(true)}
          />
        )}
        {tab === 'documents' && <Suspense fallback={<p role="status" className="py-8 text-center text-sm text-slate-500">{t('cases.workspace.loadingDocuments')}</p>}><RequiredDocumentsPanel key={caseId} caseId={caseId} initialSelectedId={documentToOpen} onDocumentClose={() => setDocumentToOpen(undefined)} canUpdate={canUpdate} canDecideNecessity={canDecideNecessity} canManageTasks={canManageTasks} canReviewDocuments={canReviewDocuments} currentEmployeeId={user?.employee?.id} activities={caseFile.activities ?? []} tasks={caseFile.case_tasks} onCandidates={() => setTab('collection')} onHistory={() => setTab('timeline')} onChanged={() => reload(true)} onCreateTasks={openTaskDrawer} onManageTasks={() => setTab('tasks')} onOpenTask={openRelatedTask}/></Suspense>}
        {tab === 'tasks' && <TasksPanel
          key={workspaceScope}
          caseId={caseId}
          tasks={caseFile.case_tasks ?? []}
          initialTaskId={taskToOpen}
          onInitialTaskHandled={() => setTaskToOpen(null)}
          activities={caseFile.activities ?? []}
          canManage={canManageTasks}
          canReview={canReviewTasks}
          working={working}
          error={error}
          onRetry={() => void reload(true)}
          onAdd={() => openTaskDrawer()}
          onUpdate={(task, payload) => runTask(task.id, () => caseWorkspaceApi.updateTask(caseId, task.id, payload), 'タスクを更新しました。')}
          onAccept={(task) => runTask(task.id, () => caseWorkspaceApi.acceptTask(caseId, task.id), 'タスクを受領しました。')}
          onSubmit={(task, file) => runTask(task.id, () => caseWorkspaceApi.submitTask(caseId, task.id, file), 'ファイルを提出しました。', true)}
          onGenerate={(task) => task.case_document_id && navigate(`/quests/${caseId}/documents/${task.case_document_id}/edit`)}
          onApprove={(task) => task.latest_submission ? runTask(task.id, () => caseWorkspaceApi.approveTaskSubmission(caseId, task.id, task.latest_submission!.id), '提出物を承認しました。', false, true) : Promise.resolve(false)}
          onReject={(task, reason) => task.latest_submission ? runTask(task.id, () => caseWorkspaceApi.rejectTaskSubmission(caseId, task.id, task.latest_submission!.id, reason), '提出物を差し戻しました。', false, true) : Promise.resolve(false)}
          onCancel={(task) => runTask(task.id, () => caseWorkspaceApi.deleteTask(caseId, task.id), 'タスクをキャンセルしました。')}
        />}
        {tab === 'deadlines' && <DeadlinesPanel deadlines={caseFile.deadlines ?? []} canUpdate={canUpdate} working={working} onAdd={() => setDialog('deadline')} onComplete={(deadline) => void run(() => caseWorkspaceApi.updateDeadline(caseId, deadline.id, { status: deadline.status === 'completed' ? 'open' : 'completed' }), '期限の状態を更新しました。')} onDelete={(deadline) => confirmDelete(deadline.title) && void run(() => caseWorkspaceApi.deleteDeadline(caseId, deadline.id), '期限を削除しました。')}/>}
        {tab === 'interpretation' && <Suspense fallback={<p role="status" className="py-8 text-center text-sm text-slate-500">通訳依頼を読み込み中…</p>}><InterpretationPanel key={workspaceScope} caseId={caseId} caseLabel={caseFile.reference_number || caseFile.title} clientName={caseFile.client?.name ?? ''} onChanged={() => void reload(true)}/></Suspense>}
        {tab === 'parties' && <PartiesPanel caseFile={caseFile} canUpdate={canUpdate} onAdd={() => { setEditingEntity(null); setIsAddEntityDrawerOpen(true) }} onSelectEntity={openEntityDrawer} onDelete={(party) => confirmDelete(party.name) && void run(() => caseWorkspaceApi.deleteParty(caseId, party.id), '関係者を削除しました。')}/>}
        {tab === 'timeline' && <CaseHistoryPanel key={workspaceScope} caseId={caseId} onChanged={() => reload(true)} onOpenTask={openRelatedTask}/>}
      </div>
    </div>

    {dialog && <WorkspaceDialog title={dialogTitle[dialog]} working={working} onClose={() => !working && setDialog(null)}>
      <CreateItemForm kind={dialog} working={working} onSubmit={(payload) => void run(() => createItem(dialog, caseId, payload), '保存しました。')}/>
    </WorkspaceDialog>}

    <CreateCaseTasksDrawer
      caseId={caseId}
      isOpen={isTaskDrawerOpen}
      initialSelectedIds={taskDrawerDocumentIds}
      onClose={() => { setIsTaskDrawerOpen(false); setTaskDrawerDocumentIds([]) }}
      onCreated={async count => {
        await reload(true)
        setNotice(`${count}件のタスクを作成しました。`)
      }}
    />

    <RelatedEntityDrawer
      entity={selectedEntity}
      isOpen={isDrawerOpen}
      onClose={() => setIsDrawerOpen(false)}
      lastUpdated={selectedEntity?.updatedAt}
      onEdit={canUpdate && !selectedEntity?.originalEmploymentId ? (entity) => {
        setIsDrawerOpen(false)
        setEditingEntity(entity)
        setIsAddEntityDrawerOpen(true)
      } : undefined}
    />

    <RelatedEntityAddDrawer
      isOpen={isAddEntityDrawerOpen}
      onClose={() => { setIsAddEntityDrawerOpen(false); setEditingEntity(null) }}
      caseFile={caseFile}
      initialEntity={editingEntity}
      onAdd={async (newEntity) => {
        const isEmploymentRelation = ['current_employer', 'former_employer', 'dispatch_company', 'dispatch_destination'].includes(newEntity.relationType)
        const partyType = newEntity.relationType === 'opponent_company' ? 'opponent'
          : newEntity.kind === 'company' ? 'employer'
          : newEntity.kind === 'person' ? 'opponent'
          : newEntity.kind === 'insurer' ? 'insurer' : 'other'
        const payload = {
          party_type: partyType,
          entity_type: newEntity.kind,
          relation_type: newEntity.relationType,
          relation_status: isEmploymentRelation ? (newEntity.isCurrent ? 'current' : 'past') : null,
          relationship: newEntity.relationRoleLabel,
          name: newEntity.name,
          organization: newEntity.organizationName || null,
          address: newEntity.address || null,
          phone: newEntity.phone || null,
          email: newEntity.email || null,
          contact_person: newEntity.contactPerson || null,
          reference_number: newEntity.referenceNumber || newEntity.claimNumber || null,
          start_date: isEmploymentRelation ? (newEntity.startDate || null) : null,
          end_date: isEmploymentRelation ? (newEntity.endDate || null) : null,
          is_current: isEmploymentRelation ? (newEntity.isCurrent ?? null) : null,
          metadata: newEntity.metadata || null,
          notes: newEntity.notes || null,
        }
        if (editingEntity?.originalPartyId) {
          await caseWorkspaceApi.updateParty(caseId, editingEntity.originalPartyId, payload)
        } else {
          await caseWorkspaceApi.createParty(caseId, payload)
        }
        await reload(true)
        setNotice(editingEntity
          ? `関係先「${newEntity.name}」を更新しました。`
          : `関係先「${newEntity.name}」を追加しました。`)
      }}
    />

    <IncidentSummaryEditDrawer
      isOpen={isIncidentDrawerOpen}
      onClose={() => setIsIncidentDrawerOpen(false)}
      caseFile={caseFile}
      onSave={async (values) => {
        await caseWorkspaceApi.updateIncident(caseId, {
          incident_summary: values.summary || null,
          occurred_at: values.incidentDate
            ? new Date(`${values.incidentDate}T${values.incidentTime || '00:00'}`).toISOString() : null,
          injury_details: values.injuryContent || null,
          incident_location: values.location || null,
          current_status_memo: values.notes || null,
        })
        await reload(true)
        setNotice('事故・事件概要を更新しました。')
      }}
    />

    <ClientEditDrawer
      isOpen={isClientEditDrawerOpen}
      onClose={() => setIsClientEditDrawerOpen(false)}
      caseFile={caseFile}
      onSave={async (values) => {
        const clientId = caseFile.client?.id
        if (!clientId) throw new Error('依頼者情報が見つかりません。')
        await caseWorkspaceApi.updateClient(clientId, {
          name: values.name || null,
          name_kana: values.name_kana || null,
          birth_date: values.birth_date || null,
          client_type: values.client_type,
          phone: values.phone || null,
          email: values.email || null,
          address: values.address || null,
        })
        await reload(true)
        setNotice('依頼者情報を更新しました。')
      }}
    />
  </main>
}

function OverviewPanel({
  caseFile,
  summary,
  canUpdate,
  onOpenTab,
  onSelectEntity,
  onOpenAddEntity,
  onEditIncident,
}: {
  caseFile: CaseWorkspace
  summary?: WorkspaceSummary | null
  canUpdate: boolean
  onOpenTab: (tab: WorkspaceTab) => void
  onSelectEntity: (entity: RelatedEntity) => void
  onOpenAddEntity?: () => void
  onEditIncident?: () => void
}) {
  const deadlines = caseFile?.deadlines ?? []
  const urgent = deadlines.filter((item) => item.status === 'open' && remainingDays(item.due_at) <= 7)

  const docs = (caseFile?.documents ?? []) as Array<WorkspaceDocument & { necessity_status?: string }>
  const undeterminedCount = docs.filter((d) => d.necessity_status === 'undetermined' || (!d.necessity_status && d.requirement_level === 'conditional')).length
  const requiredCount = docs.filter((d) => d.necessity_status === 'required' || (!d.necessity_status && d.requirement_level === 'required')).length

  const baseEntities = buildRelatedEntities(caseFile)
  const relatedEntities = baseEntities

  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({
    incident: true,
    entities: true,
    quick: true,
    workflow: true,
    history: true,
  })

  const toggleAccordion = (key: string) => {
    setOpenAccordions((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end"><Button size="sm" variant="outline" icon={<CalendarDays size={15}/>} onClick={() => onOpenTab('deadlines')}>期限管理を開く</Button></div>
      {/* Desktop 2-Column Command Layout */}
      <div className="cm-ws-overview-layout">
        <div className="cm-ws-left-col">
          <IncidentSummaryCard
            caseFile={caseFile}
            onEdit={canUpdate ? onEditIncident : undefined}
          />
          <RelatedEntitiesSection
            entities={relatedEntities}
            onSelectEntity={onSelectEntity}
            onAddEntity={canUpdate ? onOpenAddEntity : undefined}
          />
        </div>

        <div className="cm-ws-right-col">
          <QuickInfoSidebar summary={summary} urgentCount={urgent.length} />
          <WorkflowLinksSection
            undeterminedCount={undeterminedCount}
            requiredCount={requiredCount}
            onOpenTab={onOpenTab}
          />
        </div>

        <div className="cm-ws-full-col">
          <RecentHistoryCard
            activities={caseFile.activities}
            onViewAll={() => onOpenTab('timeline')}
          />
        </div>
      </div>

      {/* Mobile Accordion Layout (Reusing the exact same components) */}
      <div className="cm-ws-overview-mobile space-y-2">
        <MobileAccordionSection
          title="事故・事件概要"
          icon={Shield}
          isOpen={openAccordions.incident}
          onToggle={() => toggleAccordion('incident')}
        >
          <IncidentSummaryCard
            caseFile={caseFile}
            onEdit={canUpdate ? onEditIncident : undefined}
            hideTitle
          />
        </MobileAccordionSection>

        <MobileAccordionSection
          title="関係先"
          icon={Users}
          isOpen={openAccordions.entities}
          onToggle={() => toggleAccordion('entities')}
        >
          <RelatedEntitiesSection
            entities={relatedEntities}
            onSelectEntity={onSelectEntity}
            onAddEntity={canUpdate ? onOpenAddEntity : undefined}
          />
        </MobileAccordionSection>

        <MobileAccordionSection
          title="クイック情報"
          icon={CheckCircle2}
          isOpen={openAccordions.quick}
          onToggle={() => toggleAccordion('quick')}
        >
          <QuickInfoSidebar summary={summary} urgentCount={urgent.length} />
        </MobileAccordionSection>

        <MobileAccordionSection
          title="資料ワークフロー"
          icon={Folder}
          isOpen={openAccordions.workflow}
          onToggle={() => toggleAccordion('workflow')}
        >
          <WorkflowLinksSection
            undeterminedCount={undeterminedCount}
            requiredCount={requiredCount}
            onOpenTab={onOpenTab}
          />
        </MobileAccordionSection>

        <MobileAccordionSection
          title="最近の履歴"
          icon={Clock3}
          isOpen={openAccordions.history}
          onToggle={() => toggleAccordion('history')}
        >
          <RecentHistoryCard
            activities={caseFile.activities}
            onViewAll={() => onOpenTab('timeline')}
          />
        </MobileAccordionSection>
      </div>
    </div>
  )
}

function SuccessToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const [closing, setClosing] = useState(false)
  const autoDismissTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)

  const dismiss = useCallback(() => {
    if (autoDismissTimer.current !== null) window.clearTimeout(autoDismissTimer.current)
    if (closing) return
    setClosing(true)
    closeTimer.current = window.setTimeout(onDismiss, 170)
  }, [closing, onDismiss])

  useEffect(() => {
    autoDismissTimer.current = window.setTimeout(() => {
      setClosing(true)
      closeTimer.current = window.setTimeout(onDismiss, 170)
    }, 6000)

    return () => {
      if (autoDismissTimer.current !== null) window.clearTimeout(autoDismissTimer.current)
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    }
  }, [message, onDismiss])

  return createPortal(
    <div className="cm-success-toast-region" aria-live="polite" aria-atomic="true">
      <div className={`cm-success-toast ${closing ? 'is-closing' : ''}`} role="status">
        <span className="cm-success-toast-icon" aria-hidden="true">
          <CheckCircle2 size={17} />
        </span>
        <span className="cm-success-toast-message">{message}</span>
        <button type="button" className="cm-success-toast-close" onClick={dismiss} aria-label="通知を閉じる">
          <X size={16} aria-hidden="true" />
        </button>
        <span className="cm-success-toast-progress" aria-hidden="true" />
      </div>
    </div>,
    document.body,
  )
}

function WorkflowLinksSection({
  undeterminedCount,
  requiredCount,
  onOpenTab,
}: {
  undeterminedCount: number
  requiredCount: number
  onOpenTab: (tab: WorkspaceTab) => void
}) {
  return (
    <section className="cm-ws-card cm-ws-workflow-card">
      <div className="cm-ws-card-header cm-ws-workflow-header">
        <div className="cm-ws-card-title-wrap">
          <div className="cm-ws-title-iconbox">
            <Folder size={16} />
          </div>
          <h2 className="cm-ws-card-title">資料ワークフロー</h2>
        </div>
      </div>
      <div className="cm-ws-workflow-list">
        <button
          type="button"
          onClick={() => onOpenTab('collection')}
          className="cm-ws-workflow-link"
        >
          <div className="cm-ws-workflow-link-main">
            <div className="cm-ws-workflow-link-title">資料収集</div>
            <div className="cm-ws-workflow-link-sub">
              未判定 {undeterminedCount}件 · 必要 {requiredCount}件
            </div>
          </div>
          <ArrowRight size={15} className="cm-ws-workflow-link-arrow" />
        </button>
        <button
          type="button"
          onClick={() => onOpenTab('documents')}
          className="cm-ws-workflow-link"
        >
          <div className="cm-ws-workflow-link-main">
            <div className="cm-ws-workflow-link-title">必要資料一覧</div>
            <div className="cm-ws-workflow-link-sub">
              必要書類 {requiredCount}件
            </div>
          </div>
          <ArrowRight size={15} className="cm-ws-workflow-link-arrow" />
        </button>
      </div>
    </section>
  )
}

function MobileAccordionSection({
  title,
  icon: Icon,
  isOpen,
  onToggle,
  children,
}: {
  title: string
  icon: typeof Shield
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="cm-ws-accordion-item">
      <button
        type="button"
        className="cm-ws-accordion-btn"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-blue-600 dark:text-blue-400" />
          <span>{title}</span>
        </div>
        <ChevronRight
          size={16}
          className={`transition-transform duration-200 text-slate-400 ${isOpen ? 'rotate-90' : ''}`}
        />
      </button>
      {isOpen && <div className="cm-ws-accordion-content pt-3">{children}</div>}
    </div>
  )
}


function DeadlinesPanel({ deadlines, canUpdate, working, onAdd, onComplete, onDelete }: { deadlines: CaseDeadline[]; canUpdate: boolean; working: boolean; onAdd: () => void; onComplete: (deadline: CaseDeadline) => void; onDelete: (deadline: CaseDeadline) => void }) { return <><PanelToolbar title="期限管理" description="在留期限、提出期限、追加資料期限、時効を一元管理します。" actions={canUpdate && <button type="button" onClick={onAdd} className={primaryButton}><Plus size={16}/>期限を追加</button>}/><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{deadlines.map((deadline) => { const days = remainingDays(deadline.due_at); const isDone = deadline.status === 'completed'; return <article key={deadline.id} className={`border-l-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-tm-border dark:bg-tm-surface-elevated ${isDone ? 'border-l-green-500' : days < 0 ? 'border-l-red-500' : days <= 7 ? 'border-l-amber-500' : 'border-l-blue-500'}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-slate-500">{deadlineTypeLabel(deadline.deadline_type)}</p><h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{deadline.title}</h3></div><PriorityBadge priority={deadline.priority}/></div><div className="mt-4 flex items-end justify-between"><div><p className="text-lg font-semibold text-slate-900 dark:text-white">{shortDate(deadline.due_at)}</p><p className={`mt-1 text-xs font-medium ${isDone ? 'text-green-600' : days < 0 ? 'text-red-600' : days <= 7 ? 'text-amber-600' : 'text-slate-500'}`}>{isDone ? '完了済み' : days < 0 ? `${Math.abs(days)}日超過` : `残り${days}日`}</p></div>{canUpdate && <div className="flex gap-1"><button type="button" disabled={working} onClick={() => onComplete(deadline)} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-500/10"><CheckCircle2 size={17}/></button><button type="button" onClick={() => onDelete(deadline)} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"><Trash2 size={16}/></button></div>}</div></article>})}{deadlines.length === 0 && <div className="md:col-span-2 xl:col-span-3"><EmptyRow text="期限はまだ登録されていません。"/></div>}</div></> }

function getEntitySecondaryDescription(entity: RelatedEntity, originalParty?: CaseParty | null): string {
  if (entity.relationType === 'current_employer') {
    return '勤務先・現在の勤務先'
  }
  if (entity.relationType === 'former_employer') {
    return '勤務先・過去の勤務先'
  }
  if (entity.relationType === 'dispatch_company') {
    return '勤務先・派遣元会社'
  }
  if (entity.relationType === 'dispatch_destination') {
    return '勤務先・派遣先会社'
  }
  if (entity.kind === 'police' || entity.relationType === 'police') {
    return `その他・${entity.name}`
  }
  if (entity.kind === 'insurer' || entity.relationType === 'own_insurer' || entity.relationType === 'opponent_insurer') {
    const side = entity.statusBadgeLabel === '本人側保険会社' || entity.insuranceSide === 'own' ? '本人側' : '相手方'
    return `保険会社・${side}`
  }
  if (entity.relationType === 'opponent_company') {
    return 'その他・加害者側会社'
  }
  if (originalParty?.party_type && originalParty.party_type !== 'other') {
    const typeLabel = ({
      client: '依頼者',
      family: '家族',
      employer: '勤務先',
      opponent: '相手方',
      insurer: '保険会社',
      medical: '医療機関',
      supporter: '支援者',
    } as Record<string, string>)[originalParty.party_type] || 'その他'
    return `${typeLabel}・${entity.relationRoleLabel || entity.name}`
  }
  return entity.organizationName || entity.relationshipDetail || entity.relationRoleLabel || '関係先'
}

function PartiesPanel({ caseFile, canUpdate, onAdd, onSelectEntity, onDelete }: { caseFile: CaseWorkspace; canUpdate: boolean; onAdd: () => void; onSelectEntity: (entity: RelatedEntity) => void; onDelete: (party: CaseParty) => void }) {
  const entities = buildRelatedEntities(caseFile)
  const client = caseFile.client
  return (
    <>
      <PanelToolbar
        title="関係者"
        description="依頼者、家族、勤務先、相手方、保険会社、医療機関を管理します。"
        actions={canUpdate && <button type="button" onClick={onAdd} className={primaryButton}><Plus size={16}/>関係者を追加</button>}
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {/* Pinned client card — always first */}
        <PartiesEntityCard
          roleLabel="依頼者"
          roleTone="violet"
          name={client.name || '氏名未登録'}
          secondary={client.name_kana || '依頼者'}
          phone={client.phone}
          email={client.email}
          kind="person"
          canUpdate={canUpdate}
        />
        {/* Related entities derived from parties + employments */}
        {entities.map((entity) => {
          const originalParty = entity.originalPartyId
            ? (caseFile.parties ?? []).find((p) => p.id === entity.originalPartyId) ?? null
            : null
          const canDelete = canUpdate && !!originalParty
          const isOpponent = entity.relationType === 'opponent_insurer' || entity.statusBadgeLabel === '相手方保険会社' || entity.insuranceSide === 'opponent'
          const accentBorder = entity.relationType === 'opponent_company' ? 'orange' : isOpponent ? 'amber' : undefined
          const subRoleLabel = entity.relationType === 'opponent_company' ? '加害車両所有会社' : null

          return (
            <PartiesEntityCard
              key={entity.id}
              roleLabel={entity.statusBadgeLabel || entity.relationRoleLabel}
              roleTone={entity.statusBadgeTone}
              subRoleLabel={subRoleLabel}
              name={entity.name}
              secondary={getEntitySecondaryDescription(entity, originalParty)}
              phone={entity.phone}
              email={entity.email}
              kind={entity.kind}
              isOpponent={isOpponent}
              accentBorder={accentBorder}
              canUpdate={canUpdate}
              onClick={() => onSelectEntity(entity)}
              onDelete={canDelete && originalParty ? () => onDelete(originalParty) : undefined}
            />
          )
        })}
        {entities.length === 0 && (
          <div className="md:col-span-2 xl:col-span-3">
            <EmptyRow text="関係者はまだ登録されていません。" />
          </div>
        )}
      </div>
    </>
  )
}

type PartiesEntityCardProps = {
  roleLabel: string
  roleTone?: import('./types').EntityBadgeTone
  subRoleLabel?: string | null
  name: string
  secondary?: string | null
  phone?: string | null
  email?: string | null
  kind: import('./types').EntityKind | 'insurance_company'
  isOpponent?: boolean
  accentBorder?: 'orange' | 'amber'
  canUpdate?: boolean
  onClick?: () => void
  onDelete?: () => void
}

function PartiesEntityCard({
  roleLabel,
  roleTone,
  subRoleLabel,
  name,
  secondary,
  phone,
  email,
  kind,
  isOpponent = false,
  accentBorder,
  canUpdate = false,
  onClick,
  onDelete,
}: PartiesEntityCardProps) {
  const iconEl = (() => {
    switch (kind) {
      case 'person': return <UserRound size={19} />
      case 'organization': return <Users size={19} />
      case 'insurer': return isOpponent ? <Shield size={19} /> : <ShieldCheck size={19} />
      case 'police': return <Shield size={19} />
      default: return <Building2 size={19} />
    }
  })()

  const tone = roleTone ?? 'slate'
  const accentClass = accentBorder === 'orange' ? ' cw-pt-card--accent-orange' : accentBorder === 'amber' ? ' cw-pt-card--accent-amber' : ''

  return (
    <article
      className={`cw-pt-card${accentClass}${onClick ? ' cw-pt-card--clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `${name} の詳細を開く` : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
    >
      {/* Top area */}
      <div className="cw-pt-top-row">
        <div className={`cw-pt-icon-tile cw-pt-icon-tile--${tone}`}>
          {iconEl}
        </div>

        <div className="cw-pt-center-col">
          <div className="cw-pt-role-row">
            <span className={`cw-pt-role-pill cw-pt-role-pill--${tone}`}>
              <span className={`cw-pt-pill-dot cw-pt-pill-dot--${tone}`} />
              {roleLabel}
            </span>
            {subRoleLabel && (
              <span className="cw-pt-sub-tag">
                {subRoleLabel}
              </span>
            )}
          </div>

          <p className="cw-pt-name" title={name}>{name}</p>

          {secondary && <p className="cw-pt-secondary" title={secondary}>{secondary}</p>}
        </div>

        <div className="cw-pt-actions">
          <button
            type="button"
            className="cw-pt-action-btn"
            onClick={(e) => { e.stopPropagation(); onClick?.() }}
            aria-label={`${name} の詳細を表示`}
            title="詳細を表示"
          >
            <MoreHorizontal size={14} />
          </button>
          {canUpdate && (
            <button
              type="button"
              className={`cw-pt-action-btn cw-pt-action-btn--delete ${!onDelete ? 'opacity-40 cursor-not-allowed' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                if (onDelete) {
                  onDelete()
                } else {
                  window.alert('依頼者データは削除できません。')
                }
              }}
              aria-label={`${name}を削除`}
              title={onDelete ? `${name}を削除` : '依頼者データは削除できません'}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Bottom area: Contact row */}
      {(phone || email) && (
        <div className="cw-pt-contacts">
          {phone && (
            <span className="cw-pt-contact-item">
              <Phone size={12.5} className="cw-pt-contact-icon" />
              <span>{phone}</span>
            </span>
          )}
          {email && (
            <span className="cw-pt-contact-item">
              <Mail size={12.5} className="cw-pt-contact-icon" />
              <span className="truncate">{email}</span>
            </span>
          )}
        </div>
      )}
    </article>
  )
}


function CreateItemForm({ kind, working, onSubmit }: { kind: DialogKind; working: boolean; onSubmit: (payload: Record<string, unknown>) => void }) {
  const [fields, setFields] = useState<Record<string, string>>({ status: 'pending', priority: 'normal', party_type: 'other', deadline_type: 'submission', activity_type: 'communication', channel: 'meeting', occurred_at: localDateTime() })
  const update = (name: string, value: string) => setFields((current) => ({ ...current, [name]: value }))
  const submit = (event: React.FormEvent) => { event.preventDefault(); const payload = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value || null])); onSubmit(payload) }
  return <form onSubmit={submit} className="space-y-4">
    {kind === 'deadline' && <><Field label="期限名 *"><input required value={fields.title ?? ''} onChange={(e) => update('title', e.target.value)} className={inputClass}/></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="期限種別"><select value={fields.deadline_type} onChange={(e) => update('deadline_type', e.target.value)} className={inputClass}><option value="residence">在留期限</option><option value="submission">提出期限</option><option value="additional">追加資料期限</option><option value="limitation">時効</option><option value="document">書類期限</option><option value="internal">内部期限</option><option value="other">その他</option></select></Field><Field label="優先度"><PrioritySelect value={fields.priority} onChange={(value) => update('priority', value)}/></Field></div><Field label="日時 *"><input required type="datetime-local" value={fields.due_at ?? ''} onChange={(e) => update('due_at', e.target.value)} className={inputClass}/></Field><Field label="補足"><textarea value={fields.notes ?? ''} onChange={(e) => update('notes', e.target.value)} className={textareaClass}/></Field></>}
    {kind === 'party' && <><div className="grid gap-3 sm:grid-cols-2"><Field label="関係者区分"><select value={fields.party_type} onChange={(e) => update('party_type', e.target.value)} className={inputClass}><option value="family">家族</option><option value="employer">勤務先</option><option value="opponent">相手方</option><option value="insurer">保険会社</option><option value="medical">医療機関</option><option value="supporter">支援者</option><option value="other">その他</option></select></Field><Field label="氏名 *"><input required value={fields.name ?? ''} onChange={(e) => update('name', e.target.value)} className={inputClass}/></Field></div><Field label="組織名"><input value={fields.organization ?? ''} onChange={(e) => update('organization', e.target.value)} className={inputClass}/></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="電話"><input value={fields.phone ?? ''} onChange={(e) => update('phone', e.target.value)} className={inputClass}/></Field><Field label="メール"><input type="email" value={fields.email ?? ''} onChange={(e) => update('email', e.target.value)} className={inputClass}/></Field></div></>}
    <div className="flex justify-end border-t border-slate-200 pt-4 dark:border-white/10"><button type="submit" disabled={working} className={primaryButton}>{working && <ButtonSpinner size={14}/>} {working ? '保存中…' : '保存する'}</button></div>
  </form>
}

function WorkspaceDialog({ title, working, onClose, children }: { title: string; working: boolean; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:items-center sm:p-6" onMouseDown={onClose}><section role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-tm-border dark:bg-tm-surface-elevated dark:shadow-[var(--tm-shadow-lg)]"><header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 dark:border-tm-border dark:bg-tm-surface-elevated"><h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2><button type="button" disabled={working} onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"><X size={18}/></button></header><div className="p-5">{children}</div></section></div> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1.5"><span className="text-xs font-medium text-slate-700 dark:text-slate-300">{label}</span>{children}</label> }
function PrioritySelect({ value, onChange }: { value: string; onChange: (value: string) => void }) { return <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}><option value="low">低</option><option value="normal">通常</option><option value="high">高</option><option value="critical">最優先</option></select> }
function PanelToolbar({ title, description, actions }: { title: string; description: string; actions?: React.ReactNode }) { return <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-semibold text-slate-950 dark:text-white">{title}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p></div>{actions && <div className="flex flex-wrap gap-2">{actions}</div>}</div> }

function EmptyRow({ text }: { text: string }) { return <div className="flex min-h-24 items-center justify-center px-4 py-8 text-center text-sm text-slate-500"><ShieldCheck size={18} className="mr-2 text-slate-400"/>{text}</div> }
function PriorityBadge({ priority, translated = false }: { priority: CaseTask['priority'] | CaseDeadline['priority']; translated?: boolean }) { const { t } = useTranslation(); const config = { low: ['低', 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'], normal: ['通常', 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'], high: ['高', 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'], critical: ['最優先', 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'] }[priority]; return <span className={`inline-flex h-6 items-center rounded-md px-2 text-xs font-medium ${config[1]}`}>{translated ? t(`cases.priority.${priority}`) : config[0]}</span> }

function WorkspaceSkeleton({ onBack, taskView = false }: { onBack: () => void; taskView?: boolean }) { const { t } = useTranslation(); return <div className="p-5"><button type="button" onClick={onBack} className={secondaryButton}><ArrowLeft size={16}/>{t('cases.workspace.backToList')}</button><div className="mt-4 h-52 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-tm-border dark:bg-tm-surface-elevated"/>{taskView ? <div className="cm-task-loading" role="status" aria-label="タスクを読み込み中…"><span className="sr-only">タスクを読み込み中…</span><div className="cm-task-loading-title"/>{[0, 1, 2, 3].map(row => <div key={row} className="cm-task-loading-row"><span/><span/><span/><span/></div>)}</div> : <div className="mt-4 h-96 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-tm-border dark:bg-tm-surface-elevated"/>}</div> }
function WorkspaceFailure({ error, onBack, onRetry }: { error: string | null; onBack: () => void; onRetry: () => void }) { const { t } = useTranslation(); return <div className="p-5"><button type="button" onClick={onBack} className={secondaryButton}><ArrowLeft size={16}/>{t('cases.workspace.backToList')}</button><div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-500/30 dark:bg-red-500/10"><AlertTriangle className="mx-auto text-red-500"/><h1 className="mt-3 text-lg font-semibold text-red-800 dark:text-red-200">{t('cases.workspace.loadFailed')}</h1><p className="mt-1 text-sm text-red-600 dark:text-red-300">{error}</p><button type="button" onClick={onRetry} className={`${primaryButton} mt-4`}><RefreshCw size={16}/>{t('cases.workspace.retry')}</button></div></div> }

async function createItem(kind: DialogKind, caseId: number, payload: Record<string, unknown>) { return kind === 'deadline' ? caseWorkspaceApi.createDeadline(caseId, payload) : caseWorkspaceApi.createParty(caseId, payload) }
function confirmDelete(name: string) { return window.confirm(`「${name}」を削除しますか？この操作は画面上から取り消せません。`) }
function apiError(error: unknown, fallback: string) { if (!axios.isAxiosError(error)) return fallback; const validation = error.response?.data?.errors as Record<string, string[]> | undefined; return validation ? Object.values(validation).flat()[0] : error.response?.data?.message ?? fallback }
function shortDate(value: string) { return new Intl.DateTimeFormat(i18n.language, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)) }
function remainingDays(value: string) { const target = new Date(value); const today = new Date(); target.setHours(0, 0, 0, 0); today.setHours(0, 0, 0, 0); return Math.ceil((target.getTime() - today.getTime()) / 86400000) }
function localDateTime() { const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); return date.toISOString().slice(0, 16) }
function deadlineTypeLabel(type: CaseDeadline['deadline_type']) { return ({ residence: '在留期限', submission: '提出期限', additional: '追加資料期限', limitation: '時効', document: '書類期限', internal: '内部期限', other: 'その他' } as Record<string, string>)[type] }
