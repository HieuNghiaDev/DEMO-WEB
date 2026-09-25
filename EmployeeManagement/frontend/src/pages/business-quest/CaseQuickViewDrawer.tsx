import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowRight,
  Briefcase,
  Check,
  ChevronRight,
  ClipboardList,
  Clock3,
  FilePlus2,
  FileText,
  Files,
  FolderOpen,
  UserCheck,
  X,
} from 'lucide-react'
import { SectionSkeleton } from '../../components/loading'
import { caseWorkspaceApi } from '../../features/case-workspace/api'
import type { WorkspaceResponse } from '../../features/case-workspace/types'
import { useDrawerBodyScrollLock } from '../../features/case-workspace/useDrawerBodyScrollLock'
import { documentCollectionApi } from '../../features/document-collection/api'
import { collectionLabels, fulfillmentLabels, reviewLabels } from '../../features/document-collection/labels'
import type { CollectionItem, CollectionListResponse } from '../../features/document-collection/types'
import { safeProgress, statusConfig } from './helpers'
import type { BusinessCase } from './types'
import { CaseTypeBadge } from './CaseListView'

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

const CLOSE_DURATION_MS = 200

export default function CaseQuickViewDrawer({ caseItem, onClose, onOpen, onOpenCollection }: Props) {
  const [activeCase, setActiveCase] = useState<BusinessCase | null>(caseItem)
  const [isRendered, setIsRendered] = useState<boolean>(Boolean(caseItem))
  const [isClosing, setIsClosing] = useState(false)
  const [response, setResponse] = useState<DrawerResponse | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const closingRef = useRef(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggerElementRef = useRef<HTMLElement | null>(null)

  const handleClose = () => {
    // Rapid click protection: ignore if already closing or not rendered
    if (closingRef.current || !isRendered) return
    closingRef.current = true
    setIsClosing(true)

    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
    }

    closeTimerRef.current = setTimeout(() => {
      setIsRendered(false)
      setIsClosing(false)
      closingRef.current = false
      closeTimerRef.current = null
      onClose()

      // Restore focus safely after close animation and unmount
      if (triggerElementRef.current && typeof triggerElementRef.current.focus === 'function') {
        try {
          triggerElementRef.current.focus({ preventScroll: true })
        } catch {
          // ignore
        }
      }
    }, CLOSE_DURATION_MS)
  }

  // Sync prop changes
  useEffect(() => {
    if (caseItem) {
      // Capture trigger element before opening
      triggerElementRef.current = document.activeElement as HTMLElement | null

      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
      closingRef.current = false
      setActiveCase(caseItem)
      setIsRendered(true)
      setIsClosing(false)
    } else if (!caseItem && isRendered && !closingRef.current) {
      handleClose()
    }
  }, [caseItem, isRendered])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current)
      }
    }
  }, [])

  // Hook handles body scroll lock with scrollbar compensation + Escape key
  useDrawerBodyScrollLock(isRendered, handleClose)

  // Data fetching
  useEffect(() => {
    if (!activeCase || !isRendered) return

    let active = true
    const controller = new AbortController()
    void Promise.all([
      caseWorkspaceApi.show(activeCase.id),
      documentCollectionApi.list(activeCase.id, { necessity_status: 'required', page: 1, per_page: 100 }, controller.signal),
    ])
      .then(([workspace, collection]) => {
        if (!active) return
        setResponse({ caseId: activeCase.id, workspace, collection, error: null })
      })
      .catch(() => {
        if (active && !controller.signal.aborted) {
          setResponse({
            caseId: activeCase.id,
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
  }, [activeCase?.id, isRendered])

  // Reset scroll only when opening a different case
  useEffect(() => {
    if (isRendered && !isClosing) {
      scrollContainerRef.current?.scrollTo({ top: 0 })
    }
  }, [activeCase?.id, isRendered, isClosing])

  const isCurrentResponse = activeCase !== null && response?.caseId === activeCase.id
  const data = isCurrentResponse ? response?.workspace ?? null : null
  const collectionData = isCurrentResponse ? response?.collection ?? null : null
  const loadError = isCurrentResponse ? response?.error ?? null : null
  const isLoading = activeCase !== null && !isCurrentResponse

  const requiredDocuments = useMemo(() => collectionData?.documents ?? [], [collectionData])
  const recentActivities = useMemo(
    () => [...(data?.case_file.activities ?? [])]
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
      .slice(0, 5),
    [data],
  )

  if (!isRendered || !activeCase) return null

  const status = statusConfig[activeCase.status]
  const completedCount = requiredDocuments.filter(isDocumentConfirmed).length
  const requiredCount = collectionData?.summary.necessity.required ?? activeCase.documentsTotal
  const progress = safeProgress(completedCount, requiredCount)

  const openCase = () => {
    handleClose()
    onOpen(activeCase.id)
  }

  const openCollection = () => {
    handleClose()
    onOpenCollection(activeCase.id)
  }

  return createPortal(
    <div className="cm-qv-root" role="presentation">
      {/* Dimmed Backdrop */}
      <div
        className={`cm-qv-backdrop ${isClosing ? 'is-closing' : ''}`}
        aria-label="案件詳細を閉じる"
        onClick={handleClose}
      />

      {/* Floating Right-Side Drawer Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="case-quick-view-title"
        className={`cm-qv-drawer ${isClosing ? 'is-closing' : ''}`}
      >
        {/* Header Block with Mockup-faithful Visual Hierarchy */}
        <header className="cm-qv-header">
          <div className="cm-qv-header-main">
            {/* Level 1: Eyebrow alone */}
            <div className="cm-qv-eyebrow">QUICK VIEW · 案件詳細</div>

            {/* Level 2: Client Name (22-24px, 700-750) */}
            <h2 id="case-quick-view-title" className="cm-qv-header-name">
              {activeCase.customerName}
            </h2>

            {/* Level 3: [CASE-000048] ・ チャン・クオック・フイ */}
            <div className="cm-qv-code-row">
              <span className="cm-qv-code-badge">{activeCase.code}</span>
              {activeCase.customerKana && (
                <>
                  <span className="cm-qv-code-separator" aria-hidden="true">・</span>
                  <span className="cm-qv-kana">{activeCase.customerKana}</span>
                </>
              )}
            </div>

            {/* Level 4: Case Title (e.g. TRAN QUOC HUY / 労災) */}
            <div className="cm-qv-case-title">
              {activeCase.title || `${activeCase.customerName} / ${activeCase.caseType}`}
            </div>

            {/* Level 5: Status Badge & Case Type */}
            <div className="cm-qv-header-badges">
              <span className={`cm-qv-status-badge cm-qv-status-badge--${activeCase.status}`}>
                <span className={`cm-qv-status-dot ${status.dot}`} />
                {status.label}
              </span>
              <CaseTypeBadge caseType={activeCase.caseType} />
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="案件詳細を閉じる"
            className="cm-qv-header-close-btn"
          >
            <X size={18} />
          </button>
        </header>

        {/* Scrollable Body: Continuous Single Flow */}
        <div ref={scrollContainerRef} className="cm-qv-body">
          {/* Section 1: 案件の情報 */}
          <section className="cm-qv-card" aria-labelledby="qv-sec-case-info">
            <div className="cm-qv-card-header">
              <div className="flex items-center gap-2.5">
                <div className="cm-qv-card-iconbox">
                  <ClipboardList size={16} />
                </div>
                <h3 id="qv-sec-case-info" className="cm-qv-card-title">案件の情報</h3>
              </div>
            </div>

            <div className="cm-qv-card-content">
              {/* 事件類型 */}
              <div className="cm-qv-fact-row">
                <div className="cm-qv-fact-left">
                  <div className="cm-qv-row-iconbox" aria-hidden="true">
                    <Briefcase size={14} />
                  </div>
                  <span className="cm-qv-fact-label">事件類型</span>
                </div>
                <div className="cm-qv-fact-right">
                  <CaseTypeBadge caseType={activeCase.caseType} />
                  {activeCase.targetCompletionAt && (
                    <span className="cm-qv-fact-sub">目標: {activeCase.targetCompletionAt.slice(0, 10)}</span>
                  )}
                </div>
              </div>

              {/* 担当者 */}
              <div className="cm-qv-fact-row">
                <div className="cm-qv-fact-left">
                  <div className="cm-qv-row-iconbox" aria-hidden="true">
                    <UserCheck size={14} />
                  </div>
                  <span className="cm-qv-fact-label">担当者</span>
                </div>
                <div className="cm-qv-fact-right">
                  <span className="cm-qv-fact-value">
                    {activeCase.assignedEmployeeId ? activeCase.assignee : '未割当'}
                  </span>
                  <span className="cm-qv-fact-sub">
                    {activeCase.assignedEmployeeId ? activeCase.role : '担当スタッフ未登録'}
                  </span>
                </div>
              </div>

              {/* 更新日時 */}
              <div className="cm-qv-fact-row">
                <div className="cm-qv-fact-left">
                  <div className="cm-qv-row-iconbox" aria-hidden="true">
                    <Clock3 size={14} />
                  </div>
                  <span className="cm-qv-fact-label">更新日時</span>
                </div>
                <div className="cm-qv-fact-right">
                  <span className="cm-qv-fact-value font-mono">
                    {formatDateTime(activeCase.rawUpdatedAt)}
                  </span>
                </div>
              </div>

              {/* 案件メモ if exists */}
              {activeCase.memo && (
                <div className="cm-qv-fact-row cm-qv-fact-row--memo">
                  <div className="cm-qv-fact-left">
                    <div className="cm-qv-row-iconbox" aria-hidden="true">
                      <FileText size={14} />
                    </div>
                    <span className="cm-qv-fact-label">案件メモ</span>
                  </div>
                  <div className="cm-qv-fact-right text-left">
                    <p className="cm-qv-memo-text">{activeCase.memo}</p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Section 2: 必要資料の進捗 */}
          <section className="cm-qv-card" aria-labelledby="qv-sec-docs">
            <div className="cm-qv-card-header">
              <div className="flex items-center gap-2.5">
                <div className="cm-qv-card-iconbox">
                  <Files size={16} />
                </div>
                <h3 id="qv-sec-docs" className="cm-qv-card-title">必要資料の進捗</h3>
              </div>
              <span className="cm-qv-count-badge">
                {`${completedCount} / ${requiredCount} 件`}
              </span>
            </div>

            {isLoading ? (
              <SectionSkeleton className="border-x-0 px-0 my-2" label="案件資料を読み込み中…" rows={3} showHeader={false} />
            ) : loadError ? (
              <p role="alert" className="cm-qv-error-box">
                {loadError}
              </p>
            ) : (
              <div className="cm-qv-card-content">
                {/* Thin Elegant Progress bar */}
                <div className="cm-qv-progress-bar">
                  <div
                    className={`cm-qv-progress-fill ${
                      progress === 100
                        ? 'bg-emerald-500'
                        : progress > 0
                        ? 'bg-indigo-600'
                        : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>

                {requiredCount === 0 ? (
                  <p className="cm-qv-empty-text">必要資料はまだ設定されていません。</p>
                ) : (
                  <div className="cm-qv-doc-list">
                    {requiredDocuments.map((document) => {
                      const confirmed = isDocumentConfirmed(document)
                      const statusTxt = documentDisplayStatus(document)
                      return (
                        <div key={document.id} className="cm-qv-doc-item">
                          <div className="cm-qv-doc-title-wrap">
                            <FileText size={15} className="cm-qv-doc-icon" />
                            <span className="cm-qv-doc-title">{document.title}</span>
                          </div>
                          <div className="cm-qv-doc-status-wrap">
                            <span
                              className={`cm-qv-doc-pill ${
                                confirmed
                                  ? 'cm-qv-doc-pill--confirmed'
                                  : statusTxt.includes('確認中')
                                  ? 'cm-qv-doc-pill--reviewing'
                                  : statusTxt.includes('不備') || statusTxt.includes('不足')
                                  ? 'cm-qv-doc-pill--alert'
                                  : 'cm-qv-doc-pill--default'
                              }`}
                            >
                              {statusTxt}
                            </span>
                            <span
                              className={`cm-qv-doc-check ${confirmed ? 'is-confirmed' : 'is-pending'}`}
                              aria-label={confirmed ? '確認・充足済み' : '未完了'}
                            >
                              {confirmed && <Check size={11} strokeWidth={3} />}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Section 3: 最近のアクティビティ */}
          <section className="cm-qv-card" aria-labelledby="qv-sec-activity">
            <div className="cm-qv-card-header">
              <div className="flex items-center gap-2.5">
                <div className="cm-qv-card-iconbox">
                  <Clock3 size={16} />
                </div>
                <h3 id="qv-sec-activity" className="cm-qv-card-title">最近のアクティビティ</h3>
              </div>
              <button
                type="button"
                onClick={openCase}
                className="cm-qv-link-btn"
              >
                <span>すべて見る</span>
                <ChevronRight size={13} />
              </button>
            </div>

            {isLoading ? (
              <SectionSkeleton className="border-x-0 px-0 my-2" label="アクティビティを読み込み中…" rows={3} showHeader={false} />
            ) : recentActivities.length > 0 ? (
              <div className="cm-qv-timeline">
                {recentActivities.map((activity) => (
                  <div key={activity.id} className="cm-qv-timeline-item">
                    <span className="cm-qv-timeline-dot" aria-hidden="true" />
                    <time className="cm-qv-timeline-time">
                      {formatDateTime(activity.occurred_at)}
                    </time>
                    <p className="cm-qv-timeline-title">{activity.title}</p>
                    {activity.created_by_employee?.full_name && (
                      <span className="cm-qv-timeline-author">
                        {activity.created_by_employee.full_name}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="cm-qv-empty-text">記録されたアクティビティはありません。</p>
            )}
          </section>
        </div>

        {/* Sticky Footer Actions */}
        <footer className="cm-qv-footer">
          <button
            type="button"
            onClick={openCollection}
            className="cm-qv-btn-secondary"
          >
            <FilePlus2 size={15} />
            <span>資料収集を開く</span>
          </button>
          <button
            type="button"
            onClick={openCase}
            className="cm-qv-btn-primary"
          >
            <FolderOpen size={15} />
            <span>案件を開く</span>
            <ArrowRight size={14} className="cm-qv-btn-arrow opacity-80" />
          </button>
        </footer>
      </aside>
    </div>,
    document.body,
  )
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
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
