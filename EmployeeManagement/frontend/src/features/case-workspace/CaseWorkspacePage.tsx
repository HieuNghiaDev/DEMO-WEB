import { lazy, Suspense, useEffect, useState } from 'react'
import axios from 'axios'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, CircleGauge,
  Clock3, Files, ListChecks, Mail, MessageSquareText, Pencil, Phone,
  Plus, RefreshCw, ShieldCheck, Trash2, UserRound, X,
  FolderOpen, Flag, Globe, CalendarDays, Target, MapPin, UserPlus, CalendarPlus
} from 'lucide-react'

import { useAuth } from '../../contexts/AuthContext'
import i18n from '../../i18n'
import { generatedCaseTitle } from '../case-management/helpers'
import type { CaseViewer } from '../case-management/types'
import { caseWorkspaceApi } from './api'
import type {
  CaseActivity, CaseDeadline, CaseParty, CaseTask, CaseWorkspace,
  WorkspaceResponse, WorkspaceSummary, WorkspaceTab,
} from './types'

type DialogKind = 'task' | 'deadline' | 'party' | 'activity'
type Props = { caseId: number; onBack: () => void; onEdit?: () => void; initialNotice?: string }
const DocumentCollectionPanel = lazy(() => import('../document-collection/DocumentCollectionPanel'))
const RequiredDocumentsPanel = lazy(() => import('../document-collection/components/RequiredDocumentsPanel'))

const inputClass = 'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
const textareaClass = `${inputClass} min-h-24 py-2.5`
const primaryButton = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400'
const secondaryButton = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'

const tabs: Array<{ id: WorkspaceTab; icon: typeof Files }> = [
  { id: 'overview', icon: CircleGauge },
  { id: 'collection', icon: ListChecks },
  { id: 'documents', icon: Files },
  { id: 'timeline', icon: MessageSquareText },
]

export default function CaseWorkspacePage(props: Props) {
  const { user } = useAuth()
  return <CaseWorkspaceView {...props} user={user}/>
}

