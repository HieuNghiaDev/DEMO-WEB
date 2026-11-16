import { useEffect, useId, useRef, useState } from 'react'
import axios from 'axios'
import { CalendarDays, Check, ChevronDown, ClipboardCheck, FileText, Filter, Flag, Layers, LockKeyhole, Search, UserRound, X } from 'lucide-react'

import { Button, IconButton, ModalShell } from '../../components/ui'
import { caseWorkspaceApi } from './api'
import TaskStatusBadge from './TaskStatusBadge'
import { eligibleTaskDocumentIds, hasExistingDocumentTask, selectedEligibleTaskDocuments } from './taskCreationEligibility'
import type { CaseTaskEmployeeOption, CaseTaskOptionsResponse, CaseTaskRequirementOption, CreateCaseTaskBatchItem } from './types'
import './createCaseTasks.css'

type Props = {
  caseId: number
  isOpen: boolean
  initialSelectedIds?: number[]
  onClose: () => void
  onCreated: (count: number) => Promise<void> | void
}

type Assignment = {
  assigned_employee_id: string
  due_date: string
  priority: 'low' | 'normal' | 'high' | 'critical'
}

const batchLimit = 100
const emptyIds: number[] = []
const defaultAssignment: Assignment = { assigned_employee_id: '', due_date: '', priority: 'normal' }
const priorityLabels = { low: '低', normal: '通常', high: '高', critical: '最優先' }
const fieldClass = 'block h-10 w-full min-w-0 rounded-lg border border-[var(--tm-border-strong)] bg-[var(--tm-control)] px-3 text-sm text-[var(--tm-text-primary)] outline-none focus:border-[var(--tm-border-focus)] focus:ring-2 focus:ring-[var(--tm-focus-ring)] disabled:opacity-60'
const labelClass = 'grid min-w-0 gap-1.5 text-sm font-semibold'

export default function CreateCaseTasksDrawer({ caseId, isOpen, initialSelectedIds = emptyIds, onClose, onCreated }: Props) {
  if (!isOpen) return null

  return <CreateCaseTasksDrawerContent key={`${caseId}:${initialSelectedIds.join(',')}`} caseId={caseId} initialSelectedIds={initialSelectedIds} onClose={onClose} onCreated={onCreated} />
}

