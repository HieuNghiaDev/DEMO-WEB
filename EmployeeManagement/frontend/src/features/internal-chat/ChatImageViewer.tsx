import { useEffect, useId, useRef, useState } from 'react'
import { Download, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react'
import ModalShell from '../../components/ui/ModalShell'

export default function ChatImageViewer({ url, name, downloading, onDownload, onClose }: {
  url: string
  name: string
  downloading: boolean
  onDownload: () => Promise<void>
  onClose: () => void
}) {
  const titleId = useId()
  const [zoom, setZoom] = useState(1)
  const [natural, setNatural] = useState({ width: 0, height: 0 })
  const [bounds, setBounds] = useState({ width: 0, height: 0 })
  const viewport = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)

  useEffect(() => {
    const node = viewport.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect
      if (rect) setBounds({ width: rect.width, height: rect.height })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const changeZoom = (amount: number) => setZoom(value => Math.max(0.5, Math.min(4, value + amount)))
  const reset = () => {
    setZoom(1)
    viewport.current?.scrollTo({ top: 0, left: 0 })
  }
  const fit = natural.width && bounds.width
    ? Math.min(Math.max(1, bounds.width - 32) / natural.width, Math.max(1, bounds.height - 32) / natural.height, 1)
    : 1

  return <ModalShell isOpen onClose={onClose} title="画像プレビュー" customContent>
    <div className="internal-chat-image-viewer-backdrop" aria-hidden="true" onClick={onClose} />
    <section className="internal-chat-image-viewer" role="dialog" aria-modal="true" aria-labelledby={titleId}
      onKeyDown={event => {
        if (event.ctrlKey || event.metaKey || event.altKey) return
        if (event.key === '+' || event.key === '=') { event.preventDefault(); changeZoom(0.25) }
        if (event.key === '-') { event.preventDefault(); changeZoom(-0.25) }
        if (event.key === '0') { event.preventDefault(); reset() }
      }}>
      <header className="internal-chat-image-viewer-toolbar">
        <h2 id={titleId}>画像プレビュー</h2>
        <div className="internal-chat-image-viewer-controls">
          <button type="button" aria-label="縮小" disabled={zoom <= 0.5} onClick={() => changeZoom(-0.25)}><ZoomOut size={18} /></button>
          <output aria-label="表示倍率">{Math.round(zoom * 100)}%</output>
          <button type="button" aria-label="拡大" disabled={zoom >= 4} onClick={() => changeZoom(0.25)}><ZoomIn size={18} /></button>
          <button type="button" aria-label="表示をリセット" title="表示をリセット" onClick={reset}><RotateCcw size={17} /></button>
          <button type="button" aria-label="画像をダウンロード" disabled={downloading} onClick={() => void onDownload()}><Download size={18} /></button>
          <button type="button" aria-label="画像プレビューを閉じる" onClick={onClose}><X size={20} /></button>
        </div>
      </header>
      <div ref={viewport} className="internal-chat-image-viewer-viewport" tabIndex={0} aria-label="画像の表示領域"
        style={{ cursor: zoom > 1 ? 'grab' : 'default' }}
        onPointerDown={event => {
          if (zoom <= 1 || event.button !== 0 || event.pointerType !== 'mouse') return
          event.preventDefault()
          const node = event.currentTarget
          drag.current = { x: event.clientX, y: event.clientY, left: node.scrollLeft, top: node.scrollTop }
          node.setPointerCapture(event.pointerId)
        }}
        onPointerMove={event => {
          if (!drag.current) return
          event.currentTarget.scrollLeft = drag.current.left + drag.current.x - event.clientX
          event.currentTarget.scrollTop = drag.current.top + drag.current.y - event.clientY
        }}
        onPointerUp={() => { drag.current = null }}
        onPointerCancel={() => { drag.current = null }}
        onLostPointerCapture={() => { drag.current = null }}>
        <div className="internal-chat-image-viewer-canvas">
          <img src={url} alt={name} draggable={false}
            style={natural.width ? { width: natural.width * fit * zoom, height: natural.height * fit * zoom } : undefined}
            onDoubleClick={() => setZoom(value => value === 1 ? 2 : 1)}
            onLoad={event => {
              setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
              if (viewport.current) setBounds({ width: viewport.current.clientWidth, height: viewport.current.clientHeight })
            }} />
        </div>
      </div>
    </section>
  </ModalShell>
}