export function CaseWorkspaceView({ caseId, onBack, onEdit, initialNotice, user }: Props & { user: CaseViewer }) {
  const { t } = useTranslation()
  const [data, setData] = useState<WorkspaceResponse | null>(null)
  const [tab, setTab] = useState<WorkspaceTab>('overview')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(initialNotice ?? null)
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const canUpdate = user?.permission_names.includes('case.update') ?? false
  const canReviewDocuments = canUpdate && (user?.role_names.some(role => role === 'level_4' || role === 'level_5') ?? false)

  const reload = async (quiet = false) => {
    if (!quiet) setLoading(true)
    setError(null)
    try {
      setData(await caseWorkspaceApi.show(caseId))
    } catch (requestError) {
      setError(apiError(requestError, t('cases.workspace.loadFailed')))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void reload() }, 0)
    return () => window.clearTimeout(timer)
    // `reload` intentionally reads the current case id; changing case id remounts this workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId])

  const run = async (action: () => Promise<unknown>, success?: string) => {
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      await action()
      if (success) setNotice(success)
      setDialog(null)
      await reload(true)
    } catch (requestError) {
      setError(apiError(requestError, '処理を完了できませんでした。入力内容を確認してください。'))
    } finally {
      setWorking(false)
    }
  }

  if (loading) return <WorkspaceSkeleton onBack={onBack}/>
  if (!data) return <WorkspaceFailure error={error} onBack={onBack} onRetry={() => void reload()}/>

  const caseFile = data.case_file
  const dialogTitle: Record<DialogKind, string> = {
    task: 'タスクを追加', deadline: '期限を追加',
    party: '関係者を追加', activity: '連絡・イベントを記録',
  }

  return <main className="dc-preview cm-page">
    <div className="cm-backbar">
      <button type="button" onClick={onBack} className="dc-button">
        <ArrowLeft size={17}/>{t('cases.workspace.backToList')}
      </button>
    </div>

    <WorkspaceHeader caseFile={caseFile} onEdit={canUpdate ? onEdit : undefined}/>

    {(error || notice) && <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300' : 'border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300'}`}>{error ?? notice}</div>}

    <section className="cm-surface cm-workspace-tabs">
      <nav aria-label={t('cases.workspace.ariaLabel')}>
        {tabs.map(({ id, icon: Icon }) => <button key={id} type="button" onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}><Icon size={16}/>{t(`cases.tabs.${id}`)}</button>)}
      </nav>
      <div className="cm-tab-content">
        {tab === 'collection' && <Suspense fallback={<p role="status" className="py-8 text-center text-sm text-slate-500">{t('cases.workspace.loadingCollection')}</p>}><DocumentCollectionPanel key={caseId} caseId={caseId} canUpdate={canUpdate} canReviewDocuments={canReviewDocuments} canReadEmployees={user?.permission_names.includes('employee.view') ?? false} activities={caseFile.activities} onHistory={() => setTab('timeline')} onBack={onBack} onChanged={() => void reload(true)} /></Suspense>}
        {tab === 'overview' && <OverviewPanel caseFile={caseFile} summary={data.summary} onOpenTab={setTab}/>}
        {tab === 'documents' && <Suspense fallback={<p role="status" className="py-8 text-center text-sm text-slate-500">{t('cases.workspace.loadingDocuments')}</p>}><RequiredDocumentsPanel key={caseId} caseId={caseId} canUpdate={canUpdate} canReviewDocuments={canReviewDocuments} canReadEmployees={user?.permission_names.includes('employee.view') ?? false} activities={caseFile.activities} onCandidates={() => setTab('collection')} onHistory={() => setTab('timeline')} onChanged={() => void reload(true)}/></Suspense>}
        {tab === 'tasks' && <TasksPanel tasks={caseFile.case_tasks} canUpdate={canUpdate} working={working} onAdd={() => setDialog('task')} onStatus={(task, status) => void run(() => caseWorkspaceApi.updateTask(caseId, task.id, { status }), 'タスクを更新しました。')} onDelete={(task) => confirmDelete(task.title) && void run(() => caseWorkspaceApi.deleteTask(caseId, task.id), 'タスクを削除しました。')}/>}
        {tab === 'deadlines' && <DeadlinesPanel deadlines={caseFile.deadlines} canUpdate={canUpdate} working={working} onAdd={() => setDialog('deadline')} onComplete={(deadline) => void run(() => caseWorkspaceApi.updateDeadline(caseId, deadline.id, { status: deadline.status === 'completed' ? 'open' : 'completed' }), '期限の状態を更新しました。')} onDelete={(deadline) => confirmDelete(deadline.title) && void run(() => caseWorkspaceApi.deleteDeadline(caseId, deadline.id), '期限を削除しました。')}/>}
        {tab === 'parties' && <PartiesPanel client={caseFile.client} parties={caseFile.parties} canUpdate={canUpdate} onAdd={() => setDialog('party')} onDelete={(party) => confirmDelete(party.name) && void run(() => caseWorkspaceApi.deleteParty(caseId, party.id), '関係者を削除しました。')}/>}
        {tab === 'timeline' && <TimelinePanel activities={caseFile.activities} canUpdate={canUpdate} onAdd={() => setDialog('activity')}/>}
      </div>
    </section>

    {dialog && <WorkspaceDialog title={dialogTitle[dialog]} working={working} onClose={() => !working && setDialog(null)}>
      <CreateItemForm kind={dialog} working={working} onSubmit={(payload) => void run(() => createItem(dialog, caseId, payload), '保存しました。')}/>
    </WorkspaceDialog>}
  </main>
}

