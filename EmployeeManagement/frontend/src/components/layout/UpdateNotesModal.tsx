import { useEffect, useRef, useState, type ElementType } from 'react'
import { Bug, Check, CheckCircle2, LayoutDashboard, Sparkles, Wrench } from 'lucide-react'
import { lastSeenVersionStorageKey } from '../../config/app'
import { useAppRelease } from '../../contexts/AppReleaseContext'
import { formatReleaseName, releaseVersionTag } from '../../features/releases/releaseApi'
import Button from '../ui/Button'
import ModalShell from '../ui/ModalShell'
import './UpdateNotesModal.css'

type UpdateNotesModalProps = {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
}

type ReleaseSection = {
  title: string
  icon: ElementType
  items: Array<{ label: string; badge?: 'NEW' | '改善' }>
}

export default function UpdateNotesModal({ isOpen, onOpenChange }: UpdateNotesModalProps) {
  const { currentRelease } = useAppRelease()
  const releaseName = formatReleaseName(currentRelease)
  const releaseSections: ReleaseSection[] = [
    { title: 'UI・操作性', icon: LayoutDashboard, items: currentRelease.release_notes.ui.map(label => ({ label })) },
    { title: '新機能', icon: Sparkles, items: currentRelease.release_notes.new_features.map(label => ({ label, badge: 'NEW' })) },
    { title: '改善', icon: Wrench, items: currentRelease.release_notes.improvements.map(label => ({ label, badge: '改善' })) },
    { title: '不具合修正', icon: Bug, items: currentRelease.release_notes.bug_fixes.map(label => ({ label })) },
  ].filter(section => section.items.length > 0)
  const [isMounted, setIsMounted] = useState(isOpen)
  const [isClosing, setIsClosing] = useState(false)
  const closeTimer = useRef<number | null>(null)

  useEffect(() => {
    if (!isOpen) return
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    const openTimer = window.setTimeout(() => {
      setIsMounted(true)
      setIsClosing(false)
    }, 0)
    return () => window.clearTimeout(openTimer)
  }, [isOpen])

  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
  }, [])

  const close = () => {
    if (isClosing) return
    try {
      window.localStorage.setItem(lastSeenVersionStorageKey, releaseVersionTag(currentRelease))
    } catch {
      // The acknowledgement remains session-only when storage is unavailable.
    }
    setIsClosing(true)
    closeTimer.current = window.setTimeout(() => {
      setIsMounted(false)
      setIsClosing(false)
      onOpenChange(false)
    }, 200)
  }

  return (
    <ModalShell
      isOpen={isMounted}
      onClose={close}
      size="md"
      titleId="themis-update-title"
      title={
        <span className="tm-release-title-row">
          <span>アップデートのお知らせ</span>
          <span className="tm-release-version">{releaseName}</span>
        </span>
      }
      description={currentRelease.title}
      icon={<Sparkles className="h-[18px] w-[18px]" aria-hidden="true" />}
      className={`tm-release-modal${isClosing ? ' is-closing' : ''}`}
      overlayClassName={`tm-release-overlay${isClosing ? ' is-closing' : ''}`}
      backdropClassName="tm-release-backdrop"
      footer={
        <div className="tm-release-footer">
          <p>{releaseName}<span aria-hidden="true"> · </span>{currentRelease.environment}</p>
          <div>
            <Button variant="ghost" onClick={close}>後で見る</Button>
            <Button variant="primary" icon={<Check size={16} aria-hidden="true" />} onClick={close}>
              アップデートを確認しました
            </Button>
          </div>
        </div>
      }
    >
      <div className="tm-release-sections">
        {releaseSections.map(({ title, icon: Icon, items }) => (
          <section className="tm-release-section" key={title}>
            <header>
              <span className="tm-release-section-icon"><Icon size={16} aria-hidden="true" /></span>
              <h4>{title}</h4>
            </header>
            <ul>
              {items.map((item) => (
                <li key={item.label}>
                  <CheckCircle2 size={14} aria-hidden="true" />
                  <span>{item.label}</span>
                  {item.badge && <em>{item.badge}</em>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </ModalShell>
  )
}
