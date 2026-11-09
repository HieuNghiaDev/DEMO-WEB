import { MoreHorizontal } from 'lucide-react'
import { UserAvatar } from '../../../components/ui/UserAvatar'
import { resolveGeneratedVersionPreviewTarget, type DocumentPreviewTarget, type PreviewDocumentVersion } from '../documentPreview'
import { formatDate } from '../utils'
import { fileReviewLabel } from '../fileReview'
import DocumentFileCard from './DocumentFileCard'

export default function DocumentVersionList({ caseId, documentId, versions, onPreview, compact = false }: { caseId: number; documentId: number; versions: PreviewDocumentVersion[]; onPreview: (target: DocumentPreviewTarget) => void; compact?: boolean }) {
  return <div className={compact ? 'dc-compact-file-list' : 'dc-version-list'}>{versions.map((version, index) => {
    const target = resolveGeneratedVersionPreviewTarget(caseId, documentId, version, version.previewSubmission)
    const artifact = version.artifacts.find(item => item.filename === target.name) ?? version.artifacts[0]
    const author = artifact?.uploaded_by ?? version.created_by
    const name = target.name
    if (compact) return <DocumentFileCard key={version.id} name={name} version={version.version} author={(version.previewSubmission?.submitted_by ?? author)?.name} uploadedAt={version.previewSubmission?.submitted_at ?? artifact?.uploaded_at ?? version.updated_at} reviewStatus={version.previewSubmission?.source_type === 'manual_upload' ? version.previewSubmission.review_status : null} isCurrent={index === 0} onOpen={() => onPreview(target)}/>
    return <article key={version.id}>
      <span className="dc-version-number" aria-label={`バージョン${version.version}`}>v{version.version}</span>
      <div><button type="button" className="dc-version-preview" title={name} onClick={() => onPreview(target)}><strong>{name}</strong></button><small>{formatDate(artifact?.uploaded_at ?? version.updated_at, true)}</small></div>
      <span className="dc-version-author">{author && <><UserAvatar name={author.name} stableKey={author.id} size="sm" shape="circle"/><span title={author.name}>{author.name}</span></>}</span>
      <span>{version.previewSubmission?.source_type === 'manual_upload' ? <span className={`dc-file-review-label is-${version.previewSubmission.review_status}`}>{fileReviewLabel(version.previewSubmission.review_status)}</span> : index === 0 && <span className="dc-current-version">現在</span>}</span>
      <button type="button" className="dc-icon-button" onClick={() => onPreview(target)} aria-label={`${name}をプレビュー`}><MoreHorizontal size={18}/></button>
    </article>
  })}</div>
}
