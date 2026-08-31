import { useEffect, useRef } from 'react'
import type { InitializationPreview } from '../types'
import type { CollectionError } from '../errors'
import CollectionFeedback from './CollectionFeedback'

export default function InitializationDialog({ preview, busy, error, onClose, onConfirm }: {
  preview: InitializationPreview; busy: boolean; error: CollectionError | null; onClose: () => void; onConfirm: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const origin = document.activeElement as HTMLElement | null
    const element = dialog.current
    element?.showModal()
    return () => { element?.close(); if (origin?.isConnected) origin.focus({ preventScroll: true }) }
  }, [])
  return <dialog ref={dialog} className="dc-confirm" aria-labelledby="dc-confirm-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <header><h2 id="dc-confirm-title">資料収集リストを作成</h2></header>
    <div><p><strong>{preview.case.case_type?.name ?? '—'}</strong>の候補資料 <strong>{preview.initialization.missing_candidate_count}件</strong>を資料収集リストに追加します。</p><p>候補はすべて「未判定」で作成されます。<br />候補資料は自動的に「必要」には設定されません。</p><p className="dc-meta">外部への連絡・送信や法的必要性の判断は行いません。既存項目は変更しません。</p>{error && <CollectionFeedback error={error} onRetry={onConfirm} />}</div>
    <footer><button type="button" className="dc-button" disabled={busy} onClick={onClose}>キャンセル</button><button type="button" className="dc-button dc-primary" disabled={busy} onClick={onConfirm}>{busy ? '作成中…' : '作成する'}</button></footer>
  </dialog>
}
