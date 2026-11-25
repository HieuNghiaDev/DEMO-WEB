import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowRight,
  Check,
  ChevronRight,
  Copy,
  FilePlus2,
  FileText,
  FolderOpen,
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
  const [copiedCaseId, setCopiedCaseId] = useState<number | null>(null)
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
  const defaultTitle = `${activeCase.customerName} / ${activeCase.caseType}`
  const customTitle = activeCase.title && activeCase.title.trim() !== defaultTitle && activeCase.title.trim() !== activeCase.customerName
    ? activeCase.title.trim()
    : null

  const copiedCode = copiedCaseId === activeCase.id

  const copyCaseCode = async () => {
    try {
      await navigator.clipboard.writeText(activeCase.code)
      const currentId = activeCase.id
      setCopiedCaseId(currentId)
      window.setTimeout(() => {
        setCopiedCaseId((prev) => (prev === currentId ? null : prev))
      }, 1600)
    } catch {
      // Clipboard unavailable
    }
  }

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

      {/* Right-Side Operational Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="case-quick-view-title"
        className={`cm-qv-drawer ${isClosing ? 'is-closing' : ''}`}
      >
        {/* Compact Executive Header */}
        <header className="cm-qv-header">
          <div className="cm-qv-header-main">
            <div className="cm-qv-meta-row">
              <button
                type="button"
                className="cm-qv-code-badge"
                onClick={() => void copyCaseCode()}
                title="案件番号をコピー"
                aria-label={`案件番号 ${activeCase.code} をコピー`}
              >
                <span>{activeCase.code}</span>
                {copiedCode ? <Check size={11} className="cm-qv-copy-done" /> : <Copy size={11} className="cm-qv-copy-icon" />}
              </button>
              <span className={`cm-qv-status-badge cm-qv-status-badge--${activeCase.status}`}>
                <span className={`cm-qv-status-dot ${status.dot}`} />
                {status.label}
              </span>
              <CaseTypeBadge caseType={activeCase.caseType} />
            </div>

            <div className="cm-qv-title-block">
              <h2 id="case-quick-view-title" className="cm-qv-header-name">
                {activeCase.customerName}
              </h2>
              {activeCase.customerKana && (
                <p className="cm-qv-kana">{activeCase.customerKana}</p>
              )}
              {customTitle && (
                <p className="cm-qv-case-title">{customTitle}</p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="案件詳細を閉じる"
            className="cm-qv-header-close-btn"
          >
            <X size={16} />
          </button>
        </header>

        {/* Scrollable Body */}
        <div ref={scrollContainerRef} className="cm-qv-body">
          {/* Section 1: 案件情報 (Compact 2-Column Hairline Grid) */}
          <section className="cm-qv-section" aria-labelledby="qv-sec-case-info">
            <div className="cm-qv-section-head">
              <h3 id="qv-sec-case-info" className="cm-qv-section-title">案件情報</h3>
            </div>

            <div className="cm-qv-info-grid">
              <div className="cm-qv-info-cell">
                <span className="cm-qv-info-label">担当者</span>
                <span className={`cm-qv-info-value ${!activeCase.assignedEmployeeId ? 'is-muted' : ''}`}>
                  {activeCase.assignedEmployeeId ? activeCase.assignee : '未割当'}
                </span>
                <span className="cm-qv-info-sub">
                  {activeCase.assignedEmployeeId ? activeCase.role : '担当スタッフ未登録'}
                </span>
              </div>

              <div className="cm-qv-info-cell">
                <span className="cm-qv-info-label">最終更新</span>
                <span className="cm-qv-info-value cm-qv-mono">
                  {formatDateTime(activeCase.rawUpdatedAt)}
                </span>
                {activeCase.targetCompletionAt && (
                  <span className="cm-qv-info-sub cm-qv-mono">
                    目標: {activeCase.targetCompletionAt.slice(0, 10)}
                  </span>
                )}
              </div>

              {activeCase.memo && (
                <div className="cm-qv-info-cell cm-qv-info-cell--full">
                  <span className="cm-qv-info-label">案件メモ</span>
                  <p className="cm-qv-memo-text">{activeCase.memo}</p>
                </div>
              )}
            </div>
          </section>

          {/* Section 2: 必要資料の進捗 */}
          <section className="cm-qv-section" aria-labelledby="qv-sec-docs">
            <div className="cm-qv-section-head">
              <h3 id="qv-sec-docs" className="cm-qv-section-title">必要資料の進捗</h3>
              <span className={`cm-qv-count-badge ${progress === 100 && requiredCount > 0 ? 'is-complete' : ''}`}>
                {`${completedCount} / ${requiredCount} 件`}
              </span>
            </div>

            <div className="cm-qv-surface">
              {isLoading ? (
                <SectionSkeleton className="border-0 px-3 py-2" label="案件資料を読み込み中…" rows={3} showHeader={false} />
              ) : loadError ? (
                <p role="alert" className="cm-qv-error-box">
                  {loadError}
                </p>
              ) : (
                <>
                  <div className="cm-qv-progress-wrap">
                    <div className="cm-qv-progress-bar">
                      <div
                        className={`cm-qv-progress-fill ${
                          progress === 100
                            ? 'is-complete'
                            : progress > 0
                            ? 'is-active'
                            : 'is-empty'
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="cm-qv-progress-pct">{progress}%</span>
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
                              <FileText size={14} className="cm-qv-doc-icon" />
                              <span className="cm-qv-doc-title" title={document.title}>{document.title}</span>
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
                                {confirmed && <Check size={10} strokeWidth={3} />}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          {/* Section 3: 最近のアクティビティ */}
          <section className="cm-qv-section" aria-labelledby="qv-sec-activity">
            <div className="cm-qv-section-head">
              <h3 id="qv-sec-activity" className="cm-qv-section-title">最近のアクティビティ</h3>
              <button
                type="button"
                onClick={openCase}
                className="cm-qv-link-btn"
              >
                <span>すべて見る</span>
                <ChevronRight size={13} />
              </button>
            </div>

            <div className="cm-qv-surface">
              {isLoading ? (
                <SectionSkeleton className="border-0 px-3 py-2" label="アクティビティを読み込み中…" rows={3} showHeader={false} />
              ) : recentActivities.length > 0 ? (
                <div className="cm-qv-timeline">
                  {recentActivities.map((activity) => (
                    <div key={activity.id} className="cm-qv-timeline-item">
                      <span className="cm-qv-timeline-dot" aria-hidden="true" />
                      <div className="cm-qv-timeline-top">
                        <p className="cm-qv-timeline-title">{activity.title}</p>
                        <time className="cm-qv-timeline-time">
                          {formatDateTime(activity.occurred_at)}
                        </time>
                      </div>
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
            </div>
          </section>
        </div>

        {/* Sticky Footer Actions */}
        <footer className="cm-qv-footer">
          <button
            type="button"
            onClick={openCollection}
            className="cm-qv-btn-secondary"
          >
            <FilePlus2 size={14} />
            <span>資料収集を開く</span>
          </button>
          <button
            type="button"
            onClick={openCase}
            className="cm-qv-btn-primary"
          >
            <FolderOpen size={14} />
            <span>案件を開く</span>
            <ArrowRight size={14} className="cm-qv-btn-arrow" />
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
