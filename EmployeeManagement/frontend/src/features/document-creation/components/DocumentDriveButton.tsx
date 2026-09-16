import { useRef, useState } from 'react'
import { saveDocumentToDrive } from '../documentDraftStore'
import type { DocumentDriveState } from '../documentDraftStore'
import { ButtonSpinner } from '../../../components/loading'

function driveLink(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'drive.google.com' && !url.username && !url.password ? url.href : null
  } catch { return null }
}

export default function DocumentDriveButton({ caseId, documentId, version, drive, onSaved }: { caseId: number; documentId: number; version?: number; drive: DocumentDriveState; onSaved: (state: DocumentDriveState) => void }) {
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const upload = async () => {
    if (inFlight.current || !drive.available || drive.artifact) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      const result = await saveDocumentToDrive({ caseId, documentId }, version)
      if (!result.artifact || !driveLink(result.artifact.url)) throw new Error('Invalid upload result')
      onSaved(result)
    } catch {
      setError('Google Driveへの保存を確認できませんでした。再試行しても解消しない場合は管理者に確認してください。')
    } finally { inFlight.current = false; setBusy(false) }
  }
  const url = drive.artifact && driveLink(drive.artifact.url)
  if (drive.artifact) return <span><span>Google Drive 保存済み </span>{url && <a className="dc-button" href={url} target="_blank" rel="noopener noreferrer">Google Driveで開く</a>}</span>
  return <span>
    <button type="button" className="dc-button" disabled={!drive.available || busy} onClick={() => void upload()}>{busy && <ButtonSpinner size={14} />}{busy ? 'Google Driveへ保存中…' : 'Google Driveへ保存'}</button>
    {!drive.available && <small className="dc-meta">Google Driveへの保存は現在利用できません。</small>}
    {error && <span className="dc-danger" role="alert">{error}</span>}
  </span>
}
