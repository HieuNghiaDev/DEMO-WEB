import { useState } from 'react'
import { Copy, Download } from 'lucide-react'
import { Button } from '../../components/ui'

export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false)
  const [feedback, setFeedback] = useState('')
  const codesText = codes.join('\n')

  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText(codesText)
      setFeedback('すべてのコードをコピーしました。')
    } catch {
      setFeedback('コピーできませんでした。ファイルをダウンロードしてください。')
    }
  }

  const downloadCodes = () => {
    const file = new Blob([`${codesText}\n`], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    try {
      link.href = url
      link.download = 'themis-backup-codes.txt'
      document.body.append(link)
      link.click()
    } finally {
      link.remove()
      // Leave the browser time to consume the Blob.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
  }

  return <div className="auth-security-form">
    <p>コードは一度だけ表示されます。各コードは1回使用でき、再読み込みすると表示できなくなります。</p>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" icon={<Copy size={16} aria-hidden="true" />} onClick={() => void copyCodes()}>すべてコピー</Button>
      <Button type="button" variant="outline" icon={<Download size={16} aria-hidden="true" />} onClick={downloadCodes}>ダウンロード</Button>
    </div>
    <p className={feedback ? '' : 'sr-only'} role="status">{feedback}</p>
    <ul className="auth-security-codes sm:grid-cols-2" aria-label="バックアップコード">{codes.map(code => <li className="min-w-0" key={code}><code>{code}</code></li>)}</ul>
    <label className="auth-security-ack"><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} />コードを安全な場所に保存しました。</label>
    <Button type="button" variant="primary" fullWidth disabled={!saved} onClick={onDone}>ログインに戻る</Button>
  </div>
}
