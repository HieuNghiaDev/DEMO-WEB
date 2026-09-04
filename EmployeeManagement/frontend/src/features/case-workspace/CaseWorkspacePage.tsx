import { lazy, Suspense, useEffect, useState } from 'react'
import axios from 'axios'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, CircleGauge,
  Clock3, Mail, MessageSquareText, Pencil, Phone,
  Plus, RefreshCw, ShieldCheck, Trash2, UserRound, X,
  Globe, MapPin, Files, ListChecks, CalendarDays,
  Compass, Layers, Folder, FileText
} from 'lucide-react'

import { useAuth } from '../../contexts/AuthContext'
import i18n from '../../i18n'
import type { CaseViewer } from '../case-management/types'
import { caseWorkspaceApi } from './api'
import type {
  CaseActivity, CaseDeadline, CaseParty, CaseTask, CaseWorkspace,
  WorkspaceDocument, WorkspaceResponse, WorkspaceSummary, WorkspaceTab,
} from './types'

type DialogKind = 'task' | 'deadline' | 'party' | 'activity'
type Props = { caseId: number; user?: CaseViewer; onBack: () => void; onEdit?: () => void; initialNotice?: string }
const DocumentCollectionPanel = lazy(() => import('../document-collection/DocumentCollectionPanel'))
const RequiredDocumentsPanel = lazy(() => import('../document-collection/components/RequiredDocumentsPanel'))

const inputClass = 'h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 dark:border-tm-border dark:bg-tm-control dark:text-[var(--tm-text-primary)] dark:placeholder:text-[var(--tm-text-muted)] dark:focus:border-indigo-400'
const textareaClass = `${inputClass} min-h-24 py-2`
const primaryButton = 'inline-flex h-9 items-center justify-center gap-2 rounded-md bg-indigo-600 px-3.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 active:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-500'
const secondaryButton = 'inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 text-xs font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 dark:border-tm-border dark:bg-tm-surface-elevated dark:text-[var(--tm-text-secondary)] dark:shadow-none dark:hover:bg-tm-surface-hover dark:hover:text-white'

const tabs: Array<{ id: WorkspaceTab; icon: typeof Files }> = [
  { id: 'overview', icon: CircleGauge },
  { id: 'collection', icon: ListChecks },
  { id: 'documents', icon: Files },
  { id: 'tasks', icon: CheckCircle2 },
  { id: 'deadlines', icon: CalendarDays },
  { id: 'parties', icon: UserRound },
  { id: 'timeline', icon: MessageSquareText },
]

export function CaseWorkspaceView(props: Props) {
  return <CaseWorkspacePage {...props} />
}

export default function CaseWorkspacePage(props: Props) {
  const { caseId, onBack, onEdit, initialNotice } = props
  const { user } = useAuth()
  const { t } = useTranslation()
  const [tab, setTab] = useState<WorkspaceTab>('overview')
  const [data, setData] = useState<WorkspaceResponse | null>(null)
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
      <button type="button" onClick={onBack} className="cm-back-button">
        <ArrowLeft size={15}/><span>{t('cases.workspace.backToList')}</span>
      </button>
    </div>

    {(error || notice) && <div className={`cm-alert-banner ${error ? 'is-error' : 'is-success'}`}>{error ?? notice}</div>}

    <div className="cm-workspace-shell">
      <WorkspaceHeader caseFile={caseFile} onEdit={canUpdate ? onEdit : undefined}/>

      <nav className="cm-command-rail" aria-label={t('cases.workspace.ariaLabel')} role="tablist">
        {tabs.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            className={`cm-rail-tab ${tab === id ? 'is-active' : ''}`}
            onClick={() => setTab(id)}
            aria-selected={tab === id}
            aria-current={tab === id ? 'page' : undefined}
          >
            <Icon size={15} className="cm-rail-icon"/>
            <span>{t(`cases.tabs.${id}`)}</span>
          </button>
        ))}
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
    </div>

    {dialog && <WorkspaceDialog title={dialogTitle[dialog]} working={working} onClose={() => !working && setDialog(null)}>
      <CreateItemForm kind={dialog} working={working} onSubmit={(payload) => void run(() => createItem(dialog, caseId, payload), '保存しました。')}/>
    </WorkspaceDialog>}
  </main>
}

