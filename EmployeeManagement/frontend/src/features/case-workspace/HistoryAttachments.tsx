import { useId, useRef, useState } from 'react'
import { Download, FileText, Image, Mic, Paperclip, Video, X } from 'lucide-react'
import { Button } from '../../components/ui'
import { captureAuthSession } from '../../services/api'
import { caseWorkspaceApi } from './api'
import type { HistoryAttachment } from './historyTypes'

const limitsByExtension: Record<string, number> = {
  pdf: 20, jpg: 20, jpeg: 20, png: 20, webp: 20,
  mp3: 100, wav: 100, m4a: 100, aac: 100, ogg: 100, opus: 100,
  mp4: 250, mov: 250, webm: 250,
}
const megabyte = 1024 * 1024
const sizeLabel = (size: number) => size >= megabyte ? `${(size / megabyte).toFixed(1)} MB` : `${Math.max(1, Math.ceil(size / 1024))} KB`

export function HistoryAttachmentList({ attachments, caseId, communicationId }: { attachments: HistoryAttachment[]; caseId: number; communicationId: number }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const download = async (item: HistoryAttachment) => {
    if (busy) return
    setBusy(item.id)
    setError(false)
    const sameSession = captureAuthSession()
    try {
      const blob = await caseWorkspaceApi.downloadCommunicationAttachment(caseId, communicationId, item.id)
      if (!sameSession()) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = item.name
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch {
      if (sameSession()) setError(true)
    } finally {
      setBusy(null)
    }
  }
  return <div className="cm-history-attachments">
    <ul>{attachments.map(item => {
      const Icon = item.mime_type.startsWith('image/') ? Image : item.mime_type.startsWith('video/') ? Video : item.mime_type.startsWith('audio/') ? Mic : FileText
      return <li key={item.id}>
        <Icon size={16} aria-hidden/>
        <span className="cm-history-attachment-name" title={item.name}>{item.name}</span>
        <small>{sizeLabel(item.size)}</small>
        <Button type="button" size="sm" variant="ghost" aria-label={`${item.name}をダウンロード`} disabled={busy !== null} loading={busy === item.id} onClick={() => void download(item)}><Download size={16} aria-hidden/></Button>
      </li>
    })}</ul>
    {error && <p role="alert" className="cm-history-field-error">添付ファイルを取得できませんでした。再試行してください。</p>}
  </div>
}

export function HistoryAttachmentPicker({ id, files, onChange, existingCount, serverError }: {
  id: string; files: File[]; onChange: (files: File[]) => void; existingCount: number; serverError: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const hintId = useId()
  const [error, setError] = useState('')
  const pick = (newFiles: File[]) => {
    const next = [...files]
    for (const file of newFiles) {
      const extension = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() ?? '' : ''
      const limit = limitsByExtension[extension]
      if (!limit || !file.size || file.size > limit * megabyte) {
        setError(limit ? `${file.name}：${limit}MB以下のファイルを選択してください。` : `${file.name}：このファイル形式は添付できません。`)
        return
      }
      if (!next.some(item => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) next.push(file)
    }
    if (next.length > Math.min(5, 10 - existingCount) || next.reduce((size, file) => size + file.size, 0) > 300 * megabyte) {
      setError('一度に5件・合計300MB、履歴1件につき10ファイルまで添付できます。')
      return
    }
    setError('')
    onChange(next)
  }
  return <section className="cm-history-attachments" aria-label="添付ファイル">
    <div className="cm-history-attachment-heading">
      <div><strong>ファイルを追加</strong><p id={hintId}>画像・PDF 20MB／録音 100MB／動画 250MBまで。1回の保存につき合計300MBまで。</p></div>
      <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-label="添付ファイルを選択" multiple accept={Object.keys(limitsByExtension).map(extension => `.${extension}`).join(',')} onChange={event => {
        pick(Array.from(event.currentTarget.files ?? []))
        event.currentTarget.value = ''
      }}/>
      <Button id={id} aria-describedby={hintId} type="button" size="sm" icon={<Paperclip size={15} aria-hidden/>} disabled={existingCount >= 10} onClick={() => input.current?.click()}>ファイルを選択</Button>
    </div>
    {files.length > 0 && <ul>{files.map((file, index) => <li key={`${file.name}-${index}`}>
      <Paperclip size={15} aria-hidden/><span className="cm-history-attachment-name" title={file.name}>{file.name}</span><small>{sizeLabel(file.size)}</small>
      <Button type="button" size="sm" variant="ghost" aria-label={`${file.name}を取り消す`} onClick={() => { setError(''); onChange(files.filter(item => item !== file)) }}><X size={16} aria-hidden/></Button>
    </li>)}</ul>}
    {(error || serverError) && <p role="alert" className="cm-history-field-error">{error || serverError}</p>}
  </section>
}
