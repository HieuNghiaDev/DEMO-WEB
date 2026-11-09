import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import axios from 'axios'
import {
  CalendarDays,
  Check,
  CheckSquare2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileCheck2,
  FileText,
  LockKeyhole,
  Users,
  X,
} from 'lucide-react'

import { Button, IconButton, UserAvatar } from '../../components/ui'
import { caseWorkspaceApi } from './api'
import TaskStatusBadge from './TaskStatusBadge'
import { eligibleTaskDocumentIds, hasExistingDocumentTask, selectedEligibleTaskDocuments } from './taskCreationEligibility'
import type {
  CaseTaskEmployeeOption,
  CaseTaskOptionsResponse,
  CaseTaskRequirementOption,
  CreateCaseTaskBatchItem,
} from './types'

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

type TouchedAssignment = {
  employee?: boolean
  dueDate?: boolean
}

const emptyAssignment = (): Assignment => ({ assigned_employee_id: '', due_date: '', priority: 'normal' })
const fieldClass = 'h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 dark:border-white/10 dark:bg-[#111827] dark:text-white dark:focus:border-indigo-400'

export default function CreateCaseTasksDrawer({ caseId, isOpen, initialSelectedIds = [], onClose, onCreated }: Props) {
  if (!isOpen) return null

  return <CreateCaseTasksDrawerContent key={`${caseId}:${initialSelectedIds.join(',')}`} caseId={caseId} initialSelectedIds={initialSelectedIds} onClose={onClose} onCreated={onCreated} />
}