function WorkspaceHeader({ caseFile, onEdit }: { caseFile: CaseWorkspace; onEdit?: () => void }) {
  const { t } = useTranslation()
  const code = caseFile.reference_number || `CASE-${String(caseFile.id).padStart(6, '0')}`

  return (
    <header className="cm-dossier-header">
      <div className="cm-dh-top">
        <div className="cm-dh-identity">
          <div className="cm-dh-code-row">
            <span className="cm-dh-code">{code}</span>
            <span className="cm-dh-status-label">ACTIVE CASE</span>
          </div>
          <h1 className="cm-dh-client-name">{caseFile.client.name}</h1>
        </div>

        <div className="cm-dh-ops-box">
          <div className="cm-dh-timestamps">
            <div className="cm-dh-ts-row">
              <span className="cm-dh-ts-label">{t('cases.workspace.createdAt')}</span>
              <time className="cm-dh-ts-val">{caseFile.created_at ? dateTime(caseFile.created_at) : '—'}</time>
            </div>
            <div className="cm-dh-ts-row">
              <span className="cm-dh-ts-label">{t('cases.workspace.updatedAt')}</span>
              <time className="cm-dh-ts-val">{dateTime(caseFile.updated_at)}</time>
            </div>
          </div>
          {onEdit && (
            <button type="button" className="cm-dh-edit-button" onClick={onEdit}>
              <Pencil size={13} />
              <span>{t('cases.workspace.edit')}</span>
            </button>
          )}
        </div>
      </div>

      <div className="cm-dh-contact-rail">
        <span className="cm-dh-contact-item">
          <Phone size={16} className="cm-dh-contact-icon cm-dh-contact-icon--phone" />
          <span className="cm-dh-contact-val">{caseFile.client.phone || t('cases.workspace.notRegistered')}</span>
        </span>
        <span className="cm-dh-contact-item" title={caseFile.client.email || undefined}>
          <Mail size={16} className="cm-dh-contact-icon cm-dh-contact-icon--mail" />
          <span className="cm-dh-contact-val">{caseFile.client.email || t('cases.workspace.notRegistered')}</span>
        </span>
        <span className="cm-dh-contact-item">
          <Globe size={16} className="cm-dh-contact-icon cm-dh-contact-icon--globe" />
          <span className="cm-dh-contact-val">{caseFile.client.nationality || t('cases.workspace.notRegistered')}</span>
        </span>
        <span className="cm-dh-contact-item cm-dh-contact-item--address" title={caseFile.client.address || undefined}>
          <MapPin size={16} className="cm-dh-contact-icon cm-dh-contact-icon--pin" />
          <span className="cm-dh-contact-val">{caseFile.client.address || t('cases.workspace.notRegistered')}</span>
        </span>
      </div>
    </header>
  )
}

