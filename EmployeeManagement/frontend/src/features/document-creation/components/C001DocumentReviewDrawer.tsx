import { Check, ExternalLink, FileDown, Maximize2, Pencil, RotateCcw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ButtonSpinner, SectionSkeleton } from '../../../components/loading'
import InspectorShell from '../../document-collection/components/InspectorShell'
import type { DocumentCreationState } from '../documentDraftStore'
import { documentDraftStore } from '../documentDraftStore'
import C001PdfDownloadButton from './C001PdfDownloadButton'
import C001WorkbookDownloadButton from './C001WorkbookDownloadButton'
import '../../document-collection/documentCollection.css'
import './c001DocumentReviewDrawer.css'

type Props = {
  caseId: number
  documentId: number
  canUpdate: boolean
  onClose: () => void
  onChanged?: () => void
}

const statusMeta = {
  missing: ['未作成', 'neutral'], draft: ['下書き', 'neutral'], pending_approval: ['承認待ち', 'warning'],
  complete: ['承認済み', 'success'], rejected: ['差戻し', 'danger'],
} as const

const formatDate = (value?: string | null) => value
  ? new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tokyo' }).format(new Date(value))
  : '—'

const safeDriveUrl = (value?: string | null) => value && /^https:\/\/(drive|docs)\.google\.com\//i.test(value) ? value : null

