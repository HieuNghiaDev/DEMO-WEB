import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { InitializationPreview } from '../types'
import type { CollectionError } from '../errors'
import CollectionFeedback from './CollectionFeedback'

export default function InitializationDialog({ preview, busy, error, onClose, onConfirm }: {
  preview: InitializationPreview; busy: boolean; error: CollectionError | null; onClose: () => void; onConfirm: () => void
}) {
  const { t } = useTranslation()
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const origin = document.activeElement as HTMLElement | null
    const element = dialog.current
    element?.showModal()
    return () => { element?.close(); if (origin?.isConnected) origin.focus({ preventScroll: true }) }
  }, [])
  return <dialog ref={dialog} className="dc-confirm" aria-labelledby="dc-confirm-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <header><h2 id="dc-confirm-title">{t('documentCollection.initialization.title')}</h2></header>
    <div><p>{t('documentCollection.initialization.addCandidates', { caseType: preview.case.case_type?.name ?? '—', count: preview.initialization.missing_candidate_count })}</p><p>{t('documentCollection.initialization.undetermined').split('\n').map((line, index) => <span key={line}>{index > 0 && <br />}{line}</span>)}</p><p className="dc-meta">{t('documentCollection.initialization.safety')}</p>{error && <CollectionFeedback error={error} onRetry={onConfirm} />}</div>
    <footer><button type="button" className="dc-button" disabled={busy} onClick={onClose}>{t('documentCollection.initialization.cancel')}</button><button type="button" className="dc-button dc-primary" disabled={busy} onClick={onConfirm}>{busy ? t('documentCollection.initialization.creating') : t('documentCollection.initialization.create')}</button></footer>
  </dialog>
}
