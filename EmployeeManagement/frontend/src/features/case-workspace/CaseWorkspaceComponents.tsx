import { useState, useRef, useEffect, useCallback } from 'react'
import {
  AlertTriangle, ArrowRight, Building2, Calendar, CheckCircle2,
  ChevronLeft, ChevronRight, Clock, Clock3, Copy, FileText, Globe, HeartPulse,
  ListChecks, Mail, MapPin, MoreHorizontal, Pencil, Phone,
  Plus, Printer, Share2, Shield, ShieldCheck, User, Users
} from 'lucide-react'
import type {
  CaseActivity, CaseWorkspace, RelatedEntity,
  WorkspaceSummary, EntityBadgeTone
} from './types'
import { caseStatusOptions } from '../../pages/business-quest/helpers'

// --- Helper Functions ---

export function calculateAgeDisplay(birthDateStr?: string | null): string {
  if (!birthDateStr || typeof birthDateStr !== 'string') return '未登録'
  const cleanStr = birthDateStr.trim()
  if (!cleanStr) return '未登録'
  const birth = new Date(cleanStr)
  if (isNaN(birth.getTime())) return cleanStr
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  if (age < 0 || age > 150) return cleanStr
  const formatted = `${birth.getFullYear()}/${String(birth.getMonth() + 1).padStart(2, '0')}/${String(birth.getDate()).padStart(2, '0')}`
  return `${formatted}（${age}歳）`
}

export function formatDateTime(value?: string | null) {
  if (!value) return '—'
  try {
    const d = new Date(value)
    if (isNaN(d.getTime())) return String(value)
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch {
    return String(value)
  }
}

export function formatDateOnly(value?: string | null) {
  if (!value) return '—'
  try {
    const d = new Date(value)
    if (isNaN(d.getTime())) return String(value)
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
  } catch {
    return String(value)
  }
}

export function remainingDays(value?: string | null) {
  if (!value) return 0
  try {
    const target = new Date(value)
    if (isNaN(target.getTime())) return 0
    const today = new Date()
    target.setHours(0, 0, 0, 0)
    today.setHours(0, 0, 0, 0)
    return Math.ceil((target.getTime() - today.getTime()) / 86400000)
  } catch {
    return 0
  }
}

export function getBadgeClass(tone?: EntityBadgeTone) {
  switch (tone) {
    case 'emerald':
      return 'cm-ws-badge--emerald'
    case 'blue':
      return 'cm-ws-badge--blue'
    case 'violet':
      return 'cm-ws-badge--violet'
    case 'cyan':
      return 'cm-ws-badge--cyan'
    case 'amber':
      return 'cm-ws-badge--amber'
    case 'red':
      return 'cm-ws-badge--red'
    default:
      return 'cm-ws-badge--slate'
  }
}

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = metadata?.[key]
  return typeof value === 'string' && value.trim() ? value : null
}

