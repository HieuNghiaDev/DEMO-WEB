import { useEffect, useRef, useState, type ElementType } from 'react'
import { Bot, BriefcaseBusiness, Check, CheckCircle2, LayoutDashboard, Sparkles, Wrench } from 'lucide-react'
import { appBuildLabel, appReleaseName, appVersionTag, lastSeenVersionStorageKey } from '../../config/app'
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

const releaseSections: ReleaseSection[] = [
  {
    title: 'UI・操作性',
    icon: LayoutDashboard,
    items: [
      { label: '案件詳細画面のUIを改善' },
      { label: '関係先・関係者カードを見やすく整理' },
      { label: 'Quick View のデザインと操作性を改善' },
      { label: 'モバイル表示・レスポンシブ対応を強化' },
      { label: 'ダークモードの表示品質を改善' },
    ],
  },
  {
    title: '案件・関係者管理',
    icon: BriefcaseBusiness,
    items: [
      { label: '交通事故案件の関係先管理を強化' },
      { label: '本人側保険会社 / 相手方保険会社を識別可能に', badge: 'NEW' },
      { label: '相手方企業（加害者側会社）に対応', badge: 'NEW' },
      { label: '勤務先・保険会社・警察署などの関係種別表示を改善' },
    ],
  },
  {
    title: 'THEMIS AI',
    icon: Bot,
    items: [
      { label: 'AIクイックアシストのUIを刷新', badge: '改善' },
      { label: 'ログインユーザー名を使ったパーソナルな挨拶に対応' },
      { label: 'クイックアクションと入力UIを改善' },
      { label: 'チャットパネルの開閉アニメーションを改善' },
    ],
  },
  {
    title: 'その他',
    icon: Wrench,
    items: [
      { label: '各種UIの細かな表示・操作性を改善' },
      { label: 'レスポンシブ表示とダークモードの調整' },
      { label: '軽微な不具合を修正' },
    ],
  },
]

export default function UpdateNotesModal({ isOpen, onOpenChange }: UpdateNotesModalProps) {
  const [isMounted, setIsMounted] = useState(isOpen)
  const [isClosing, setIsClosing] = useState(false)
  const closeTimer = useRef<number | null>(null)

  useEffect(() => {
    if (isOpen) {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
      setIsMounted(true)
      setIsClosing(false)
    }
  }, [isOpen])

  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
  }, [])

  const close = () => {
    if (isClosing) return
    try {
      window.localStorage.setItem(lastSeenVersionStorageKey, appVersionTag)
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
          <span className="tm-release-version">{appReleaseName}</span>
        </span>
      }
      description="THEMIS がさらに使いやすくなりました。"
      icon={<Sparkles className="h-[18px] w-[18px]" aria-hidden="true" />}
      className={`tm-release-modal${isClosing ? ' is-closing' : ''}`}
      overlayClassName={`tm-release-overlay${isClosing ? ' is-closing' : ''}`}
      backdropClassName="tm-release-backdrop"
      footer={
        <div className="tm-release-footer">
          <p>{appReleaseName}<span aria-hidden="true"> · </span>{appBuildLabel}</p>
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
