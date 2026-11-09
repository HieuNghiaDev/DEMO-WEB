import { ExternalLink, FileText, LoaderCircle, RefreshCw, X } from 'lucide-react'
import { useEffect, useRef, useState, type ComponentType } from 'react'
import { createPortal } from 'react-dom'
import type { DocumentPreviewKind, DocumentPreviewTarget } from '../documentPreview'
import { previewAuthorizationFailed, resolvePreviewBlob } from '../documentPreview'
import { savePdfDownload } from '../../document-creation/documentPdf'
import './documentPreviewViewer.css'
import type { PdfCanvasViewerProps } from './PdfCanvasViewer'

type LoadedPreview = { kind: Extract<DocumentPreviewKind, 'pdf' | 'image'>; url: string }

export default function DocumentPreviewViewer({ target, onClose }: { target: DocumentPreviewTarget | null; onClose: () => void }) {
  return target ? <PreviewSession key={target.key} target={target} onClose={onClose}/> : null
}

function PreviewSession({ target, onClose }: { target: DocumentPreviewTarget; onClose: () => void }) {
  const [attempt, setAttempt] = useState(0)
  const [externalBlocked, setExternalBlocked] = useState(false)
  const closeButton = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLElement>(null)
  const origin = useRef<HTMLElement | null>(null)
  const closeRef = useRef(onClose)
  const targetKey = target?.key

  useEffect(() => { closeRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!targetKey) return
    origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButton.current?.focus({ preventScroll: true })
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        event.stopImmediatePropagation()
        const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], select:not([disabled])') ?? []).filter(element => element.getClientRects().length)
        const first = controls[0]; const last = controls.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      closeRef.current()
    }
    document.addEventListener('keydown', closeOnEscape, true)
    return () => {
      document.removeEventListener('keydown', closeOnEscape, true)
      document.body.style.overflow = previousOverflow
      origin.current?.focus({ preventScroll: true })
    }
  }, [targetKey])

  return createPortal(<div className="dc-document-preview-layer">
    <div className="dc-document-preview-backdrop" aria-hidden="true"/>
    <section ref={panel} className="dc-document-preview" role="dialog" aria-modal="true" aria-label={`${target.name}のプレビュー`}>
      <header><div><FileText size={18}/><strong>{target.name}</strong>{target.versionLabel && <span>{target.versionLabel}</span>}</div><div className="dc-document-preview-actions">{target.externalUrl && !externalBlocked && <a href={target.externalUrl} target="_blank" rel="noopener noreferrer" aria-label="外部で開く"><ExternalLink size={16}/>外部で開く</a>}<button ref={closeButton} type="button" onClick={onClose} aria-label="プレビューを閉じる"><X size={20}/></button></div></header>
      <PreviewBody key={`${target.key}:${attempt}`} target={target} externalBlocked={externalBlocked} onExternalBlocked={() => setExternalBlocked(true)} onRetry={() => setAttempt(value => value + 1)} onClose={onClose}/>
    </section>
  </div>, document.body)
}

