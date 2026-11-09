import { useId, useRef, useState } from 'react'
import { CircleAlert, Check, Undo2 } from 'lucide-react'
import ModalShell from '../../../components/ui/ModalShell'
import { documentCollectionApi } from '../api'
import { fileReviewError } from '../errors'
import { fileReturnReasons, fileReviewLabel, validFileReturnReason, fileReviewRefreshWarning, saveFileReview } from '../fileReview'
import type { CollectionDetail } from '../types'
import { formatDate } from '../utils'
import ReceivedDocumentRegistration from './ReceivedDocumentRegistration'
import './fileReviewDialog.css'

type ReviewAction = 'confirm' | 'return'
type ReviewConfirmation = {
  action: ReviewAction
  caseId: number
  documentId: number
  code: string | null
  name: string
  file: Pick<NonNullable<CollectionDetail['file_review']>, 'source' | 'id' | 'version'>
}

export default function FileReviewActions({ caseId, detail, onChanged, compact = false }: { caseId: number; detail: CollectionDetail; onChanged: (detail: CollectionDetail) => void | Promise<void>; compact?: boolean }) {
  const [confirmation, setConfirmation] = useState<ReviewConfirmation | null>(null)
  const confirmationRef = useRef<ReviewConfirmation | null>(null)
  const [reason, setReason] = useState('')
  const [explanation, setExplanation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reasonTouched, setReasonTouched] = useState(false)
  const inFlight = useRef(false)
  const [savedDetail, setSavedDetail] = useState<CollectionDetail | null>(null)
  const id = useId()
  const file = detail.file_review
  if (!file?.status) return null
  const canReview = file.status === 'pending_review' && detail.capabilities?.can_review
  const canReturn = file.status === 'pending_review' && detail.capabilities?.can_return
  const openConfirmation = (action: ReviewAction) => {
    if (inFlight.current || !(action === 'confirm' ? canReview : canReturn)) return
    const target: ReviewConfirmation = { action, caseId, documentId: detail.id, code: detail.document_type?.code ?? null, name: detail.document_type?.name_ja ?? detail.title, file: { source: file.source, id: file.id, version: file.version } }
    confirmationRef.current = target
    setError(''); setReason(''); setExplanation(''); setReasonTouched(false)
    setConfirmation(target)
  }
  const closeConfirmation = () => {
    if (inFlight.current) return
    confirmationRef.current = null
    setConfirmation(null)
  }
  const save = async (action: ReviewAction) => {
    if (inFlight.current) return
    const target = confirmationRef.current
    if (!target || target !== confirmation || target.action !== action) return
    if (file.status !== 'pending_review') { setError('この資料は現在確認できる状態ではありません。'); return }
    if (!(action === 'confirm' ? canReview : canReturn)) { setError('この資料を確認する権限がありません。'); return }
    // Confirmation stays bound to the displayed version, never a newer background refresh.
    if (target.caseId !== caseId || target.documentId !== detail.id || target.file.source !== file.source || target.file.id !== file.id || target.file.version !== file.version) { setError('対象のファイルが更新されています。閉じて最新のファイルを確認してください。'); return }
    if (action === 'return' && !validFileReturnReason(reason)) { setReasonTouched(true); return }
    inFlight.current = true
    setBusy(true); setError(''); setSavedDetail(null)
    try {
      const result = await saveFileReview(
        () => documentCollectionApi.reviewFile(target.caseId, target.documentId, { source: target.file.source, file_id: target.file.id, action, ...(action === 'return' ? { reason, detail: explanation.trim() } : {}) }),
        updated => { confirmationRef.current = null; setConfirmation(null); return onChanged(updated) },
      )
      if (result.kind === 'save_failed') setError(fileReviewError(result.error))
      if (result.kind === 'refresh_failed') { setSavedDetail(result.updated); setError(fileReviewRefreshWarning) }
    } finally { inFlight.current = false; setBusy(false) }
  }
  const retryRefresh = async () => {
    if (inFlight.current || !savedDetail) return
    inFlight.current = true; setBusy(true)
    try { await onChanged(savedDetail); setSavedDetail(null); setError('') }
    catch { setError(fileReviewRefreshWarning) }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <div className={`dc-file-review is-${file.status}${compact ? ' is-compact' : ''}`} aria-busy={busy}>
    {(!compact || file.reviewed_by) && <div className="dc-file-review-summary">{!compact && <strong>v{file.version} · {fileReviewLabel(file.status)}</strong>}{file.reviewed_by && <span>{compact && '確認者: '}{file.reviewed_by.name} · {formatDate(file.reviewed_at, true)}</span>}</div>}
    {file.status === 'rejected' && <div className="dc-file-return-reason"><strong>差し戻し理由: {file.reason}</strong>{file.detail && <p>{file.detail}</p>}</div>}
    {error && !confirmation && <p role="alert" className={compact ? 'dc-compact-file-alert' : 'dc-danger'}>{compact && <CircleAlert size={16} aria-hidden="true"/>}<span>{error}</span></p>}
    {(canReview || canReturn) && <div className="dc-file-review-buttons">{canReturn && <button type="button" className={`dc-button${compact ? '' : ' dc-danger'}`} disabled={busy} onClick={() => openConfirmation('return')}><Undo2 size={14} aria-hidden="true"/>差し戻す</button>}{canReview && <button type="button" className="dc-button dc-primary" disabled={busy} onClick={() => openConfirmation('confirm')}><Check size={14} aria-hidden="true"/>{busy ? '保存中…' : '確認済みにする'}</button>}</div>}
    {file.status === 'rejected' && detail.capabilities?.can_upload && <ReceivedDocumentRegistration caseId={caseId} itemId={detail.id} canUpdate documentName={detail.document_type?.name_ja ?? detail.title} triggerLabel="新しいファイルをアップロード" onRegistered={onChanged}/>}
    {savedDetail && <button type="button" className="dc-button" disabled={busy} onClick={() => void retryRefresh()}>{busy ? '再取得中…' : '最新情報を再取得'}</button>}
    <ModalShell isOpen={confirmation !== null} onClose={closeConfirmation} dismissible={!busy} title={confirmation?.action === 'return' ? '資料を差し戻しますか？' : '資料を確認済みにしますか？'} titleId={`${id}-title`} size="sm" className="dc-preview dc-file-review-dialog" description={confirmation?.action === 'return' ? '担当者に修正・再提出を依頼します。' : 'この操作を実行すると、このファイルは「確認済み」として記録されます。'} footer={confirmation && <><button type="button" className="dc-button" disabled={busy} onClick={closeConfirmation}>キャンセル</button><button type="submit" form={`${id}-form`} className={`dc-button ${confirmation.action === 'return' ? 'dc-review-destructive' : 'dc-primary'}`} disabled={busy || (confirmation.action === 'return' ? !canReturn || !validFileReturnReason(reason) : !canReview)} aria-busy={busy}>{busy ? '保存中…' : confirmation.action === 'return' ? '差し戻しを確定' : '確認済みにする'}</button></>}>
      {confirmation && <form id={`${id}-form`} className="dc-file-return-form" aria-busy={busy} onSubmit={event => { event.preventDefault(); void save(confirmation.action) }}>
        <div className="dc-review-target"><div>{confirmation.code && <span>{confirmation.code}</span>}<strong>{confirmation.name}</strong></div><span className="dc-review-target-version">v{confirmation.file.version}</span></div>
        {confirmation.action === 'return' && <>
        <label htmlFor={`${id}-reason`}>差し戻し理由 <span className="dc-danger">（必須）</span></label>
        <select id={`${id}-reason`} required value={reason} disabled={busy} aria-invalid={reasonTouched && !validFileReturnReason(reason)} aria-describedby={reasonTouched && !validFileReturnReason(reason) ? `${id}-validation` : undefined} onBlur={() => setReasonTouched(true)} onChange={event => setReason(event.target.value)}><option value="">理由を選択してください</option>{fileReturnReasons.map(value => <option key={value} value={value}>{value}</option>)}</select>
        {reasonTouched && !validFileReturnReason(reason) && <p id={`${id}-validation`} className="dc-danger">差し戻し理由を選択してください。</p>}
        <label htmlFor={`${id}-detail`}>詳細理由（任意）</label><textarea id={`${id}-detail`} rows={4} maxLength={5000} disabled={busy} value={explanation} onChange={event => setExplanation(event.target.value)}/>
        </>}
        {error && <p role="alert" className="dc-danger">{error}</p>}
      </form>}
    </ModalShell>
  </div>
}
