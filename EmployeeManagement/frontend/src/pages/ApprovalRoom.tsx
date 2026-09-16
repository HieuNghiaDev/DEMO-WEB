import { useCallback, useEffect, useState } from 'react'
import { Check, CheckCircle2, Clock3, Play, RefreshCw, X, XCircle } from 'lucide-react'
import api from '../services/api'
import {
  Button,
  EmptyState,
  MetricCard,
  MetricStrip,
  PageHeader,
  StatusBadge,
} from '../components/ui'
import { SectionSkeleton } from '../components/loading'
import { useAuth } from '../contexts/AuthContext'
import C001DocumentReviewDrawer from '../features/document-creation/components/C001DocumentReviewDrawer'

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

type C001ApprovalSummary = {
  case_id: number
  case_reference: string | null
  case_title: string | null
  document_id: number
  document_title: string
  client_name: string | null
  status: 'pending_approval' | 'complete' | 'rejected'
  version: number
  success_fee_percentage: string | null
  generated_at: string | null
  generated_by: string | null
  approved_at: string | null
  approved_by: string | null
}

const statusMeta: Record<ApprovalStatus, { label: string; variant: 'warning' | 'success' | 'danger' }> = {
  pending: { label: '承認待ち', variant: 'warning' },
  approved: { label: '承認済み', variant: 'success' },
  rejected: { label: '却下', variant: 'danger' },
}

const actionLabels: Record<string, string> = { delete_task: 'タスクの削除' }