function CreateCaseTasksDrawerContent({ caseId, initialSelectedIds = [], onClose, onCreated }: Omit<Props, 'isOpen'>) {
  const [step, setStep] = useState(1)
  const [options, setOptions] = useState<CaseTaskOptionsResponse | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [assignments, setAssignments] = useState<Record<number, Assignment>>({})
  const [touchedAssignments, setTouchedAssignments] = useState<Record<number, TouchedAssignment>>({})
  const [bulkEmployee, setBulkEmployee] = useState('')
  const [bulkDate, setBulkDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const submitInFlight = useRef(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void caseWorkspaceApi.taskOptions(caseId, controller.signal)
      .then(value => {
        setOptions(value)
        const eligibleIds = eligibleTaskDocumentIds(value.required_documents)
        const selected = initialSelectedIds.filter(id => eligibleIds.includes(id))
        if (selected.length) {
          setSelectedIds(selected)
          setAssignments(Object.fromEntries(selected.map(id => [id, emptyAssignment()])))
        }
      })
      .catch((requestError) => {
        if (!axios.isCancel(requestError)) setError(apiMessage(requestError, '必要資料を読み込めませんでした。'))
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [caseId, initialSelectedIds])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, submitting])

  const documents = useMemo(() => options?.required_documents ?? [], [options])
  const selectedDocuments = useMemo(
    () => selectedEligibleTaskDocuments(documents, selectedIds),
    [documents, selectedIds],
  )
  const eligibleIds = eligibleTaskDocumentIds(documents)
  const selectedEligibleIds = selectedDocuments.map(document => document.id)
  const hasAssignees = (options?.employees.length ?? 0) > 0
  const allEligibleSelected = eligibleIds.length > 0 && eligibleIds.every(id => selectedIds.includes(id))
  const assignmentsComplete = selectedEligibleIds.length > 0
    && selectedEligibleIds.every(id => assignments[id]?.assigned_employee_id && assignments[id]?.due_date)
  const assignedCount = selectedEligibleIds.filter(id => assignments[id]?.assigned_employee_id).length
  const earliestDueDate = selectedEligibleIds
    .map(id => assignments[id]?.due_date)
    .filter(Boolean)
    .sort()[0]

  const toggle = (document: CaseTaskRequirementOption) => {
    if (hasExistingDocumentTask(document)) return
    setSelectedIds(current => current.includes(document.id)
      ? current.filter(id => id !== document.id)
      : [...current, document.id])
    setAssignments(current => current[document.id]
      ? current
      : { ...current, [document.id]: emptyAssignment() })
  }

  const toggleAllEligible = () => {
    if (allEligibleSelected) {
      setSelectedIds([])
      return
    }
    setSelectedIds(eligibleIds)
    setAssignments(current => Object.fromEntries(
      eligibleIds.map(id => [id, current[id] ?? emptyAssignment()]),
    ))
  }

  const updateAssignment = (documentId: number, assignmentPatch: Partial<Assignment>) => {
    setAssignments(current => ({
      ...current,
      [documentId]: { ...(current[documentId] ?? emptyAssignment()), ...assignmentPatch },
    }))
  }

  const markTouched = (documentId: number, field: keyof TouchedAssignment) => {
    setTouchedAssignments(current => ({
      ...current,
      [documentId]: { ...current[documentId], [field]: true },
    }))
  }

  const applyBulk = () => {
    if (!bulkEmployee && !bulkDate) return
    setAssignments(current => Object.fromEntries(selectedEligibleIds.map(id => [id, {
      ...(current[id] ?? emptyAssignment()),
      ...(bulkEmployee ? { assigned_employee_id: bulkEmployee } : {}),
      ...(bulkDate ? { due_date: bulkDate } : {}),
    }])))
  }

  const goNext = () => {
    setError(null)
    if (step === 1 && selectedDocuments.length === 0) return setError('タスクにする必要資料を選択してください。')
    if (step === 2 && !assignmentsComplete) return setError('各タスクの担当者と期限を設定してください。')
    setStep(current => Math.min(3, current + 1))
  }

  const submit = async () => {
    if (!assignmentsComplete || submitInFlight.current) return
    submitInFlight.current = true
    setSubmitting(true)
    setError(null)
    try {
      const tasks: CreateCaseTaskBatchItem[] = selectedEligibleIds.map(id => ({
        case_document_id: id,
        assigned_employee_id: Number(assignments[id].assigned_employee_id),
        due_date: assignments[id].due_date,
        priority: assignments[id].priority,
      }))
      await caseWorkspaceApi.createTaskBatch(caseId, tasks)
      // A privacy-scoped response may omit tasks assigned to someone else.
      await onCreated(tasks.length)
      onClose()
    } catch (requestError) {
      setError(apiMessage(requestError, 'タスクの作成に失敗しました。'))
      if (axios.isAxiosError(requestError) && requestError.response?.status === 409) {
        // Another manager may have assigned a document after this wizard opened.
        setStep(1)
        try {
          const fresh = await caseWorkspaceApi.taskOptions(caseId)
          setOptions(fresh)
          const eligible = eligibleTaskDocumentIds(fresh.required_documents)
          setSelectedIds(current => current.filter(id => eligible.includes(id)))
        } catch {
          // Fail closed if options cannot be refreshed; do not retry the POST automatically.
          setSelectedIds([])
          setOptions(null)
          setError(`${apiMessage(requestError, 'タスクの作成に失敗しました。')} 必要資料を再取得できませんでした。閉じてもう一度開いてください。`)
        }
      }
    } finally {
      submitInFlight.current = false
      setSubmitting(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-slate-950/55" onMouseDown={() => !submitting && onClose()}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="case-task-drawer-title"
        className="ml-auto flex h-full w-full flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0f172a] sm:w-[min(600px,100vw)] xl:w-[720px]"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="shrink-0 border-b border-slate-200 bg-white px-5 py-5 dark:border-white/10 dark:bg-[#0f172a] sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600 dark:border-indigo-400/15 dark:bg-indigo-500/10 dark:text-indigo-300">
                <ClipboardCheck size={20} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 id="case-task-drawer-title" className="text-xl font-bold tracking-tight text-slate-950 dark:text-white">タスクを追加</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">必要資料ごとに担当者と期限を設定します。</p>
              </div>
            </div>
            <IconButton aria-label="閉じる" variant="ghost" size="lg" onClick={onClose} disabled={submitting}>
              <X aria-hidden="true" />
            </IconButton>
          </div>

          <TaskStepper step={step} />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-4 py-5 dark:bg-[#0b1220] sm:px-6">
          {error && (
            <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-medium text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          )}

          {loading ? <DrawerSkeleton /> : step === 1 ? (
            <section aria-labelledby="task-step-one-heading">
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <h3 id="task-step-one-heading" className="text-base font-bold text-slate-950 dark:text-white">必要資料を選択</h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">「必要」と判定された資料のみ表示しています。</p>
                </div>
                {selectedDocuments.length > 0 && (
                  <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300" aria-live="polite">
                    選択中 {selectedDocuments.length}件
                  </span>
                )}
              </div>

              {!hasAssignees && (
                <div role="alert" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
                  担当者として選択できる社員がいません。
                </div>
              )}

              {documents.length > 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#111827] sm:p-4">
                  {eligibleIds.length > 0 && (
                    <div className="mb-3 flex justify-end">
                      <button type="button" onClick={toggleAllEligible} className="rounded-md px-2 py-1 text-xs font-semibold text-indigo-600 outline-none hover:bg-indigo-50 focus-visible:ring-2 focus-visible:ring-indigo-500/30 dark:text-indigo-300 dark:hover:bg-indigo-500/10">
                        {allEligibleSelected ? '選択を解除' : 'すべて選択'}
                      </button>
                    </div>
                  )}
                  <div className="space-y-2.5">
                    {documents.map(document => (
                      <RequirementCard
                        key={document.id}
                        document={document}
                        isSelected={selectedIds.includes(document.id)}
                        onToggle={() => toggle(document)}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState />
              )}
            </section>
          ) : step === 2 ? (
            <section aria-labelledby="task-step-two-heading" className="space-y-5">
              <div>
                <h3 id="task-step-two-heading" className="text-base font-bold text-slate-950 dark:text-white">担当者・期限を設定</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">一括設定後も各タスクを個別に変更できます。</p>
              </div>

              <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 dark:border-indigo-400/15 dark:bg-indigo-500/[0.07]">
                <div className="mb-3 flex items-start gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-indigo-600 shadow-sm dark:bg-[#151f32] dark:text-indigo-300"><Users size={16} aria-hidden="true" /></span>
                  <div><h4 className="text-sm font-bold text-slate-900 dark:text-white">一括設定</h4><p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">任意の値を選択中のすべての項目に適用します。</p></div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <EmployeePicker value={bulkEmployee} onChange={setBulkEmployee} employees={options?.employees ?? []} label="担当者" optional />
                  <DateField value={bulkDate} onChange={setBulkDate} label="期限" />
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={applyBulk} disabled={!bulkEmployee && !bulkDate} className="mt-3 border-indigo-200 text-indigo-700 dark:border-indigo-400/20 dark:text-indigo-200">
                  選択した項目に適用
                </Button>
              </div>

              <div className="space-y-3">
                {selectedDocuments.map((document, index) => {
                  const assignment = assignments[document.id] ?? emptyAssignment()
                  const touched = touchedAssignments[document.id] ?? {}
                  return (
                    <article key={document.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#111827]">
                      <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-white/[0.06]">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><FileText size={16} aria-hidden="true" /></span>
                          <h4 className="truncate text-sm font-bold text-slate-950 dark:text-white">{document.document_type?.name_ja ?? document.title}</h4>
                        </div>
                        <span className="shrink-0 text-[11px] font-semibold text-slate-400">{index + 1} / {selectedDocuments.length}</span>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <EmployeePicker
                          value={assignment.assigned_employee_id}
                          onChange={value => updateAssignment(document.id, { assigned_employee_id: value })}
                          onTouched={() => markTouched(document.id, 'employee')}
                          employees={options?.employees ?? []}
                          hasError={!!touched.employee && !assignment.assigned_employee_id}
                        />
                        <DateField
                          value={assignment.due_date}
                          onChange={value => updateAssignment(document.id, { due_date: value })}
                          onBlur={() => markTouched(document.id, 'dueDate')}
                          hasError={!!touched.dueDate && !assignment.due_date}
                          required
                        />
                      </div>
                      <label className="mt-4 block space-y-1.5">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">優先度</span>
                        <select value={assignment.priority} onChange={event => updateAssignment(document.id, { priority: event.target.value as Assignment['priority'] })} className={fieldClass}>
                          <option value="low">低</option>
                          <option value="normal">通常</option>
                          <option value="high">高</option>
                          <option value="critical">最優先</option>
                        </select>
                      </label>
                    </article>
                  )
                })}
              </div>
            </section>
          ) : (
            <section aria-labelledby="task-step-three-heading">
              <div>
                <h3 id="task-step-three-heading" className="text-base font-bold text-slate-950 dark:text-white">作成内容を確認</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{selectedDocuments.length}件のタスクを作成します。</p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2" aria-label="作成内容の概要">
                <SummaryChip label={`${selectedDocuments.length} タスク`} />
                <SummaryChip label={`${assignedCount} 担当設定済み`} />
                <SummaryChip label={`最短期限 ${earliestDueDate ? earliestDueDate.replaceAll('-', '/') : '—'}`} />
              </div>

              <div className="mt-4 space-y-3">
                {selectedDocuments.map(document => {
                  const assignment = assignments[document.id]
                  const employee = options?.employees.find(item => item.id === Number(assignment.assigned_employee_id))
                  return (
                    <article key={document.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#111827]">
                      <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3 dark:border-white/[0.06]">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><CheckSquare2 size={16} aria-hidden="true" /></span>
                        <strong className="text-sm text-slate-950 dark:text-white">{document.document_type?.name_ja ?? document.title}</strong>
                      </div>
                      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div><dt className="text-[11px] font-medium text-slate-400">担当者</dt><dd className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200"><UserAvatar name={employee?.full_name} imageSrc={employee?.avatar_path} stableKey={employee?.id} size="xs" shape="circle" />{employee?.full_name}</dd></div>
                        <div><dt className="text-[11px] font-medium text-slate-400">期限</dt><dd className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"><CalendarDays size={14} className="text-indigo-500" aria-hidden="true" />{assignment.due_date.replaceAll('-', '/')}</dd></div>
                      </dl>
                    </article>
                  )
                })}
              </div>
            </section>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-[#0f172a] sm:px-6">
          <Button type="button" variant="secondary" onClick={() => step === 1 ? onClose() : setStep(current => current - 1)} disabled={submitting} icon={<ChevronLeft size={15} aria-hidden="true" />}>
            {step === 1 ? 'キャンセル' : '戻る'}
          </Button>
          {step < 3 ? (
            <Button
              type="button"
              variant="primary"
              onClick={goNext}
              disabled={loading || submitting || !hasAssignees || (step === 1 ? selectedDocuments.length === 0 : !assignmentsComplete)}
              icon={<ChevronRight size={15} aria-hidden="true" />}
              iconPosition="right"
              className="min-w-28"
            >
              {step === 1 ? '次へ' : '確認へ'}
            </Button>
          ) : (
            <Button type="button" variant="primary" onClick={() => void submit()} disabled={!assignmentsComplete} loading={submitting} className="min-w-44">
              {submitting ? 'タスクを作成中...' : `${selectedDocuments.length}件のタスクを作成`}
            </Button>
          )}
        </footer>
      </aside>
    </div>,
    document.body,
  )
}

function TaskStepper({ step }: { step: number }) {
  const steps = ['必要資料', '担当者・期限', '確認']
  return (
    <ol className="mt-5 grid grid-cols-3 items-center" aria-label="タスク作成手順">
      {steps.map((label, index) => {
        const number = index + 1
        const active = number === step
        const completed = number < step
        return (
            <li key={label} aria-current={active ? 'step' : undefined} className={`relative flex min-w-0 items-center gap-1.5 text-[11px] font-semibold sm:text-xs ${active || completed ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-400 dark:text-slate-500'}`}>
              <span className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] ${active ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm' : completed ? 'border-indigo-500 bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300' : 'border-slate-300 bg-white text-slate-400 dark:border-slate-600 dark:bg-[#111827]'}`}>
                {completed ? <Check size={13} aria-hidden="true" /> : number}
              </span>
              <span className="relative z-10 truncate bg-white pr-2 dark:bg-[#0f172a]">{label}</span>
              {index < steps.length - 1 && <span aria-hidden="true" className={`absolute left-[calc(50%+1rem)] right-[-50%] top-3 z-0 h-px ${number < step ? 'bg-indigo-400' : 'bg-slate-200 dark:bg-slate-700'}`} />}
            </li>
        )
      })}
    </ol>
  )
}

function RequirementCard({ document, isSelected, onToggle }: { document: CaseTaskRequirementOption; isSelected: boolean; onToggle: () => void }) {
  const existingTask = document.case_tasks[0]
  const disabled = hasExistingDocumentTask(document)
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isSelected}
      disabled={disabled}
      onClick={onToggle}
      className={`group flex w-full items-start gap-3 rounded-xl border p-3.5 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-indigo-500/30 sm:p-4 ${disabled ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-500 dark:border-white/[0.07] dark:bg-[#0f172a]/70' : isSelected ? 'border-indigo-500 bg-indigo-50/55 ring-1 ring-inset ring-indigo-500/10 dark:bg-indigo-500/[0.08]' : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/25 dark:border-white/10 dark:bg-[#151f32] dark:hover:border-indigo-400/30 dark:hover:bg-indigo-500/[0.04]'}`}
    >
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${disabled ? 'border-slate-300 bg-slate-100 text-slate-400 dark:border-slate-600 dark:bg-slate-800' : isSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-transparent group-hover:border-indigo-400 dark:border-slate-600 dark:bg-[#111827]'}`}>
        {disabled ? <LockKeyhole size={11} aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}
      </span>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${disabled ? 'bg-slate-200/70 text-slate-500 dark:bg-slate-800' : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300'}`}><FileText size={17} aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-sm font-bold text-slate-950 dark:text-white">{document.document_type?.name_ja ?? document.title}</strong>
          {disabled ? <span className="rounded-full bg-slate-200/70 px-2 py-1 text-[10px] font-semibold text-slate-600 dark:bg-slate-700/70 dark:text-slate-300">タスク作成済み</span> : isSelected ? <span className="rounded-full bg-indigo-100 px-2 py-1 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">選択中</span> : null}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>{document.category || '必要資料'}</span>
          {document.document_type?.code && <span className="font-mono text-[10px] text-slate-400">{document.document_type.code}</span>}
        </span>
        {existingTask && <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400"><span>担当 {existingTask.assigned_employee?.full_name ?? '未割当'} · 期限 {existingTask.due_at ? formatDate(existingTask.due_at) : '未設定'}</span><TaskStatusBadge status={existingTask.status}/></span>}
      </span>
    </button>
  )
}

function EmployeePicker({ value, onChange, employees, label = '担当者', optional = false, hasError = false, onTouched }: {
  value: string
  onChange: (value: string) => void
  employees: CaseTaskEmployeeOption[]
  label?: string
  optional?: boolean
  hasError?: boolean
  onTouched?: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const labelId = useId()
  const selectedEmployee = employees.find(employee => employee.id === Number(value))

  useEffect(() => {
    if (!isOpen) return
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
        onTouched?.()
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setIsOpen(false)
        onTouched?.()
      }
    }
    document.addEventListener('pointerdown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape, true)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape, true)
    }
  }, [isOpen, onTouched])

  return (
    <div ref={rootRef} className="relative space-y-1.5">
      <span id={labelId} className="block text-xs font-semibold text-slate-600 dark:text-slate-300">{label}{!optional && ' *'}</span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby={labelId}
        aria-invalid={hasError || undefined}
        onClick={() => setIsOpen(current => !current)}
        className={`flex h-11 w-full items-center gap-2 rounded-lg border bg-white px-2.5 text-left text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-indigo-500/20 dark:bg-[#111827] ${hasError ? 'border-red-400 dark:border-red-500' : isOpen ? 'border-indigo-500 dark:border-indigo-400' : 'border-slate-300 dark:border-white/10'}`}
      >
        <UserAvatar name={selectedEmployee?.full_name} imageSrc={selectedEmployee?.avatar_path} stableKey={selectedEmployee?.id ?? 'unassigned'} size="xs" shape="circle" />
        <span className="min-w-0 flex-1">
          <span className={`block truncate font-medium ${selectedEmployee ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>{selectedEmployee?.full_name ?? '選択してください'}</span>
          {selectedEmployee && <span className="block text-[10px] text-slate-400">社員</span>}
        </span>
        <ChevronDown size={15} className={`shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {hasError && <p className="text-[11px] font-medium text-red-600 dark:text-red-400">担当者を選択してください。</p>}
      {isOpen && (
        <div role="listbox" aria-labelledby={labelId} className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-[#151f32]">
          {optional && <EmployeeOption isSelected={!value} label="指定しない" onClick={() => { onChange(''); setIsOpen(false); onTouched?.() }} />}
          {employees.map(employee => (
            <EmployeeOption
              key={employee.id}
              employee={employee}
              isSelected={employee.id === selectedEmployee?.id}
              onClick={() => { onChange(String(employee.id)); setIsOpen(false); onTouched?.() }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function EmployeeOption({ employee, label, isSelected, onClick }: { employee?: CaseTaskEmployeeOption; label?: string; isSelected: boolean; onClick: () => void }) {
  return (
    <button type="button" role="option" aria-selected={isSelected} onClick={onClick} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500/25 dark:hover:bg-white/[0.05] ${isSelected ? 'bg-indigo-50 dark:bg-indigo-500/10' : ''}`}>
      {employee ? <UserAvatar name={employee.full_name} imageSrc={employee.avatar_path} stableKey={employee.id} size="sm" shape="circle" /> : <span className="h-8 w-8 rounded-full border border-dashed border-slate-300 dark:border-slate-600" />}
      <span className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-900 dark:text-white">{employee?.full_name ?? label}</strong>{employee && <span className="mt-0.5 block text-[10px] text-slate-400">社員</span>}</span>
      {isSelected && <Check size={14} className="text-indigo-600 dark:text-indigo-300" aria-hidden="true" />}
    </button>
  )
}

function DateField({ value, onChange, onBlur, label = '期限', required = false, hasError = false }: {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  label?: string
  required?: boolean
  hasError?: boolean
}) {
  return (
    <label className="space-y-1.5">
      <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">{label}{required && ' *'}</span>
      <span className="relative block">
        <CalendarDays size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input type="date" value={value} onChange={event => onChange(event.target.value)} onBlur={onBlur} required={required} aria-invalid={hasError || undefined} className={`${fieldClass} pl-9 ${hasError ? 'border-red-400 dark:border-red-500' : ''}`} />
      </span>
      {hasError && <p className="text-[11px] font-medium text-red-600 dark:text-red-400">期限を設定してください。</p>}
    </label>
  )
}

function SummaryChip({ label }: { label: string }) {
  return <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm dark:border-white/10 dark:bg-[#111827] dark:text-slate-300">{label}</span>
}

function DrawerSkeleton() {
  return <div role="status" className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#111827]" aria-label="必要資料を読み込み中"><div className="space-y-3"><div className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800"/><div className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800"/><div className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800"/></div></div>
}

function EmptyState() {
  return <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center dark:border-slate-700 dark:bg-[#111827]"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"><FileCheck2 size={20} aria-hidden="true" /></span><h4 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">選択できる必要資料がありません</h4><p className="mt-1 max-w-sm text-xs leading-5 text-slate-500 dark:text-slate-400">必要資料が追加されると、ここからタスクを作成できます。</p></div>
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
}

function apiMessage(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) return fallback
  const validation = error.response?.data?.errors as Record<string, string[]> | undefined
  return validation ? Object.values(validation).flat()[0] : error.response?.data?.message ?? fallback
}