function PreviewBody({ target, externalBlocked, onExternalBlocked, onRetry, onClose }: { target: DocumentPreviewTarget; externalBlocked: boolean; onExternalBlocked: () => void; onRetry: () => void; onClose: () => void }) {
  const [requestTarget] = useState(target)
  const [loaded, setLoaded] = useState<LoadedPreview | null>(null)
  const [loading, setLoading] = useState(Boolean(target.load))
  const [frameReady, setFrameReady] = useState(false)
  const [useCanvas, setUseCanvas] = useState(() => typeof navigator !== 'undefined' && navigator.pdfViewerEnabled === false)
  const [CanvasRenderer, setCanvasRenderer] = useState<ComponentType<PdfCanvasViewerProps> | null>(null)
  const [error, setError] = useState(target.load ? '' : target.unavailableMessage ?? 'ファイルをプレビューできませんでした。')
  const [downloading, setDownloading] = useState(false)
  const downloadController = useRef<AbortController | null>(null)
  const blockedRef = useRef(onExternalBlocked)
  useEffect(() => { blockedRef.current = onExternalBlocked }, [onExternalBlocked])
  useEffect(() => () => downloadController.current?.abort(), [])

  const download = async () => {
    if (!target.download || downloading) return
    const controller = new AbortController()
    downloadController.current = controller
    setDownloading(true)
    try {
      const blob = await target.download(controller.signal)
      if (!controller.signal.aborted) savePdfDownload(blob, target.name)
    } catch (requestError) {
      if (!controller.signal.aborted) {
        if (previewAuthorizationFailed(requestError)) onExternalBlocked()
        setError('ファイルを取得できませんでした。')
      }
    } finally { if (!controller.signal.aborted) setDownloading(false) }
  }

  useEffect(() => {
    if (!requestTarget.load) return
    const controller = new AbortController()
    let objectUrl = ''
    let timedOut = false
    let disposed = false
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); setError('ファイルをプレビューできませんでした。'); setLoading(false) }, 30000)
    void requestTarget.load(controller.signal).then(async blob => {
      const resolved = await resolvePreviewBlob(requestTarget, blob, controller.signal)
      if (!resolved || controller.signal.aborted || disposed) return
      objectUrl = URL.createObjectURL(resolved.blob)
      setLoaded({ kind: resolved.kind, url: objectUrl })
    }).catch(requestError => {
      if (!disposed && (!controller.signal.aborted || timedOut)) {
        if (previewAuthorizationFailed(requestError)) blockedRef.current()
        setError('ファイルをプレビューできませんでした。')
      }
    }).finally(() => {
      window.clearTimeout(timeout)
      if (!controller.signal.aborted && !disposed) setLoading(false)
    })
    return () => {
      disposed = true
      controller.abort()
      window.clearTimeout(timeout)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [requestTarget])

  useEffect(() => {
    if (!loaded || frameReady || error || (loaded.kind === 'pdf' && useCanvas)) return
    // Some embedded browsers advertise PDF support but never finish loading the
    // native frame. Render the already-authenticated bytes locally instead.
    const timeout = window.setTimeout(() => {
      if (loaded.kind === 'pdf') setUseCanvas(true)
      else setError('ファイルをプレビューできませんでした。')
    }, loaded.kind === 'pdf' ? 8000 : 20000)
    return () => window.clearTimeout(timeout)
  }, [loaded, frameReady, error, useCanvas])

  useEffect(() => {
    if (!useCanvas || loaded?.kind !== 'pdf') return
    let disposed = false
    void import('./PdfCanvasViewer').then(module => {
      if (!disposed) setCanvasRenderer(() => module.default)
    }).catch(() => { if (!disposed) setError('ファイルをプレビューできませんでした。') })
    return () => { disposed = true }
  }, [useCanvas, loaded?.kind])

  const busy = !error && (loading || !loaded || (loaded.kind === 'image' && !frameReady) || (loaded.kind === 'pdf' && useCanvas && !CanvasRenderer))
  const markReady = () => setFrameReady(true)
  const markFailed = () => setError('ファイルをプレビューできませんでした。')
  return <div className="dc-document-preview-body" aria-busy={busy}>
    {loaded?.kind === 'pdf' && !error && (useCanvas
      ? CanvasRenderer && <CanvasRenderer url={loaded.url} name={target.name} onError={markFailed}/>
      : <iframe className="is-ready" title={`${target.name} PDFプレビュー`} src={`${loaded.url}#page=1&view=Fit`} onLoad={markReady} onError={() => setUseCanvas(true)}/>)}
    {loaded?.kind === 'image' && !error && <img className={frameReady ? 'is-ready' : ''} src={loaded.url} alt={target.name} onLoad={markReady} onError={markFailed}/>}
    {busy && <div className="dc-document-preview-state" role="status"><LoaderCircle size={26} aria-hidden="true"/><strong>ファイルを読み込んでいます…</strong></div>}
    {error && <div className={`dc-document-preview-state ${target.kind === 'external' ? 'is-external' : 'is-error'}`} role={target.kind === 'external' ? 'status' : 'alert'}><FileText size={30} aria-hidden="true"/><strong>{target.kind === 'external' ? 'このファイルはアプリ内でプレビューできません。' : 'ファイルをプレビューできませんでした。'}</strong><p>{error}</p><div>{target.load && <button type="button" onClick={onRetry}><RefreshCw size={15}/>再試行</button>}{target.externalUrl && !externalBlocked && <a href={target.externalUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/>外部で開く</a>}{target.download && !externalBlocked && <button type="button" disabled={downloading} onClick={() => void download()}>{downloading ? '読込中…' : 'ダウンロード'}</button>}<button type="button" onClick={onClose}>閉じる</button></div></div>}
  </div>
}
