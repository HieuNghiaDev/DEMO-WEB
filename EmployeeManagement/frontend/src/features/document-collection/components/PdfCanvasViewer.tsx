import { ChevronLeft, ChevronRight, Download, LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import IconButton from '../../../components/ui/IconButton'

export type PdfCanvasViewerProps = { url: string; name: string; onError: () => void }

GlobalWorkerOptions.workerSrc = workerUrl
// Vite emits these dependency resources as local versioned assets. CJK CMaps,
// standard fonts and decoders must never fall back to a third-party CDN.
const resources = import.meta.glob<string>('/node_modules/pdfjs-dist/{cmaps/*.bcmap,standard_fonts/*.{pfb,ttf},wasm/*.wasm}', { query: '?url', import: 'default', eager: true })
const resourceFolders: Record<string, string> = { cMapUrl: 'cmaps', standardFontDataUrl: 'standard_fonts', wasmUrl: 'wasm' }
class LocalPdfResources {
  async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
    const resource = resources[`/node_modules/pdfjs-dist/${resourceFolders[kind]}/${filename}`]
    if (!resource) throw new Error('pdf-resource-unavailable')
    const response = await fetch(resource)
    if (!response.ok) throw new Error('pdf-resource-unavailable')
    return new Uint8Array(await response.arrayBuffer())
  }
}

export default function PdfCanvasViewer({ url, name, onError }: PdfCanvasViewerProps) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [width, setWidth] = useState(0)
  const [rendered, setRendered] = useState('')
  const [pageText, setPageText] = useState('')
  const viewport = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const renderQueue = useRef<Promise<unknown>>(Promise.resolve())
  const errorRef = useRef(onError)
  useEffect(() => { errorRef.current = onError }, [onError])

  useEffect(() => {
    let disposed = false
    const task = getDocument({ url, BinaryDataFactory: LocalPdfResources, useWorkerFetch: false, enableXfa: false })
    const timeout = window.setTimeout(() => { if (!disposed) errorRef.current(); void task.destroy().catch(() => {}) }, 30000)
    task.onPassword = () => { if (!disposed) errorRef.current(); void task.destroy().catch(() => {}) }
    void task.promise.then(document => {
      if (!disposed) setPdf(document)
    }).catch(() => { if (!disposed) errorRef.current() }).finally(() => window.clearTimeout(timeout))
    return () => { disposed = true; window.clearTimeout(timeout); void task.destroy().catch(() => {}) }
  }, [url])

  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const resize = () => setWidth(Math.max(1, element.clientWidth - 32))
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const renderKey = `${pageNumber}:${width}:${zoom}`
  useEffect(() => {
    if (!pdf || !width) return
    let disposed = false
    let task: RenderTask | undefined
    // Cancellation settles before another render uses this canvas, including
    // rapid page changes/resizes and React StrictMode effect replays.
    const pending = renderQueue.current.catch(() => {}).then(async () => {
      if (disposed) return
      const page = await pdf.getPage(pageNumber)
      if (disposed || !canvas.current) return
      const base = page.getViewport({ scale: 1 })
      const view = page.getViewport({ scale: Math.min(width / base.width, 2) * zoom })
      const outputScale = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(8_000_000 / (view.width * view.height)))
      const element = canvas.current
      const context = element.getContext('2d')
      if (!context) throw new Error('pdf-canvas-unavailable')
      element.width = Math.max(1, Math.floor(view.width * outputScale))
      element.height = Math.max(1, Math.floor(view.height * outputScale))
      element.style.width = `${view.width}px`
      element.style.height = `${view.height}px`
      task = page.render({ canvas: element, canvasContext: context, viewport: view, transform: [outputScale, 0, 0, outputScale, 0, 0] })
      await task.promise
      const content = await page.getTextContent().catch(() => null)
      if (!disposed) {
        setRendered(renderKey)
        setPageText(content?.items.map(item => 'str' in item ? item.str : '').join(' ') ?? '')
      }
    })
    renderQueue.current = pending
    void pending.catch(() => { if (!disposed) errorRef.current() })
    return () => { disposed = true; task?.cancel() }
  }, [pdf, pageNumber, width, zoom, renderKey])

  const busy = !pdf || rendered !== renderKey
  return <section className="dc-pdf-canvas-viewer" aria-label={`${name} PDFプレビュー`} aria-busy={busy}>
    <nav className="dc-pdf-canvas-toolbar" aria-label="PDFページ操作">
      <IconButton size="sm" aria-label="前のPDFページ" disabled={!pdf || pageNumber <= 1} onClick={() => setPageNumber(value => value - 1)}><ChevronLeft size={16} aria-hidden/></IconButton>
      <span aria-live="polite">{pageNumber} / {pdf?.numPages ?? '—'}</span>
      <IconButton size="sm" aria-label="次のPDFページ" disabled={!pdf || pageNumber >= pdf.numPages} onClick={() => setPageNumber(value => value + 1)}><ChevronRight size={16} aria-hidden/></IconButton>
      <label>表示倍率 <select value={zoom} onChange={event => setZoom(Number(event.target.value))}><option value={1}>幅に合わせる</option><option value={1.5}>150%</option><option value={2}>200%</option></select></label>
      <a href={url} download={name} aria-label="PDFをダウンロード"><Download size={16} aria-hidden/></a>
    </nav>
    <div className="dc-pdf-canvas-pages" ref={viewport}>
      <canvas ref={canvas} role="img" aria-label={`${name} ${pageNumber}ページ`} style={{ visibility: busy ? 'hidden' : 'visible' }}/>
      {!busy && <p className="sr-only">{pageText}</p>}
      {busy && <div className="dc-document-preview-state" role="status"><LoaderCircle size={26} aria-hidden/><strong>PDFを表示しています…</strong></div>}
    </div>
  </section>
}
