import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, Check, ClipboardList, FilePlus2, FolderOpen, UserRound, X } from 'lucide-react'
import { SectionSkeleton } from '../../components/loading'
import { caseWorkspaceApi } from '../../features/case-workspace/api'
import type { CaseActivity, WorkspaceResponse } from '../../features/case-workspace/types'
import { documentCollectionApi } from '../../features/document-collection/api'
import { collectionLabels, fulfillmentLabels, reviewLabels } from '../../features/document-collection/labels'
import type { CollectionItem, CollectionListResponse } from '../../features/document-collection/types'
import { safeProgress, statusConfig } from './helpers'
import type { BusinessCase } from './types'

type Props = {
  caseItem: BusinessCase | null
  onClose: () => void
  onOpen: (id: number) => void
  onOpenCollection: (id: number) => void
}

type DrawerResponse = {
  caseId: number
  workspace: WorkspaceResponse | null
  collection: CollectionListResponse | null
  error: string | null
}

export default function CaseQuickViewDrawer({ caseItem, onClose, onOpen, onOpenCollection }: Props) {
  const [response, setResponse] = useState<DrawerResponse | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!caseItem) return

    let active = true
    const controller = new AbortController()
    void Promise.all([
      caseWorkspaceApi.show(caseItem.id),
      documentCollectionApi.list(caseItem.id, { necessity_status: 'required', page: 1, per_page: 100 }, controller.signal),
    ])
      .then(([workspace, collection]) => {
        if (!active) return
        setResponse({ caseId: caseItem.id, workspace, collection, error: null })
      })
      .catch(() => {
        if (active && !controller.signal.aborted) {
          setResponse({
            caseId: caseItem.id,
            workspace: null,
            collection: null,
            error: '案件の詳細を取得できませんでした。もう一度お試しください。',
          })
        }
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [caseItem])

  const isCurrentResponse = caseItem !== null && response?.caseId === caseItem.id
  const data = isCurrentResponse ? response?.workspace ?? null : null
  const collectionData = isCurrentResponse ? response?.collection ?? null : null
  const loadError = isCurrentResponse ? response?.error ?? null : null
  const isLoading = caseItem !== null && !isCurrentResponse

  useEffect(() => {
    if (!caseItem) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [caseItem, onClose])

  useEffect(() => {
    if (!caseItem) return
    scrollContainerRef.current?.scrollTo({ top: 0 })
  }, [caseItem])

  const requiredDocuments = useMemo(() => collectionData?.documents ?? [], [collectionData])
  const recentActivities = useMemo(
    () => [...(data?.case_file.activities ?? [])]
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
      .slice(0, 3),
    [data],
  )

  if (!caseItem) return null

  const status = statusConfig[caseItem.status]
  const completedCount = requiredDocuments.filter(isDocumentConfirmed).length
  const requiredCount = collectionData?.summary.necessity.required ?? caseItem.documentsTotal
  const progress = safeProgress(completedCount, requiredCount)

  const openCase = () => {
    onClose()
    onOpen(caseItem.id)
  }

  const openCollection = () => {
    onClose()
    onOpenCollection(caseItem.id)
  }

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="presentation">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-slate-950/50 backdrop-blur-[2px] transition-opacity"
        aria-label="案件詳細を閉じる"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="case-quick-view-title"
        className="absolute inset-y-0 right-0 flex w-full max-w-[430px] flex-col border-l border-[var(--tm-border)] bg-[var(--tm-surface)] shadow-2xl md:inset-y-3 md:right-3 md:rounded-xl md:border"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] px-5 py-4 md:rounded-t-xl">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wide text-[var(--tm-primary)]">QUICK VIEW · 案件詳細</p>
            <h2 id="case-quick-view-title" className="mt-2 truncate text-[17px] font-semibold text-[var(--tm-text-primary)]">
              {caseItem.customerName}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--tm-text-secondary)]">{caseItem.code}</p>
            <p className="mt-0.5 truncate text-xs text-[var(--tm-text-muted)]">{caseItem.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="案件詳細を閉じる"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--tm-text-secondary)] transition-colors hover:bg-[var(--tm-surface-hover)] hover:text-[var(--tm-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-focus-ring)]"
          >
            <X size={18} />
          </button>
        </header>

        <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${status.badge}`}>
              {status.label}
            </span>
          </div>

          <dl className="mt-4 grid gap-3 border-y border-[var(--tm-border)] py-3.5 text-xs">
            <DetailFact icon={<ClipboardList size={15} />} label="事件類型" value={caseItem.caseType} />
            <DetailFact icon={<UserRound size={15} />} label="担当者" value={caseItem.assignee} description={caseItem.role} />
            <DetailFact icon={<CalendarDays size={15} />} label="更新日時" value={formatDateTime(caseItem.rawUpdatedAt)} />
          </dl>

          {isLoading ? (
            <SectionSkeleton className="mt-4 border-x-0 px-0" label="案件資料を読み込み中…" rows={5} showHeader={false} />
          ) : loadError ? (
            <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300">
              {loadError}
            </p>
          ) : (
            <>
              <section className="mt-5" aria-labelledby="case-quick-progress-title">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 id="case-quick-progress-title" className="text-xs font-semibold text-[var(--tm-text-primary)]">必要資料の進捗</h3>
                  <span className="text-xs font-semibold tabular-nums text-[var(--tm-text-primary)]">
                    {`${completedCount} / ${requiredCount} 件`}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--tm-surface-hover)]">
                  <div className="h-full rounded-full bg-[var(--tm-primary)] transition-[width]" style={{ width: `${progress}%` }} />
                </div>
                {requiredCount === 0 && (
                  <p className="mt-2 text-xs text-[var(--tm-text-muted)]">必要資料はまだ設定されていません。</p>
                )}
                <ul className="mt-3 overflow-hidden rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)]">
                  {requiredDocuments.map((document) => {
                    const confirmed = isDocumentConfirmed(document)
                    return (
                      <li key={document.id} className="flex min-h-11 items-center gap-2.5 border-b border-[var(--tm-border)] px-3 py-2 last:border-b-0">
                        <span className="min-w-0 flex-1 text-xs font-medium leading-5 text-[var(--tm-text-primary)]">{document.title}</span>
                        <span className={`shrink-0 text-[11px] font-medium ${confirmed ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--tm-text-muted)]'}`}>
                          {documentDisplayStatus(document)}
                        </span>
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border ${confirmed ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-[var(--tm-border-strong)] bg-[var(--tm-surface)]'}`} aria-label={confirmed ? '確認・充足済み' : '未完了'}>
                          {confirmed && <Check size={12} strokeWidth={3} />}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </section>

              <section className="mt-5 border-t border-[var(--tm-border)] pt-4" aria-labelledby="case-quick-activity-title">
                <div className="flex items-center justify-between gap-3">
                  <h3 id="case-quick-activity-title" className="text-xs font-semibold text-[var(--tm-text-primary)]">最近のアクティビティ</h3>
                  <button type="button" onClick={openCase} className="text-[11px] font-semibold text-[var(--tm-primary)] hover:underline">すべて見る</button>
                </div>
                {recentActivities.length ? (
                  <ol className="mt-3 space-y-3 border-l border-[var(--tm-border)] pl-3">
                    {recentActivities.map((activity) => <ActivityItem key={activity.id} activity={activity} />)}
                  </ol>
                ) : (
                  <p className="mt-3 text-xs text-[var(--tm-text-muted)]">記録されたアクティビティはありません。</p>
                )}
              </section>
            </>
          )}
        </div>

        <footer className="grid grid-cols-2 gap-2 border-t border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] px-5 py-4">
          <button type="button" onClick={openCase} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[var(--tm-primary)] px-3 text-xs font-semibold text-white transition-colors hover:bg-[var(--tm-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-focus-ring)]">
            <FolderOpen size={15} />案件を開く
          </button>
          <button type="button" onClick={openCollection} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-[var(--tm-border-strong)] bg-[var(--tm-surface)] px-3 text-xs font-semibold text-[var(--tm-primary)] transition-colors hover:bg-[var(--tm-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-focus-ring)]">
            <FilePlus2 size={15} />資料収集を開く
          </button>
        </footer>
      </aside>
    </div>,
    document.body,
  )
}