function WorkspaceHeader({ caseFile, onEdit }: { caseFile: CaseWorkspace; onEdit?: () => void }) {
  const { t } = useTranslation()
  const code = caseFile.reference_number || `CASE-${String(caseFile.id).padStart(6, '0')}`
  const caseType = caseFile.case_type_option?.parent ? `${caseFile.case_type_option.parent.name} / ${caseFile.case_type_option.name}` : caseFile.case_type ?? t('cases.workspace.unclassified')
  const customTitle = caseFile.title !== generatedCaseTitle(caseFile.client.name, caseFile.case_type_option?.name ?? caseFile.case_type ?? '') ? caseFile.title : ''
  const caseTypeStr = caseFile.case_type === 'その他' && caseFile.case_type_other ? `${caseType}：${caseFile.case_type_other}` : caseType

  return <div className="cm-workspace-header">
    <div className="cm-wh-top">
      <div className="cm-wh-title">
        <div className="flex items-center gap-3">
          <h1>{caseFile.client.name}</h1>
          <CaseStatusBadge status={caseFile.status}/>
        </div>
        <p className="cm-wh-code">{customTitle ? <><span className="cm-code-pill">{code}</span> <span className="cm-code-desc">{customTitle}</span></> : <span className="cm-code-pill">{code}</span>}</p>
      </div>
      <div className="cm-wh-actions">
        {onEdit && <button type="button" className="dc-button" onClick={onEdit}><Pencil size={15}/>{t('cases.workspace.edit')}</button>}
      </div>
    </div>
    <div className="cm-wh-meta">
      <div className="cm-wh-group cm-wh-group--1">
        <dl>
          <div><dt aria-label={t('cases.workspace.caseType')} data-tooltip={t('cases.workspace.caseType')}><FolderOpen size={15}/></dt><dd title={caseTypeStr}>{presentWorkspaceCaseType(caseTypeStr, t)}</dd></div>
          <div><dt aria-label={t('cases.workspace.assignee')} data-tooltip={t('cases.workspace.assignee')}><UserRound size={15}/></dt><dd>{caseFile.assigned_employee?.full_name ?? t('cases.workspace.unassigned')}</dd></div>
          <div><dt aria-label={t('cases.workspace.priority')} data-tooltip={t('cases.workspace.priority')}><Flag size={15}/></dt><dd><PriorityBadge priority={caseFile.priority ?? 'normal'} translated/></dd></div>
        </dl>
      </div>
      <div className="cm-wh-group cm-wh-group--2">
        <dl>
          <div><dt aria-label={t('cases.workspace.phone')} data-tooltip={t('cases.workspace.phone')}><Phone size={15}/></dt><dd>{caseFile.client.phone || t('cases.workspace.notRegistered')}</dd></div>
          <div><dt aria-label={t('cases.workspace.email')} data-tooltip={t('cases.workspace.email')}><Mail size={15}/></dt><dd title={caseFile.client.email || t('cases.workspace.notRegistered')}>{caseFile.client.email || t('cases.workspace.notRegistered')}</dd></div>
          <div><dt aria-label={t('cases.workspace.nationality')} data-tooltip={t('cases.workspace.nationality')}><Globe size={15}/></dt><dd>{caseFile.client.nationality || t('cases.workspace.notRegistered')}</dd></div>
        </dl>
      </div>
      <div className="cm-wh-group cm-wh-group--3">
        <dl>
          <div><dt aria-label={t('cases.workspace.openedAt')} data-tooltip={t('cases.workspace.openedAt')}><CalendarDays size={15}/></dt><dd>{caseFile.opened_at?.slice(0,10) || t('cases.workspace.notSet')}</dd></div>
          <div><dt aria-label={t('cases.workspace.targetCompletion')} data-tooltip={t('cases.workspace.targetCompletion')}><Target size={15}/></dt><dd>{caseFile.target_completion_at?.slice(0,10) || t('cases.workspace.notSet')}</dd></div>
          <div><dt aria-label={t('cases.workspace.updatedAt')} data-tooltip={t('cases.workspace.updatedAt')}><Clock3 size={15}/></dt><dd>{dateTime(caseFile.updated_at)}</dd></div>
        </dl>
      </div>
      <div className="cm-wh-group cm-wh-group--4">
        <dl>
          <div><dt aria-label={t('cases.workspace.address')} data-tooltip={t('cases.workspace.address')}><MapPin size={15}/></dt><dd title={caseFile.client.address || t('cases.workspace.notRegistered')}>{caseFile.client.address || t('cases.workspace.notRegistered')}</dd></div>
          <div><dt aria-label={t('cases.workspace.createdBy')} data-tooltip={t('cases.workspace.createdBy')}><UserPlus size={15}/></dt><dd>{caseFile.created_by_employee?.full_name ?? t('cases.workspace.notRecorded')}</dd></div>
          <div><dt aria-label={t('cases.workspace.createdAt')} data-tooltip={t('cases.workspace.createdAt')}><CalendarPlus size={15}/></dt><dd>{caseFile.created_at ? dateTime(caseFile.created_at) : '—'}</dd></div>
        </dl>
      </div>
    </div>
  </div>
}

