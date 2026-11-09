import { CalendarDays, CheckCircle2, File as FileIcon, FileImage, FileText, Paperclip, Pencil, Plus, UploadCloud, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { documentCollectionApi } from '../api'
import { collectionError } from '../errors'
import type { CollectionDetail, ReceivedDocument } from '../types'
import InspectorShell from './InspectorShell'
import '../../case-workspace/caseWorkspace.css'

type StorageType = ReceivedDocument['storage_type']
type FieldErrors = Partial<Record<'receivedAt' | 'title' | 'file' | 'externalUrl', string>>

export default function ReceivedDocumentRegistration({ caseId, itemId, canUpdate, onRegistered, triggerLabel, triggerClassName = '', documentName = 'この資料' }: {
  caseId: number; itemId: number; canUpdate: boolean; onRegistered: (detail: CollectionDetail) => void; triggerLabel?: string; triggerClassName?: string; documentName?: string
}) {
  const { t } = useTranslation()
  const formId = useId()
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [successVisible, setSuccessVisible] = useState(false)
  const [storageType, setStorageType] = useState<StorageType>('upload')
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [externalUrl, setExternalUrl] = useState('')
  const [receivedAt, setReceivedAt] = useState(() => localDateTimeValue())
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const closeTimerRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
  }, [])

  useEffect(() => {
    if (!successVisible) return
    const timer = window.setTimeout(() => setSuccessVisible(false), 4000)
    return () => window.clearTimeout(timer)
  }, [successVisible])

  if (!canUpdate) return null

  const clearForm = () => {
    setStorageType('upload'); setTitle(''); setFile(null); setExternalUrl(''); setReceivedAt(localDateTimeValue()); setNotes(''); setError(''); setFieldErrors({}); setIsDragging(false)
  }
  const closeDrawer = () => {
    if (saving || closing) return
    setClosing(true)
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false)
      setClosing(false)
      clearForm()
      closeTimerRef.current = null
    }, 210)
  }
  const selectFile = (selected: File | null) => {
    setFile(selected)
    setFieldErrors(current => ({ ...current, file: undefined }))
    if (selected && !title) setTitle(selected.name)
  }
  const openFilePicker = () => {
    if (saving || !fileInputRef.current) return
    fileInputRef.current.value = ''
    fileInputRef.current.click()
  }
  const removeFile = () => {
    if (saving) return
    setFile(null)
    setFieldErrors(current => ({ ...current, file: undefined }))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }
  const validate = () => {
    const next: FieldErrors = {}
    if (!receivedAt) next.receivedAt = t('documentCollection.receivedDocuments.receivedAtRequired')
    if (!title.trim()) next.title = t('documentCollection.receivedDocuments.titleRequired')
    if (storageType === 'upload' && !file) next.file = t('documentCollection.receivedDocuments.fileRequired')
    if (storageType !== 'upload' && !externalUrl.trim()) next.externalUrl = t('documentCollection.receivedDocuments.urlRequired')
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validate()) return
    const formData = new FormData()
    formData.append('storage_type', storageType)
    formData.append('title', title.trim())
    formData.append('received_at', new Date(receivedAt).toISOString())
    if (notes.trim()) formData.append('notes', notes.trim())
    if (storageType === 'upload' && file) formData.append('file', file)
    if (storageType !== 'upload') formData.append('external_url', externalUrl.trim())
    setSaving(true); setError('')
    try {
      const updated = await documentCollectionApi.registerReceivedDocument(caseId, itemId, formData)
      setSuccessVisible(true)
      setClosing(true)
      closeTimerRef.current = window.setTimeout(() => {
        setOpen(false)
        setClosing(false)
        clearForm()
        closeTimerRef.current = null
        // Refresh after the exit animation; an empty-file trigger may disappear.
        onRegistered(updated)
      }, 210)
    } catch (requestError) { setError(collectionError(requestError).message) }
    finally { setSaving(false) }
  }

  const successToast = successVisible && createPortal(<div className="dc-received-success-toast" role="status" aria-live="polite"><CheckCircle2 size={18} aria-hidden="true"/><span>{t('documentCollection.receivedDocuments.registered')}</span></div>, document.body)

  const trigger = <button type="button" className={`dc-button dc-received-add ${triggerClassName}`.trim()} onClick={() => setOpen(true)}><Plus size={15}/>{triggerLabel ?? t('documentCollection.receivedDocuments.add')}</button>
  if (!open) return <>{trigger}{successToast}</>

  return <>{trigger}<InspectorShell
    forceOverlay
    editLayout
    className={`dc-received-drawer dc-action-drawer ${closing ? 'is-closing' : ''}`}
    backdropClassName={`dc-received-drawer-backdrop ${closing ? 'is-closing' : ''}`}
    title={t('documentCollection.receivedDocuments.registerTitle')}
    code={<Paperclip size={17} aria-hidden="true"/>}
    subtitle={`${documentName}に受領文書を追加します。`}
    onClose={closeDrawer}
    footer={<div className="dc-received-actions"><button type="button" className="dc-button" disabled={saving} onClick={closeDrawer}>{t('documentCollection.receivedDocuments.cancel')}</button><button type="submit" form={formId} className="dc-button dc-primary" disabled={saving}>{saving ? t('documentCollection.receivedDocuments.saving') : t('documentCollection.receivedDocuments.save')}</button></div>}
  >
  <form id={formId} className="dc-received-registration" noValidate onSubmit={submit}>
    <div className="dc-received-form-grid">
      <label className="dc-received-field">{t('documentCollection.receivedDocuments.storageType')}<select value={storageType} disabled={saving} onChange={event => { setStorageType(event.target.value as StorageType); setError(''); setFieldErrors({}) }}><option value="upload">{t('documentCollection.receivedDocuments.upload')}</option><option value="external_link">{t('documentCollection.receivedDocuments.externalLink')}</option><option value="google_drive">Google Drive</option></select></label>
      <label className="dc-received-field">{t('documentCollection.receivedDocuments.receivedAt')}<span className={`dc-received-date-control ${fieldErrors.receivedAt ? 'has-error' : ''}`}><CalendarDays size={16} aria-hidden="true"/><span>{formatLocalDateTime(receivedAt)}</span><input type="datetime-local" value={receivedAt} disabled={saving} onChange={event => { setReceivedAt(event.target.value); setFieldErrors(current => ({ ...current, receivedAt: undefined })) }}/><CalendarDays size={16} aria-hidden="true"/></span>{fieldErrors.receivedAt && <small className="dc-received-field-error">{fieldErrors.receivedAt}</small>}</label>
      <label className="dc-received-field dc-wide">{t('documentCollection.receivedDocuments.documentTitle')}<span className={`dc-received-input-shell ${fieldErrors.title ? 'has-error' : ''}`}><FileText size={16} aria-hidden="true"/><input maxLength={255} value={title} disabled={saving} placeholder={t('documentCollection.receivedDocuments.titlePlaceholder')} onChange={event => { setTitle(event.target.value); setFieldErrors(current => ({ ...current, title: undefined })) }}/></span>{fieldErrors.title && <small className="dc-received-field-error">{fieldErrors.title}</small>}</label>
      {storageType === 'upload' ? <div className="dc-received-field dc-wide"><span>{t('documentCollection.receivedDocuments.file')}</span><input ref={fileInputRef} className="dc-received-file-input" type="file" tabIndex={-1} disabled={saving} aria-label={t('documentCollection.receivedDocuments.chooseFile')} onChange={event => selectFile(event.target.files?.[0] ?? null)}/><button type="button" className={`dc-received-dropzone ${isDragging ? 'is-dragging' : ''} ${fieldErrors.file ? 'has-error' : ''}`} disabled={saving} aria-describedby="dc-received-file-help" onClick={openFilePicker} onDragEnter={event => { event.preventDefault(); if (!saving) setIsDragging(true) }} onDragOver={event => event.preventDefault()} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false) }} onDrop={event => { event.preventDefault(); setIsDragging(false); if (!saving) selectFile(event.dataTransfer.files?.[0] ?? null) }}><UploadCloud size={34} aria-hidden="true"/><strong>{isDragging ? t('documentCollection.receivedDocuments.dropFile') : t('documentCollection.receivedDocuments.chooseFile')}</strong><span id="dc-received-file-help">{t('documentCollection.receivedDocuments.dropOrClick')}</span><small>{t('documentCollection.receivedDocuments.fileTypesHint')}</small><span className="dc-button dc-primary"><UploadCloud size={15} aria-hidden="true"/>{t('documentCollection.receivedDocuments.chooseFile')}</span></button>{fieldErrors.file && <small className="dc-received-field-error">{fieldErrors.file}</small>}{file && <SelectedFile file={file} saving={saving} onChange={openFilePicker} onRemove={removeFile}/>}</div> : <label className="dc-received-field dc-wide">{t('documentCollection.receivedDocuments.url')}<input className={fieldErrors.externalUrl ? 'has-error' : ''} type="url" maxLength={2048} disabled={saving} placeholder="https://…" value={externalUrl} onChange={event => { setExternalUrl(event.target.value); setFieldErrors(current => ({ ...current, externalUrl: undefined })) }}/>{fieldErrors.externalUrl && <small className="dc-received-field-error">{fieldErrors.externalUrl}</small>}</label>}
      <label className="dc-received-field dc-wide">{t('documentCollection.receivedDocuments.notes')}<span className="dc-received-notes"><textarea maxLength={5000} rows={4} disabled={saving} placeholder={t('documentCollection.receivedDocuments.notesPlaceholder')} value={notes} onChange={event => setNotes(event.target.value)}/><small>{notes.length}/5000</small></span></label>
    </div>
    {error && <p className="dc-received-form-error" role="alert">{error}</p>}
  </form>
  </InspectorShell>{successToast}</>
}

