import { useRef, useState } from 'react'
import { fetchDocumentPdf, savePdfDownload } from '../documentPdf'
import { ButtonSpinner } from '../../../components/loading'

export default function DocumentPdfDownloadButton({ caseId, documentId, version }: { caseId: number; documentId: number; version?: number }) {
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const download = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true); setError('')
    try {
      const { blob, filename } = await fetchDocumentPdf(caseId, documentId, version)
      savePdfDownload(blob, filename)
    } catch {
      setError('PDFをダウンロードできませんでした。接続と閲覧権限を確認して再試行してください。')
    } finally {
      inFlight.current = false; setBusy(false)
    }
  }
  return <span>
    <button type="button" className="dc-button" disabled={busy} onClick={() => void download()}>{busy && <ButtonSpinner size={14} />}{busy ? 'PDFを作成中…' : 'PDFをダウンロード'}</button>
    {error && <p className="dc-danger" role="alert">{error}</p>}
  </span>
}