function CreateCaseTasksDrawerContent({ caseId, initialSelectedIds = emptyIds, onClose, onCreated }: Omit<Props, 'isOpen'>) {
  const titleId = useId()
  const [options, setOptions] = useState<CaseTaskOptionsResponse | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [shared, setShared] = useState(defaultAssignment)
  const [overrides, setOverrides] = useState<Record<number, Partial<Assignment>>>({})
  const [editingId, setEditingId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [selectedOnly, setSelectedOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const submitInFlight = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [loadRevision, setLoadRevision] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    void caseWorkspaceApi.taskOptions(caseId, controller.signal)
      .then(value => {
        if (controller.signal.aborted) return
        setOptions(value)
        setSelectedIds(selectedEligibleTaskDocuments(value.required_documents, initialSelectedIds).slice(0, batchLimit).map(document => document.id))
      })
      .catch(requestError => {
        if (!controller.signal.aborted) setError(apiMessage(requestError, '必要資料を読み込めませんでした。'))
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [caseId, initialSelectedIds, loadRevision])

  const documents = options?.required_documents ?? []
  const employees = options?.employees ?? []
  const employeeById = new Map(employees.map(employee => [String(employee.id), employee]))
  const selection = new Set(selectedIds)
  const selectedDocuments = selectedEligibleTaskDocuments(documents, selectedIds)
  const availableCount = eligibleTaskDocumentIds(documents).length
  const remainingSlots = batchLimit - selectedDocuments.length
  const keyword = normalize(query.trim())
  const matching = documents.filter(document => normalize([
    document.title, document.document_type?.name_ja, document.document_type?.code, document.category,
  ].join(' ')).includes(keyword))
  const visibleEligible = matching.filter(document => !hasExistingDocumentTask(document)
    && (!selectedOnly || selection.has(document.id)))
  const visible = selectedOnly ? visibleEligible : [...visibleEligible, ...matching.filter(hasExistingDocumentTask)]
  const visibleEligibleIds = visibleEligible.map(document => document.id)
  const visibleSelectionCount = visibleEligibleIds.filter(id => selection.has(id)).length
  const allVisibleSelected = visibleEligibleIds.length > 0 && visibleSelectionCount === visibleEligibleIds.length
  const clearVisibleSelection = allVisibleSelected || (!remainingSlots && visibleSelectionCount > 0)
  const effective = (id: number): Assignment => ({ ...shared, ...overrides[id] })
  const invalidCount = selectedDocuments.filter(({ id }) => {
    const assignment = effective(id)
    return !employeeById.has(assignment.assigned_employee_id) || !assignment.due_date
  }).length
  const canSubmit = Boolean(options && selectedDocuments.length && !invalidCount)
  const assignedIds = new Set(selectedDocuments.map(({ id }) => effective(id).assigned_employee_id))
  const dueDates = new Set(selectedDocuments.map(({ id }) => effective(id).due_date))
  const commonDueDate = dueDates.size === 1 ? dueDates.values().next().value : undefined
  const singleAssignee = assignedIds.size === 1 ? employeeById.get(assignedIds.values().next().value ?? '') : undefined

  const toggleDocument = (id: number) => {
    const document = documents.find(item => item.id === id)
    if (!document || hasExistingDocumentTask(document) || !employees.length || submitInFlight.current) return
    setSelectedIds(current => current.includes(id) ? current.filter(item => item !== id)
      : current.length < batchLimit ? [...current, id] : current)
  }

  const toggleVisible = () => {
    if (!employees.length || submitInFlight.current) return
    if (clearVisibleSelection) {
      const visibleIds = new Set(visibleEligibleIds)
      setSelectedIds(current => current.filter(id => !visibleIds.has(id)))
    } else {
      setSelectedIds(current => {
        const selected = new Set(current)
        const additions = visibleEligibleIds.filter(id => !selected.has(id)).slice(0, batchLimit - current.length)
        return [...current, ...additions]
      })
    }
  }

  const submit = async () => {
    if (!canSubmit || submitInFlight.current) return
    submitInFlight.current = true
    setSubmitting(true)
    setError(null)
    const tasks: CreateCaseTaskBatchItem[] = selectedDocuments.map(({ id }) => {
      const assignment = effective(id)
      return {
        case_document_id: id,
        assigned_employee_id: Number(assignment.assigned_employee_id),
        due_date: assignment.due_date,
        priority: assignment.priority,
      }
    })

    try {
      await caseWorkspaceApi.createTaskBatch(caseId, tasks)
    } catch (requestError) {
      const message = apiMessage(requestError, 'タスクの作成に失敗しました。')
      setError(message)
      if (axios.isAxiosError(requestError) && requestError.response?.status === 409) {
        try {
          const fresh = await caseWorkspaceApi.taskOptions(caseId)
          setOptions(fresh)
          const eligible = new Set(eligibleTaskDocumentIds(fresh.required_documents))
          setSelectedIds(current => current.filter(id => eligible.has(id)))
          setSelectedOnly(false)
          setQuery('')
        } catch {
          setOptions(null)
          setSelectedIds([])
          setError(message + ' 必要資料を再取得できませんでした。')
        }
      }
      submitInFlight.current = false
      setSubmitting(false)
      return
    }

    onClose()
    await onCreated(tasks.length)
  }

  return (
    <ModalShell isOpen title="タスクを追加" onClose={onClose} dismissible={!submitting} customContent overlayClassName="flex justify-end overflow-hidden bg-black/45">
      <aside role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="case-task-create flex h-full w-full max-w-[560px] flex-col overflow-hidden border-[var(--tm-border)] bg-[var(--tm-surface)] text-[var(--tm-text-primary)] shadow-xl sm:border-l">
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] px-4 py-3.5 sm:px-5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--tm-primary-muted)] text-[var(--tm-primary)]">
            <ClipboardCheck size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold leading-tight">タスクを追加</h2>
            <p className="mt-1 text-xs leading-relaxed text-[var(--tm-text-secondary)]">必要資料ごとにタスクを作成します。</p>
          </div>
          <IconButton aria-label="閉じる" variant="ghost" size="md" onClick={onClose} disabled={submitting} className="shrink-0">
            <X size={17} aria-hidden="true" />
          </IconButton>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {loading ? (
            <p role="status" className="py-6 text-center text-sm text-[var(--tm-text-secondary)]">必要資料を読み込み中…</p>
          ) : !options ? (
            <Button type="button" onClick={() => { setError(null); setLoading(true); setLoadRevision(value => value + 1) }}>再読み込み</Button>
          ) : (
            <fieldset disabled={submitting} className="min-w-0 space-y-5">
              {availableCount > 0 && employees.length > 0 && (
                <section aria-label="共通の割り当て" className="rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] p-3.5 sm:p-4">
                  <div className="mb-3.5 flex items-start gap-2.5 sm:mb-4">
                    <Layers size={17} className="mt-0.5 shrink-0 text-[var(--tm-text-secondary)]" aria-hidden="true" />
                    <div>
                      <h3 className="text-sm font-semibold">共通の割り当て</h3>
                      <p className="mt-0.5 text-xs leading-relaxed text-[var(--tm-text-secondary)]">選択した資料すべてに適用されます。例外は各資料で変更できます。</p>
                    </div>
                  </div>
                  <AssignmentFields assignment={shared} employees={employees} showRequiredMarkers onChange={patch => setShared(current => ({ ...current, ...patch }))} />
                </section>
              )}
              {employees.length === 0 && <p role="alert" className="text-sm text-[var(--tm-warning)]">担当者として選択できる社員がいません。</p>}
              <section aria-label="必要資料">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <FileText size={17} className="text-[var(--tm-text-secondary)]" aria-hidden="true" />必要資料
                  </h3>
                  <span className="text-xs tabular-nums text-[var(--tm-text-secondary)]">{availableCount}件作成可能</span>
                </div>
                {documents.length > 0 ? <>
                  <div className="mb-3 flex flex-wrap items-center gap-2 sm:mb-4 sm:gap-3">
                    <label className="relative min-w-0 flex-1 basis-36">
                      <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tm-text-muted)]" aria-hidden="true" />
                      <input type="search" value={query} onChange={event => setQuery(event.target.value)}
                        aria-label="資料名・コードで検索" placeholder="資料名・コードで検索" className={fieldClass + ' pl-9'} />
                    </label>
                    <Button type="button" variant={selectedOnly ? 'secondary' : 'outline'} aria-pressed={selectedOnly}
                      size="sm" className="min-h-10 shrink-0 whitespace-nowrap" icon={<Filter size={15} aria-hidden="true" />}
                      onClick={() => setSelectedOnly(value => !value)}>選択済みを表示</Button>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface)]">
                    <div className="flex min-h-10 items-center justify-between gap-2 border-b border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] pr-3 sm:pr-4">
                      <label className="flex min-h-10 cursor-pointer items-center gap-3 px-3 text-sm font-semibold sm:gap-4 sm:px-4">
                        <input type="checkbox" aria-label="表示中をすべて選択" checked={allVisibleSelected} onChange={toggleVisible}
                          ref={input => { if (input) input.indeterminate = !allVisibleSelected && visibleSelectionCount > 0 }}
                          disabled={!employees.length || !visibleEligibleIds.length || (!remainingSlots && !clearVisibleSelection)}
                          className="size-[18px] shrink-0 accent-[var(--tm-primary)] disabled:opacity-50" />
                        資料
                      </label>
                      <span className="text-xs tabular-nums text-[var(--tm-text-secondary)]">{visible.length}件表示</span>
                    </div>
                    {visible.length > 0 ? <ul className="divide-y divide-[var(--tm-border)]">
                      {visible.map(document => {
                        const id = document.id
                        const isSelected = selection.has(id)
                        const locked = hasExistingDocumentTask(document)
                        return <RequirementRow key={id} document={document} isSelected={isSelected}
                          disabled={locked || !employees.length || (!isSelected && !remainingSlots)}
                          expanded={isSelected && editingId === id}
                          override={overrides[id]} assignment={effective(id)} employees={employees}
                          onToggle={() => toggleDocument(id)}
                          onEdit={() => setEditingId(current => current === id ? null : id)}
                          onChange={patch => setOverrides(current => ({ ...current, [id]: { ...current[id], ...patch } }))}
                          onReset={() => setOverrides(current => {
                            const next = { ...current }
                            delete next[id]
                            return next
                          })} />
                      })}
                    </ul> : <p className="px-3 py-5 text-sm text-[var(--tm-text-secondary)]">{selectedOnly && selectedDocuments.length === 0 ? '資料が選択されていません。' : '条件に一致する資料がありません。'}</p>}
                  </div>
                  {!remainingSlots && <p role="status" className="mt-2 text-xs text-[var(--tm-text-secondary)]">一度に作成できるタスクは{batchLimit}件までです。</p>}
                </> : <p className="rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface)] p-4 text-sm text-[var(--tm-text-secondary)]">タスクにできる必要資料がありません。</p>}
              </section>
            </fieldset>
          )}
        </div>

        <footer className="grid shrink-0 grid-cols-[1fr_auto] items-center gap-2.5 border-t border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:grid-cols-[1fr_auto_auto] sm:px-5">
          {error && (
            <p role="alert" className="col-span-full max-h-24 overflow-auto break-words rounded-md border border-[var(--tm-danger)]/30 px-3 py-2 text-xs text-[var(--tm-danger)]">{error}</p>
          )}
          <div className="col-span-full min-w-0 sm:col-span-1" aria-live="polite">
            <p className="text-sm font-semibold tabular-nums">{selectedDocuments.length}件選択中</p>
            {selectedDocuments.length > 0 && <p className="mt-0.5 break-words text-xs text-[var(--tm-text-secondary)]">
              {invalidCount ? `${invalidCount}件の担当者または期限を設定してください。`
                : `${singleAssignee ? singleAssignee.full_name : `${assignedIds.size}名`} に割り当て${commonDueDate ? ` · 期限 ${formatDate(commonDueDate)}` : ''}`}
            </p>}
          </div>
          <Button type="button" variant="outline" className="justify-self-end whitespace-nowrap" onClick={onClose} disabled={submitting}>キャンセル</Button>
          <Button type="button" variant="primary" className="whitespace-nowrap"
            icon={<Check size={16} aria-hidden="true" />} onClick={() => void submit()} loading={submitting} disabled={!canSubmit}>
            {submitting ? '作成中…' : selectedDocuments.length ? `${selectedDocuments.length}件のタスクを作成` : 'タスクを作成'}
          </Button>
        </footer>
      </aside>
    </ModalShell>
  )
}

