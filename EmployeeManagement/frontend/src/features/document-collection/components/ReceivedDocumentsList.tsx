import { Download, FileText, Link2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { documentCollectionApi } from '../api'
import type { ReceivedDocument } from '../types'
import { formatDate, safeExternalUrl } from '../utils'

export default function ReceivedDocumentsList({ caseId, itemId, files, hideTitle = false }: { caseId: number; itemId: number; files: ReceivedDocument[]; hideTitle?: boolean }) {
  const { t } = useTranslation()
  const [downloadingId, setDownloadingId] = useState<number | null>(null)
  const [downloadError, setDownloadError] = useState(false)
  const download = async (file: ReceivedDocument) => {
    setDownloadingId(file.id); setDownloadError(false)
    try {
      const blob = await documentCollectionApi.downloadReceivedDocument(caseId, itemId, file.id)
      const url = URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = url; link.download = file.original_filename ?? file.title; link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch { setDownloadError(true) }
    finally { setDownloadingId(null) }
  }
  return <section className="dc-received-documents">{!hideTitle && <h3>{t('documentCollection.receivedDocuments.title')} <small>{t('cases.count', { count: files.length })}</small></h3>}
    {!files.length && <p className="dc-file-empty">{t('documentCollection.receivedDocuments.empty')}</p>}
    {files.map(file => {
      const url = file.storage_type !== 'upload' ? safeExternalUrl(file.external_url) : null
      const provider = file.storage_type === 'google_drive' ? 'Google Drive' : file.storage_type === 'external_link' ? t('documentCollection.receivedDocuments.externalLink') : t('documentCollection.receivedDocuments.upload')
      return <article className="dc-file" key={file.id}><FileText size={18} aria-hidden="true" /><div><strong>{file.title}</strong>
        <span>{provider} · v{file.version} · {formatDate(file.received_at, true)}</span>
        {file.original_filename && <span>{file.original_filename}</span>}
        {file.notes && <p>{file.notes}</p>}{url ? <a className="dc-blue dc-link-text" href={url} target="_blank" rel="noopener noreferrer"><Link2 size={12} />{file.storage_type === 'google_drive' ? t('documentCollection.receivedDocuments.openGoogleDrive') : t('documentCollection.receivedDocuments.openLink')}</a> : file.storage_type === 'upload' ? <button type="button" className="dc-file-download" disabled={downloadingId === file.id} onClick={() => void download(file)}><Download size={12}/>{downloadingId === file.id ? t('documentCollection.receivedDocuments.downloading') : t('documentCollection.receivedDocuments.download')}</button> : <span>{t('documentCollection.receivedDocuments.noLink')}</span>}
      </div></article>
    })}
    {downloadError && <p className="dc-danger" role="alert">{t('documentCollection.receivedDocuments.downloadFailed')}</p>}
  </section>
}
