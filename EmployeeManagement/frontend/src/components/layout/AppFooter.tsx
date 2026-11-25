import { ArrowUpRight, CheckCircle2, ChevronUp, FileText, History, Settings, Shield, Tag, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { appDisplayMetadata } from '../../config/app'
import { useAppRelease } from '../../contexts/AppReleaseContext'
import { formatReleaseName } from '../../features/releases/releaseApi'
import './AppFooter.css'

type AppFooterProps = {
  onOpenReleaseNotes: () => void
}

export default function AppFooter({ onOpenReleaseNotes }: AppFooterProps) {
  const { currentRelease } = useAppRelease()
  const releaseName = formatReleaseName(currentRelease)
  const releaseDate = currentRelease.released_at ?? currentRelease.build_date
  const parsedReleaseDate = releaseDate ? new Date(releaseDate) : null
  const dateLabel =
    parsedReleaseDate && !Number.isNaN(parsedReleaseDate.getTime())
      ? new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }).format(parsedReleaseDate)
      : '—'
  const currentYear = new Date().getFullYear()
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
    }, 150)
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

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    },
    [],
  )

  const openReleaseNotes = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    setIsVersionMounted(false)
    setIsVersionClosing(false)
    onOpenReleaseNotes()
  }

  return (
    <footer className="tm-footer" aria-label="サイトフッター">
      <div className="tm-footer-inner">
        {/* Left: Brand identity & operational status */}
        <div className="tm-footer-left">
          <div className="tm-footer-brand">
            <span className="tm-footer-crest" aria-hidden="true">
              <img src={`${import.meta.env.BASE_URL}images/logoTHEMIS.png`} alt="" />
            </span>
            <strong className="tm-footer-name">THEMIS HQ</strong>
            <span className="tm-footer-sep" aria-hidden="true">/</span>
            <span className="tm-footer-tagline">合同法律事務所オペレーション基盤</span>
          </div>

          <div className="tm-footer-meta">
            <span className="tm-footer-live" role="status">
              <span className="tm-footer-live-dot" aria-hidden="true" />
              稼働中
            </span>

            <div className="tm-footer-version-wrap" ref={versionAreaRef}>
              <button
                type="button"
                className="tm-footer-version-trigger"
                aria-controls="themis-version-popover"
                aria-expanded={isVersionMounted && !isVersionClosing}
                aria-haspopup="dialog"
                aria-label={`バージョン情報 ${releaseName}`}
                onClick={toggleVersionInfo}
              >
                <Tag size={11} aria-hidden="true" className="tm-footer-version-icon" />
                <span>{releaseName}</span>
                <ChevronUp
                  size={12}
                  aria-hidden="true"
                  className={`tm-footer-version-chevron${isVersionMounted && !isVersionClosing ? ' is-open' : ''}`}
                />
              </button>

              {isVersionMounted && (
                <section
                  id="themis-version-popover"
                  role="dialog"
                  aria-labelledby="themis-version-title"
                  className={`tm-footer-popover${isVersionClosing ? ' is-closing' : ''}`}
                >
                  <header className="tm-footer-popover-head">
                    <div className="tm-footer-popover-brand">
                      <span className="tm-footer-crest" aria-hidden="true">
                        <img src={`${import.meta.env.BASE_URL}images/logoTHEMIS.png`} alt="" />
                      </span>
                      <div>
                        <h2 id="themis-version-title">THEMIS HQ</h2>
                        <span className="tm-footer-popover-ver">{releaseName}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="tm-footer-popover-close"
                      aria-label="閉じる"
                      onClick={closeVersionInfo}
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </header>

                  <dl className="tm-footer-popover-grid">
                    <div>
                      <dt>バージョン</dt>
                      <dd className="font-mono">{releaseName}</dd>
                    </div>
                    <div>
                      <dt>リリース日</dt>
                      <dd>{dateLabel}</dd>
                    </div>
                    <div>
                      <dt>ステータス</dt>
                      <dd className="tm-footer-popover-ok">
                        <CheckCircle2 size={12} aria-hidden="true" />
                        正常稼働
                      </dd>
                    </div>
                    <div>
                      <dt>推奨環境</dt>
                      <dd>{appDisplayMetadata.recommendedScale} · Full HD</dd>
                    </div>
                  </dl>

                  <button
                    type="button"
                    className="tm-footer-popover-action"
                    onClick={openReleaseNotes}
                  >
                    <History size={14} aria-hidden="true" />
                    <span>更新履歴・リリースノート</span>
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </button>
                </section>
              )}
            </div>
          </div>
        </div>

        {/* Right: Clean working utility links + copyright */}
        <div className="tm-footer-right">
          <nav className="tm-footer-nav" aria-label="フッターメニュー">
            <button type="button" onClick={openReleaseNotes} className="tm-footer-link">
              <History size={12} aria-hidden="true" />
              <span>更新履歴</span>
            </button>
            <Link to="/system?section=privacy" className="tm-footer-link">
              <Shield size={12} aria-hidden="true" />
              <span>プライバシー</span>
            </Link>
            <a
              href={`${import.meta.env.BASE_URL}terms.html`}
              target="_blank"
              rel="noreferrer"
              className="tm-footer-link"
            >
              <FileText size={12} aria-hidden="true" />
              <span>利用規約</span>
            </a>
            <Link to="/system" className="tm-footer-link">
              <Settings size={12} aria-hidden="true" />
              <span>設定</span>
            </Link>
          </nav>

          <span className="tm-footer-copy" aria-label={`Copyright ${currentYear} THEMIS HQ`}>
            © {currentYear} THEMIS
          </span>
        </div>
      </div>
    </footer>
  )
}