function SelectedFile({ file, saving, onChange, onRemove }: { file: File; saving: boolean; onChange: () => void; onRemove: () => void }) {
  const kind = fileKind(file)
  return <div className="dc-received-selected-file"><span className={`dc-received-file-tile is-${kind.tone}`} aria-hidden="true">{kind.icon}</span><span className="dc-received-file-copy"><strong title={file.name}>{file.name}</strong><small>{kind.label} · {formatFileSize(file.size)}</small></span><button type="button" className="dc-received-change-file" disabled={saving} aria-label="ファイルを変更" onClick={onChange}><Pencil size={14}/><span>変更</span></button><button type="button" className="dc-icon-button" disabled={saving} aria-label="選択したファイルを削除" onClick={onRemove}><X size={17}/></button></div>
}

function fileKind(file: File) {
  const extension = file.name.split('.').at(-1)?.toLocaleLowerCase() ?? ''
  if (file.type === 'application/pdf' || extension === 'pdf') return { label: 'PDF', tone: 'pdf', icon: <FileText size={22}/> }
  if (file.type.startsWith('image/')) return { label: extension.toLocaleUpperCase() || 'IMAGE', tone: 'image', icon: <FileImage size={22}/> }
  if (['doc', 'docx'].includes(extension)) return { label: extension.toLocaleUpperCase(), tone: 'word', icon: <FileText size={22}/> }
  return { label: extension.toLocaleUpperCase() || 'FILE', tone: 'other', icon: <FileIcon size={22}/> }
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatLocalDateTime(value: string) {
  if (!value) return '—'
  const [date, time] = value.split('T')
  return `${date.replaceAll('-', '/')} ${time}`
}

function localDateTimeValue(): string {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 16)
}
