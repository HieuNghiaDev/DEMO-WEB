import { FileText, Link2, Plus } from 'lucide-react'
import { useState } from 'react'
import type { ReceivedFile } from './types'

export default function ReceivedDocumentsSection({ files, purposes, onChange }: { files: ReceivedFile[]; purposes: string[]; onChange: (files: ReceivedFile[]) => void }) {
  const [mode, setMode] = useState<'file' | 'link' | null>(null)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [format, setFormat] = useState<'原本' | '写し'>('写し')
  const [error, setError] = useState('')
  const add = () => {
    if (!name.trim()) { setError('資料名を入力してください。'); return }
    if (mode === 'link') {
      try { if (new URL(url).protocol !== 'https:') throw new Error() } catch { setError('https:// で始まるリンクを入力してください。'); return }
    }
    onChange([...files, { id: crypto.randomUUID(), name: name.trim(), version: Math.max(0, ...files.filter(file => file.name === name.trim()).map(file => file.version)) + 1, received: '2026-08-31', actor: 'LE HIEU NGHIA（デモ）', format, returnStatus: format === '原本' ? '返却要否 未確認' : '返却不要', purposes: [...purposes], ...(mode === 'link' ? { url } : {}) }])
    setMode(null); setName(''); setUrl(''); setError('')
  }
  return <section className="dc-detail-section" id="dc-received">
    <h3><span>F</span>受領資料 <small>{files.length}件</small></h3>
    <p className="dc-meta">収集項目とは別に、受領したファイル・版を管理します。</p>
    {files.length === 0 && <p className="dc-file-empty">受領資料はまだ登録されていません。</p>}
    {files.map(file => <article className="dc-file" key={file.id}>
      <FileText size={18} aria-hidden="true" /><div><strong>{file.name}</strong><span>v{file.version} · {file.format} · {file.received.replaceAll('-', '/')}</span><span>登録: {file.actor}</span><span>関連目的: {file.purposes.join(' / ')} · 1ファイルを共用</span><span>原本管理: {file.returnStatus}</span>{file.url && <span className="dc-blue dc-link-text"><Link2 size={12} />{file.url}（プレビューのみ・開きません）</span>}</div>
    </article>)}
    <div className="dc-action-row"><button type="button" className="dc-button" onClick={() => { setMode('file'); setError('') }}><Plus size={15} />ファイルを登録</button><button type="button" className="dc-button" onClick={() => { setMode('link'); setError('') }}><Link2 size={15} />外部リンクを追加</button></div>
    {mode && <div className="dc-inline-editor">
      <p className="dc-meta">デモ登録：実ファイルは選択・送信しません。同名で登録すると次の版になります。</p>
      <label>受領資料名<input value={name} onChange={event => setName(event.target.value)} placeholder="例：診断書_2026-08-31.pdf" /></label>
      {mode === 'link' && <label>資料リンク（HTTPS）<input type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://drive.google.com/..." /></label>}
      <label>原本 / 写し<select value={format} onChange={event => setFormat(event.target.value as '原本' | '写し')}><option>写し</option><option>原本</option></select></label>
      {error && <p role="alert" className="dc-danger">{error}</p>}
      <div className="dc-action-row"><button type="button" className="dc-button dc-primary" onClick={add}>デモに追加</button><button type="button" className="dc-button" onClick={() => setMode(null)}>キャンセル</button></div>
    </div>}
  </section>
}
