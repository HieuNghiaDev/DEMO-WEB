import { useEffect, useRef, useState } from 'react'
import { Download, FileSpreadsheet, FileText, LoaderCircle } from 'lucide-react'
import { fetchChatAttachment } from './api'
import ChatImageViewer from './ChatImageViewer'
import type { ChatAttachment as Attachment } from './types'

export default function ChatAttachment({ messageId, file }: { messageId: number; file: Attachment }) {
  const [attempt, setAttempt] = useState(0)
  const [imageResult, setImageResult] = useState<{ key: string; url: string; failed: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)
  const container = useRef<HTMLLIElement>(null)
  const request = useRef<AbortController | null>(null)
  const image = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mime_type)
  const imageKey = `${messageId}/${file.id}/${attempt}`
  const preview = imageResult?.key === imageKey ? imageResult : null
  const fileType = file.name.match(/\.([a-z0-9]{1,8})$/i)?.[1].toUpperCase() ?? 'FILE'
  const FileIcon = ['XLS', 'XLSX'].includes(fileType) ? FileSpreadsheet : FileText
  const fileSize = file.size >= 1024 * 1024
    ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.ceil(file.size / 1024)} KB`

  useEffect(() => () => { request.current?.abort() }, [])

  useEffect(() => {
    if (!image) return
    const controller = new AbortController()
    let objectUrl: string | undefined
    let started = false
    const loadImage = async () => {
      try {
        const blob = await fetchChatAttachment(messageId, file.id, controller.signal)
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setImageResult({ key: imageKey, url: objectUrl, failed: false })
      } catch {
        if (!controller.signal.aborted) setImageResult({ key: imageKey, url: '', failed: true })
      }
    }
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      if (!started && entries.some(entry => entry.isIntersecting)) {
        started = true
        observer?.disconnect()
        void loadImage()
      }
    }, { rootMargin: '160px' })
    if (observer && container.current) observer.observe(container.current)
    else void loadImage()

    return () => {
      controller.abort()
      observer?.disconnect()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [image, imageKey, messageId, file.id])

  const download = async () => {
    if (request.current) return
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError(false)
    try {
      const blob = preview?.url ? null : await fetchChatAttachment(messageId, file.id, controller.signal)
      if (controller.signal.aborted) return
      const url = blob ? URL.createObjectURL(blob) : preview!.url
      const link = document.createElement('a')
      link.href = url
      link.download = file.name
      link.click()
      if (blob) window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      if (!controller.signal.aborted) setError(true)
    } finally {
      request.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  return <li ref={container} aria-busy={busy || (image && !preview)}>
    {image && <div className={`internal-chat-image-frame${preview?.url ? ' is-loaded' : ''}`}>
      {preview?.url
        ? <button type="button" className="internal-chat-image-open" onClick={() => setViewerOpen(true)}
          aria-label="画像を大きく表示" aria-haspopup="dialog">
          <img className="internal-chat-attachment-image" src={preview.url} alt={file.name} decoding="async"
            onError={() => setImageResult({ key: imageKey, url: '', failed: true })} />
        </button>
        : preview?.failed
          ? <button type="button" className="internal-chat-image-retry" onClick={() => setAttempt(value => value + 1)}>
            画像を読み込めませんでした · 再試行
          </button>
          : <span className="internal-chat-image-loading" role="status">画像を読み込み中…</span>}
      {preview?.url && <button type="button" className="internal-chat-image-download" disabled={busy}
        aria-label="画像をダウンロード" onClick={() => void download()}><Download size={17} aria-hidden="true" /></button>}
    </div>}
    {!image && <div className="internal-chat-attachment-row">
      <span className="internal-chat-file-icon" aria-hidden="true"><FileIcon size={21} /></span>
      <div className="internal-chat-file-info">
        <strong className="internal-chat-file-name" title={file.name}>{file.name}</strong>
        <small className="internal-chat-file-meta">{fileType} · {fileSize}</small>
      </div>
      <button type="button" className="internal-chat-tool-btn internal-chat-file-download" disabled={busy}
        title="ダウンロード" aria-label={`${file.name} をダウンロード`}
        onClick={() => void download()}>{busy
          ? <LoaderCircle className="animate-spin" size={16} aria-hidden="true" />
          : <Download size={17} aria-hidden="true" />}</button>
    </div>}
    {error && <p className="internal-chat-attachment-error" role="alert">ファイルを取得できませんでした。</p>}
    {viewerOpen && preview?.url && <ChatImageViewer url={preview.url} name={file.name} downloading={busy}
      onDownload={download} onClose={() => setViewerOpen(false)} />}
  </li>
}
