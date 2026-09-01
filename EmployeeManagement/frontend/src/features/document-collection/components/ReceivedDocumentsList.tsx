import { FileText, Link2 } from 'lucide-react'
import type { ReceivedDocument } from '../types'
import { formatDate, safeExternalUrl } from '../utils'

export default function ReceivedDocumentsList({ files }: { files: ReceivedDocument[] }) {
  return <section className="dc-received-documents"><h3>受領文書 <small>{files.length}件</small></h3>
    {!files.length && <p className="dc-file-empty">受領文書はまだ登録されていません。</p>}
    {files.map(file => {
      const url = file.storage_type !== 'upload' ? safeExternalUrl(file.external_url) : null
      const provider = file.storage_type === 'google_drive' ? 'Google Drive' : file.storage_type === 'external_link' ? '外部リンク' : 'アップロード'
      return <article className="dc-file" key={file.id}><FileText size={18} aria-hidden="true" /><div><strong>{file.title}</strong>
        <span>{provider} · v{file.version} · {formatDate(file.received_at, true)}</span>
        {file.original_filename && <span>{file.original_filename}</span>}
        {file.notes && <p>{file.notes}</p>}{url ? <a className="dc-blue dc-link-text" href={url} target="_blank" rel="noopener noreferrer"><Link2 size={12} />{file.storage_type === 'google_drive' ? 'Google Driveで開く' : '資料リンクを開く'}</a> : <span>閲覧リンクはありません。</span>}
      </div></article>
    })}
  </section>
}