const formatDate = (value: string | null) => {
  if (!value) return '—'
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

const summarizePayload = (payload: Record<string, unknown> | null) => {
  if (!payload || Object.keys(payload).length === 0) return '追加情報なし'
  return Object.entries(payload)
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join(' ・ ')
}

function ApprovalRoom() {
  const { user } = useAuth()
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([])
  const [c001Documents, setC001Documents] = useState<C001ApprovalSummary[]>([])
  const [selectedC001, setSelectedC001] = useState<C001ApprovalSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeAction, setActiveAction] = useState<{ id: number; action: ApprovalAction } | null>(null)

  const loadApprovals = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await api.get<{ approvals: ApprovalRequest[]; c001_documents?: C001ApprovalSummary[] }>('/approvals')
      setApprovals(response.data.approvals)
      setC001Documents(response.data.c001_documents ?? [])
    } catch {
      setError('承認申請を読み込めませんでした。アクセス権限と接続状況を確認してください。')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadApprovals()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadApprovals])

  const transitionApproval = async (approvalId: number, action: ApprovalAction) => {
    setActiveAction({ id: approvalId, action })
    setError(null)
    try {
      const response = await api.patch<{ approval: ApprovalRequest }>(`/approvals/${approvalId}/${action}`)
      setApprovals((current) =>
        current.map((approval) => (approval.id === approvalId ? response.data.approval : approval)),
      )
    } catch {
      await loadApprovals()
      setError('申請を更新できませんでした。すでに処理済みの可能性があります。')
    } finally {
      setActiveAction(null)
    }
  }

  const pendingC001Count = c001Documents.filter((document) => document.status === 'pending_approval').length
  const pendingCount = approvals.filter((approval) => approval.status === 'pending').length + pendingC001Count
  const approvedCount = approvals.filter((approval) => approval.status === 'approved').length
  const rejectedCount = approvals.filter((approval) => approval.status === 'rejected').length
  const executedCount = approvals.filter((approval) => approval.executed_at !== null).length

  return (
    <div className="min-h-full pb-10">
      <PageHeader
        breadcrumb="承認室"
        domainKicker="APPROVAL OPERATIONS"
        title="承認室"
        description="AI社員から届いた操作申請を確認し、安全に承認・却下します。"
        actions={
          <Button
            variant="secondary"
            size="md"
            onClick={() => void loadApprovals()}
            disabled={isLoading}
            loading={isLoading}
            icon={!isLoading ? <RefreshCw size={15} className="text-[var(--tm-primary)]" /> : undefined}
          >
            {isLoading ? '更新中…' : '最新データを取得'}
          </Button>
        }
      />

      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* KPI / Metric Strip */}
        <MetricStrip columns={4}>
          <MetricCard
            label="承認待ち"
            value={pendingCount}
            subtext="件"
            status="warning"
            icon={<Clock3 size={18} />}
          />
          <MetricCard
            label="承認済み"
            value={approvedCount}
            subtext="件"
            status="success"
            icon={<CheckCircle2 size={18} />}
          />
          <MetricCard
            label="実行済み"
            value={executedCount}
            subtext="件"
            status="info"
            icon={<Play size={18} />}
          />
          <MetricCard
            label="却下"
            value={rejectedCount}
            subtext="件"
            status="danger"
            icon={<XCircle size={18} />}
          />
        </MetricStrip>

        <section className="overflow-hidden rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface)] shadow-xs" aria-labelledby="c001-approval-title">
          <div className="flex items-center justify-between gap-4 border-b border-[var(--tm-border)] bg-[var(--tm-surface-elevated)]/50 px-4 py-3.5 sm:px-5">
            <div>
              <h2 id="c001-approval-title" className="text-sm font-semibold text-[var(--tm-text-primary)]">C-001 文書承認</h2>
              <p className="mt-0.5 text-xs text-[var(--tm-text-secondary)]">公式PDFを確認して承認・差戻しを行います</p>
            </div>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-amber-600 dark:text-amber-400">要確認 {pendingC001Count}件</span>
          </div>
          {isLoading && c001Documents.length === 0 ? <ApprovalLoadingState /> : c001Documents.length === 0 ? (
            <div className="p-7"><EmptyState icon={<CheckCircle2 className="h-7 w-7 text-emerald-500" />} title="C-001の承認対象はありません" description="作成済みのC-001が承認待ちになると、ここに表示されます。" /></div>
          ) : (
            <div className="divide-y divide-[var(--tm-border)]">
              {c001Documents.map((document) => {
                const meta = document.status === 'pending_approval' ? statusMeta.pending : document.status === 'complete' ? statusMeta.approved : statusMeta.rejected
                return <button type="button" key={document.document_id} onClick={() => setSelectedC001(document)} className="flex w-full flex-col gap-3 px-4 py-4 text-left transition-colors hover:bg-[var(--tm-surface-hover)] sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[11px] text-[var(--tm-primary)]">C-001 · v{document.version}</span><StatusBadge variant={meta.variant} dot>{meta.label}</StatusBadge></div>
                    <strong className="mt-1.5 block truncate text-sm text-[var(--tm-text-primary)]">{document.client_name || document.case_title || '依頼者未登録'}</strong>
                    <span className="mt-1 block truncate text-xs text-[var(--tm-text-muted)]">{document.case_reference || `CASE-${document.case_id}`} · 報酬金 {document.success_fee_percentage ?? '—'}%</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-[var(--tm-text-secondary)]"><span>{formatDate(document.generated_at)}</span><span className="font-semibold text-[var(--tm-primary)]">文書を確認 →</span></div>
                </button>
              })}
            </div>
          )}
        </section>

        {/* Approval Requests Queue */}
        <section
          className="overflow-hidden rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface)] shadow-xs"
          aria-labelledby="approval-queue-title"
        >
          <div className="flex items-center justify-between gap-4 border-b border-[var(--tm-border)] bg-[var(--tm-surface-elevated)]/50 px-4 py-3.5 sm:px-5">
            <div>
              <h2 id="approval-queue-title" className="text-sm font-semibold text-[var(--tm-text-primary)]">
                承認申請一覧
              </h2>
              <p className="mt-0.5 text-xs text-[var(--tm-text-secondary)]">
                最新100件 · 判断と実行状況を時系列で表示
              </p>
            </div>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-amber-600 dark:text-amber-400">
              要確認 {pendingCount}件
            </span>
          </div>

          {error && (
            <div className="m-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-medium text-[var(--tm-danger)] sm:m-5">
              {error}
            </div>
          )}

          {isLoading && approvals.length === 0 ? (
            <ApprovalLoadingState />
          ) : approvals.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={<CheckCircle2 className="h-7 w-7 text-emerald-500" />}
                title="未処理の承認申請はありません"
                description="AI社員から新しいアクション申請が届くと、ここに表示されます。"
              />
            </div>
          ) : (
            <div className="divide-y divide-[var(--tm-border)]">
              {approvals.map((approval) => {
                const meta = statusMeta[approval.status]
                const isApproving = activeAction?.id === approval.id && activeAction.action === 'approve'
                const isRejecting = activeAction?.id === approval.id && activeAction.action === 'reject'
                const isActing = activeAction?.id === approval.id

                return (
                  <article
                    key={approval.id}
                    className="group relative px-4 py-4.5 transition-colors duration-150 hover:bg-[var(--tm-surface-hover)] sm:px-5"
                  >
                    <span
                      className={`absolute bottom-3 left-0 top-3 w-1 rounded-r ${
                        approval.status === 'pending'
                          ? 'bg-amber-500'
                          : approval.status === 'approved'
                            ? 'bg-emerald-500'
                            : 'bg-red-500'
                      }`}
                      aria-hidden="true"
                    />

                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-mono text-[var(--tm-text-muted)]">
                            REQ-#{approval.id}
                          </span>
                          <StatusBadge variant={meta.variant} dot>
                            {meta.label}
                          </StatusBadge>
                          <code className="text-[11px] text-[var(--tm-text-secondary)] font-mono bg-[var(--tm-surface-elevated)] px-1.5 py-0.5 rounded border border-[var(--tm-border)]">
                            {approval.tool_name ?? 'tool 未指定'}
                          </code>
                        </div>

                        <h3 className="mt-2 text-base font-semibold tracking-tight text-[var(--tm-text-primary)]">
                          {actionLabels[approval.action_type] ?? approval.action_type}
                        </h3>

                        <div className="mt-2 rounded-lg border-l-2 border-[var(--tm-primary)] bg-[var(--tm-surface-elevated)] px-3 py-2 text-xs leading-5 text-[var(--tm-text-secondary)]">
                          {summarizePayload(approval.payload)}
                        </div>

                        <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--tm-text-muted)]">
                          <span>
                            申請者：
                            <strong className="font-medium text-[var(--tm-text-primary)]">
                              {approval.requested_by?.name ?? '不明'}
                            </strong>
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Clock3 size={13} aria-hidden="true" /> {formatDate(approval.created_at)}
                          </span>
                          {approval.approved_by && (
                            <span>承認者：{approval.approved_by.name}</span>
                          )}
                          {approval.rejected_by && (
                            <span>却下者：{approval.rejected_by.name}</span>
                          )}
                        </div>
                      </div>

                      {approval.status === 'pending' ? (
                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            variant="secondary"
                            size="md"
                            disabled={isActing}
                            loading={isRejecting}
                            onClick={() => void transitionApproval(approval.id, 'reject')}
                            icon={!isRejecting ? <X size={15} className="text-red-500" /> : undefined}
                            className="hover:border-red-500/30 hover:text-red-600 dark:hover:text-red-400"
                          >
                            却下
                          </Button>
                          <Button
                            variant="primary"
                            size="md"
                            disabled={isActing}
                            loading={isApproving}
                            onClick={() => void transitionApproval(approval.id, 'approve')}
                            icon={!isApproving ? <Check size={15} /> : undefined}
                          >
                            承認
                          </Button>
                        </div>
                      ) : (
                        <div className="flex shrink-0 items-center gap-2 text-sm font-medium text-[var(--tm-text-secondary)]">
                          {approval.executed_at ? (
                            <CheckCircle2 size={17} className="text-[var(--tm-primary)]" />
                          ) : approval.status === 'approved' ? (
                            <CheckCircle2 size={17} className="text-emerald-500" />
                          ) : (
                            <XCircle size={17} className="text-red-500" />
                          )}
                          <span>
                            {approval.executed_at ? '実行済み' : statusMeta[approval.status].label}
                            <span className="ml-2 text-xs font-normal tabular-nums text-[var(--tm-text-muted)]">
                              {formatDate(approval.executed_at ?? approval.approved_at ?? approval.rejected_at)}
                            </span>
                          </span>
                        </div>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
      {selectedC001 && <C001DocumentReviewDrawer caseId={selectedC001.case_id} documentId={selectedC001.document_id} canUpdate={Boolean(user?.permission_names.includes('case.update'))} onClose={() => setSelectedC001(null)} onChanged={() => void loadApprovals()} />}
    </div>
  )
}

function ApprovalLoadingState() {
  return <SectionSkeleton className="border-0" label="承認申請を読み込み中…" rows={4} showHeader={false} />
}

export default ApprovalRoom
