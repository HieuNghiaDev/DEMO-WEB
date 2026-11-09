import { File, FileImage, FileSpreadsheet, FileText, MoreHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'
import { fileReviewLabel } from '../fileReview'
import type { FileReview } from '../types'
import { formatDate } from '../utils'
import './documentFiles.css'

/** Compact presentation only; callers retain their existing preview/download actions. */
export default function DocumentFileCard({ name, version, author, uploadedAt, reviewStatus, isCurrent, onOpen, disabled, children }: {
  name: string; version: number; author?: string | null; uploadedAt?: string | null
  reviewStatus?: FileReview['status']; isCurrent?: boolean; onOpen: () => void; disabled?: boolean; children?: ReactNode
}) {
  const extension = name.split('.').pop()?.toLowerCase()
  const isPdf = extension === 'pdf'
  const Icon = isPdf ? FileText : ['xlsx', 'xls', 'csv'].includes(extension ?? '') ? FileSpreadsheet : ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension ?? '') ? FileImage : File
  return <article className="dc-compact-file">
    <span className={`dc-compact-file-type ${isPdf ? 'is-pdf' : ''}`} aria-label={isPdf ? 'PDF' : 'ファイル'}><Icon size={23} aria-hidden="true"/>{isPdf && <small aria-hidden="true">PDF</small>}</span>
    <div className="dc-compact-file-content">
      <div className="dc-compact-file-identity"><button type="button" className="dc-file-preview" disabled={disabled} title={name} onClick={onOpen}><strong>{name}</strong></button><span className="dc-compact-file-version" aria-label={`バージョン${version}`}>v{version}</span></div>
      <div className="dc-compact-file-meta">{author && <span>{author}</span>}{uploadedAt && <span>{formatDate(uploadedAt, true)}</span>}</div>
      {children}
    </div>
    {reviewStatus ? <span className={`dc-compact-file-status is-${reviewStatus}`}><i aria-hidden="true"/>{fileReviewLabel(reviewStatus)}</span> : isCurrent ? <span className="dc-current-version">現在</span> : <span/>}
    <button type="button" className="dc-icon-button dc-compact-file-more" disabled={disabled} onClick={onOpen} aria-label={`${name}をプレビュー`}><MoreHorizontal size={18} aria-hidden="true"/></button>
  </article>
}