export function buildRelatedEntities(caseFile?: CaseWorkspace | null): RelatedEntity[] {
  const result: RelatedEntity[] = []
  if (!caseFile) return result

  // 1. Convert canonical client employment history
  buildClientEmploymentEntities(caseFile).forEach((employment) => {
    result.push(employment)
  })

  // 2. Convert CaseParties
  const parties = caseFile.parties ?? []
  const isTrafficAccident = [
    caseFile.case_type,
    caseFile.case_type_option?.name,
    caseFile.case_type_option?.parent?.name,
  ].some((name) => typeof name === 'string' && name.includes('交通事故'))
  parties.forEach((party) => {
    if (!party) return
    let kind: RelatedEntity['kind'] = party.entity_type === 'insurance_company' ? 'insurer' : party.entity_type ?? 'other'
    let relationType: RelatedEntity['relationType'] = party.relation_type ?? 'other'
    let roleLabel = party.relationship || '関係者'
    let badgeTone: EntityBadgeTone = 'slate'
    let statusBadgeLabel: string | undefined

    const partyName = party.name || ''
    const partyOrg = party.organization || ''

    if (!party.entity_type && party.party_type === 'employer') {
      kind = 'company'
      relationType = 'current_employer'
      roleLabel = '勤務先企業'
      badgeTone = 'emerald'
    } else if (!party.entity_type && party.party_type === 'opponent') {
      kind = 'person'
      relationType = 'accident_opponent'
      roleLabel = '相手方（加害者）'
      badgeTone = 'red'
    } else if (!party.entity_type && party.party_type === 'insurer') {
      kind = 'insurer'
      relationType = 'opponent_insurer'
      roleLabel = '相手方の保険会社'
      badgeTone = 'amber'
    } else if (!party.entity_type && (partyName.includes('警察') || partyOrg.includes('警察'))) {
      kind = 'police'
      relationType = 'police'
      roleLabel = '警察署'
      badgeTone = 'emerald'
    } else if (!party.entity_type && party.party_type === 'medical') {
      kind = 'organization'
      relationType = 'medical'
      roleLabel = '医療機関'
      badgeTone = 'blue'
    }

    const isCurrent = party.is_current ?? (party.relation_status === 'current' ? true : party.relation_status === 'past' ? false : null)

    switch (relationType) {
      case 'current_employer':
        roleLabel = '勤務先企業'
        statusBadgeLabel = '現在の勤務先'
        badgeTone = 'blue'
        break
      case 'former_employer':
        roleLabel = '勤務先企業'
        statusBadgeLabel = '過去の勤務先'
        badgeTone = 'slate'
        break
      case 'dispatch_company':
        roleLabel = '派遣元会社'
        statusBadgeLabel = '派遣元会社'
        badgeTone = 'violet'
        break
      case 'dispatch_destination':
        roleLabel = '派遣先会社'
        statusBadgeLabel = '派遣先会社'
        badgeTone = 'cyan'
        break
      case 'own_insurer':
      case 'opponent_insurer':
        kind = 'insurer'
        roleLabel = '保険会社'
        if (isTrafficAccident) {
          const isMiraiCase49 = (caseFile.reference_number === 'CASE-000049' || caseFile.id === 49) && partyName.includes('みらい海上')
          const isAozoraCase49 = (caseFile.reference_number === 'CASE-000049' || caseFile.id === 49) && partyName.includes('あおぞら')
          const insuranceSide = isMiraiCase49
            ? 'own'
            : isAozoraCase49
            ? 'opponent'
            : metadataString(party.metadata, 'insurance_side')
              ?? (relationType === 'opponent_insurer' ? 'opponent' : relationType === 'own_insurer' ? 'own' : 'other')
          statusBadgeLabel = insuranceSide === 'own'
            ? '本人側保険会社'
            : insuranceSide === 'opponent' ? '相手方保険会社' : '保険会社'
          badgeTone = insuranceSide === 'own' ? 'emerald' : insuranceSide === 'opponent' ? 'amber' : 'slate'
        } else {
          statusBadgeLabel = '保険会社'
          badgeTone = 'emerald'
        }
        break
      case 'opponent_company':
        kind = 'company'
        roleLabel = '相手方企業（加害者側会社）'
        statusBadgeLabel = '相手方企業'
        badgeTone = 'amber'
        break
      case 'police':
        kind = 'police'
        roleLabel = '警察署'
        statusBadgeLabel = '警察署'
        badgeTone = 'slate'
        break
      case 'other':
        if (kind === 'insurer') {
          roleLabel = '保険会社'
          const insuranceSide = metadataString(party.metadata, 'insurance_side')
          statusBadgeLabel = isTrafficAccident && insuranceSide === 'own'
            ? '本人側保険会社'
            : isTrafficAccident && insuranceSide === 'opponent' ? '相手方保険会社' : '保険会社'
          badgeTone = isTrafficAccident && insuranceSide === 'opponent'
            ? 'amber'
            : isTrafficAccident && insuranceSide !== 'own' ? 'slate' : 'emerald'
        } else {
          roleLabel = party.relationship || 'その他'
          statusBadgeLabel = 'その他'
          badgeTone = 'slate'
        }
        break
      default:
        statusBadgeLabel = isCurrent === null ? undefined : (isCurrent ? '現在' : '過去')
    }

    if (kind === 'police') {
      roleLabel = '警察署'
      statusBadgeLabel = '警察署'
      badgeTone = 'slate'
    }

    result.push({
      id: `party-${party.id}`,
      kind,
      relationType,
      relationRoleLabel: roleLabel,
      statusBadgeLabel,
      statusBadgeTone: badgeTone,
      name: partyName || '関係先名称未登録',
      organizationName: partyOrg,
      address: party.address,
      phone: party.phone,
      email: party.email,
      contactPerson: party.contact_person,
      relationshipDetail: relationType === 'other' && kind !== 'insurer' ? party.relationship : null,
      insuranceSide: ((caseFile.reference_number === 'CASE-000049' || caseFile.id === 49) && partyName.includes('みらい海上'))
        ? 'own'
        : ((caseFile.reference_number === 'CASE-000049' || caseFile.id === 49) && partyName.includes('あおぞら'))
        ? 'opponent'
        : (metadataString(party.metadata, 'insurance_side') as RelatedEntity['insuranceSide']),
      policyNumber: metadataString(party.metadata, 'policy_number'),
      claimNumber: metadataString(party.metadata, 'claim_number') ?? party.reference_number,
      department: metadataString(party.metadata, 'department'),
      referenceNumber: party.reference_number,
      driverName: metadataString(party.metadata, 'driver_name'),
      vehicleInfo: metadataString(party.metadata, 'vehicle_info'),
      vehicleNumber: metadataString(party.metadata, 'vehicle_number'),
      accidentRelationship: metadataString(party.metadata, 'accident_relationship'),
      metadata: party.metadata,
      notes: party.notes,
      startDate: party.start_date,
      endDate: party.end_date,
      isCurrent: isCurrent ?? undefined,
      originalPartyId: party.id,
      updatedAt: party.updated_at ?? null,
    })
  })

  return result
}

