import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Camera, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { Button, ModalShell } from '../ui'

const OUTPUT_SIZE = 512
const MIN_ZOOM = 1
const MAX_ZOOM = 3

type Point = { x: number; y: number }
type ImageSize = { width: number; height: number }

interface AvatarCropDialogProps {
  file: File
  isSaving: boolean
  onCancel: () => void
  onSave: (avatar: Blob) => Promise<void>
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
}

export default function AvatarCropDialog({ file, isSaving, onCancel, onSave }: AvatarCropDialogProps) {
  const [imageUrl] = useState(() => URL.createObjectURL(file))
  const [imageSize, setImageSize] = useState<ImageSize | null>(null)
  const [viewportSize, setViewportSize] = useState(320)
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })
  const [cropError, setCropError] = useState('')
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const dragRef = useRef<{ pointerId: number; start: Point; origin: Point } | null>(null)
  const revokeTimerRef = useRef<number | null>(null)

  useEffect(() => {
    // React Strict Mode runs an immediate setup/cleanup/setup cycle in dev.
    // Defer revocation so the second setup can keep the same object URL alive.
    if (revokeTimerRef.current !== null) window.clearTimeout(revokeTimerRef.current)

    return () => {
      revokeTimerRef.current = window.setTimeout(() => URL.revokeObjectURL(imageUrl), 0)
    }
  }, [imageUrl])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width)
      if (width > 0) setViewportSize(width)
    })
    observer.observe(viewport)

    return () => observer.disconnect()
  }, [])

  const baseScale = imageSize
    ? Math.max(viewportSize / imageSize.width, viewportSize / imageSize.height)
    : 1
  const renderedWidth = imageSize ? imageSize.width * baseScale * zoom : viewportSize
  const renderedHeight = imageSize ? imageSize.height * baseScale * zoom : viewportSize

  const clampOffset = (next: Point, nextZoom = zoom): Point => {
    if (!imageSize) return { x: 0, y: 0 }
    const scale = baseScale * nextZoom
    const maxX = Math.max(0, (imageSize.width * scale - viewportSize) / 2)
    const maxY = Math.max(0, (imageSize.height * scale - viewportSize) / 2)

    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    }
  }

  const updateZoom = (nextZoom: number) => {
    const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom))
    setZoom(clampedZoom)
    setOffset((current) => clampOffset(current, clampedZoom))
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!imageSize || isSaving) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: offset,
    }
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setOffset(clampOffset({
      x: drag.origin.x + event.clientX - drag.start.x,
      y: drag.origin.y + event.clientY - drag.start.y,
    }))
  }

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  const handleCropKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const movements: Partial<Record<string, Point>> = {
      ArrowLeft: { x: -8, y: 0 },
      ArrowRight: { x: 8, y: 0 },
      ArrowUp: { x: 0, y: -8 },
      ArrowDown: { x: 0, y: 8 },
    }
    const movement = movements[event.key]
    if (!movement || isSaving) return
    event.preventDefault()
    setOffset((current) => clampOffset({
      x: current.x + movement.x,
      y: current.y + movement.y,
    }))
  }

  const handleSave = async () => {
    const image = imageRef.current
    if (!image || !imageSize || isSaving) return

    try {
      setCropError('')
      const canvas = document.createElement('canvas')
      canvas.width = OUTPUT_SIZE
      canvas.height = OUTPUT_SIZE
      const context = canvas.getContext('2d')
      if (!context) throw new Error('canvas-unavailable')

      const scale = baseScale * zoom
      const sourceSize = viewportSize / scale
      const sourceX = Math.min(
        imageSize.width - sourceSize,
        Math.max(0, (imageSize.width - sourceSize) / 2 - offset.x / scale),
      )
      const sourceY = Math.min(
        imageSize.height - sourceSize,
        Math.max(0, (imageSize.height - sourceSize) / 2 - offset.y / scale),
      )

      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        0,
        0,
        OUTPUT_SIZE,
        OUTPUT_SIZE,
      )

      const avatar = await canvasToBlob(canvas, 'image/webp', 0.9)
        ?? await canvasToBlob(canvas, 'image/jpeg', 0.92)
      if (!avatar) throw new Error('image-export-failed')

      await onSave(avatar)
    } catch (error) {
      setCropError(
        error instanceof Error && error.message
          ? error.message
          : '画像を処理できませんでした。別の画像を選択して再試行してください。',
      )
    }
  }

  const previewScale = 72 / viewportSize

  return (
    <ModalShell
      isOpen
      onClose={isSaving ? () => undefined : onCancel}
      title="プロフィール画像を調整"
      titleId="avatar-crop-dialog-title"
      description="円の中に表示したい範囲を合わせてください。"
      icon={<Camera size={18} aria-hidden="true" />}
      size="md"
      footer={(
        <>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isSaving}>
            キャンセル
          </Button>
          <Button type="button" variant="primary" onClick={() => void handleSave()} loading={isSaving} disabled={!imageSize}>
            更新する
          </Button>
        </>
      )}
    >
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_96px] sm:items-start">
        <div className="min-w-0">
          <div
            ref={viewportRef}
            role="application"
            tabIndex={0}
            aria-label="プロフィール画像の切り抜き位置。ドラッグまたは矢印キーで位置を調整できます。"
            onKeyDown={handleCropKeyDown}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            className="relative mx-auto aspect-square w-full max-w-80 touch-none select-none overflow-hidden rounded-lg bg-[var(--tm-bg)] outline-none ring-1 ring-[var(--tm-border)] focus-visible:ring-2 focus-visible:ring-[var(--tm-focus-ring)]"
          >
            <img
              ref={imageRef}
              src={imageUrl}
              alt="選択したプロフィール画像"
              draggable={false}
              onLoad={(event) => {
                setImageSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
                setOffset({ x: 0, y: 0 })
                setZoom(MIN_ZOOM)
              }}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
              style={{
                width: renderedWidth,
                height: renderedHeight,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/90 shadow-[0_0_0_999px_rgba(2,6,23,0.58)]"
            />
          </div>
          <p className="mt-2 text-center text-[11px] leading-5 text-[var(--tm-text-secondary)]">
            ドラッグまたは矢印キーで位置を調整できます。
          </p>
        </div>

        <aside className="flex items-center gap-3 sm:flex-col" aria-label="プロフィール画像プレビュー">
          <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-full bg-[var(--tm-bg)] ring-2 ring-[var(--tm-border)]">
            <img
              src={imageUrl}
              alt="プロフィール画像のプレビュー"
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
              style={{
                width: renderedWidth * previewScale,
                height: renderedHeight * previewScale,
                transform: `translate(calc(-50% + ${offset.x * previewScale}px), calc(-50% + ${offset.y * previewScale}px))`,
              }}
            />
          </div>
          <span className="text-[11px] font-medium text-[var(--tm-text-secondary)]">プレビュー</span>
        </aside>
      </div>

      <div className="mt-5 rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] p-3">
        <div className="flex items-center gap-3">
          <ZoomOut size={16} className="shrink-0 text-[var(--tm-text-muted)]" aria-hidden="true" />
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step="0.01"
            value={zoom}
            onChange={(event) => updateZoom(Number(event.target.value))}
            disabled={!imageSize || isSaving}
            aria-label="画像の拡大率"
            className="h-2 min-w-0 flex-1 cursor-pointer accent-[var(--tm-primary)] disabled:cursor-not-allowed"
          />
          <ZoomIn size={16} className="shrink-0 text-[var(--tm-text-muted)]" aria-hidden="true" />
          <span className="w-10 text-right text-[11px] tabular-nums text-[var(--tm-text-secondary)]">
            {Math.round(zoom * 100)}%
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            setZoom(MIN_ZOOM)
            setOffset({ x: 0, y: 0 })
          }}
          disabled={isSaving}
          className="mt-3 inline-flex min-h-8 items-center gap-1.5 text-xs font-medium text-[var(--tm-text-secondary)] hover:text-[var(--tm-text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RotateCcw size={14} aria-hidden="true" />
          リセット
        </button>
      </div>

      {cropError && <p role="alert" className="mt-3 text-xs text-[var(--tm-danger)]">{cropError}</p>}
      <p className="mt-3 text-[11px] leading-5 text-[var(--tm-text-muted)]">
        保存時に512×512pxへ最適化します。元の画像ファイルは保存されません。
      </p>
    </ModalShell>
  )
}
