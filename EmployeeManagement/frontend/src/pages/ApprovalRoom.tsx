import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, CheckCircle2, Clock3, Play, RefreshCw, ShieldCheck, X, XCircle } from 'lucide-react'
import api from '../services/api'

type ApprovalStatus = 'pending' | 'approved' | 'rejected'
type ApprovalAction = 'approve' | 'reject'
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

function ApprovalMetric({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: 'amber' | 'emerald' | 'indigo' | 'rose' }) {
  const tones = {
    amber: { accent: 'bg-amber-500', icon: 'bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300' },
    emerald: { accent: 'bg-emerald-500', icon: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300' },
    indigo: { accent: 'bg-indigo-500', icon: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-300' },
    rose: { accent: 'bg-rose-500', icon: 'bg-rose-50 text-rose-600 dark:bg-rose-400/10 dark:text-rose-300' },
  } as const
  const selectedTone = tones[tone]

  return (
    <div className="relative px-4 py-3.5 sm:px-5">
      <span className={`absolute inset-x-0 top-0 h-0.5 ${selectedTone.accent}`} aria-hidden="true" />
      <div className="flex items-center gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${selectedTone.icon}`} aria-hidden="true">{icon}</span>
        <div className="min-w-0"><p className="text-2xl font-semibold tracking-tight tabular-nums text-slate-950 dark:text-white">{value}<span className="ml-1 text-xs font-medium text-slate-400 dark:text-slate-500">件</span></p><p className="mt-0.5 truncate text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p></div>
      </div>
    </div>
  )
}

function ApprovalRoom() {
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeAction, setActiveAction] = useState<{ id: number; action: ApprovalAction } | null>(null)

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

  const pendingCount = approvals.filter((approval) => approval.status === 'pending').length
  const approvedCount = approvals.filter((approval) => approval.status === 'approved').length
  const rejectedCount = approvals.filter((approval) => approval.status === 'rejected').length
  const executedCount = approvals.filter((approval) => approval.executed_at !== null).length

  return (
    <div className="w-full min-w-0 max-w-full px-4 pb-10 pt-5 text-slate-900 dark:text-slate-100 sm:px-5 lg:px-6 xl:px-8">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" aria-labelledby="approval-room-title">
        <header className="px-4 pb-4 pt-5 sm:px-5 lg:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 border-l-2 border-indigo-500 pl-4">
              <div className="flex items-center gap-2 text-xs font-medium text-indigo-600 dark:text-indigo-300">
                <ShieldCheck size={15} aria-hidden="true" />
                承認管理
              </div>
              <h1 id="approval-room-title" className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-100 md:text-[28px]">承認室</h1>
              <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">AI社員から届いた操作申請を確認し、安全に承認・却下します。</p>
            </div>
            <button
              type="button"
              onClick={() => void loadApprovals()}
              disabled={isLoading}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-400/50 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-200"
            >
              <RefreshCw size={15} className={isLoading ? 'animate-spin' : 'text-indigo-500 dark:text-indigo-300'} aria-hidden="true" />
              {isLoading ? '更新中…' : '最新データを取得'}
            </button>
          </div>
        </header>
        <div className="grid grid-cols-2 border-t border-slate-200 bg-slate-50/55 dark:border-slate-700 dark:bg-slate-950/25 sm:grid-cols-4 sm:divide-x sm:divide-slate-100 dark:sm:divide-slate-800">
          <ApprovalMetric icon={<Clock3 size={18} />} label="承認待ち" value={pendingCount} tone="amber" />
          <ApprovalMetric icon={<CheckCircle2 size={18} />} label="承認済み" value={approvedCount} tone="emerald" />
          <ApprovalMetric icon={<Play size={18} />} label="実行済み" value={executedCount} tone="indigo" />
          <ApprovalMetric icon={<XCircle size={18} />} label="却下" value={rejectedCount} tone="rose" />
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" aria-labelledby="approval-queue-title">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-50/70 px-4 py-3.5 dark:border-slate-700 dark:bg-slate-900/70 sm:px-5">
          <div>
            <h2 id="approval-queue-title" className="text-sm font-semibold text-slate-900 dark:text-slate-100">承認申請一覧</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">最新100件 · 判断と実行状況を時系列で表示</p>
          </div>
          <span className="shrink-0 text-xs font-medium tabular-nums text-amber-700 dark:text-amber-300">要確認 {pendingCount}件</span>
        </div>

        {error && <div className="m-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300 sm:m-5">{error}</div>}

        {isLoading && approvals.length === 0 ? (
          <ApprovalLoadingState />
        ) : approvals.length === 0 ? (
          <div className="grid min-h-56 place-items-center px-6 text-center"><div><CheckCircle2 className="mx-auto text-emerald-500" size={30} /><p className="mt-3 text-sm font-semibold">承認申請はありません</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">新しい申請が届くと、ここに表示されます。</p></div></div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {approvals.map((approval) => {
              const meta = statusMeta[approval.status]
              const isApproving = activeAction?.id === approval.id && activeAction.action === 'approve'
              const isRejecting = activeAction?.id === approval.id && activeAction.action === 'reject'
              const isActing = activeAction?.id === approval.id
              return (
                <article key={approval.id} className="group relative px-4 py-4 transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/35 sm:px-5">
                  <span className={`absolute bottom-4 left-0 top-4 w-0.5 ${approval.status === 'pending' ? 'bg-amber-400' : approval.status === 'approved' ? 'bg-emerald-500' : 'bg-rose-400'}`} aria-hidden="true" />
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-medium tabular-nums text-slate-400 dark:text-slate-500">REQUEST #{approval.id}</span>
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${meta.className}`}>{meta.label}</span>
                        <code className="text-[11px] text-slate-500 dark:text-slate-400">{approval.tool_name ?? 'tool 未指定'}</code>
                      </div>
                      <h3 className="mt-2 text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">{actionLabels[approval.action_type] ?? approval.action_type}</h3>
                      <div className="mt-2 border-l-2 border-slate-200 bg-slate-50/70 px-3 py-2 text-sm leading-5 text-slate-600 dark:border-slate-700 dark:bg-slate-950/25 dark:text-slate-300">{summarizePayload(approval.payload)}</div>
                      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <span>申請者：<strong className="font-medium text-slate-700 dark:text-slate-200">{approval.requested_by?.name ?? '不明'}</strong></span>
                        <span className="inline-flex items-center gap-1.5"><Clock3 size={13} aria-hidden="true" /> {formatDate(approval.created_at)}</span>
                        {approval.approved_by && <span>承認者：{approval.approved_by.name}</span>}
                        {approval.rejected_by && <span>却下者：{approval.rejected_by.name}</span>}
                      </div>
                    </div>

                    {approval.status === 'pending' ? (
                      <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                        <button type="button" disabled={isActing} onClick={() => void transitionApproval(approval.id, 'reject')} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-4 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:cursor-wait disabled:opacity-50 dark:border-rose-400/25 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-400/10">{isRejecting ? <RefreshCw size={15} className="animate-spin" /> : <X size={16} />} 却下</button>
                        <button type="button" disabled={isActing} onClick={() => void transitionApproval(approval.id, 'approve')} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-wait disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400">{isApproving ? <RefreshCw size={15} className="animate-spin" /> : <Check size={16} />} 承認</button>
                      </div>
                    ) : (
                      <div className="flex shrink-0 items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">{approval.executed_at ? <CheckCircle2 size={18} className="text-indigo-500" /> : approval.status === 'approved' ? <CheckCircle2 size={18} className="text-emerald-500" /> : <XCircle size={18} className="text-rose-500" />}<span>{approval.executed_at ? '実行済み' : statusMeta[approval.status].label}<span className="ml-2 text-xs font-normal tabular-nums">{formatDate(approval.executed_at ?? approval.approved_at ?? approval.rejected_at)}</span></span></div>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

    </div>
  )
}

function ApprovalLoadingState() {
  return (
    <div className="animate-pulse px-4 py-3 sm:px-5" aria-label="承認申請を読み込み中">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="border-b border-slate-100 py-4 last:border-b-0 dark:border-slate-800">
          <div className="h-3 w-36 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="mt-3 h-5 w-52 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="mt-3 h-10 rounded bg-slate-100 dark:bg-slate-800" />
        </div>
      ))}
    </div>
  )
}

export default ApprovalRoom