export default function C001DocumentReviewDrawer({ caseId, documentId, canUpdate, onClose, onChanged }: Props) {
  const navigate = useNavigate()
  const [state, setState] = useState<DocumentCreationState | null>(null)
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const [pdfUrl, setPdfUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [confirmApprove, setConfirmApprove] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    void documentDraftStore.load({ caseId, documentId, version: selectedVersion ?? undefined }, controller.signal)
      .then(value => {
        if (controller.signal.aborted) return
        if (value.c001?.pdf_artifact) setPdfLoading(true)
        setState(value)
        if (selectedVersion === null) setSelectedVersion(value.currentVersion ?? value.c001?.latest_version ?? value.record?.version ?? 1)
      })
      .catch(() => { if (!controller.signal.aborted) setError('C-001の文書情報を読み込めませんでした。') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [caseId, documentId, selectedVersion])

  const pdfArtifactId = state?.c001?.pdf_artifact?.external_file_id
  useEffect(() => {
    if (!pdfArtifactId || !selectedVersion) return
    const controller = new AbortController()
    let objectUrl = ''
    void documentDraftStore.previewC001({ caseId, documentId, version: selectedVersion }, true, controller.signal)
      .then(({ blob }) => { if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setPdfUrl(objectUrl) } })
      .catch(() => { if (!controller.signal.aborted) setError('PDFプレビューを読み込めませんでした。') })
      .finally(() => { if (!controller.signal.aborted) setPdfLoading(false) })
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [caseId, documentId, pdfArtifactId, selectedVersion])

  const c001 = state?.c001
  const versions = state?.versions ?? []
  const selected = versions.find(item => item.version === selectedVersion)
  const status = c001?.status ?? 'missing'
  const statusInfo = statusMeta[status]
  const isCurrent = selectedVersion === state?.currentVersion
  const canApprove = Boolean(state?.permissions.canApprove && status === 'pending_approval' && isCurrent)
  const driveUrl = safeDriveUrl(c001?.pdf_artifact?.url ?? c001?.artifact?.url)
  const generatedAt = c001?.artifact?.generated_at ?? selected?.driveArtifact?.uploaded_at
  const generatedBy = c001?.artifact?.generated_by
  const title = state?.template?.name ?? '委任契約書'

  const act = async (action: 'approve' | 'reject') => {
    if (busy) return
    setBusy(true); setError('')
    try {
      const next = action === 'approve'
        ? await documentDraftStore.approve({ caseId, documentId, version: selectedVersion ?? undefined })
        : await documentDraftStore.rejectC001({ caseId, documentId, version: selectedVersion ?? undefined }, rejectReason.trim())
      setState(next); setConfirmApprove(false); setRejectOpen(false); setRejectReason(''); onChanged?.()
    } catch { setError(action === 'approve' ? '文書を承認できませんでした。' : '文書を差戻しできませんでした。') }
    finally { setBusy(false) }
  }

  const footer = c001 && <div className="c001-review-footer">
    {['pending_approval', 'rejected'].includes(status) && canUpdate && <button type="button" className="dc-button" onClick={() => navigate(`/quests/${caseId}/documents/${documentId}/edit`)}><Pencil size={14}/>{status === 'rejected' ? '編集を再開' : '文書を編集'}</button>}
    {canApprove && <><button type="button" className="dc-button c001-reject" onClick={() => setRejectOpen(true)}><RotateCcw size={14}/>差戻し</button><button type="button" className="dc-button dc-primary" onClick={() => setConfirmApprove(true)}><Check size={14}/>承認して完了</button></>}
    {!canApprove && status === 'complete' && <span className="c001-readonly"><Check size={14}/>承認済み・閲覧のみ</span>}
    <button type="button" className="dc-button" onClick={onClose}>閉じる</button>
  </div>

  return <>
    <InspectorShell forceOverlay className="c001-review-drawer" title={title} code="C-001" subtitle={`公式文書レビュー · v${selectedVersion ?? '—'}`} onClose={onClose} footer={footer}>
      {loading && <SectionSkeleton className="border-0" label="C-001を読み込み中…" rows={5} showHeader={false}/>}
      {error && <p className="c001-review-error" role="alert">{error}</p>}
      {!loading && c001 && <div className="c001-review-content">
        <div className="c001-review-toolbar">
          <span className={`c001-review-status is-${statusInfo[1]}`}>{statusInfo[0]}</span>
          <label>版<select value={selectedVersion ?? ''} onChange={event => { setLoading(true); setPdfLoading(true); setPdfUrl(''); setError(''); setSelectedVersion(Number(event.target.value)) }}>{versions.map(version => <option key={version.version} value={version.version}>v{version.version}{version.isCurrent ? '（最新）' : ''}</option>)}</select></label>
        </div>

        <dl className="c001-review-facts">
          <div><dt>依頼者</dt><dd>{c001.client_name || '—'}</dd></div>
          <div><dt>報酬金</dt><dd>{c001.success_fee_percentage}%</dd></div>
          <div><dt>作成日時</dt><dd>{formatDate(generatedAt)}</dd></div>
          <div><dt>作成者</dt><dd>{generatedBy || '—'}</dd></div>
        </dl>

        {status === 'rejected' && <section className="c001-rejection-note"><strong>差戻し理由</strong><p>{c001.rejection_reason || '理由は記録されていません。'}</p><small>{c001.rejected_by?.name || '—'} · {formatDate(c001.rejected_at)}</small></section>}

        <section className="c001-review-preview" aria-label="公式PDFプレビュー">
          <header><div><strong>公式PDF</strong><span>v{selectedVersion} · Google Drive保存版</span></div><button type="button" className="dc-icon-button" disabled={!pdfUrl} onClick={() => setPreviewOpen(true)} aria-label="PDFを拡大表示"><Maximize2 size={17}/></button></header>
          <button type="button" className="c001-preview-surface" disabled={!pdfUrl} onClick={() => setPreviewOpen(true)}>
            {pdfLoading ? <span><ButtonSpinner size={18}/>PDFを読み込み中…</span> : pdfUrl ? <iframe title="C-001 PDF preview" src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0&page=1&view=Fit`}/> : <span>PDFプレビューを利用できません。</span>}
          </button>
        </section>

        <div className="c001-review-files">
          <C001PdfDownloadButton caseId={caseId} documentId={documentId} version={selectedVersion ?? 1}/>
          <C001WorkbookDownloadButton caseId={caseId} documentId={documentId} version={selectedVersion ?? 1} label="Excelをダウンロード"/>
          {driveUrl && <a className="dc-button" href={driveUrl} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Driveで開く</a>}
        </div>
      </div>}
    </InspectorShell>

    {previewOpen && createPortal(<div className="c001-full-preview" role="dialog" aria-modal="true" aria-label="C-001 PDFプレビュー"><header><div><FileDown size={18}/><strong>{title}</strong><span>v{selectedVersion}</span></div><button type="button" onClick={() => setPreviewOpen(false)} aria-label="プレビューを閉じる"><X size={20}/></button></header><iframe title="C-001 official PDF" src={`${pdfUrl}#page=1&view=Fit`}/></div>, document.body)}
    {confirmApprove && createPortal(<ConfirmDialog title="この文書を承認しますか？" message="承認すると、このC-001は完了となり編集できなくなります。" busy={busy} confirmLabel="承認して完了" onCancel={() => setConfirmApprove(false)} onConfirm={() => void act('approve')}/>, document.body)}
    {rejectOpen && createPortal(<div className="c001-confirm-backdrop" role="presentation"><div className="c001-confirm" role="dialog" aria-modal="true" aria-labelledby="c001-reject-title"><h3 id="c001-reject-title">C-001を差戻す</h3><p>修正が必要な内容を担当者に伝えてください。</p><label>差戻し理由<textarea autoFocus maxLength={2000} value={rejectReason} onChange={event => setRejectReason(event.target.value)} placeholder="修正箇所と理由を入力"/></label><div><button type="button" className="dc-button" disabled={busy} onClick={() => setRejectOpen(false)}>キャンセル</button><button type="button" className="dc-button c001-reject" disabled={busy || !rejectReason.trim()} onClick={() => void act('reject')}>{busy && <ButtonSpinner size={14}/>}差戻す</button></div></div></div>, document.body)}
  </>
}

function ConfirmDialog({ title, message, busy, confirmLabel, onCancel, onConfirm }: { title: string; message: string; busy: boolean; confirmLabel: string; onCancel: () => void; onConfirm: () => void }) {
  return <div className="c001-confirm-backdrop" role="presentation"><div className="c001-confirm" role="dialog" aria-modal="true"><h3>{title}</h3><p>{message}</p><div><button type="button" className="dc-button" disabled={busy} onClick={onCancel}>キャンセル</button><button type="button" className="dc-button dc-primary" disabled={busy} onClick={onConfirm}>{busy && <ButtonSpinner size={14}/>} {confirmLabel}</button></div></div></div>
}
