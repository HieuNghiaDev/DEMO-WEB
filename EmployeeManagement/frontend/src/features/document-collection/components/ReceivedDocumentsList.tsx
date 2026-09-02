import { FileText, Link2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ReceivedDocument } from '../types'
import { formatDate, safeExternalUrl } from '../utils'

export default function ReceivedDocumentsList({ files }: { files: ReceivedDocument[] }) {
  const { t } = useTranslation()
  return <section className="dc-received-documents"><h3>{t('documentCollection.receivedDocuments.title')} <small>{t('cases.count', { count: files.length })}</small></h3>
    {!files.length && <p className="dc-file-empty">{t('documentCollection.receivedDocuments.empty')}</p>}
    {files.map(file => {
      const url = file.storage_type !== 'upload' ? safeExternalUrl(file.external_url) : null
      const provider = file.storage_type === 'google_drive' ? 'Google Drive' : file.storage_type === 'external_link' ? t('documentCollection.receivedDocuments.externalLink') : t('documentCollection.receivedDocuments.upload')
      return <article className="dc-file" key={file.id}><FileText size={18} aria-hidden="true" /><div><strong>{file.title}</strong>
        <span>{provider} · v{file.version} · {formatDate(file.received_at, true)}</span>
        {file.original_filename && <span>{file.original_filename}</span>}
        {file.notes && <p>{file.notes}</p>}{url ? <a className="dc-blue dc-link-text" href={url} target="_blank" rel="noopener noreferrer"><Link2 size={12} />{file.storage_type === 'google_drive' ? t('documentCollection.receivedDocuments.openGoogleDrive') : t('documentCollection.receivedDocuments.openLink')}</a> : <span>{t('documentCollection.receivedDocuments.noLink')}</span>}
      </div></article>
    })}
  </section>
}
