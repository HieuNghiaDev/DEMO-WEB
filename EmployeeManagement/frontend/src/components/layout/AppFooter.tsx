import { CircleHelp, FileText, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { appDisplayMetadata } from '../../config/app'
import { useAppRelease } from '../../contexts/AppReleaseContext'
import { formatReleaseName } from '../../features/releases/releaseApi'
import './AppFooter.css'

type AppFooterProps = {
  onOpenReleaseNotes: () => void
}

export default function AppFooter({ onOpenReleaseNotes }: AppFooterProps) {
  const { currentRelease, error } = useAppRelease()
  const releaseName = formatReleaseName(currentRelease)
  const releaseDate = currentRelease.released_at ?? currentRelease.build_date
  const parsedReleaseDate = releaseDate ? new Date(releaseDate) : null
  const dateLabel = parsedReleaseDate && !Number.isNaN(parsedReleaseDate.getTime())
    ? new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }).format(parsedReleaseDate)
    : '—'
  const [isVersionMounted, setIsVersionMounted] = useState(false)
  const [isVersionClosing, setIsVersionClosing] = useState(false)
  const versionAreaRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<number | null>(null)

  const closeVersionInfo = useCallback(() => {
    if (!isVersionMounted || isVersionClosing) return

    setIsVersionClosing(true)
    closeTimer.current = window.setTimeout(() => {
      setIsVersionMounted(false)
      setIsVersionClosing(false)
    }, 160)
  }, [isVersionClosing, isVersionMounted])

  const toggleVersionInfo = () => {
    if (isVersionMounted) {
      closeVersionInfo()
      return
    }

    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    setIsVersionMounted(true)
    setIsVersionClosing(false)
  }

  useEffect(() => {
    if (!isVersionMounted) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!versionAreaRef.current?.contains(event.target as Node)) closeVersionInfo()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeVersionInfo()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeVersionInfo, isVersionMounted])

  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
  }, [])

  const openReleaseNotes = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    setIsVersionMounted(false)
    setIsVersionClosing(false)
    onOpenReleaseNotes()
  }

  const utilityLabels = ['ヘルプ', 'プライバシー', '利用規約', 'お問い合わせ']

  return (
    <footer className="themis-global-footer">
      <div className="themis-footer-inner">
        <div className="themis-footer-brand">
          <img src={`${import.meta.env.BASE_URL}images/logoTHEMIS.png`} alt="" aria-hidden="true" />
          <div>
            <strong>THEMIS HQ</strong>
            <span>法で、人と組織の可能性をひらく。</span>
          </div>
        </div>

        <nav className="themis-footer-links" aria-label="フッターリンク">
          {utilityLabels.map((label) => (
            <button key={label} type="button" disabled aria-disabled="true" title="準備中">
              {label}
            </button>
          ))}
        </nav>

        <div className="themis-footer-system">
          <span className="themis-footer-status" role="status"><i />システム稼働中</span>
          <div className="themis-footer-version-area" ref={versionAreaRef}>
            <span className="themis-footer-version">{releaseName}</span>
            <button
              aria-controls="themis-version-popover"
              aria-expanded={isVersionMounted && !isVersionClosing}
              aria-haspopup="dialog"
              aria-label="バージョン情報"
              className="themis-footer-help"
              onClick={toggleVersionInfo}
              type="button"
            >
              <CircleHelp size={17} aria-hidden="true" />
            </button>

            {isVersionMounted && (
              <section
                aria-labelledby="themis-version-title"
                className={`themis-version-popover${isVersionClosing ? ' is-closing' : ''}`}
                id="themis-version-popover"
                role="dialog"
              >
                <header>
                  <h2 id="themis-version-title">バージョン情報</h2>
                  <button aria-label="閉じる" onClick={closeVersionInfo} type="button"><X size={16} /></button>
                </header>

                <dl className="themis-version-details">
                  <div><dt>現在のバージョン</dt><dd>{releaseName}</dd></div>
                  <div><dt>リリース日</dt><dd>{dateLabel}</dd></div>
                  <div><dt>環境</dt><dd>{currentRelease.environment}</dd></div>
                  <div><dt>最終更新</dt><dd>{dateLabel}</dd></div>
                </dl>

                {error && <p className="themis-version-error">{error}</p>}

                <div className="themis-display-guidance">
                  <span>推奨表示環境</span>
                  <strong>{appDisplayMetadata.recommendedResolution}</strong>
                  <p>ブラウザ表示倍率 {appDisplayMetadata.recommendedScale}</p>
                  <small>{appDisplayMetadata.minimumResolution}</small>
                </div>

                <button className="themis-release-link" onClick={openReleaseNotes} type="button">
                  <FileText size={16} aria-hidden="true" />
                  <span>リリースノートを見る</span>
                  <span aria-hidden="true">→</span>
                </button>
              </section>
            )}
          </div>
        </div>
      </div>
    </footer>
  )
}
