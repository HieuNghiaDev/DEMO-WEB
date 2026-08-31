import { FileText, Link2 } from 'lucide-react'
import type { ReceivedDocument } from '../types'
import { formatDate, safeExternalUrl } from '../utils'

export default function ReceivedDocumentsList({ files }: { files: ReceivedDocument[] }) {
  return <section className="dc-detail-section"><h3><span>F</span>受領資料 <small>{files.length}件</small></h3><p className="dc-meta">受領したファイル・版の登録情報です。現在は閲覧のみ対応しています。</p>
    {!files.length && <p className="dc-file-empty">受領資料はまだ登録されていません。</p>}
    {files.map(file => {
      const url = file.storage_type !== 'upload' ? safeExternalUrl(file.external_url) : null
      return <article className="dc-file" key={file.id}><FileText size={18} aria-hidden="true" /><div><strong>{file.title}</strong>
        {file.original_filename && <span>{file.original_filename}</span>}<span>v{file.version} · {file.original_or_copy === 'original' ? '原本' : file.original_or_copy === 'copy' ? '写し' : '原本 / 写し 未設定'} · {formatDate(file.received_at, true)}</span>
        <span>登録: {file.registered_by_employee?.display_name ?? '—'}</span><span>関連: {file.relationship_type === 'primary' ? '主資料' : file.relationship_type === 'alternative' ? '代替資料' : file.relationship_type === 'supporting' ? '補足資料' : file.relationship_type}</span>
        <span>原本管理: {file.return_required ? '返却必要' : '返却不要'}{file.returned_at && ` · 返却済み ${formatDate(file.returned_at, true)}`}</span>
        {file.notes && <p>{file.notes}</p>}{url ? <a className="dc-blue dc-link-text" href={url} target="_blank" rel="noopener noreferrer"><Link2 size={12} />資料リンクを開く</a> : <span>閲覧リンクはありません。</span>}
      </div></article>
    })}
  </section>
}
