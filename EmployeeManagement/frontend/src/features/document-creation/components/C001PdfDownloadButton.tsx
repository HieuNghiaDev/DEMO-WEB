import { useState } from 'react'
import { Download } from 'lucide-react'
import { ButtonSpinner } from '../../../components/loading'
import api from '../../../services/api'
import { pdfFilename, savePdfDownload } from '../documentPdf'

export default function C001PdfDownloadButton({ caseId, documentId, version }: {
  caseId: number
  documentId: number
  version: number
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const download = async () => {
    if (busy) return
    setBusy(true); setError('')
    try {
      const response = await api.get<Blob>(`/case-files/${caseId}/document-collection/${documentId}/creation/c001/pdf?version=${version}`, { responseType: 'blob' })
      if (!response.data.type.toLowerCase().startsWith('application/pdf') || await response.data.slice(0, 5).text() !== '%PDF-') throw new Error()
      savePdfDownload(response.data, pdfFilename(response.headers['content-disposition']))
    } catch {
      setError('PDFをダウンロードできませんでした。')
    } finally {
      setBusy(false)
    }
  }

  return <span className="c001-download-action">
    <button type="button" className="dc-button" disabled={busy} onClick={() => void download()}>
      {busy ? <ButtonSpinner size={14}/> : <Download size={14}/>} {busy ? '準備中…' : 'PDFをダウンロード'}
    </button>
    {error && <small role="alert">{error}</small>}
  </span>
}
