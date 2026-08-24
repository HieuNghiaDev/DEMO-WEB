import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, CheckCircle2, Clock3, Play, RefreshCw, ShieldCheck, X, XCircle } from 'lucide-react'
import api from '../services/api'

type ApprovalStatus = 'pending' | 'approved' | 'rejected'
type ApprovalAction = 'approve' | 'reject' | 'execute'
type ApprovalUser = { id: number; name: string }
type ApprovalRequest = {
  id: number
  action_type: string
  tool_name: string | null
  payload: Record<string, unknown> | null
  requested_by: ApprovalUser | null
  status: ApprovalStatus
  created_at: string | null
  approved_by: ApprovalUser | null
  approved_at: string | null
  rejected_by: ApprovalUser | null
  rejected_at: string | null
  executed_by: ApprovalUser | null
  executed_at: string | null
}

const statusMeta: Record<ApprovalStatus, { label: string; className: string }> = {
  pending: { label: '承認待ち', className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300' },
  approved: { label: '承認済み', className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300' },
  rejected: { label: '却下', className: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300' },
}

const actionLabels: Record<string, string> = { delete_task: 'タスクの削除' }

const formatDate = (value: string | null) => {
  if (!value) return '—'
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}

const summarizePayload = (payload: Record<string, unknown> | null) => {
  if (!payload || Object.keys(payload).length === 0) return '追加情報なし'
  return Object.entries(payload).slice(0, 4).map(([key, value]) =>
    `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`,
  ).join(' ・ ')
}

function ApprovalRoom() {
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeAction, setActiveAction] = useState<{ id: number; action: ApprovalAction } | null>(null)
  const [executionCandidate, setExecutionCandidate] = useState<ApprovalRequest | null>(null)

  const loadApprovals = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await api.get<{ approvals: ApprovalRequest[] }>('/approvals')
      setApprovals(response.data.approvals)
    } catch {
      setError('承認申請を読み込めませんでした。アクセス権限と接続状況を確認してください。')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadApprovals() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadApprovals])

  const transitionApproval = async (approvalId: number, action: ApprovalAction) => {
    setActiveAction({ id: approvalId, action })
    setError(null)
    try {
      const response = await api.patch<{ approval: ApprovalRequest }>(`/approvals/${approvalId}/${action}`)
      setApprovals((current) => current.map((approval) =>
        approval.id === approvalId ? response.data.approval : approval,
      ))
    } catch {
      await loadApprovals()
      setError('申請を更新できませんでした。すでに処理済みの可能性があります。')
    } finally {
      setActiveAction(null)
    }
  }

  const executeApproval = async (approvalId: number) => {
    setActiveAction({ id: approvalId, action: 'execute' })
    setError(null)
    try {
      const response = await api.post<{ approval: ApprovalRequest }>(`/approvals/${approvalId}/execute`)
      setApprovals((current) => current.map((approval) =>
        approval.id === approvalId ? response.data.approval : approval,
      ))
      setExecutionCandidate(null)
    } catch {
      setExecutionCandidate(null)
      await loadApprovals()
      setError('承認済み操作を実行できませんでした。申請状態と対象データを確認してください。')
    } finally {
      setActiveAction(null)
    }
  }

  const pendingCount = approvals.filter((approval) => approval.status === 'pending').length

  return (
    <div className="min-h-full space-y-5 bg-slate-50 p-4 text-slate-900 dark:bg-[#080f1f] dark:text-slate-100 sm:p-6">
      <header className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700/70 dark:bg-[#111b30] sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"><ShieldCheck size={25} /></div>
          <div>
            <p className="text-xs font-bold tracking-[0.18em] text-indigo-600 dark:text-indigo-300">APPROVAL ROOM</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">承認室</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">AI社員から届いた申請を確認し、承認または却下します。</p>
          </div>
        </div>
        <button type="button" onClick={() => void loadApprovals()} disabled={isLoading} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold transition hover:-translate-y-0.5 hover:border-indigo-300 hover:text-indigo-600 disabled:cursor-wait disabled:opacity-60 dark:border-slate-600 dark:hover:border-indigo-400 dark:hover:text-indigo-300">
          <RefreshCw size={17} className={isLoading ? 'animate-spin' : ''} /> 更新
        </button>
      </header>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/70 dark:bg-[#111b30]">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700/70 sm:px-6">
          <div><h2 className="font-black">承認申請一覧</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">最新100件を表示</p></div>
          <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">承認待ち {pendingCount}件</span>
        </div>

        {error && <div className="m-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300">{error}</div>}

        {isLoading && approvals.length === 0 ? (
          <div className="grid min-h-64 place-items-center text-sm text-slate-500 dark:text-slate-400"><div className="flex items-center gap-3"><RefreshCw className="animate-spin" size={19} /> 読み込み中...</div></div>
        ) : approvals.length === 0 ? (
          <div className="grid min-h-64 place-items-center px-6 text-center"><div><CheckCircle2 className="mx-auto text-emerald-500" size={34} /><p className="mt-3 font-bold">承認申請はありません</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">新しい申請が届くと、ここに表示されます。</p></div></div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {approvals.map((approval) => {
              const meta = statusMeta[approval.status]
              const isApproving = activeAction?.id === approval.id && activeAction.action === 'approve'
              const isRejecting = activeAction?.id === approval.id && activeAction.action === 'reject'
              const isExecuting = activeAction?.id === approval.id && activeAction.action === 'execute'
              const isActing = activeAction?.id === approval.id
              const canExecute = approval.status === 'approved'
                && approval.executed_at === null
                && approval.action_type === 'delete_task'
                && approval.tool_name === 'delete_task'
              return (
                <article key={approval.id} className="p-5 transition-colors hover:bg-slate-50/80 dark:hover:bg-white/[0.025] sm:p-6">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2.5"><span className="text-xs font-bold text-slate-400">#{approval.id}</span><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${meta.className}`}>{meta.label}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{approval.tool_name ?? 'tool 未指定'}</span></div>
                      <h3 className="mt-3 text-lg font-black">{actionLabels[approval.action_type] ?? approval.action_type}</h3>
                      <p className="mt-2 break-words text-sm text-slate-600 dark:text-slate-300">{summarizePayload(approval.payload)}</p>
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400"><span>申請者: <strong className="text-slate-700 dark:text-slate-200">{approval.requested_by?.name ?? '不明'}</strong></span><span className="inline-flex items-center gap-1.5"><Clock3 size={13} /> {formatDate(approval.created_at)}</span>{approval.approved_by && <span>承認者: {approval.approved_by.name}</span>}{approval.rejected_by && <span>却下者: {approval.rejected_by.name}</span>}</div>
                    </div>

                    {approval.status === 'pending' ? (
                      <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                        <button type="button" disabled={isActing} onClick={() => void transitionApproval(approval.id, 'reject')} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-rose-200 px-4 text-sm font-bold text-rose-600 transition hover:-translate-y-0.5 hover:bg-rose-50 disabled:cursor-wait disabled:opacity-50 dark:border-rose-400/25 dark:text-rose-300 dark:hover:bg-rose-400/10">{isRejecting ? <RefreshCw size={16} className="animate-spin" /> : <X size={17} />} 却下</button>
                        <button type="button" disabled={isActing} onClick={() => void transitionApproval(approval.id, 'approve')} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:-translate-y-0.5 hover:bg-indigo-500 disabled:cursor-wait disabled:opacity-50">{isApproving ? <RefreshCw size={16} className="animate-spin" /> : <Check size={17} />} 承認</button>
                      </div>
                    ) : canExecute ? (
                      <button type="button" disabled={isActing} onClick={() => setExecutionCandidate(approval)} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 text-sm font-bold text-white shadow-lg shadow-rose-500/20 transition hover:-translate-y-0.5 hover:bg-rose-500 disabled:cursor-wait disabled:opacity-50">{isExecuting ? <RefreshCw size={16} className="animate-spin" /> : <Play size={17} />} 実行</button>
                    ) : (
                      <div className="flex shrink-0 items-center gap-2 text-sm font-bold text-slate-500 dark:text-slate-400">{approval.executed_at ? <CheckCircle2 size={19} className="text-indigo-500" /> : approval.status === 'approved' ? <CheckCircle2 size={19} className="text-emerald-500" /> : <XCircle size={19} className="text-rose-500" />}<span>{approval.executed_at ? '実行済み' : statusMeta[approval.status].label}<span className="ml-2 font-medium">{formatDate(approval.executed_at ?? approval.approved_at ?? approval.rejected_at)}</span></span></div>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {executionCandidate && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="execute-approval-title">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-[#111b30] sm:p-7">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-400/10 dark:text-rose-300"><AlertTriangle size={25} /></div>
            <h2 id="execute-approval-title" className="mt-4 text-xl font-black">承認済み操作の実行確認</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">承認済みのタスク削除を実行しますか？この操作は元に戻せません。</p>
            <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-800/70">
              <span className="text-slate-500 dark:text-slate-400">対象：</span>
              <strong>Task #{String(executionCandidate.payload?.task_id ?? '不明')}</strong>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" disabled={activeAction !== null} onClick={() => setExecutionCandidate(null)} className="h-11 rounded-xl border border-slate-200 text-sm font-bold transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800">キャンセル</button>
              <button type="button" disabled={activeAction !== null} onClick={() => void executeApproval(executionCandidate.id)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 text-sm font-bold text-white shadow-lg shadow-rose-500/20 transition hover:bg-rose-500 disabled:cursor-wait disabled:opacity-50">{activeAction?.action === 'execute' ? <RefreshCw size={16} className="animate-spin" /> : <Play size={17} />} 削除を実行</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ApprovalRoom
