import { Download } from 'lucide-react'
import { useRef, useState } from 'react'
import { ButtonSpinner } from '../../../components/loading'
import { fetchC001Workbook, saveWorkbookDownload } from '../c001Workbook'

export default function C001WorkbookDownloadButton({ caseId, documentId, version, label = 'ダウンロード' }: {
  caseId: number
  documentId: number
  version: number
  label?: string
}) {
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const download = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      const { blob, filename } = await fetchC001Workbook(caseId, documentId, version)
      saveWorkbookDownload(blob, filename)
    } catch {
      setError('C-001をダウンロードできませんでした。接続と閲覧権限を確認してください。')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return <span>
    <button type="button" className="dc-button" disabled={busy} onClick={() => void download()}>
      {busy ? <ButtonSpinner size={14}/> : <Download size={14}/>} {busy ? '取得中…' : label}
    </button>
    {error && <p className="dc-danger" role="alert">{error}</p>}
  </span>
}