function OverviewPanel({ caseFile, summary, onOpenTab }: { caseFile: CaseWorkspace; summary: WorkspaceSummary; onOpenTab: (tab: WorkspaceTab) => void }) {
  const { t } = useTranslation()
  const urgent = caseFile.deadlines.filter((item) => item.status === 'open' && remainingDays(item.due_at) <= 7)

  const docs = (caseFile.documents ?? []) as Array<WorkspaceDocument & { necessity_status?: string }>
  const undeterminedCount = docs.filter((d) => d.necessity_status === 'undetermined' || (!d.necessity_status && d.requirement_level === 'conditional')).length
  const requiredCount = docs.filter((d) => d.necessity_status === 'required' || (!d.necessity_status && d.requirement_level === 'required')).length

  return (
    <div className="cm-overview-dashboard">
      {/* 案件の現在地 */}
      <section className="cm-sec-block">
        <div className="cm-sec-header">
          <h2 className="cm-sec-title">
            <Compass size={16} className="cm-sec-title-icon cm-sec-title-icon--compass" />
            <span>案件の現在地</span>
          </h2>
        </div>
        <div className="cm-instrument-panel">
          <div className="cm-inst-col">
            <div className="cm-inst-circle cm-inst-circle--task">
              <ListChecks size={20} className="cm-inst-circle-icon" />
            </div>
            <div className="cm-inst-content">
              <span className="cm-inst-label">{t('cases.workspace.overview.openTasks')}</span>
              <div className="cm-inst-metric">
                <span className="cm-inst-val">{summary.open_tasks}</span>
                <span className="cm-inst-unit">件</span>
              </div>
              <div className="cm-inst-sub">{t('cases.workspace.overview.openTasksDetail')}</div>
            </div>
          </div>

          <div className={`cm-inst-col ${urgent.length > 0 ? 'is-warning' : ''}`}>
            <div className="cm-inst-circle cm-inst-circle--risk">
              <AlertTriangle size={20} className="cm-inst-circle-icon" />
            </div>
            <div className="cm-inst-content">
              <span className="cm-inst-label">{t('cases.workspace.overview.deadlineRisk')}</span>
              <div className="cm-inst-metric">
                <span className="cm-inst-val">{urgent.length}</span>
                <span className="cm-inst-unit">件</span>
              </div>
              <div className="cm-inst-sub">{t('cases.workspace.overview.deadlineRiskDetail')}</div>
            </div>
          </div>

          <div className="cm-inst-col">
            <div className="cm-inst-circle cm-inst-circle--deadline">
              <Clock3 size={20} className="cm-inst-circle-icon" />
            </div>
            <div className="cm-inst-content">
              <span className="cm-inst-label">{t('cases.workspace.overview.nextDeadline')}</span>
              <div className="cm-inst-metric">
                <span className={`cm-inst-date ${!summary.next_deadline ? 'is-empty' : ''}`}>
                  {summary.next_deadline ? shortDate(summary.next_deadline) : t('cases.workspace.notSet')}
                </span>
              </div>
              <div className="cm-inst-sub">{t('cases.workspace.overview.nextDeadlineDetail')}</div>
            </div>
          </div>
        </div>
      </section>

      {/* 資料ワークフロー */}
      <section className="cm-sec-block">
        <div className="cm-sec-header">
          <h2 className="cm-sec-title">
            <Layers size={16} className="cm-sec-title-icon cm-sec-title-icon--layers" />
            <span>資料ワークフロー</span>
          </h2>
        </div>
        <div className="cm-workflow-row">
          <button type="button" onClick={() => onOpenTab('collection')} className="cm-wf-card">
            <div className="cm-wf-icon-box cm-wf-icon-box--collection">
              <Folder size={20} className="cm-wf-icon" />
            </div>
            <div className="cm-wf-content">
              <h3 className="cm-wf-title">{t('cases.tabs.collection')}</h3>
              <p className="cm-wf-desc">{t('cases.workspace.overview.collectionHint')}</p>
              <div className="cm-wf-pills">
                <span className="cm-wf-pill is-neutral">未判定 <strong className="cm-wf-pill-num">{undeterminedCount}</strong></span>
                <span className="cm-wf-pill is-indigo">必要 <strong className="cm-wf-pill-num">{requiredCount}</strong></span>
              </div>
            </div>
            <div className="cm-wf-action">
              <span>資料収集へ</span>
              <ArrowRight size={14} className="cm-wf-arrow" />
            </div>
          </button>

          <button type="button" onClick={() => onOpenTab('documents')} className="cm-wf-card">
            <div className="cm-wf-icon-box cm-wf-icon-box--documents">
              <FileText size={20} className="cm-wf-icon" />
            </div>
            <div className="cm-wf-content">
              <h3 className="cm-wf-title">{t('cases.tabs.documents')}</h3>
              <p className="cm-wf-desc">{t('cases.workspace.overview.documentsHint')}</p>
              <div className="cm-wf-pills">
                <span className="cm-wf-pill is-indigo">必要 <strong className="cm-wf-pill-num">{requiredCount}件</strong></span>
              </div>
            </div>
            <div className="cm-wf-action">
              <span>必要資料へ</span>
              <ArrowRight size={14} className="cm-wf-arrow" />
            </div>
          </button>
        </div>
      </section>

      {/* 最近の履歴 */}
      <section className="cm-sec-block">
        <div className="cm-sec-header">
          <h2 className="cm-sec-title">
            <Clock3 size={16} className="cm-sec-title-icon cm-sec-title-icon--clock" />
            <span>最近の履歴</span>
          </h2>
          <button type="button" className="cm-audit-all-btn" onClick={() => onOpenTab('timeline')}>
            <span>{t('cases.workspace.overview.viewAllHistory')}</span>
            <ArrowRight size={14} />
          </button>
        </div>
        <div className="cm-audit-panel">
          <div className="cm-audit-table-head">
            <span className="cm-audit-head-cell cm-audit-col-time">記録日時</span>
            <span className="cm-audit-head-cell cm-audit-col-action">操作内容</span>
            <span className="cm-audit-head-cell cm-audit-col-details">対象・変更詳細</span>
            <span className="cm-audit-head-cell cm-audit-col-actor">担当者</span>
          </div>
          <div className="cm-audit-table-body">
            {caseFile.activities.slice(0, 4).map((activity) => (
              <RecentHistoryRow key={activity.id} activity={activity} />
            ))}
            {caseFile.activities.length === 0 && (
              <div className="cm-audit-empty">{t('cases.workspace.overview.noHistory')}</div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

function RecentHistoryRow({ activity }: { activity: CaseActivity }) {
  const { t } = useTranslation()
  const changedFields = Object.keys(activity.metadata?.changes ?? {}).map((field) => historyFieldLabel(field, t)).filter(Boolean)
  const relatedDocument = activity.metadata?.event === 'document_collection.updated' ? activity.content : null

  return (
    <article className="cm-audit-row">
      <div className="cm-audit-cell cm-audit-col-time">
        <FileText size={14} className="cm-audit-file-icon" />
        <time dateTime={activity.occurred_at}>{dateTime(activity.occurred_at)}</time>
      </div>
      <div className="cm-audit-cell cm-audit-col-action">
        <span className="cm-audit-action-title">{activity.title}</span>
      </div>
      <div className="cm-audit-cell cm-audit-col-details">
        {relatedDocument && <span className="cm-audit-tag-target">対象: {relatedDocument}</span>}
        {changedFields.length > 0 && <span className="cm-audit-tag-changes">変更: {changedFields.join(' · ')}</span>}
        {!relatedDocument && changedFields.length === 0 && <span className="cm-audit-tag-none">—</span>}
      </div>
      <div className="cm-audit-cell cm-audit-col-actor">
        <span className="cm-audit-actor-name">
          {activity.created_by_employee?.full_name ?? t('cases.workspace.overview.historySystem')}
        </span>
      </div>
    </article>
  )
}

function TasksPanel({ tasks, canUpdate, working, onAdd, onStatus, onDelete }: { tasks: CaseTask[]; canUpdate: boolean; working: boolean; onAdd: () => void; onStatus: (task: CaseTask, status: CaseTask['status']) => void; onDelete: (task: CaseTask) => void }) { return <><PanelToolbar title="担当タスク" description="担当者、期限、進捗を案件単位で追跡します。" actions={canUpdate && <button type="button" onClick={onAdd} className={primaryButton}><Plus size={16}/>タスクを追加</button>}/><div className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-white/[0.055] dark:border-tm-border dark:bg-tm-surface-elevated">{tasks.map((task) => <div key={task.id} className="grid gap-3 px-4 py-3 hover:bg-slate-50/70 dark:hover:bg-tm-surface-hover md:grid-cols-[minmax(0,1fr)_9rem_9rem_2.5rem] md:items-center"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium text-slate-900 dark:text-white">{task.title}</p><PriorityBadge priority={task.priority}/></div><p className="mt-1 text-xs text-slate-500">{task.assigned_employee?.full_name ?? '未割当'} · {task.due_at ? `期限 ${shortDate(task.due_at)}` : '期限未設定'}</p></div><select disabled={!canUpdate || working} value={task.status} onChange={(event) => onStatus(task, event.target.value as CaseTask['status'])} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs dark:border-tm-border dark:bg-tm-control dark:text-[var(--tm-text-secondary)]"><option value="pending">未着手</option><option value="in_progress">対応中</option><option value="completed">完了</option><option value="cancelled">取消</option></select><span className="text-xs text-slate-500">{task.description || '詳細なし'}</span>{canUpdate && <button type="button" onClick={() => onDelete(task)} aria-label={`${task.title}を削除`} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"><Trash2 size={15}/></button>}</div>)}{tasks.length === 0 && <EmptyRow text="タスクはまだ登録されていません。"/>}</div></> }

function DeadlinesPanel({ deadlines, canUpdate, working, onAdd, onComplete, onDelete }: { deadlines: CaseDeadline[]; canUpdate: boolean; working: boolean; onAdd: () => void; onComplete: (deadline: CaseDeadline) => void; onDelete: (deadline: CaseDeadline) => void }) { return <><PanelToolbar title="期限管理" description="在留期限、提出期限、追加資料期限、時効を一元管理します。" actions={canUpdate && <button type="button" onClick={onAdd} className={primaryButton}><Plus size={16}/>期限を追加</button>}/><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{deadlines.map((deadline) => { const days = remainingDays(deadline.due_at); const isDone = deadline.status === 'completed'; return <article key={deadline.id} className={`border-l-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-tm-border dark:bg-tm-surface-elevated ${isDone ? 'border-l-green-500' : days < 0 ? 'border-l-red-500' : days <= 7 ? 'border-l-amber-500' : 'border-l-blue-500'}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-slate-500">{deadlineTypeLabel(deadline.deadline_type)}</p><h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{deadline.title}</h3></div><PriorityBadge priority={deadline.priority}/></div><div className="mt-4 flex items-end justify-between"><div><p className="text-lg font-semibold text-slate-900 dark:text-white">{shortDate(deadline.due_at)}</p><p className={`mt-1 text-xs font-medium ${isDone ? 'text-green-600' : days < 0 ? 'text-red-600' : days <= 7 ? 'text-amber-600' : 'text-slate-500'}`}>{isDone ? '完了済み' : days < 0 ? `${Math.abs(days)}日超過` : `残り${days}日`}</p></div>{canUpdate && <div className="flex gap-1"><button type="button" disabled={working} onClick={() => onComplete(deadline)} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-500/10"><CheckCircle2 size={17}/></button><button type="button" onClick={() => onDelete(deadline)} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"><Trash2 size={16}/></button></div>}</div></article>})}{deadlines.length === 0 && <div className="md:col-span-2 xl:col-span-3"><EmptyRow text="期限はまだ登録されていません。"/></div>}</div></> }

function PartiesPanel({ client, parties, canUpdate, onAdd, onDelete }: { client: CaseWorkspace['client']; parties: CaseParty[]; canUpdate: boolean; onAdd: () => void; onDelete: (party: CaseParty) => void }) { return <><PanelToolbar title="関係者" description="依頼者、家族、勤務先、相手方、保険会社、医療機関を管理します。" actions={canUpdate && <button type="button" onClick={onAdd} className={primaryButton}><Plus size={16}/>関係者を追加</button>}/><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"><PartyCard name={client.name} type="依頼者" organization={client.client_type === 'corporate' ? client.name : null} phone={client.phone} email={client.email}/>{parties.map((party) => <PartyCard key={party.id} name={party.name} type={partyTypeLabel(party.party_type)} organization={party.organization} phone={party.phone} email={party.email} onDelete={canUpdate ? () => onDelete(party) : undefined}/>)}</div></> }
function PartyCard({ name, type, organization, phone, email, onDelete }: { name: string; type: string; organization: string | null; phone: string | null; email: string | null; onDelete?: () => void }) { return <article className="rounded-lg border border-slate-200 bg-white p-4 dark:border-tm-border dark:bg-tm-surface-elevated"><div className="flex items-start justify-between"><div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-indigo-500/15 dark:text-indigo-300"><UserRound size={18}/></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{name}</p><p className="text-xs text-slate-500">{type}{organization ? ` · ${organization}` : ''}</p></div></div>{onDelete && <button type="button" onClick={onDelete} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"><Trash2 size={15}/></button>}</div><div className="mt-4 space-y-2 text-xs text-slate-500">{phone && <p className="flex items-center gap-2"><Phone size={14}/>{phone}</p>}{email && <p className="flex items-center gap-2 truncate"><Mail size={14}/>{email}</p>}{!phone && !email && <p>連絡先は未登録です。</p>}</div></article> }

function TimelinePanel({ activities, canUpdate, onAdd }: { activities: CaseActivity[]; canUpdate: boolean; onAdd: () => void }) { return <><PanelToolbar title="連絡・イベント履歴" description="電話、メール、面談、提出、事故、通院などを時系列で残します。" actions={canUpdate && <button type="button" onClick={onAdd} className={primaryButton}><Plus size={16}/>履歴を追加</button>}/><div className="relative ml-2 space-y-0 before:absolute before:bottom-5 before:left-4 before:top-5 before:w-px before:bg-slate-200 dark:before:bg-white/[0.055]">{activities.map((activity) => <article key={activity.id} className="relative flex gap-4 pb-5"><span className="relative z-10 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-4 border-white bg-blue-100 text-blue-700 dark:border-[var(--tm-surface)] dark:bg-indigo-500/20 dark:text-indigo-300"><MessageSquareText size={13}/></span><div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-tm-border dark:bg-tm-surface-elevated"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-medium text-blue-600 dark:text-indigo-300">{activityTypeLabel(activity.activity_type)}{activity.channel ? ` · ${channelLabel(activity.channel)}` : ''}</p><h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{activity.title}</h3></div><time className="text-xs text-slate-400">{dateTime(activity.occurred_at)}</time></div>{activity.content && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{activity.content}</p>}<p className="mt-2 text-xs text-slate-400">{activity.created_by_employee?.full_name ?? 'システム'}</p></div></article>)}{activities.length === 0 && <EmptyRow text="連絡・イベント履歴はまだありません。"/>}</div></> }

function CreateItemForm({ kind, working, onSubmit }: { kind: DialogKind; working: boolean; onSubmit: (payload: Record<string, unknown>) => void }) {
  const [fields, setFields] = useState<Record<string, string>>({ status: 'pending', priority: 'normal', party_type: 'other', deadline_type: 'submission', activity_type: 'communication', channel: 'meeting', occurred_at: localDateTime() })
  const update = (name: string, value: string) => setFields((current) => ({ ...current, [name]: value }))
  const submit = (event: React.FormEvent) => { event.preventDefault(); const payload = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value || null])); onSubmit(payload) }
  return <form onSubmit={submit} className="space-y-4">
    {kind === 'task' && <><Field label="タスク名 *"><input required value={fields.title ?? ''} onChange={(e) => update('title', e.target.value)} className={inputClass}/></Field><Field label="説明"><textarea value={fields.description ?? ''} onChange={(e) => update('description', e.target.value)} className={textareaClass}/></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="優先度"><PrioritySelect value={fields.priority} onChange={(value) => update('priority', value)}/></Field><Field label="期限"><input type="datetime-local" value={fields.due_at ?? ''} onChange={(e) => update('due_at', e.target.value)} className={inputClass}/></Field></div></>}
    {kind === 'deadline' && <><Field label="期限名 *"><input required value={fields.title ?? ''} onChange={(e) => update('title', e.target.value)} className={inputClass}/></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="期限種別"><select value={fields.deadline_type} onChange={(e) => update('deadline_type', e.target.value)} className={inputClass}><option value="residence">在留期限</option><option value="submission">提出期限</option><option value="additional">追加資料期限</option><option value="limitation">時効</option><option value="document">書類期限</option><option value="internal">内部期限</option><option value="other">その他</option></select></Field><Field label="優先度"><PrioritySelect value={fields.priority} onChange={(value) => update('priority', value)}/></Field></div><Field label="日時 *"><input required type="datetime-local" value={fields.due_at ?? ''} onChange={(e) => update('due_at', e.target.value)} className={inputClass}/></Field><Field label="補足"><textarea value={fields.notes ?? ''} onChange={(e) => update('notes', e.target.value)} className={textareaClass}/></Field></>}
    {kind === 'party' && <><div className="grid gap-3 sm:grid-cols-2"><Field label="関係者区分"><select value={fields.party_type} onChange={(e) => update('party_type', e.target.value)} className={inputClass}><option value="family">家族</option><option value="employer">勤務先</option><option value="opponent">相手方</option><option value="insurer">保険会社</option><option value="medical">医療機関</option><option value="supporter">支援者</option><option value="other">その他</option></select></Field><Field label="氏名 *"><input required value={fields.name ?? ''} onChange={(e) => update('name', e.target.value)} className={inputClass}/></Field></div><Field label="組織名"><input value={fields.organization ?? ''} onChange={(e) => update('organization', e.target.value)} className={inputClass}/></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="電話"><input value={fields.phone ?? ''} onChange={(e) => update('phone', e.target.value)} className={inputClass}/></Field><Field label="メール"><input type="email" value={fields.email ?? ''} onChange={(e) => update('email', e.target.value)} className={inputClass}/></Field></div></>}
    {kind === 'activity' && <><div className="grid gap-3 sm:grid-cols-2"><Field label="記録種別"><select value={fields.activity_type} onChange={(e) => update('activity_type', e.target.value)} className={inputClass}><option value="communication">連絡</option><option value="event">イベント</option><option value="submission">提出</option><option value="medical">通院・医療</option><option value="incident">事故・事実</option><option value="note">内部メモ</option></select></Field><Field label="チャネル"><select value={fields.channel} onChange={(e) => update('channel', e.target.value)} className={inputClass}><option value="meeting">面談</option><option value="phone">電話</option><option value="email">メール</option><option value="line">LINE</option><option value="internal">社内</option><option value="other">その他</option></select></Field></div><Field label="タイトル *"><input required value={fields.title ?? ''} onChange={(e) => update('title', e.target.value)} className={inputClass}/></Field><Field label="日時 *"><input required type="datetime-local" value={fields.occurred_at ?? ''} onChange={(e) => update('occurred_at', e.target.value)} className={inputClass}/></Field><Field label="内容"><textarea value={fields.content ?? ''} onChange={(e) => update('content', e.target.value)} className={textareaClass}/></Field></>}
    <div className="flex justify-end border-t border-slate-200 pt-4 dark:border-white/10"><button type="submit" disabled={working} className={primaryButton}>{working ? '保存中…' : '保存する'}</button></div>
  </form>
}

function WorkspaceDialog({ title, working, onClose, children }: { title: string; working: boolean; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:items-center sm:p-6" onMouseDown={onClose}><section role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-tm-border dark:bg-tm-surface-elevated dark:shadow-[var(--tm-shadow-lg)]"><header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 dark:border-tm-border dark:bg-tm-surface-elevated"><h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2><button type="button" disabled={working} onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"><X size={18}/></button></header><div className="p-5">{children}</div></section></div> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1.5"><span className="text-xs font-medium text-slate-700 dark:text-slate-300">{label}</span>{children}</label> }
function PrioritySelect({ value, onChange }: { value: string; onChange: (value: string) => void }) { return <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}><option value="low">低</option><option value="normal">通常</option><option value="high">高</option><option value="critical">最優先</option></select> }
function PanelToolbar({ title, description, actions }: { title: string; description: string; actions?: React.ReactNode }) { return <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-semibold text-slate-950 dark:text-white">{title}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p></div>{actions && <div className="flex flex-wrap gap-2">{actions}</div>}</div> }

function EmptyRow({ text }: { text: string }) { return <div className="flex min-h-24 items-center justify-center px-4 py-8 text-center text-sm text-slate-500"><ShieldCheck size={18} className="mr-2 text-slate-400"/>{text}</div> }
function PriorityBadge({ priority, translated = false }: { priority: CaseTask['priority'] | CaseDeadline['priority']; translated?: boolean }) { const { t } = useTranslation(); const config = { low: ['低', 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'], normal: ['通常', 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'], high: ['高', 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'], critical: ['最優先', 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'] }[priority]; return <span className={`inline-flex h-6 items-center rounded-md px-2 text-xs font-medium ${config[1]}`}>{translated ? t(`cases.priority.${priority}`) : config[0]}</span> }

function WorkspaceSkeleton({ onBack }: { onBack: () => void }) { const { t } = useTranslation(); return <div className="p-5"><button type="button" onClick={onBack} className={secondaryButton}><ArrowLeft size={16}/>{t('cases.workspace.backToList')}</button><div className="mt-4 h-52 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-tm-border dark:bg-tm-surface-elevated"/><div className="mt-4 h-96 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-tm-border dark:bg-tm-surface-elevated"/></div> }
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