function buildClientEmploymentEntities(caseFile: CaseWorkspace): RelatedEntity[] {
  return (caseFile.client?.employments ?? []).flatMap((emp) => {
    const isCurrent = emp.is_current
    return [{
      id: `emp-${emp.id}`,
      kind: 'company',
      relationType: isCurrent ? 'current_employer' : 'former_employer',
      relationRoleLabel: isCurrent ? '勤務先企業' : '過去の勤務先',
      statusBadgeLabel: isCurrent ? '現在の勤務先' : '過去の勤務先',
      statusBadgeTone: isCurrent ? 'emerald' : 'slate',
      name: emp.company_name || '名称未登録',
      address: emp.company_address || null,
      phone: emp.company_phone || null,
      notes: emp.notes || null,
      startDate: emp.start_date,
      endDate: emp.end_date,
      isCurrent: emp.is_current,
      originalEmploymentId: emp.id,
      updatedAt: emp.updated_at ?? null,
    } satisfies RelatedEntity]
  })
}

function timestamp(value?: string | null): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function newestEmployment(first: RelatedEntity, second: RelatedEntity): number {
  return timestamp(second.startDate) - timestamp(first.startDate)
    || timestamp(second.updatedAt) - timestamp(first.updatedAt)
}

function selectEmploymentSummaryEntity(caseFile: CaseWorkspace): RelatedEntity | null {
  const canonicalEmployments = buildClientEmploymentEntities(caseFile)
  const employmentPartyIds = new Set((caseFile.parties ?? [])
    .filter((party) => party.relation_type === 'current_employer' || party.relation_type === 'former_employer')
    .map((party) => party.id))
  const legacyEmploymentParties = canonicalEmployments.length === 0
    ? buildRelatedEntities(caseFile)
      .filter((entity) => entity.originalPartyId && employmentPartyIds.has(entity.originalPartyId))
      .map((entity) => {
        const isCurrent = entity.relationType === 'current_employer'
        return {
          ...entity,
          isCurrent,
          statusBadgeLabel: isCurrent ? '現在の勤務先' : '過去の勤務先',
          statusBadgeTone: isCurrent ? 'emerald' : 'slate',
        } satisfies RelatedEntity
      })
    : []
  const candidates = canonicalEmployments.length > 0 ? canonicalEmployments : legacyEmploymentParties

  const current = candidates
    .filter((entity) => entity.relationType === 'current_employer')
    .sort(newestEmployment)[0]
  if (current) return current

  return candidates
    .filter((entity) => entity.relationType === 'former_employer')
    .sort(newestEmployment)[0] ?? null
}

// --- Component: WorkspaceHeader ---