function AssignmentFields({ assignment, employees, onChange, showRequiredMarkers = false }: {
  assignment: Assignment
  employees: CaseTaskEmployeeOption[]
  onChange: (patch: Partial<Assignment>) => void
  showRequiredMarkers?: boolean
}) {
  const urgentPriority = assignment.priority === 'high' || assignment.priority === 'critical'
  return <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] gap-2.5 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_minmax(0,0.95fr)] sm:gap-4">
    <label className={labelClass + ' col-span-2 sm:col-span-1'}>
      <span className="flex items-center gap-1.5"><UserRound size={17} className="text-[var(--tm-text-secondary)]" aria-hidden="true" />担当者{showRequiredMarkers && <span className="text-[var(--tm-danger)]" aria-hidden="true">*</span>}</span>
      <select value={assignment.assigned_employee_id} onChange={event => onChange({ assigned_employee_id: event.target.value })} className={fieldClass}>
        <option value="">担当者を選択</option>
        {employees.map(employee => <option key={employee.id} value={String(employee.id)}>{employee.full_name}</option>)}
      </select>
    </label>
    <label className={labelClass}>
      <span className="flex items-center gap-1.5"><CalendarDays size={17} className="text-[var(--tm-text-secondary)]" aria-hidden="true" />期限{showRequiredMarkers && <span className="text-[var(--tm-danger)]" aria-hidden="true">*</span>}</span>
      <input type="date" value={assignment.due_date} onChange={event => onChange({ due_date: event.target.value })} className={fieldClass + ' max-w-full'} />
    </label>
    <label className={labelClass}>
      <span className="flex items-center gap-1.5"><Flag size={17} className="text-[var(--tm-text-secondary)]" aria-hidden="true" />優先度</span>
      <span className="relative">
        {urgentPriority && <Flag size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 fill-current text-[var(--tm-danger)]" aria-hidden="true" />}
        <select value={assignment.priority} onChange={event => onChange({ priority: event.target.value as Assignment['priority'] })} className={fieldClass + (urgentPriority ? ' pl-9' : '')}>
          {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </span>
    </label>
  </div>
}

function RequirementRow({ document, isSelected, disabled, expanded, override, assignment, employees, onToggle, onEdit, onChange, onReset }: {
  document: CaseTaskRequirementOption
  isSelected: boolean
  disabled: boolean
  expanded: boolean
  override?: Partial<Assignment>
  assignment: Assignment
  employees: CaseTaskEmployeeOption[]
  onToggle: () => void
  onEdit: () => void
  onChange: (patch: Partial<Assignment>) => void
  onReset: () => void
}) {
  const editorId = useId()
  const existingTask = document.case_tasks[0]
  const locked = hasExistingDocumentTask(document)
  const title = document.document_type?.name_ja ?? document.title
  const overriddenEmployee = override?.assigned_employee_id === undefined ? null
    : employees.find(employee => String(employee.id) === assignment.assigned_employee_id)?.full_name ?? '担当者未設定'
  const overrideSummary = [
    overriddenEmployee,
    override?.due_date === undefined ? null : assignment.due_date ? formatDate(assignment.due_date) : '期限未設定',
    override?.priority === undefined ? null : priorityLabels[assignment.priority],
  ].filter(Boolean).join(' · ')

  return <li className={isSelected ? 'bg-[var(--tm-surface-active)]' : undefined}>
    <div className="flex min-w-0 items-stretch">
      <label className={`flex min-h-11 min-w-0 flex-1 items-center gap-2.5 px-3 py-2 sm:gap-4 sm:px-4 ${disabled ? 'cursor-default' : 'cursor-pointer hover:bg-[var(--tm-surface-hover)]'}`}>
        {locked ? <LockKeyhole size={15} className="shrink-0 text-[var(--tm-text-muted)]" aria-hidden="true" />
          : <input type="checkbox" checked={isSelected} disabled={disabled} onChange={onToggle}
              aria-label={title} className="size-[18px] shrink-0 accent-[var(--tm-primary)]" />}
        <FileText size={16} className="shrink-0 text-[var(--tm-text-secondary)]" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {document.document_type?.code && <span className="whitespace-nowrap rounded-md bg-[var(--tm-surface-elevated)] px-1.5 py-0.5 font-mono text-xs text-[var(--tm-text-secondary)]">{document.document_type.code}</span>}
            <strong className="min-w-0 [overflow-wrap:anywhere] text-sm font-medium">{title}</strong>
          </span>
          {locked && <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--tm-text-secondary)]">
            <span>タスク作成済み</span>
            {existingTask && <>
              <span>{existingTask.assigned_employee?.full_name ?? '未割当'} · 期限 {existingTask.due_at ? formatDate(existingTask.due_at) : '未設定'}</span>
              <TaskStatusBadge status={existingTask.status} />
            </>}
          </span>}
          {isSelected && overrideSummary && <span className="mt-0.5 block break-words text-xs text-[var(--tm-text-secondary)]">{overrideSummary}</span>}
        </span>
      </label>
      {isSelected && <button type="button" onClick={onEdit} aria-expanded={expanded} aria-controls={expanded ? editorId : undefined}
        aria-label={`${title}の個別設定`} className="my-1.5 mr-2 flex min-h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-[var(--tm-primary)] hover:bg-[var(--tm-surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--tm-focus-ring)]">
        {override ? '個別設定済み' : '個別設定'}<ChevronDown size={14} className={expanded ? 'rotate-180' : undefined} aria-hidden="true" />
      </button>}
    </div>
    {expanded && <div id={editorId} role="group" aria-label={`${title}の割り当て`} className="border-t border-[var(--tm-border)] bg-[var(--tm-surface)] px-3 py-3">
      <AssignmentFields assignment={assignment} employees={employees} onChange={onChange} />
      {override && <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={onReset}>共通設定に戻す</Button>}
    </div>}
  </li>
}

function normalize(value: string) {
  return value.normalize('NFKC').toLowerCase()
}

function formatDate(value: string) {
  if (value.length === 10) return value.replaceAll('-', '/')
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
}

function apiMessage(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) return fallback
  const validation = error.response?.data?.errors as Record<string, string[]> | undefined
  return (validation ? Object.values(validation).flat()[0] : error.response?.data?.message) ?? fallback
}
