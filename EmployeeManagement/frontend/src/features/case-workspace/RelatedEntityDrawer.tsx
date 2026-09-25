import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Building2, Users, User, Shield, ShieldCheck,
  Phone, Mail, MapPin, Briefcase, FileText,
  Clock, Pencil
} from 'lucide-react'
import type { RelatedEntity, EntityBadgeTone } from './types'
import { useDrawerBodyScrollLock } from './useDrawerBodyScrollLock'

type Props = {
  entity: RelatedEntity | null
  isOpen: boolean
  onClose: () => void
  onEdit?: (entity: RelatedEntity) => void
  lastUpdated?: string | null
}

function formatDisplayDate(dateStr?: string | null): string | null {
  if (!dateStr) return null
  try {
    const isoPrefixMatch = dateStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
    if (isoPrefixMatch) {
      const [, y, m, d] = isoPrefixMatch
      return `${y}/${m.padStart(2, '0')}/${d.padStart(2, '0')}`
    }
    const d = new Date(dateStr)
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${year}/${month}/${day}`
    }
    return dateStr
  } catch {
    return dateStr
  }
}

function formatPeriod(startDate?: string | null, endDate?: string | null, isCurrent?: boolean): string {
  const start = formatDisplayDate(startDate)
  const end = formatDisplayDate(endDate)

  if (start && (isCurrent || !end)) {
    return `${start} ～ ${isCurrent ? '現在継続中' : ''}`.trim()
  }
  if (start && end) {
    return `${start} ～ ${end}`
  }
  if (isCurrent) {
    return '現在継続中'
  }
  if (end) {
    return `～ ${end}`
  }
  return '未登録'
}

function formatLastUpdated(val?: string | null): string {
  if (!val) return '未登録'
  try {
    const d = new Date(val)
    if (isNaN(d.getTime())) return String(val)
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch {
    return String(val)
  }
}

function DetailRow({ icon, label, value, strong = false }: { icon: ReactNode; label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="cm-ws-drawer-info-row">
      <div className="cm-ws-drawer-info-label-group">
        <div className="cm-ws-drawer-row-iconbox">{icon}</div>
        <span className="cm-ws-drawer-row-label">{label}</span>
      </div>
      <span className={`cm-ws-drawer-row-value${strong ? ' is-strong' : ''}`}>{value || '未登録'}</span>
    </div>
  )
}

export default function RelatedEntityDrawer({ entity, isOpen, onClose, onEdit, lastUpdated }: Props) {
  const [isRendered, setIsRendered] = useState(isOpen && !!entity)
  const [isClosing, setIsClosing] = useState(false)
  const [displayedEntity, setDisplayedEntity] = useState(entity)

  useEffect(() => {
    if (isOpen && entity) {
      setDisplayedEntity(entity)
      setIsRendered(true)
      setIsClosing(false)
    } else if (!isOpen && isRendered) {
      setIsClosing(true)
      const timer = setTimeout(() => {
        setIsRendered(false)
        setIsClosing(false)
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [isOpen, entity, isRendered])

  useDrawerBodyScrollLock(isRendered, onClose)

  if (!isRendered || !displayedEntity) return null

  const getEntityIcon = () => {
    switch (displayedEntity.kind) {
      case 'person':
        return <User size={24} />
      case 'organization':
        return <Users size={24} />
      case 'insurer':
        return <ShieldCheck size={24} />
      case 'police':
        return <Shield size={24} />
      default:
        return <Building2 size={24} />
    }
  }

  const getEntityKindTitle = () => {
    switch (displayedEntity.kind) {
      case 'person':
        return '関係者情報'
      case 'organization':
        return '組織情報'
      case 'insurer':
        return '保険会社情報'
      case 'police':
        return '警察署情報'
      case 'other':
        return '関係先情報'
      default:
        return '会社情報'
    }
  }

  const getBadgeClass = (tone?: EntityBadgeTone) => {
    switch (tone) {
      case 'emerald':
        return 'cm-ws-drawer-badge--emerald'
      case 'blue':
        return 'cm-ws-drawer-badge--blue'
      case 'violet':
        return 'cm-ws-drawer-badge--violet'
      case 'cyan':
        return 'cm-ws-drawer-badge--cyan'
      case 'amber':
        return 'cm-ws-drawer-badge--amber'
      case 'red':
        return 'cm-ws-drawer-badge--red'
      case 'slate':
        return 'cm-ws-drawer-badge--slate'
      default:
        return 'cm-ws-drawer-badge--emerald'
    }
  }

  const badgeLabel = displayedEntity.statusBadgeLabel || '未登録'
  const badgeTone = displayedEntity.statusBadgeTone || (badgeLabel.includes('過去') ? 'slate' : 'emerald')
  const isEmployment = ['current_employer', 'former_employer', 'dispatch_company', 'dispatch_destination'].includes(displayedEntity.relationType)
  const isInsurance = displayedEntity.kind === 'insurer'
  const isPolice = displayedEntity.kind === 'police'
  const isOpponentCompany = displayedEntity.relationType === 'opponent_company'
  const isOther = displayedEntity.relationType === 'other' && !isInsurance && !isPolice
  const employmentStatus = displayedEntity.isCurrent === true || displayedEntity.relationType === 'current_employer'
    ? '現在'
    : displayedEntity.isCurrent === false || displayedEntity.relationType === 'former_employer' ? '過去' : '未登録'
  const insuranceSide = ({
    own: '本人側',
    opponent: '相手方',
    other: 'その他',
  } as const)[displayedEntity.insuranceSide ?? (displayedEntity.relationType === 'opponent_insurer' ? 'opponent' : 'own')]
  const nameLabel = isInsurance ? '保険会社名' : isPolice ? '警察署名' : isOther ? '名称' : '会社名'

  const drawerElement = (
    <>
      <div
        className={`cm-ws-drawer-backdrop ${isClosing ? 'is-closing' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`cm-ws-drawer ${isClosing ? 'is-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={`${displayedEntity.name} の詳細`}
      >
        {/* Header */}
        <header className="cm-ws-drawer-header">
          <div className="cm-ws-drawer-header-left">
            <div className="cm-ws-drawer-company-icon">
              {getEntityIcon()}
            </div>
            <div className="cm-ws-drawer-header-meta">
              <div className="cm-ws-drawer-header-badge-row">
                <span className="cm-ws-drawer-kind-label">{getEntityKindTitle()}</span>
                <span className={`cm-ws-drawer-badge ${getBadgeClass(badgeTone)}`}>
                  <span className="cm-ws-drawer-badge-dot" />
                  {badgeLabel}
                </span>
              </div>
              <h2 className="cm-ws-drawer-title">{displayedEntity.name}</h2>
            </div>
          </div>
          <button
            type="button"
            className="cm-ws-drawer-close-btn-top"
            onClick={onClose}
            aria-label="閉じる"
          >
            <X size={20} />
          </button>
        </header>

        {/* Body Content */}
        <div className="cm-ws-drawer-body">
          {/* Main Information Card */}
          <div className="cm-ws-drawer-info-card">
            <DetailRow icon={<Building2 size={17} />} label={nameLabel} value={displayedEntity.name} strong />
            <DetailRow icon={<MapPin size={17} />} label="住所・所在地" value={displayedEntity.address || '未登録'} />
            <DetailRow
              icon={<Phone size={17} />}
              label="電話番号"
              value={displayedEntity.phone
                ? <a href={`tel:${displayedEntity.phone}`} className="cm-ws-drawer-link">{displayedEntity.phone}</a>
                : '未登録'}
            />

            {!isPolice && (
              <DetailRow
                icon={<Mail size={17} />}
                label="メール"
                value={displayedEntity.email
                  ? <a href={`mailto:${displayedEntity.email}`} className="cm-ws-drawer-link">{displayedEntity.email}</a>
                  : '未登録'}
              />
            )}

            {isEmployment && (
              <>
                <DetailRow icon={<Briefcase size={17} />} label="状態" value={employmentStatus} />
                <DetailRow
                  icon={<Clock size={17} />}
                  label={displayedEntity.relationType === 'dispatch_destination' ? '派遣期間' : displayedEntity.relationType === 'dispatch_company' ? '契約・在籍期間' : '在籍期間'}
                  value={formatPeriod(displayedEntity.startDate, displayedEntity.endDate, displayedEntity.isCurrent)}
                />
              </>
            )}

            {isInsurance && (
              <>
                <DetailRow icon={<ShieldCheck size={17} />} label="保険の立場" value={insuranceSide} />
                <DetailRow icon={<User size={17} />} label="担当者" value={displayedEntity.contactPerson || '未登録'} />
                <DetailRow icon={<FileText size={17} />} label="証券番号" value={displayedEntity.policyNumber || '未登録'} />
                <DetailRow icon={<FileText size={17} />} label="受付番号" value={displayedEntity.claimNumber || displayedEntity.referenceNumber || '未登録'} />
              </>
            )}

            {isPolice && (
              <>
                <DetailRow icon={<Users size={17} />} label="担当部署" value={displayedEntity.department || '未登録'} />
                <DetailRow icon={<User size={17} />} label="担当者" value={displayedEntity.contactPerson || '未登録'} />
                <DetailRow icon={<FileText size={17} />} label="受付番号・事件番号" value={displayedEntity.referenceNumber || '未登録'} />
              </>
            )}

            {isOpponentCompany && (
              <>
                <DetailRow icon={<User size={17} />} label="担当者" value={displayedEntity.contactPerson || '未登録'} />
                <DetailRow icon={<User size={17} />} label="運転者名" value={displayedEntity.driverName || '未登録'} />
                <DetailRow icon={<Briefcase size={17} />} label="車両情報" value={displayedEntity.vehicleInfo || '未登録'} />
                <DetailRow icon={<FileText size={17} />} label="車両番号" value={displayedEntity.vehicleNumber || '未登録'} />
                <DetailRow icon={<Users size={17} />} label="事故との関係" value={displayedEntity.accidentRelationship || '未登録'} />
              </>
            )}

            {isOther && (
              <>
                <DetailRow icon={<Users size={17} />} label="関係" value={displayedEntity.relationshipDetail || '未登録'} />
                <DetailRow icon={<User size={17} />} label="担当者" value={displayedEntity.contactPerson || '未登録'} />
              </>
            )}

            {isEmployment && displayedEntity.industry && (
              <DetailRow icon={<Briefcase size={17} />} label="業種" value={displayedEntity.industry} />
            )}
            {isEmployment && displayedEntity.employeeCount && (
              <DetailRow icon={<Users size={17} />} label="従業員数" value={displayedEntity.employeeCount} />
            )}
          </div>

          {/* Notes / 備考 Card */}
          <div className="cm-ws-drawer-notes-card">
            <div className="cm-ws-drawer-notes-header">
              <FileText size={15} className="cm-ws-drawer-notes-icon" />
              <span className="cm-ws-drawer-notes-title">備考</span>
            </div>
            <p className="cm-ws-drawer-notes-body">
              {displayedEntity.notes || '未登録'}
            </p>
            <FileText size={52} className="cm-ws-drawer-notes-watermark" aria-hidden="true" />
          </div>
        </div>

        {/* Footer */}
        <footer className="cm-ws-drawer-footer">
          <div className="cm-ws-drawer-footer-updated">
            <span className="cm-ws-drawer-footer-updated-label">最終更新</span>
            <time className="cm-ws-drawer-footer-updated-time">{formatLastUpdated(lastUpdated)}</time>
          </div>
          <div className="cm-ws-drawer-footer-actions">
            {onEdit && (
              <button
                type="button"
                className="cm-ws-drawer-edit-btn"
                onClick={() => onEdit(displayedEntity)}
              >
                <Pencil size={14} />
                <span>編集</span>
              </button>
            )}
            <button
              type="button"
              className="cm-ws-drawer-close-btn"
              onClick={onClose}
            >
              閉じる
            </button>
          </div>
        </footer>
      </aside>
    </>
  )

  if (typeof document !== 'undefined') {
    return createPortal(drawerElement, document.body)
  }

  return drawerElement
}