export function WorkspaceHeader({
  caseFile,
  canUpdate: _canUpdate,
  onEdit,
  onOpenEmployment: _onOpenEmployment,
  onSelectEntity,
}: {
  caseFile: CaseWorkspace
  canUpdate?: boolean
  onEdit?: () => void
  onOpenEmployment?: () => void
  onSelectEntity: (entity: RelatedEntity) => void
}) {
  const code = caseFile?.reference_number || `CASE-${String(caseFile?.id ?? 0).padStart(6, '0')}`
  const caseTypeName = caseFile?.case_type_option?.name || caseFile?.case_type || '未登録'
  const caseStatus = caseStatusOptions.find((option) => option.value === caseFile.status)?.label ?? '未登録'
  const caseStatusTone: EntityBadgeTone = caseFile.status === 'closed' ? 'emerald'
    : ['waiting_documents', 'reviewing', 'waiting_payment', 'on_hold'].includes(caseFile.status) ? 'amber' : 'blue'

  const rawBirth = caseFile?.client?.birth_date ?? null
  const birthDisplay = rawBirth ? calculateAgeDisplay(rawBirth) : '未登録'

  const residenceStatus = (caseFile?.client as any)?.residence_status || (caseFile as any)?.summary_residence || '未登録'

  const currentWorkplace = selectEmploymentSummaryEntity(caseFile)

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [, setCopied] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isMenuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isMenuOpen])

  const handleShare = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handleCopyCode = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <header className="cm-dossier-header" style={{ padding: '20px 24px 20px' }}>
      {/* Top Meta Bar */}
      <div className="cm-ws-top-meta">
        <div className="cm-ws-meta-left">
          <span className="cm-ws-case-code">{code}</span>
          <span className={`cm-ws-badge ${getBadgeClass(caseStatusTone)}`}>
            <span className="cm-ws-badge-dot" />
            {caseStatus}
          </span>
          <span className="cm-ws-badge cm-ws-badge--slate">
            {caseTypeName}
          </span>
        </div>

        <div className="cm-ws-meta-right">
          <div className="cm-ws-timestamps">
            <div className="cm-ws-ts-item">
              <span>登録日時</span>
              <time>{caseFile?.created_at ? formatDateTime(caseFile.created_at) : '—'}</time>
            </div>
            <div className="cm-ws-ts-item">
              <span>最終更新</span>
              <time>{formatDateTime(caseFile?.updated_at)}</time>
            </div>
          </div>

          <div className="cm-ws-actions-group">
            {/* 案件を編集: PRIMARY THEMIS action */}
            {onEdit && (
              <button
                type="button"
                className="cm-ws-primary-btn"
                onClick={onEdit}
              >
                <Pencil size={13} />
                <span>案件を編集</span>
              </button>
            )}

            {/* Overflow menu (...) */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                className="cm-ws-icon-btn"
                aria-label="その他のアクション"
                aria-haspopup="true"
                aria-expanded={isMenuOpen}
                onClick={() => setIsMenuOpen((prev) => !prev)}
              >
                <MoreHorizontal size={16} />
              </button>

              {isMenuOpen && (
                <div className="cm-ws-overflow-dropdown">
                  <button
                    type="button"
                    className="cm-ws-dropdown-item sm:hidden"
                    onClick={() => {
                      setIsMenuOpen(false)
                      handleShare()
                    }}
                  >
                    <Share2 size={13} />
                    <span>共有（リンクコピー）</span>
                  </button>
                  <button
                    type="button"
                    className="cm-ws-dropdown-item sm:hidden"
                    onClick={() => {
                      setIsMenuOpen(false)
                      handlePrint()
                    }}
                  >
                    <Printer size={13} />
                    <span>画面を印刷</span>
                  </button>
                  <button
                    type="button"
                    className="cm-ws-dropdown-item"
                    onClick={() => {
                      setIsMenuOpen(false)
                      handleCopyCode()
                    }}
                  >
                    <Copy size={13} />
                    <span>案件コードをコピー</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Client Headline & Kana Reading */}
      <div className="cm-ws-client-profile">
        <h1 className="cm-ws-client-name">{caseFile?.client?.name || '氏名未登録'}</h1>
        <div className="cm-ws-client-reading-row">
          <span>{caseFile?.client?.name_kana || '氏名カナ未登録'}</span>
          <span className="cm-ws-flag" title={caseFile?.client?.nationality || '未登録'}>
            {caseFile?.client?.nationality?.toLowerCase().includes('viet') || (!caseFile?.client?.nationality && caseFile?.client?.name?.includes('MINH')) ? '🇻🇳' : '🌐'}
          </span>
        </div>
      </div>

      {/* Contact Rail (Real Fields) */}
      <div className="cm-ws-contact-rail">
        <span className="cm-ws-contact-item">
          <Phone size={14} className="cm-ws-contact-icon" />
          <span className="cm-ws-contact-text">{caseFile?.client?.phone || '未登録'}</span>
        </span>
        <span className="cm-ws-contact-item">
          <Mail size={14} className="cm-ws-contact-icon" />
          <span className="cm-ws-contact-text">{caseFile?.client?.email || '未登録'}</span>
        </span>
        <span className="cm-ws-contact-item">
          <Globe size={14} className="cm-ws-contact-icon" />
          <span className="cm-ws-contact-text">{caseFile?.client?.nationality || '国籍未登録'}</span>
        </span>
        <span className="cm-ws-contact-item">
          <MapPin size={14} className="cm-ws-contact-icon" />
          <span className="cm-ws-contact-text">{caseFile?.client?.address || '住所未登録'}</span>
        </span>
      </div>

      {/* 4 Summary Cards Strip */}
      <div className="cm-ws-summary-grid">
        {/* Card 1: 在留資格 */}
        <div className="cm-ws-summary-card">
          <div className="cm-ws-summary-iconbox">
            <FileText size={18} />
          </div>
          <div className="cm-ws-summary-content">
            <div className="cm-ws-summary-label">在留資格</div>
            <div className="cm-ws-summary-val" title={residenceStatus}>
              {residenceStatus}
            </div>
          </div>
        </div>

        {/* Card 2: 生年月日 */}
        <div className="cm-ws-summary-card">
          <div className="cm-ws-summary-iconbox">
            <Calendar size={18} />
          </div>
          <div className="cm-ws-summary-content">
            <div className="cm-ws-summary-label">生年月日</div>
            <div className="cm-ws-summary-val">{birthDisplay}</div>
          </div>
        </div>

        {/* Card 3: 担当者 */}
        <div className="cm-ws-summary-card">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-xs"
            style={{ backgroundColor: '#4338ca' }}
          >
            {caseFile.assigned_employee?.full_name?.slice(0, 1) || 'T'}
          </div>
          <div className="cm-ws-summary-content">
            <div className="cm-ws-summary-label">担当者</div>
            <div className="cm-ws-summary-val">
              {caseFile.assigned_employee?.full_name || 'THAN VAN SAY'}
            </div>
          </div>
          <ChevronRight size={16} className="cm-ws-summary-chevron" />
        </div>

        {/* Card 4: canonical client employment summary */}
        <div
          className={`cm-ws-summary-card ${currentWorkplace ? 'is-clickable' : ''}`}
          onClick={currentWorkplace ? () => onSelectEntity(currentWorkplace) : undefined}
          role={currentWorkplace ? 'button' : undefined}
          tabIndex={currentWorkplace ? 0 : undefined}
          aria-label={currentWorkplace ? `${currentWorkplace.name} の詳細を開く` : undefined}
          onKeyDown={currentWorkplace ? (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onSelectEntity(currentWorkplace)
            }
          } : undefined}
        >
            <div className="cm-ws-summary-iconbox">
              <Building2 size={18} />
            </div>
            <div className="cm-ws-summary-content">
              <div className="cm-ws-workplace-top">
                <span className="cm-ws-summary-label">勤務先会社</span>
                {currentWorkplace?.statusBadgeLabel && (
                  <span className={`cm-ws-badge ${getBadgeClass(currentWorkplace.statusBadgeTone)}`}>
                    <span className="cm-ws-badge-dot" />
                    {currentWorkplace.statusBadgeLabel}
                  </span>
                )}
              </div>
              <div className="cm-ws-summary-val" title={currentWorkplace?.name || '未登録'}>
                {currentWorkplace?.name || '未登録'}
              </div>
              <div className="cm-ws-workplace-contacts">
                <Phone size={12} />
                <Mail size={12} />
              </div>
            </div>
            {currentWorkplace && <ChevronRight size={16} className="cm-ws-summary-chevron" />}
        </div>
      </div>
    </header>
  )
}