function DetailFact({ icon, label, value, description }: { icon: ReactNode; label: string; value: string; description?: string }) {
  return (
    <div className="grid grid-cols-[18px_68px_minmax(0,1fr)] items-start gap-x-2">
      <span className="mt-0.5 text-[var(--tm-text-secondary)]" aria-hidden="true">{icon}</span>
      <dt className="text-[11px] text-[var(--tm-text-secondary)]">{label}</dt>
      <dd className="min-w-0 font-medium text-[var(--tm-text-primary)]">
        <span className="block truncate">{value}</span>
        {description && <span className="mt-0.5 block text-[11px] font-normal text-[var(--tm-text-secondary)]">{description}</span>}
      </dd>
    </div>
  )
}

function ActivityItem({ activity }: { activity: CaseActivity }) {
  return (
    <li className="relative">
      <span className="absolute -left-[17px] top-1.5 h-2 w-2 rounded-full bg-[var(--tm-primary)] ring-2 ring-[var(--tm-surface)]" aria-hidden="true" />
      <p className="text-[11px] text-[var(--tm-text-secondary)]">{formatDateTime(activity.occurred_at)}</p>
      <p className="mt-0.5 text-xs font-medium text-[var(--tm-text-primary)]">{activity.title}</p>
      {activity.created_by_employee?.full_name && <p className="mt-0.5 text-[11px] text-[var(--tm-text-muted)]">{activity.created_by_employee.full_name}</p>}
    </li>
  )
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
  }).format(date)
}

function isDocumentConfirmed(document: Pick<CollectionItem, 'fulfillment_status' | 'review_status'>) {
  const isSatisfied = document.fulfillment_status === 'satisfied'
    || document.fulfillment_status === 'satisfied_by_alternative'

  return isSatisfied && document.review_status === 'reviewed'
}

function documentDisplayStatus(
  document: Pick<CollectionItem, 'collection_status' | 'fulfillment_status' | 'review_status'>,
) {
  if (isDocumentConfirmed(document)) return '確認済み'
  if (document.fulfillment_status === 'insufficient') return fulfillmentLabels.insufficient
  if (document.review_status === 'reviewed') return '確認済み・未充足'
  if (document.fulfillment_status !== 'undetermined') {
    return `${fulfillmentLabels[document.fulfillment_status]}・${reviewLabels[document.review_status]}`
  }
  if (document.review_status !== 'unreviewed') return reviewLabels[document.review_status]
  return collectionLabels[document.collection_status]
}