function OverviewPanel({ caseFile, summary, onOpenTab }: { caseFile: CaseWorkspace; summary: WorkspaceSummary; onOpenTab: (tab: WorkspaceTab) => void }) {
  const { t } = useTranslation()
  const urgent = caseFile.deadlines.filter((item) => item.status === 'open' && remainingDays(item.due_at) <= 7)
  return <div className="space-y-6">
    <section><SectionHeading title={t('cases.workspace.overview.title')} description={t('cases.workspace.overview.description')}/><div className="mt-4 grid gap-3 sm:grid-cols-3"><OverviewStat label={t('cases.workspace.overview.openTasks')} value={t('cases.count', { count: summary.open_tasks })} detail={t('cases.workspace.overview.openTasksDetail')} icon={ListChecks} variant="neutral"/><OverviewStat label={t('cases.workspace.overview.deadlineRisk')} value={t('cases.count', { count: urgent.length })} detail={t('cases.workspace.overview.deadlineRiskDetail')} icon={AlertTriangle} variant={urgent.length > 0 ? 'warning' : 'neutral'}/><OverviewStat label={t('cases.workspace.overview.nextDeadline')} value={summary.next_deadline ? shortDate(summary.next_deadline) : t('cases.workspace.notSet')} detail={t('cases.workspace.overview.nextDeadlineDetail')} icon={Clock3} variant={summary.next_deadline ? 'time' : 'neutral'}/></div><div className="mt-6"><div className="cm-workflow-header"><h3>{t('cases.workspace.overview.documentWorkflow')}</h3><p>{t('cases.workspace.overview.documentWorkflowDescription')}</p></div><div className="grid gap-3 pt-3 sm:grid-cols-2"><button type="button" onClick={() => onOpenTab('collection')} className="cm-workflow-btn"><span><strong>{t('cases.tabs.collection')}</strong><small>{t('cases.workspace.overview.collectionHint')}</small></span><ChevronRight size={18}/></button><button type="button" onClick={() => onOpenTab('documents')} className="cm-workflow-btn"><span><strong>{t('cases.tabs.documents')}</strong><small>{t('cases.workspace.overview.documentsHint')}</small></span><ChevronRight size={18}/></button></div></div></section>
    <section className="cm-recent-history-section"><div className="cm-recent-history-header"><SectionHeading title={t('cases.workspace.overview.recentHistory')} description={t('cases.workspace.overview.recentHistoryDescription')}/>{caseFile.activities.length > 3 && <button type="button" className="cm-recent-history-all" onClick={() => onOpenTab('timeline')}>{t('cases.workspace.overview.viewAllHistory')}<ChevronRight size={16}/></button>}</div><div className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900">{caseFile.activities.slice(0, 3).map((activity) => <RecentHistoryRow key={activity.id} activity={activity}/>)}{caseFile.activities.length === 0 && <EmptyRow text={t('cases.workspace.overview.noHistory')}/>}</div></section>
  </div>
}

function RecentHistoryRow({ activity }: { activity: CaseActivity }) {
  const { t } = useTranslation()
  const changedFields = Object.keys(activity.metadata?.changes ?? {}).map((field) => historyFieldLabel(field, t)).filter(Boolean)
  const relatedDocument = activity.metadata?.event === 'document_collection.updated' ? activity.content : null

  return <article className="cm-timeline-row cm-recent-history-row">
    <div>
      <p className="cm-timeline-title">{activity.title}</p>
      <dl className="cm-recent-history-facts">
        <div><dt>{t('cases.workspace.overview.historyDocument')}</dt><dd>{relatedDocument || t('cases.workspace.overview.historyNoDocument')}</dd></div>
        <div><dt>{t('cases.workspace.overview.historyChangedFields')}</dt><dd>{changedFields.length ? changedFields.join(' · ') : t('cases.workspace.overview.historyChangeNotRecorded')}</dd></div>
        <div><dt>{t('cases.workspace.overview.historyActor')}</dt><dd>{activity.created_by_employee?.full_name ?? t('cases.workspace.overview.historySystem')}</dd></div>
        <div><dt>{t('cases.workspace.overview.historyDateTime')}</dt><dd><time dateTime={activity.occurred_at}>{dateTime(activity.occurred_at)}</time></dd></div>
      </dl>
    </div>
  </article>
}

function TasksPanel({ tasks, canUpdate, working, onAdd, onStatus, onDelete }: { tasks: CaseTask[]; canUpdate: boolean; working: boolean; onAdd: () => void; onStatus: (task: CaseTask, status: CaseTask['status']) => void; onDelete: (task: CaseTask) => void }) { return <><PanelToolbar title="担当タスク" description="担当者、期限、進捗を案件単位で追跡します。" actions={canUpdate && <button type="button" onClick={onAdd} className={primaryButton}><Plus size={16}/>タスクを追加</button>}/><div className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">{tasks.map((task) => <div key={task.id} className="grid gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 md:grid-cols-[minmax(0,1fr)_9rem_9rem_2.5rem] md:items-center"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium text-slate-900 dark:text-white">{task.title}</p><PriorityBadge priority={task.priority}/></div><p className="mt-1 text-xs text-slate-500">{task.assigned_employee?.full_name ?? '未割当'} · {task.due_at ? `期限 ${shortDate(task.due_at)}` : '期限未設定'}</p></div><select disabled={!canUpdate || working} value={task.status} onChange={(event) => onStatus(task, event.target.value as CaseTask['status'])} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900"><option value="pending">未着手</option><option value="in_progress">対応中</option><option value="completed">完了</option><option value="cancelled">取消</option></select><span className="text-xs text-slate-500">{task.description || '詳細なし'}</span>{canUpdate && <button type="button" onClick={() => onDelete(task)} aria-label={`${task.title}を削除`} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"><Trash2 size={15}/></button>}</div>)}{tasks.length === 0 && <EmptyRow text="タスクはまだ登録されていません。"/>}</div></> }