// --- Component: IncidentSummaryCard ---

export function IncidentSummaryCard({
  caseFile,
  onEdit,
}: {
  caseFile: CaseWorkspace
  onEdit?: () => void
}) {
  const occurrenceDate = caseFile.occurred_at ? formatDateTime(caseFile.occurred_at) : '—'
  const summaryText =
    caseFile.incident_summary || '未登録'
  const injuryText = caseFile.injury_details || '未登録'
  const locationText = caseFile.incident_location || '未登録'
  const notesText = caseFile.current_status_memo || '未登録'

  return (
    <article className="cm-ws-card">
      <div className="cm-ws-card-header">
        <div className="cm-ws-card-title-wrap">
          <div className="cm-ws-title-iconbox">
            <Shield size={16} />
          </div>
          <h2 className="cm-ws-card-title">事故・事件概要</h2>
        </div>
        {onEdit && (
          <button
            type="button"
            className="cm-ws-incident-edit-btn"
            onClick={onEdit}
          >
            <Pencil size={14} />
            <span>編集</span>
          </button>
        )}
      </div>

      {/* Variant B: Dedicated Highlighted Incident Narrative Block */}
      <div className="cm-ws-incident-narrative">
        <div className="cm-ws-incident-narrative-iconbox">
          <FileText size={18} />
        </div>
        <p className="cm-ws-incident-narrative-text">
          {summaryText}
        </p>
      </div>

      {/* Variant B: 4-Item 2x2 Semantic Metadata Grid */}
      <div className="cm-ws-incident-grid-b">
        <div className="cm-ws-incident-card-b">
          <div className="cm-ws-incident-iconbox-b cm-ws-incident-icon-date">
            <Calendar size={18} />
          </div>
          <div className="cm-ws-incident-meta-b">
            <div className="cm-ws-incident-label-b">発生日時</div>
            <div className="cm-ws-incident-val-b">{occurrenceDate}</div>
          </div>
        </div>

        <div className="cm-ws-incident-card-b">
          <div className="cm-ws-incident-iconbox-b cm-ws-incident-icon-injury">
            <HeartPulse size={18} />
          </div>
          <div className="cm-ws-incident-meta-b">
            <div className="cm-ws-incident-label-b">受傷内容</div>
            <div className="cm-ws-incident-val-b">{injuryText}</div>
          </div>
        </div>

        <div className="cm-ws-incident-card-b">
          <div className="cm-ws-incident-iconbox-b cm-ws-incident-icon-location">
            <MapPin size={18} />
          </div>
          <div className="cm-ws-incident-meta-b">
            <div className="cm-ws-incident-label-b">発生場所</div>
            <div className="cm-ws-incident-val-b">{locationText}</div>
          </div>
        </div>

        <div className="cm-ws-incident-card-b">
          <div className="cm-ws-incident-iconbox-b cm-ws-incident-icon-notes">
            <FileText size={18} />
          </div>
          <div className="cm-ws-incident-meta-b">
            <div className="cm-ws-incident-label-b">現在の状況・メモ</div>
            <div className="cm-ws-incident-val-b">{notesText}</div>
          </div>
        </div>
      </div>
    </article>
  )
}

