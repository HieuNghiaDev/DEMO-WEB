import { Paperclip, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { documentCollectionApi } from '../api'
import { collectionError } from '../errors'
import type { CollectionDetail, ReceivedDocument } from '../types'

type StorageType = ReceivedDocument['storage_type']

export default function ReceivedDocumentRegistration({ caseId, itemId, canUpdate, onRegistered }: {
  caseId: number; itemId: number; canUpdate: boolean; onRegistered: (detail: CollectionDetail) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [storageType, setStorageType] = useState<StorageType>('upload')
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [externalUrl, setExternalUrl] = useState('')
  const [receivedAt, setReceivedAt] = useState(() => localDateTimeValue())
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!canUpdate) return null

  const reset = () => {
    setOpen(false); setStorageType('upload'); setTitle(''); setFile(null); setExternalUrl(''); setReceivedAt(localDateTimeValue()); setNotes(''); setError('')
  }
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData()
    formData.append('storage_type', storageType)
    formData.append('title', title.trim())
    formData.append('received_at', new Date(receivedAt).toISOString())
    if (notes.trim()) formData.append('notes', notes.trim())
    if (storageType === 'upload' && file) formData.append('file', file)
    if (storageType !== 'upload') formData.append('external_url', externalUrl.trim())
    setSaving(true); setError('')
    try {
      onRegistered(await documentCollectionApi.registerReceivedDocument(caseId, itemId, formData))
      reset()
    } catch (requestError) { setError(collectionError(requestError).message) }
    finally { setSaving(false) }
  }

  if (!open) return <button type="button" className="dc-button dc-received-add" onClick={() => setOpen(true)}><Plus size={15}/>{t('documentCollection.receivedDocuments.add')}</button>

  return <form className="dc-received-registration" onSubmit={submit}>
    <div className="dc-section-heading"><h4><Paperclip size={15}/>{t('documentCollection.receivedDocuments.registerTitle')}</h4><button type="button" className="dc-icon-button" aria-label={t('documentCollection.receivedDocuments.cancel')} title={t('documentCollection.receivedDocuments.cancel')} onClick={reset}><X size={16}/></button></div>
    <div className="dc-form-grid">
      <label>{t('documentCollection.receivedDocuments.storageType')}<select value={storageType} disabled={saving} onChange={event => { setStorageType(event.target.value as StorageType); setError('') }}><option value="upload">{t('documentCollection.receivedDocuments.upload')}</option><option value="external_link">{t('documentCollection.receivedDocuments.externalLink')}</option><option value="google_drive">Google Drive</option></select></label>
      <label>{t('documentCollection.receivedDocuments.receivedAt')}<input type="datetime-local" required value={receivedAt} disabled={saving} onChange={event => setReceivedAt(event.target.value)} /></label>
      <label className="dc-wide">{t('documentCollection.receivedDocuments.documentTitle')}<input required maxLength={255} value={title} disabled={saving} placeholder={t('documentCollection.receivedDocuments.titlePlaceholder')} onChange={event => setTitle(event.target.value)} /></label>
      {storageType === 'upload' ? <label className="dc-wide">{t('documentCollection.receivedDocuments.file')}<input required type="file" disabled={saving} onChange={event => { const selected = event.target.files?.[0] ?? null; setFile(selected); if (selected && !title) setTitle(selected.name) }} /></label> : <label className="dc-wide">{t('documentCollection.receivedDocuments.url')}<input required type="url" maxLength={2048} disabled={saving} placeholder="https://…" value={externalUrl} onChange={event => setExternalUrl(event.target.value)} /></label>}
      <label className="dc-wide">{t('documentCollection.receivedDocuments.notes')}<textarea maxLength={5000} rows={2} disabled={saving} value={notes} onChange={event => setNotes(event.target.value)} /></label>
    </div>
    {error && <p className="dc-danger" role="alert">{error}</p>}
    <div className="dc-action-row"><button type="button" className="dc-button" disabled={saving} onClick={reset}>{t('documentCollection.receivedDocuments.cancel')}</button><button type="submit" className="dc-button dc-primary" disabled={saving}>{saving ? t('documentCollection.receivedDocuments.saving') : t('documentCollection.receivedDocuments.save')}</button></div>
  </form>
}

function localDateTimeValue(): string {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 16)
}