function DeadlinesPanel({ deadlines, canUpdate, working, onAdd, onComplete, onDelete }: { deadlines: CaseDeadline[]; canUpdate: boolean; working: boolean; onAdd: () => void; onComplete: (deadline: CaseDeadline) => void; onDelete: (deadline: CaseDeadline) => void }) { return <><PanelToolbar title="期限管理" description="在留期限、提出期限、追加資料期限、時効を一元管理します。" actions={canUpdate && <button type="button" onClick={onAdd} className={primaryButton}><Plus size={16}/>期限を追加</button>}/><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{deadlines.map((deadline) => { const days = remainingDays(deadline.due_at); const isDone = deadline.status === 'completed'; return <article key={deadline.id} className={`border-l-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 ${isDone ? 'border-l-green-500' : days < 0 ? 'border-l-red-500' : days <= 7 ? 'border-l-amber-500' : 'border-l-blue-500'}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-slate-500">{deadlineTypeLabel(deadline.deadline_type)}</p><h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{deadline.title}</h3></div><PriorityBadge priority={deadline.priority}/></div><div className="mt-4 flex items-end justify-between"><div><p className="text-lg font-semibold text-slate-900 dark:text-white">{shortDate(deadline.due_at)}</p><p className={`mt-1 text-xs font-medium ${isDone ? 'text-green-600' : days < 0 ? 'text-red-600' : days <= 7 ? 'text-amber-600' : 'text-slate-500'}`}>{isDone ? '完了済み' : days < 0 ? `${Math.abs(days)}日超過` : `残り${days}日`}</p></div>{canUpdate && <div className="flex gap-1"><button type="button" disabled={working} onClick={() => onComplete(deadline)} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-500/10"><CheckCircle2 size={17}/></button><button type="button" onClick={() => onDelete(deadline)} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"><Trash2 size={16}/></button></div>}</div></article>})}{deadlines.length === 0 && <div className="md:col-span-2 xl:col-span-3"><EmptyRow text="期限はまだ登録されていません。"/></div>}</div></> }

function PartiesPanel({ client, parties, canUpdate, onAdd, onDelete }: { client: CaseWorkspace['client']; parties: CaseParty[]; canUpdate: boolean; onAdd: () => void; onDelete: (party: CaseParty) => void }) { return <><PanelToolbar title="関係者" description="依頼者、家族、勤務先、相手方、保険会社、医療機関を管理します。" actions={canUpdate && <button type="button" onClick={onAdd} className={primaryButton}><Plus size={16}/>関係者を追加</button>}/><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"><PartyCard name={client.name} type="依頼者" organization={client.client_type === 'corporate' ? client.name : null} phone={client.phone} email={client.email}/>{parties.map((party) => <PartyCard key={party.id} name={party.name} type={partyTypeLabel(party.party_type)} organization={party.organization} phone={party.phone} email={party.email} onDelete={canUpdate ? () => onDelete(party) : undefined}/>)}</div></> }
function PartyCard({ name, type, organization, phone, email, onDelete }: { name: string; type: string; organization: string | null; phone: string | null; email: string | null; onDelete?: () => void }) { return <article className="rounded-lg border border-slate-200 p-4 dark:border-slate-700"><div className="flex items-start justify-between"><div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300"><UserRound size={18}/></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{name}</p><p className="text-xs text-slate-500">{type}{organization ? ` · ${organization}` : ''}</p></div></div>{onDelete && <button type="button" onClick={onDelete} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"><Trash2 size={15}/></button>}</div><div className="mt-4 space-y-2 text-xs text-slate-500">{phone && <p className="flex items-center gap-2"><Phone size={14}/>{phone}</p>}{email && <p className="flex items-center gap-2 truncate"><Mail size={14}/>{email}</p>}{!phone && !email && <p>連絡先は未登録です。</p>}</div></article> }

function TimelinePanel({ activities, canUpdate, onAdd }: { activities: CaseActivity[]; canUpdate: boolean; onAdd: () => void }) { return <><PanelToolbar title="連絡・イベント履歴" description="電話、メール、面談、提出、事故、通院などを時系列で残します。" actions={canUpdate && <button type="button" onClick={onAdd} className={primaryButton}><Plus size={16}/>履歴を追加</button>}/><div className="relative ml-2 space-y-0 before:absolute before:bottom-5 before:left-4 before:top-5 before:w-px before:bg-slate-200 dark:before:bg-slate-700">{activities.map((activity) => <article key={activity.id} className="relative flex gap-4 pb-5"><span className="relative z-10 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-4 border-white bg-blue-100 text-blue-700 dark:border-slate-900 dark:bg-blue-500/20 dark:text-blue-300"><MessageSquareText size={13}/></span><div className="min-w-0 flex-1 rounded-lg border border-slate-200 px-4 py-3 dark:border-slate-700"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-medium text-blue-600 dark:text-blue-300">{activityTypeLabel(activity.activity_type)}{activity.channel ? ` · ${channelLabel(activity.channel)}` : ''}</p><h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{activity.title}</h3></div><time className="text-xs text-slate-400">{dateTime(activity.occurred_at)}</time></div>{activity.content && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{activity.content}</p>}<p className="mt-2 text-xs text-slate-400">{activity.created_by_employee?.full_name ?? 'システム'}</p></div></article>)}{activities.length === 0 && <EmptyRow text="連絡・イベント履歴はまだありません。"/>}</div></> }

function CreateItemForm({ kind, working, onSubmit }: { kind: DialogKind; working: boolean; onSubmit: (payload: Record<string, unknown>) => void }) {
  const [fields, setFields] = useState<Record<string, string>>({ status: 'pending', priority: 'normal', party_type: 'other', deadline_type: 'submission', activity_type: 'communication', channel: 'meeting', occurred_at: localDateTime() })
  const update = (name: string, value: string) => setFields((current) => ({ ...current, [name]: value }))
  const submit = (event: React.FormEvent) => { event.preventDefault(); const payload = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value || null])); onSubmit(payload) }
  return <form onSubmit={submit} className="space-y-4">
    {kind === 'task' && <><Field label="タスク名 *"><input required value={fields.title ?? ''} onChange={(e) => update('title', e.target.value)} className={inputClass}/></Field><Field label="説明"><textarea value={fields.description ?? ''} onChange={(e) => update('description', e.target.value)} className={textareaClass}/></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="優先度"><PrioritySelect value={fields.priority} onChange={(value) => update('priority', value)}/></Field><Field label="期限"><input type="datetime-local" value={fields.due_at ?? ''} onChange={(e) => update('due_at', e.target.value)} className={inputClass}/></Field></div></>}
    {kind === 'deadline' && <><Field label="期限名 *"><input required value={fields.title ?? ''} onChange={(e) => update('title', e.target.value)} className={inputClass}/></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="期限種別"><select value={fields.deadline_type} onChange={(e) => update('deadline_type', e.target.value)} className={inputClass}><option value="residence">在留期限</option><option value="submission">提出期限</option><option value="additional">追加資料期限</option><option value="limitation">時効</option><option value="document">書類期限</option><option value="internal">内部期限</option><option value="other">その他</option></select></Field><Field label="優先度"><PrioritySelect value={fields.priority} onChange={(value) => update('priority', value)}/></Field></div><Field label="日時 *"><input required type="datetime-local" value={fields.due_at ?? ''} onChange={(e) => update('due_at', e.target.value)} className={inputClass}/></Field><Field label="補足"><textarea value={fields.notes ?? ''} onChange={(e) => update('notes', e.target.value)} className={textareaClass}/></Field></>}
    {kind === 'party' && <><div className="grid gap-3 sm:grid-cols-2"><Field label="関係者区分"><select value={fields.party_type} onChange={(e) => update('party_type', e.target.value)} className={inputClass}><option value="family">家族</option><option value="employer">勤務先</option><option value="opponent">相手方</option><option value="insurer">保険会社</option><option value="medical">医療機関</option><option value="supporter">支援者</option><option value="other">その他</option></select></Field><Field label="氏名 *"><input required value={fields.name ?? ''} onChange={(e) => update('name', e.target.value)} className={inputClass}/></Field></div><Field label="組織名"><input value={fields.organization ?? ''} onChange={(e) => update('organization', e.target.value)} className={inputClass}/></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="電話"><input value={fields.phone ?? ''} onChange={(e) => update('phone', e.target.value)} className={inputClass}/></Field><Field label="メール"><input type="email" value={fields.email ?? ''} onChange={(e) => update('email', e.target.value)} className={inputClass}/></Field></div></>}
    {kind === 'activity' && <><div className="grid gap-3 sm:grid-cols-2"><Field label="記録種別"><select value={fields.activity_type} onChange={(e) => update('activity_type', e.target.value)} className={inputClass}><option value="communication">連絡</option><option value="event">イベント</option><option value="submission">提出</option><option value="medical">通院・医療</option><option value="incident">事故・事実</option><option value="note">内部メモ</option></select></Field><Field label="チャネル"><select value={fields.channel} onChange={(e) => update('channel', e.target.value)} className={inputClass}><option value="meeting">面談</option><option value="phone">電話</option><option value="email">メール</option><option value="line">LINE</option><option value="internal">社内</option><option value="other">その他</option></select></Field></div><Field label="タイトル *"><input required value={fields.title ?? ''} onChange={(e) => update('title', e.target.value)} className={inputClass}/></Field><Field label="日時 *"><input required type="datetime-local" value={fields.occurred_at ?? ''} onChange={(e) => update('occurred_at', e.target.value)} className={inputClass}/></Field><Field label="内容"><textarea value={fields.content ?? ''} onChange={(e) => update('content', e.target.value)} className={textareaClass}/></Field></>}
    <div className="flex justify-end border-t border-slate-200 pt-4 dark:border-slate-700"><button type="submit" disabled={working} className={primaryButton}>{working ? '保存中…' : '保存する'}</button></div>
  </form>
}

function WorkspaceDialog({ title, working, onClose, children }: { title: string; working: boolean; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-3 sm:items-center sm:p-6" onMouseDown={onClose}><section role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"><header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-900"><h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2><button type="button" disabled={working} onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18}/></button></header><div className="p-5">{children}</div></section></div> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1.5"><span className="text-xs font-medium text-slate-700 dark:text-slate-300">{label}</span>{children}</label> }
function PrioritySelect({ value, onChange }: { value: string; onChange: (value: string) => void }) { return <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}><option value="low">低</option><option value="normal">通常</option><option value="high">高</option><option value="critical">最優先</option></select> }
function PanelToolbar({ title, description, actions }: { title: string; description: string; actions?: React.ReactNode }) { return <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-semibold text-slate-950 dark:text-white">{title}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p></div>{actions && <div className="flex flex-wrap gap-2">{actions}</div>}</div> }
function SectionHeading({ title, description }: { title: string; description: string }) { return <div><h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p></div> }
function OverviewStat({ label, value, detail, icon: Icon, variant = 'neutral' }: { label: string; value: string; detail: string; icon: typeof Files; variant?: 'neutral' | 'warning' | 'danger' | 'time' }) { return <div className={`cm-workspace-stat cm-workspace-stat--${variant}`}><div><p>{label}</p><Icon size={17} className="cm-stat-icon"/></div><p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div> }
function EmptyRow({ text }: { text: string }) { return <div className="flex min-h-24 items-center justify-center px-4 py-8 text-center text-sm text-slate-500"><ShieldCheck size={18} className="mr-2 text-slate-400"/>{text}</div> }
function PriorityBadge({ priority, translated = false }: { priority: CaseTask['priority'] | CaseDeadline['priority']; translated?: boolean }) { const { t } = useTranslation(); const config = { low: ['低', 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'], normal: ['通常', 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'], high: ['高', 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'], critical: ['最優先', 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'] }[priority]; return <span className={`inline-flex h-6 items-center rounded-md px-2 text-xs font-medium ${config[1]}`}>{translated ? t(`cases.priority.${priority}`) : config[0]}</span> }
function CaseStatusBadge({ status }: { status: string }) { const { t } = useTranslation(); const config: Record<string, [string, string]> = { intake: ['intake', 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300'], active: ['active', 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'], waiting_documents: ['waitingDocuments', 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'], reviewing: ['reviewing', 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300'], waiting_payment: ['waitingPayment', 'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300'], on_hold: ['onHold', 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'], closed: ['closed', 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300'] }; const match = config[status]; return match ? <span className={`inline-flex h-6 items-center rounded-md px-2 text-xs font-medium ${match[1]}`}>{t(`cases.status.${match[0]}`)}</span> : <span>{status}</span> }

function WorkspaceSkeleton({ onBack }: { onBack: () => void }) { const { t } = useTranslation(); return <div className="p-5"><button type="button" onClick={onBack} className={secondaryButton}><ArrowLeft size={16}/>{t('cases.workspace.backToList')}</button><div className="mt-4 h-52 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"/><div className="mt-4 h-96 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"/></div> }
function WorkspaceFailure({ error, onBack, onRetry }: { error: string | null; onBack: () => void; onRetry: () => void }) { const { t } = useTranslation(); return <div className="p-5"><button type="button" onClick={onBack} className={secondaryButton}><ArrowLeft size={16}/>{t('cases.workspace.backToList')}</button><div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-500/30 dark:bg-red-500/10"><AlertTriangle className="mx-auto text-red-500"/><h1 className="mt-3 text-lg font-semibold text-red-800 dark:text-red-200">{t('cases.workspace.loadFailed')}</h1><p className="mt-1 text-sm text-red-600 dark:text-red-300">{error}</p><button type="button" onClick={onRetry} className={`${primaryButton} mt-4`}><RefreshCw size={16}/>{t('cases.workspace.retry')}</button></div></div> }

async function createItem(kind: DialogKind, caseId: number, payload: Record<string, unknown>) { if (kind === 'task') return caseWorkspaceApi.createTask(caseId, payload); if (kind === 'deadline') return caseWorkspaceApi.createDeadline(caseId, payload); if (kind === 'party') return caseWorkspaceApi.createParty(caseId, payload); return caseWorkspaceApi.createActivity(caseId, payload) }
function confirmDelete(name: string) { return window.confirm(`「${name}」を削除しますか？この操作は画面上から取り消せません。`) }
function apiError(error: unknown, fallback: string) { if (!axios.isAxiosError(error)) return fallback; const validation = error.response?.data?.errors as Record<string, string[]> | undefined; return validation ? Object.values(validation).flat()[0] : error.response?.data?.message ?? fallback }
function shortDate(value: string) { return new Intl.DateTimeFormat(i18n.language, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)) }
function dateTime(value: string) { return new Intl.DateTimeFormat(i18n.language, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
function historyFieldLabel(field: string, t: (key: string) => string) {
  const key = ({
    necessity_status: 'necessity', necessity_reason: 'necessityReason', necessity_decided_by_employee_id: 'necessityDecidedBy', necessity_decided_at: 'necessityDecidedAt',
    target_person: 'targetPerson', collection_source: 'collectionSource', collection_method: 'collectionMethod',
    target_period_from: 'targetPeriod', target_period_to: 'targetPeriod', target_scope: 'targetScope',
    assigned_employee_id: 'assignee', requested_at: 'requestedAt', response_deadline: 'responseDeadline',
    collection_priority: 'collectionPriority', preservation_priority: 'preservationPriority', preservation_reason: 'preservationReason',
    collection_status: 'collectionStatus', collection_result: 'collectionResult', fulfillment_status: 'fulfillmentStatus', review_status: 'reviewStatus',
  } as Record<string, string>)[field]
  return key ? t(`cases.workspace.overview.historyFields.${key}`) : field
}
function remainingDays(value: string) { const target = new Date(value); const today = new Date(); target.setHours(0, 0, 0, 0); today.setHours(0, 0, 0, 0); return Math.ceil((target.getTime() - today.getTime()) / 86400000) }
function localDateTime() { const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); return date.toISOString().slice(0, 16) }
function deadlineTypeLabel(type: CaseDeadline['deadline_type']) { return ({ residence: '在留期限', submission: '提出期限', additional: '追加資料期限', limitation: '時効', document: '書類期限', internal: '内部期限', other: 'その他' } as Record<string, string>)[type] }
function partyTypeLabel(type: CaseParty['party_type']) { return ({ client: '依頼者', family: '家族', employer: '勤務先', opponent: '相手方', insurer: '保険会社', medical: '医療機関', supporter: '支援者', other: 'その他' } as Record<string, string>)[type] }
function activityTypeLabel(type: CaseActivity['activity_type']) { return ({ communication: '連絡', event: 'イベント', note: '内部メモ', submission: '提出', medical: '通院・医療', incident: '事故・事実' } as Record<string, string>)[type] }
function channelLabel(channel: NonNullable<CaseActivity['channel']>) { return ({ meeting: '面談', phone: '電話', email: 'メール', line: 'LINE', internal: '社内', other: 'その他' } as Record<string, string>)[channel] }
function presentWorkspaceCaseType(value: string, t: (key: string) => string) { const [parent, ...children] = value.split(' / '); const key = parent === '労災' ? 'cases.caseTypes.laborAccident' : parent === '交通事故' ? 'cases.caseTypes.trafficAccident' : null; return key ? [t(key), ...children].join(' / ') : value }