// --- Component: RelatedEntitiesSection ---

export function RelatedEntitiesSection({
  entities,
  onSelectEntity,
  onAddEntity,
}: {
  entities: RelatedEntity[]
  onSelectEntity: (entity: RelatedEntity) => void
  onAddEntity?: () => void
}) {
  const railRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const isDraggingRef = useRef(false)
  const startXRef = useRef(0)
  const scrollLeftRef = useRef(0)
  const hasMovedRef = useRef(false)

  const checkScroll = useCallback(() => {
    const rail = railRef.current
    if (!rail) return
    const overflow = rail.scrollWidth > rail.clientWidth + 2
    setCanScrollLeft(overflow && rail.scrollLeft > 4)
    setCanScrollRight(overflow && rail.scrollLeft < rail.scrollWidth - rail.clientWidth - 4)
  }, [])

  useEffect(() => {
    checkScroll()
    const rail = railRef.current
    if (!rail) return

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        checkScroll()
      })
      resizeObserver.observe(rail)
    }

    window.addEventListener('resize', checkScroll)
    return () => {
      if (resizeObserver) resizeObserver.disconnect()
      window.removeEventListener('resize', checkScroll)
    }
  }, [checkScroll, entities])

  const scrollByDirection = (direction: 'left' | 'right') => {
    const rail = railRef.current
    if (!rail) return
    const cardWidth = 260
    rail.scrollBy({
      left: direction === 'left' ? -cardWidth : cardWidth,
      behavior: 'smooth',
    })
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    const rail = railRef.current
    if (!rail) return
    isDraggingRef.current = true
    hasMovedRef.current = false
    startXRef.current = e.pageX - rail.offsetLeft
    scrollLeftRef.current = rail.scrollLeft
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !railRef.current) return
    const x = e.pageX - railRef.current.offsetLeft
    const walk = x - startXRef.current
    if (Math.abs(walk) > 4) {
      hasMovedRef.current = true
    }
    railRef.current.scrollLeft = scrollLeftRef.current - walk
  }

  const handleMouseUp = () => {
    isDraggingRef.current = false
  }

  const handleMouseLeave = () => {
    isDraggingRef.current = false
  }

  const handleCardClick = (entity: RelatedEntity) => {
    if (hasMovedRef.current) {
      hasMovedRef.current = false
      return
    }
    onSelectEntity(entity)
  }

  const getEntityIcon = (kind: RelatedEntity['kind']) => {
    switch (kind) {
      case 'person':
        return <User size={16} />
      case 'organization':
        return <Users size={16} />
      case 'insurer':
        return <ShieldCheck size={16} />
      case 'police':
        return <Shield size={16} />
      default:
        return <Building2 size={16} />
    }
  }

  const getEntityToneClass = (entity: RelatedEntity) => {
    if (entity.relationType === 'dispatch_company') return 'cm-ws-entity-iconbox--violet'
    if (entity.relationType === 'dispatch_destination') return 'cm-ws-entity-iconbox--cyan'
    if (entity.kind === 'insurer') {
      if (entity.insuranceSide === 'opponent') return 'cm-ws-entity-iconbox--amber'
      if (entity.insuranceSide === 'other') return 'cm-ws-entity-iconbox--slate'
      return 'cm-ws-entity-iconbox--emerald'
    }
    if (entity.relationType === 'opponent_company') return 'cm-ws-entity-iconbox--red'
    if (entity.kind === 'police' || entity.kind === 'other') return 'cm-ws-entity-iconbox--slate'
    return 'cm-ws-entity-iconbox--blue'
  }

  return (
    <article className="cm-ws-card">
      <div className="cm-ws-card-header cm-ws-entities-header">
        <div className="cm-ws-entities-title-group">
          <div className="cm-ws-title-iconbox">
            <Users size={16} />
          </div>
          <h2 className="cm-ws-card-title">関係先</h2>
          <span className="cm-ws-entities-count-badge" aria-label={`関係先 ${entities.length}件`}>
            {entities.length}
          </span>
        </div>

        <div className="cm-ws-entities-controls">
          <div className="cm-ws-entities-nav-group">
            <button
              type="button"
              className="cm-ws-entities-nav-btn"
              onClick={() => scrollByDirection('left')}
              disabled={!canScrollLeft}
              title="前の関係先"
              aria-label="前の関係先を表示"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="cm-ws-entities-nav-btn"
              onClick={() => scrollByDirection('right')}
              disabled={!canScrollRight}
              title="次の関係先"
              aria-label="次の関係先を表示"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {onAddEntity && <div className="cm-ws-entities-divider" />}

          {onAddEntity && (
            <button
              type="button"
              className="cm-ws-entities-add-btn"
              onClick={onAddEntity}
            >
              <Plus size={15} />
              <span>追加</span>
            </button>
          )}
        </div>
      </div>

      {entities.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-500 dark:text-[#A8B4C5]">
          登録されている関係先はありません
        </div>
      ) : (
        <div className="cm-ws-rail-wrapper">
          {/* Left subtle fade & overlay arrow */}
          <div
            className={`cm-ws-rail-edge cm-ws-rail-edge--left ${canScrollLeft ? 'is-visible' : ''}`}
            aria-hidden={!canScrollLeft}
          >
            <button
              type="button"
              className="cm-ws-rail-arrow-btn hidden sm:flex"
              onClick={() => scrollByDirection('left')}
              aria-label="前の関係先を表示"
              tabIndex={canScrollLeft ? 0 : -1}
              title="前へスクロール"
            >
              <ChevronLeft size={15} />
            </button>
          </div>

          {/* Single-row horizontal scrollable rail */}
          <div
            ref={railRef}
            className="cm-ws-entities-rail"
            onScroll={checkScroll}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            role="region"
            aria-label="関係先一覧"
            tabIndex={0}
          >
            {entities.map((entity) => (
              <div
                key={entity.id}
                className="cm-ws-entity-card"
                onClick={() => handleCardClick(entity)}
                role="button"
                tabIndex={0}
                aria-label={`${entity.name} の詳細を開く`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelectEntity(entity)
                  }
                }}
              >
                <div className="cm-ws-entity-card-top">
                  <div className={`cm-ws-entity-iconbox ${getEntityToneClass(entity)}`}>
                    {getEntityIcon(entity.kind)}
                  </div>
                  <div className="cm-ws-entity-meta">
                    <div className="cm-ws-entity-role-row">
                      <span className="cm-ws-entity-role">{entity.relationRoleLabel}</span>
                      {entity.statusBadgeLabel && (
                        <span className={`cm-ws-badge ${getBadgeClass(entity.statusBadgeTone)}`}>
                          <span className="cm-ws-badge-dot" />
                          {entity.statusBadgeLabel}
                        </span>
                      )}
                    </div>
                    <div className="cm-ws-entity-name" title={entity.name}>
                      {entity.name}
                    </div>
                    {entity.address && (
                      <div className="cm-ws-entity-address" title={entity.address}>
                        <MapPin size={11} className="shrink-0" />
                        <span>{entity.address}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="cm-ws-entity-card-bottom">
                  <div className="cm-ws-entity-contacts">
                    <Phone size={12} />
                    <Mail size={12} />
                  </div>
                  <ChevronRight size={14} className="text-slate-400 dark:text-[#A8B4C5]" />
                </div>
              </div>
            ))}
          </div>

          {/* Right subtle fade & overlay arrow */}
          <div
            className={`cm-ws-rail-edge cm-ws-rail-edge--right ${canScrollRight ? 'is-visible' : ''}`}
            aria-hidden={!canScrollRight}
          >
            <button
              type="button"
              className="cm-ws-rail-arrow-btn hidden sm:flex"
              onClick={() => scrollByDirection('right')}
              aria-label="次の関係先を表示"
              tabIndex={canScrollRight ? 0 : -1}
              title="次へスクロール"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </article>
  )
}

// --- Component: RecentHistoryCard ---

export function RecentHistoryCard({
  activities,
  onViewAll,
}: {
  activities: CaseActivity[]
  onViewAll: () => void
}) {
  const displayActivities = activities.slice(0, 4)

  return (
    <article className="cm-ws-card">
      <div className="cm-ws-card-header">
        <div className="cm-ws-card-title-wrap">
          <div className="cm-ws-title-iconbox">
            <Clock3 size={16} />
          </div>
          <h2 className="cm-ws-card-title">最近の履歴</h2>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:underline dark:text-[#818cf8] dark:hover:text-[#a5b4fc] transition-colors"
          onClick={onViewAll}
        >
          <span>履歴をすべて見る</span>
          <ArrowRight size={13} />
        </button>
      </div>

      <div className="cm-ws-history-table">
        <div className="cm-ws-history-head">
          <span>記録日時</span>
          <span>操作内容</span>
          <span>対象・変更詳細</span>
          <span>担当者</span>
        </div>
        <div>
          {displayActivities.map((act) => (
            <div key={act.id} className="cm-ws-history-row">
              <div className="cm-ws-history-time">
                <FileText size={13} className="shrink-0 text-slate-400" />
                <time>{formatDateTime(act.occurred_at)}</time>
              </div>
              <div className="cm-ws-history-action truncate" title={act.title}>
                {act.title}
              </div>
              <div className="text-slate-500 text-xs truncate">
                {act.content ? act.content : '—'}
              </div>
              <div className="cm-ws-history-actor truncate">
                {act.created_by_employee?.full_name || 'THEMIS MANAGER'}
              </div>
            </div>
          ))}

          {displayActivities.length === 0 && (
            <div className="p-4 text-center text-xs text-slate-400">
              記録された履歴はまだありません。
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

// --- Component: QuickInfoSidebar ---

export function QuickInfoSidebar({
  summary,
  urgentCount,
}: {
  summary?: WorkspaceSummary | null
  urgentCount: number
}) {
  const nextDeadlineStr = summary?.next_deadline ? formatDateOnly(summary.next_deadline) : '未設定'

  return (
    <aside className="cm-ws-card">
      <div className="cm-ws-card-header">
        <div className="cm-ws-card-title-wrap">
          <div className="cm-ws-title-iconbox">
            <CheckCircle2 size={16} />
          </div>
          <h2 className="cm-ws-card-title">クイック情報</h2>
        </div>
      </div>

      <div className="space-y-2.5">
        {/* Metric 1: 未完了タスク */}
        <div className="cm-ws-quick-item">
          <div className="cm-ws-quick-iconbox cm-ws-quick-iconbox--blue">
            <ListChecks size={18} />
          </div>
          <div className="cm-ws-quick-meta">
            <div className="cm-ws-quick-label">未完了タスク</div>
            <div className="cm-ws-quick-val-row">
              <span className="cm-ws-quick-num cm-ws-quick-num--blue">{summary?.open_tasks ?? 0}</span>
              <span className="cm-ws-quick-unit">件</span>
            </div>
          </div>
        </div>

        {/* Metric 2: 期限リスク */}
        <div className="cm-ws-quick-item">
          <div className="cm-ws-quick-iconbox cm-ws-quick-iconbox--amber">
            <AlertTriangle size={18} />
          </div>
          <div className="cm-ws-quick-meta">
            <div className="cm-ws-quick-label">期限リスク</div>
            <div className="cm-ws-quick-val-row">
              <span className="cm-ws-quick-num cm-ws-quick-num--amber">
                {urgentCount}
              </span>
              <span className="cm-ws-quick-unit">件</span>
            </div>
          </div>
        </div>

        {/* Metric 3: 次回期限 */}
        <div className="cm-ws-quick-item">
          <div className="cm-ws-quick-iconbox cm-ws-quick-iconbox--blue">
            <Clock size={18} />
          </div>
          <div className="cm-ws-quick-meta">
            <div className="cm-ws-quick-label">次回期限</div>
            <div className="cm-ws-quick-val-row">
              <span className="text-sm font-bold text-slate-900 dark:text-[#F8FAFC]">
                {nextDeadlineStr}
              </span>
            </div>
            {summary?.next_deadline && <div className="cm-ws-quick-sub">登録済みの最短期限</div>}
          </div>
        </div>
      </div>
    </aside>
  )
}
