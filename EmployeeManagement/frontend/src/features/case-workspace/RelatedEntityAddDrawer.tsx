import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import axios from 'axios'
import {
  Building,
  Building2,
  ShieldCheck,
  ShieldAlert,
  MoreHorizontal,
  MapPin,
  Phone,
  Mail,
  Calendar,
  ChevronDown,
  Plus,
  X,
  FileText,
  Users,
  ArrowRight,
} from 'lucide-react'
import type { RelatedEntity, EntityRelationType, EntityKind, EntityBadgeTone, CaseWorkspace } from './types'
import { ButtonSpinner } from '../../components/loading'
import { useDrawerBodyScrollLock } from './useDrawerBodyScrollLock'

export interface RelatedEntityAddDrawerProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (entity: RelatedEntity) => Promise<void>
  caseFile?: CaseWorkspace
  initialEntity?: RelatedEntity | null
}

type RelationOption = {
  id: string
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  kind: EntityKind
  relationType: EntityRelationType
}

const RELATION_OPTIONS: RelationOption[] = [
  { id: 'workplace', label: '勤務先企業', icon: FileText, kind: 'company', relationType: 'current_employer' },
  { id: 'agency', label: '派遣元会社', icon: Building, kind: 'company', relationType: 'dispatch_company' },
  { id: 'dispatch_dest', label: '派遣先会社', icon: Building2, kind: 'company', relationType: 'dispatch_destination' },
  { id: 'insurer', label: '保険会社', icon: ShieldCheck, kind: 'insurer', relationType: 'own_insurer' },
  { id: 'police', label: '警察署', icon: ShieldAlert, kind: 'police', relationType: 'police' },
  { id: 'other', label: 'その他', icon: MoreHorizontal, kind: 'other', relationType: 'other' },
]

const TRAFFIC_OPPONENT_OPTION: RelationOption = {
  id: 'opponent_company',
  label: '相手方企業（加害者側会社）',
  icon: Building2,
  kind: 'company',
  relationType: 'opponent_company',
}

const EMPLOYMENT_RELATION_IDS = new Set(['workplace', 'agency', 'dispatch_dest'])

function optionForEntity(entity: RelatedEntity | null | undefined, options: RelationOption[]): RelationOption | undefined {
  if (!entity) return undefined
  if (entity.kind === 'insurer') return options.find((option) => option.id === 'insurer')
  if (entity.kind === 'police') return options.find((option) => option.id === 'police')
  return options.find((option) => option.relationType === entity.relationType
    || (option.id === 'workplace' && entity.relationType === 'former_employer'))
}

function isTrafficAccidentCase(caseFile?: CaseWorkspace): boolean {
  const names = [
    caseFile?.case_type,
    caseFile?.case_type_option?.name,
    caseFile?.case_type_option?.parent?.name,
  ].filter((value): value is string => typeof value === 'string')
  return names.some((name) => name.includes('交通事故'))
}

export const RelatedEntityAddDrawer: React.FC<RelatedEntityAddDrawerProps> = ({
  isOpen,
  onClose,
  onAdd,
  caseFile,
  initialEntity,
}) => {
  const [isRendered, setIsRendered] = useState(isOpen)
  const [isClosing, setIsClosing] = useState(false)

  // Form State
  const [selectedRelationId, setSelectedRelationId] = useState<string>('workplace')
  const [relationText, setRelationText] = useState<string>('勤務先企業')
  const [statusValue, setStatusValue] = useState<'current' | 'past'>('current')
  const [companyName, setCompanyName] = useState<string>('')
  const [address, setAddress] = useState<string>('')
  const [phone, setPhone] = useState<string>('')
  const [email, setEmail] = useState<string>('')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [isCurrent, setIsCurrent] = useState<boolean>(true)
  const [insuranceSide, setInsuranceSide] = useState<'own' | 'opponent' | 'other'>('own')
  const [contactPerson, setContactPerson] = useState<string>('')
  const [policyNumber, setPolicyNumber] = useState<string>('')
  const [claimNumber, setClaimNumber] = useState<string>('')
  const [department, setDepartment] = useState<string>('')
  const [referenceNumber, setReferenceNumber] = useState<string>('')
  const [relationshipDetail, setRelationshipDetail] = useState<string>('')
  const [driverName, setDriverName] = useState<string>('')
  const [vehicleInfo, setVehicleInfo] = useState<string>('')
  const [vehicleNumber, setVehicleNumber] = useState<string>('')
  const [accidentRelationship, setAccidentRelationship] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [nameError, setNameError] = useState<boolean>(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const relationOptions = isTrafficAccidentCase(caseFile)
    ? [...RELATION_OPTIONS.slice(0, -1), TRAFFIC_OPPONENT_OPTION, RELATION_OPTIONS[RELATION_OPTIONS.length - 1]]
    : RELATION_OPTIONS

  // Sync open/close transitions identical to IncidentSummaryEditDrawer
  useEffect(() => {
    if (isOpen) {
      setIsRendered(true)
      setIsClosing(false)
      setSaveError('')
      setNameError(false)
      const existing = initialEntity
      const option = optionForEntity(existing, relationOptions)
      setSelectedRelationId(existing ? option?.id ?? 'other' : 'workplace')
      setRelationText(option?.label ?? '勤務先企業')
      setStatusValue(existing?.isCurrent === false ? 'past' : 'current')
      setCompanyName(existing?.name ?? '')
      setAddress(existing?.address ?? '')
      setPhone(existing?.phone ?? '')
      setEmail(existing?.email ?? '')
      setStartDate(existing?.startDate ?? '')
      setEndDate(existing?.endDate ?? '')
      setIsCurrent(existing?.isCurrent ?? true)
      setInsuranceSide(existing?.insuranceSide
        ?? (existing?.relationType === 'opponent_insurer' ? 'opponent' : 'own'))
      setContactPerson(existing?.contactPerson ?? '')
      setPolicyNumber(existing?.policyNumber ?? '')
      setClaimNumber(existing?.claimNumber ?? '')
      setDepartment(existing?.department ?? '')
      setReferenceNumber(existing?.referenceNumber ?? '')
      setRelationshipDetail(existing?.relationshipDetail ?? '')
      setDriverName(existing?.driverName ?? '')
      setVehicleInfo(existing?.vehicleInfo ?? '')
      setVehicleNumber(existing?.vehicleNumber ?? '')
      setAccidentRelationship(existing?.accidentRelationship ?? '')
      setNotes(existing?.notes ?? '')
    } else if (!isOpen && isRendered) {
      setIsClosing(true)
      const timer = setTimeout(() => {
        setIsRendered(false)
        setIsClosing(false)
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [isOpen, isRendered, initialEntity])

  useDrawerBodyScrollLock(isRendered, onClose)

  if (!isRendered) return null

  const handleSelectRelation = (option: RelationOption) => {
    if (option.id === selectedRelationId) return
    const isEmployment = EMPLOYMENT_RELATION_IDS.has(option.id)
    setSelectedRelationId(option.id)
    setRelationText(option.label)
    setStatusValue('current')
    setIsCurrent(isEmployment)
    setStartDate('')
    setEndDate('')
    setInsuranceSide('own')
    setContactPerson('')
    setPolicyNumber('')
    setClaimNumber('')
    setDepartment('')
    setReferenceNumber('')
    setRelationshipDetail('')
    setDriverName('')
    setVehicleInfo('')
    setVehicleNumber('')
    setAccidentRelationship('')
    if (option.id === 'police') setEmail('')
    setSaveError('')
  }

  // Handle relation select change
  const handleRelationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    setRelationText(value)
    const match = relationOptions.find((opt) => opt.label === value)
    if (match) {
      handleSelectRelation(match)
    } else {
      handleSelectRelation(relationOptions[relationOptions.length - 1])
    }
  }

  const handleAddSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!companyName.trim()) {
      setNameError(true)
      return
    }
    setNameError(false)

    const selectedOption = relationOptions.find((opt) => opt.id === selectedRelationId) || relationOptions[0]
    const preserveExistingRelation = initialEntity && selectedRelationId === 'other'
      && !relationOptions.some((option) => option.relationType === initialEntity.relationType)
    const isEmployment = EMPLOYMENT_RELATION_IDS.has(selectedRelationId)
    const isCurrentBool = isEmployment && isCurrent && statusValue === 'current'
    const relationType: EntityRelationType = selectedRelationId === 'workplace'
      ? (isCurrentBool ? 'current_employer' : 'former_employer')
      : selectedRelationId === 'insurer'
        ? (insuranceSide === 'own' ? 'own_insurer' : insuranceSide === 'opponent' ? 'opponent_insurer' : 'other')
        : preserveExistingRelation ? initialEntity.relationType : selectedOption.relationType
    const statusPresentation: { label: string; tone: EntityBadgeTone } = selectedRelationId === 'workplace'
      ? { label: isCurrentBool ? '現在の勤務先' : '過去の勤務先', tone: isCurrentBool ? 'blue' : 'slate' as const }
      : selectedRelationId === 'agency'
        ? { label: '派遣元会社', tone: 'violet' as const }
        : selectedRelationId === 'dispatch_dest'
          ? { label: '派遣先会社', tone: 'cyan' as const }
          : selectedRelationId === 'insurer'
            ? insuranceSide === 'own'
              ? { label: '本人側保険会社', tone: 'emerald' as const }
              : insuranceSide === 'opponent'
                ? { label: '相手方保険会社', tone: 'amber' as const }
                : { label: '保険会社', tone: 'slate' as const }
            : selectedRelationId === 'police'
              ? { label: '警察署', tone: 'slate' as const }
              : selectedRelationId === 'opponent_company'
                ? { label: '相手方企業', tone: 'red' as const }
              : { label: 'その他', tone: 'slate' as const }
    const initialOptionId = optionForEntity(initialEntity, relationOptions)?.id
    const metadata = selectedRelationId === 'insurer'
      ? {
          insurance_side: insuranceSide,
          policy_number: policyNumber.trim() || null,
          claim_number: claimNumber.trim() || null,
        }
      : selectedRelationId === 'police'
        ? { department: department.trim() || null }
        : selectedRelationId === 'opponent_company'
          ? {
              driver_name: driverName.trim() || null,
              vehicle_info: vehicleInfo.trim() || null,
              vehicle_number: vehicleNumber.trim() || null,
              accident_relationship: accidentRelationship.trim() || null,
            }
        : isEmployment && initialOptionId === selectedRelationId
          ? (initialEntity?.metadata ?? null)
          : null

    const newEntity: RelatedEntity = {
      id: initialEntity?.id ?? `custom-entity-${Date.now()}`,
      kind: preserveExistingRelation ? initialEntity.kind : selectedOption.kind,
      relationType,
      relationRoleLabel: selectedRelationId === 'other'
        ? (relationshipDetail.trim() || 'その他')
        : (relationText || selectedOption.label),
      statusBadgeLabel: statusPresentation.label,
      statusBadgeTone: statusPresentation.tone,
      name: companyName.trim(),
      organizationName: companyName.trim(),
      address: address.trim() || undefined,
      phone: phone.trim() || undefined,
      email: selectedRelationId === 'police' ? undefined : (email.trim() || undefined),
      contactPerson: ['insurer', 'police', 'opponent_company', 'other'].includes(selectedRelationId) ? (contactPerson.trim() || undefined) : undefined,
      relationshipDetail: selectedRelationId === 'other' ? (relationshipDetail.trim() || undefined) : undefined,
      insuranceSide: selectedRelationId === 'insurer' ? insuranceSide : undefined,
      policyNumber: selectedRelationId === 'insurer' ? (policyNumber.trim() || undefined) : undefined,
      claimNumber: selectedRelationId === 'insurer' ? (claimNumber.trim() || undefined) : undefined,
      department: selectedRelationId === 'police' ? (department.trim() || undefined) : undefined,
      referenceNumber: selectedRelationId === 'police' ? (referenceNumber.trim() || undefined) : undefined,
      driverName: selectedRelationId === 'opponent_company' ? (driverName.trim() || undefined) : undefined,
      vehicleInfo: selectedRelationId === 'opponent_company' ? (vehicleInfo.trim() || undefined) : undefined,
      vehicleNumber: selectedRelationId === 'opponent_company' ? (vehicleNumber.trim() || undefined) : undefined,
      accidentRelationship: selectedRelationId === 'opponent_company' ? (accidentRelationship.trim() || undefined) : undefined,
      metadata,
      startDate: isEmployment ? (startDate || undefined) : undefined,
      endDate: isEmployment && !isCurrentBool ? (endDate || undefined) : undefined,
      isCurrent: isEmployment ? isCurrentBool : undefined,
      notes: notes.trim() || undefined,
      originalPartyId: initialEntity?.originalPartyId,
    }

    setSaving(true)
    setSaveError('')
    try {
      await onAdd(newEntity)
      onClose()
    } catch (error) {
      const validationErrors = axios.isAxiosError(error)
        ? error.response?.data?.errors as Record<string, string[]> | undefined
        : undefined
      const firstValidationError = validationErrors
        ? Object.values(validationErrors).flat()[0]
        : undefined

      setSaveError(
        firstValidationError
        ?? (axios.isAxiosError(error) ? error.response?.data?.message : undefined)
        ?? '関係先を保存できませんでした。入力内容を確認して再試行してください。',
      )
    } finally {
      setSaving(false)
    }
  }

  const caseCode =
    caseFile?.reference_number ||
    (caseFile?.id ? `CASE-${String(caseFile.id).padStart(6, '0')}` : 'CASE-000045')
  const isEmploymentType = EMPLOYMENT_RELATION_IDS.has(selectedRelationId)
  const isInsuranceType = selectedRelationId === 'insurer'
  const isPoliceType = selectedRelationId === 'police'
  const isOpponentCompanyType = selectedRelationId === 'opponent_company'
  const isOtherType = selectedRelationId === 'other'
  const entityNameLabel = isInsuranceType ? '保険会社名' : isPoliceType ? '警察署名' : isOtherType ? '名称' : '会社名'
  const entityInfoLabel = isInsuranceType ? '保険会社情報' : isPoliceType ? '警察署情報' : isOpponentCompanyType ? '相手方企業情報' : isOtherType ? '関係先情報' : '会社情報'

  const drawerElement = (
    <>
      {/* Backdrop */}
      <div
        className={`cm-ws-drawer-backdrop ${isClosing ? 'is-closing' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Shell (Exact same as 事故・事件概要の編集) */}
      <aside
        className={`cm-ws-drawer cm-incident-drawer ${isClosing ? 'is-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-entity-drawer-title"
      >
        {/* Header */}
        <header className="cm-incident-drawer-header">
          <div className="cm-incident-drawer-header-left">
            <div className="cm-incident-drawer-iconbox">
              <Building2 size={20} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="cm-incident-drawer-title-wrap">
              <h2 id="add-entity-drawer-title" className="cm-incident-drawer-title">
                {initialEntity ? '関係先を編集' : '関係先を追加'}
              </h2>
              <p className="cm-incident-drawer-subtext">
                案件に関連する会社・機関・相手先情報を登録します。
              </p>
            </div>
          </div>

          <button
            type="button"
            className="cm-incident-drawer-close-btn"
            onClick={onClose}
            aria-label="閉じる"
          >
            <X size={19} />
          </button>
        </header>

        {/* Drawer Body - Exactly 5 Section Cards matching 事故・事件概要の編集 */}
        <div className="cm-incident-drawer-body">
          {/* SECTION CARD 1: 関係の種類 * */}
          <section className="cm-incident-group">
            <div className="cm-incident-group-header">
              <div className="cm-incident-group-label-wrap">
                <FileText size={15} className="text-indigo-600 dark:text-indigo-400" />
                <span className="cm-incident-label">関係の種類</span>
                <span className="cm-incident-required">*</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {relationOptions.map((option) => {
                const Icon = option.icon
                const isSelected = selectedRelationId === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleSelectRelation(option)}
                    className={`cm-relation-card flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${
                      isSelected
                        ? 'cm-relation-card--selected border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold shadow-sm'
                        : 'border-slate-200/90 dark:border-[#233144] bg-white dark:bg-[#131B27] text-slate-600 dark:text-[#94A3B8] hover:border-slate-300 dark:hover:border-[#33445C] hover:bg-slate-50 dark:hover:bg-[#172232]'
                    }`}
                  >
                    <Icon
                      size={20}
                      className={`mb-1.5 ${
                        isSelected
                          ? 'text-indigo-600 dark:text-indigo-400'
                          : 'text-slate-500 dark:text-[#7E8B9F]'
                      }`}
                    />
                    <span className="text-xs leading-tight block whitespace-nowrap font-medium">
                      {option.label}
                    </span>
                  </button>
                )
              })}
            </div>

            <p className="cm-incident-helper text-xs text-slate-400 dark:text-slate-500 mt-1">
              該当する関係先の種類を選択してください。
            </p>
          </section>

          {/* SECTION CARD 2: 関係・状態 */}
          <section className="cm-incident-group">
            <div className="cm-incident-group-header">
              <div className="cm-incident-group-label-wrap">
                <Users size={15} className="text-indigo-600 dark:text-indigo-400" />
                <span className="cm-incident-label">関係・状態</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* 関係 * */}
              <div className="space-y-1.5">
                <label
                  htmlFor="entity-relation"
                  className="block text-xs font-semibold text-slate-700 dark:text-[#CBD5E1]"
                >
                  関係 <span className="text-red-500">*</span>
                </label>
                <div className="cm-input-icon-wrap relative">
                  <Building2
                    size={16}
                    className="cm-input-icon !text-indigo-600 dark:!text-indigo-400 !opacity-100 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  />
                  <select
                    id="entity-relation"
                    value={relationText}
                    onChange={handleRelationChange}
                    className="cm-incident-input pl-9 pr-8 text-xs sm:text-sm font-medium appearance-none cursor-pointer"
                  >
                    {relationOptions.map((option) => <option key={option.id} value={option.label}>{option.label}</option>)}
                  </select>
                  <ChevronDown
                    size={15}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />
                </div>
              </div>

              {isEmploymentType && (
                <div className="space-y-1.5">
                  <label htmlFor="entity-status" className="block text-xs font-semibold text-slate-700 dark:text-[#CBD5E1]">
                    状態 <span className="text-red-500">*</span>
                  </label>
                  <div className="cm-input-icon-wrap relative">
                    <span className={`absolute left-3 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full pointer-events-none ${statusValue === 'current' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    <select
                      id="entity-status"
                      value={statusValue}
                      onChange={(e) => {
                        const current = e.target.value === 'current'
                        setStatusValue(current ? 'current' : 'past')
                        setIsCurrent(current)
                      }}
                      className="cm-incident-input pl-8 pr-8 text-xs sm:text-sm font-medium appearance-none cursor-pointer"
                    >
                      <option value="current">{selectedRelationId === 'workplace' ? '現在の勤務先' : '現在'}</option>
                      <option value="past">{selectedRelationId === 'workplace' ? '過去の勤務先' : '過去'}</option>
                    </select>
                    <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              )}

              {isInsuranceType && (
                <div className="space-y-1.5">
                  <label htmlFor="insurance-side" className="block text-xs font-semibold text-slate-700 dark:text-[#CBD5E1]">保険の立場 <span className="text-red-500">*</span></label>
                  <div className="cm-input-icon-wrap relative">
                    <ShieldCheck size={16} className="cm-input-icon absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <select id="insurance-side" value={insuranceSide} onChange={(e) => setInsuranceSide(e.target.value as 'own' | 'opponent' | 'other')} className="cm-incident-input pl-9 pr-8 text-xs sm:text-sm font-medium appearance-none cursor-pointer">
                      <option value="own">本人側</option>
                      <option value="opponent">相手方</option>
                      <option value="other">その他・未指定</option>
                    </select>
                    <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              )}

              {isOtherType && (
                <div className="space-y-1.5">
                  <label htmlFor="entity-relationship" className="block text-xs font-semibold text-slate-700 dark:text-[#CBD5E1]">関係</label>
                  <input id="entity-relationship" type="text" value={relationshipDetail} onChange={(e) => setRelationshipDetail(e.target.value)} placeholder="例：取引先、支援団体" className="cm-incident-input text-xs sm:text-sm" />
                </div>
              )}
            </div>
          </section>

          {/* SECTION CARD 3: 共通情報 */}
          <section className="cm-incident-group">
            <div className="cm-incident-group-header">
              <div className="cm-incident-group-label-wrap">
                <Building2 size={15} className="text-indigo-600 dark:text-indigo-400" />
                <span className="cm-incident-label">{entityInfoLabel}</span>
              </div>
            </div>

            <div className="space-y-3.5">
              {/* 名称 * */}
              <div className="space-y-1.5">
                <label
                  htmlFor="entity-name"
                  className="block text-xs font-semibold text-slate-700 dark:text-[#CBD5E1]"
                >
                  {entityNameLabel} <span className="text-red-500">*</span>
                </label>
                <div className="cm-input-icon-wrap relative">
                  <Building2
                    size={16}
                    className="cm-input-icon absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  />
                  <input
                    id="entity-name"
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => {
                      setCompanyName(e.target.value)
                      if (e.target.value.trim()) setNameError(false)
                    }}
                    placeholder={isPoliceType ? '大阪府〇〇警察署' : isOtherType ? '関係先の名称' : '株式会社大阪テクノ'}
                    className={`cm-incident-input pl-9 text-xs sm:text-sm ${
                      nameError ? '!border-red-400 !ring-2 !ring-red-400/20' : ''
                    }`}
                  />
                </div>
                {nameError && (
                  <p className="text-[11px] text-red-500">{entityNameLabel}を入力してください。</p>
                )}
              </div>

              {/* 住所 */}
              <div className="space-y-1.5">
                <label
                  htmlFor="entity-address"
                  className="block text-xs font-semibold text-slate-700 dark:text-[#CBD5E1]"
                >
                  住所
                </label>
                <div className="cm-input-icon-wrap relative">
                  <MapPin
                    size={16}
                    className="cm-input-icon absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  />
                  <input
                    id="entity-address"
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="大阪府大阪市西区江戸堀1-10-8"
                    className="cm-incident-input pl-9 text-xs sm:text-sm"
                  />
                </div>
              </div>

              {/* 電話番号 + メール (2 columns on desktop) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <label
                    htmlFor="entity-phone"
                    className="block text-xs font-semibold text-slate-700 dark:text-[#CBD5E1]"
                  >
                    電話番号
                  </label>
                  <div className="cm-input-icon-wrap relative">
                    <Phone
                      size={16}
                      className="cm-input-icon absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    />
                    <input
                      id="entity-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="06-6123-4567"
                      className="cm-incident-input pl-9 text-xs sm:text-sm"
                    />
                  </div>
                </div>

                {!isPoliceType && <div className="space-y-1.5">
                  <label
                    htmlFor="entity-email"
                    className="block text-xs font-semibold text-slate-700 dark:text-[#CBD5E1]"
                  >
                    メール
                  </label>
                  <div className="cm-input-icon-wrap relative">
                    <Mail
                      size={16}
                      className="cm-input-icon absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    />
                    <input
                      id="entity-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="info@osaka-techno.co.jp"
                      className="cm-incident-input pl-9 text-xs sm:text-sm"
                    />
                  </div>
                </div>}
              </div>
            </div>
          </section>

          {isEmploymentType && (
            <section className="cm-incident-group">
              <div className="cm-incident-group-header">
                <div className="cm-incident-group-label-wrap">
                  <Calendar size={15} className="text-indigo-600 dark:text-indigo-400" />
                  <span className="cm-incident-label">
                    {selectedRelationId === 'dispatch_dest' ? '派遣期間' : selectedRelationId === 'agency' ? '契約・在籍期間' : '在籍期間'}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-end gap-2.5 sm:gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-[#CBD5E1] mb-1">開始日</label>
                    <div className="cm-input-icon-wrap relative">
                      <Calendar size={15} className="cm-input-icon absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="cm-incident-input pl-9 text-xs sm:text-sm" />
                    </div>
                  </div>
                  <span className="hidden sm:inline-block pb-3 text-slate-400 font-bold select-none">～</span>
                  <div className={`flex-1 transition-opacity ${isCurrent ? 'opacity-40 pointer-events-none' : ''}`}>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-[#CBD5E1] mb-1">終了日</label>
                    <div className="cm-input-icon-wrap relative">
                      <Calendar size={15} className="cm-input-icon absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input type="date" disabled={isCurrent} value={endDate} onChange={(e) => setEndDate(e.target.value)} className="cm-incident-input pl-9 text-xs sm:text-sm" />
                    </div>
                  </div>
                  <div className="pb-1 sm:pb-2.5 sm:pl-2 flex-shrink-0">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <div className="relative inline-flex items-center">
                        <input type="checkbox" checked={isCurrent} onChange={(e) => { setIsCurrent(e.target.checked); setStatusValue(e.target.checked ? 'current' : 'past') }} className="sr-only peer" />
                        <div className="w-10 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-[#233144] peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600" />
                      </div>
                      <span className="text-xs font-semibold text-slate-700 dark:text-[#CBD5E1] whitespace-nowrap">
                        {selectedRelationId === 'workplace' ? '現在在籍中' : '現在継続中'}
                      </span>
                    </label>
                  </div>
                </div>
                <p className="cm-incident-helper text-xs text-slate-400 dark:text-slate-500">期間が不明な場合は、概算で入力してください。</p>
              </div>
            </section>
          )}

          {isInsuranceType && (
            <section className="cm-incident-group">
              <div className="cm-incident-group-header"><div className="cm-incident-group-label-wrap"><ShieldCheck size={15} className="text-indigo-600 dark:text-indigo-400" /><span className="cm-incident-label">保険契約情報</span></div></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1.5"><label className="block text-xs font-semibold text-slate-700 dark:text-[#CBD5E1]">担当者名</label><input type="text" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className="cm-incident-input text-xs sm:text-sm" /></div>
                <div className="space-y-1.5"><label className="block text-xs font-semibold text-slate-700 dark:text-[#CBD5E1]">証券番号</label><input type="text" value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} className="cm-incident-input text-xs sm:text-sm" /></div>
                <div className="space-y-1.5 sm:col-span-2"><label className="block text-xs font-semibold text-slate-700 dark:text-[#CBD5E1]">事故受付番号・受付番号</label><input type="text" value={claimNumber} onChange={(e) => setClaimNumber(e.target.value)} className="cm-incident-input text-xs sm:text-sm" /></div>
              </div>
            </section>
          )}

          {isPoliceType && (
            <section className="cm-incident-group">
              <div className="cm-incident-group-header"><div className="cm-incident-group-label-wrap"><ShieldAlert size={15} className="text-indigo-600 dark:text-indigo-400" /><span className="cm-incident-label">警察署担当情報</span></div></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1.5"><label className="block text-xs font-semibold text-slate-700 dark:text-[#CBD5E1]">担当部署</label><input type="text" value={department} onChange={(e) => setDepartment(e.target.value)} className="cm-incident-input text-xs sm:text-sm" /></div>
                <div className="space-y-1.5"><label className="block text-xs font-semibold text-slate-700 dark:text-[#CBD5E1]">担当者名</label><input type="text" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className="cm-incident-input text-xs sm:text-sm" /></div>
                <div className="space-y-1.5 sm:col-span-2"><label className="block text-xs font-semibold text-slate-700 dark:text-[#CBD5E1]">受付番号・事件番号</label><input type="text" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} className="cm-incident-input text-xs sm:text-sm" /></div>
              </div>
            </section>
          )}

          {isOpponentCompanyType && (
            <section className="cm-incident-group">
              <div className="cm-incident-group-header"><div className="cm-incident-group-label-wrap"><Building2 size={15} className="text-indigo-600 dark:text-indigo-400" /><span className="cm-incident-label">事故関係情報</span></div></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1.5"><label className="block text-xs font-semibold text-slate-700 dark:text-[#CBD5E1]">担当者名</label><input type="text" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className="cm-incident-input text-xs sm:text-sm" /></div>
                <div className="space-y-1.5"><label className="block text-xs font-semibold text-slate-700 dark:text-[#CBD5E1]">運転者名</label><input type="text" value={driverName} onChange={(e) => setDriverName(e.target.value)} className="cm-incident-input text-xs sm:text-sm" /></div>
                <div className="space-y-1.5"><label className="block text-xs font-semibold text-slate-700 dark:text-[#CBD5E1]">車両情報</label><input type="text" value={vehicleInfo} onChange={(e) => setVehicleInfo(e.target.value)} placeholder="例：普通乗用車・白" className="cm-incident-input text-xs sm:text-sm" /></div>
                <div className="space-y-1.5"><label className="block text-xs font-semibold text-slate-700 dark:text-[#CBD5E1]">車両番号</label><input type="text" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} placeholder="例：大阪 300 あ 12-34" className="cm-incident-input text-xs sm:text-sm" /></div>
                <div className="space-y-1.5 sm:col-span-2"><label className="block text-xs font-semibold text-slate-700 dark:text-[#CBD5E1]">事故との関係</label><input type="text" value={accidentRelationship} onChange={(e) => setAccidentRelationship(e.target.value)} placeholder="例：業務中に事故を起こした車両の所有会社" className="cm-incident-input text-xs sm:text-sm" /></div>
              </div>
            </section>
          )}

          {isOtherType && (
            <section className="cm-incident-group">
              <div className="cm-incident-group-header"><div className="cm-incident-group-label-wrap"><Users size={15} className="text-indigo-600 dark:text-indigo-400" /><span className="cm-incident-label">連絡担当</span></div></div>
              <div className="space-y-1.5"><label className="block text-xs font-semibold text-slate-700 dark:text-[#CBD5E1]">担当者名</label><input type="text" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className="cm-incident-input text-xs sm:text-sm" /></div>
            </section>
          )}

          {/* SECTION CARD 5: 備考 */}
          <section className="cm-incident-group">
            <div className="cm-incident-group-header">
              <div className="cm-incident-group-label-wrap">
                <FileText size={15} className="text-indigo-600 dark:text-indigo-400" />
                <span className="cm-incident-label">備考</span>
              </div>
            </div>

            <div className="cm-incident-textarea-wrap relative">
              <FileText
                size={15}
                className="cm-input-icon absolute left-3.5 top-3.5 pointer-events-none text-slate-400"
              />
              <textarea
                id="entity-notes"
                rows={3}
                maxLength={500}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="労災申請に必要な書類を依頼済み。"
                className="cm-incident-textarea pl-9 pr-3 pb-7 text-xs sm:text-sm"
              />
              <div className="cm-incident-counter absolute right-3 bottom-2 text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                {notes.length} / 500
              </div>
            </div>

            <p className="cm-incident-helper text-xs text-slate-400 dark:text-slate-500">
              特記事項や補足情報があれば入力してください。
            </p>
          </section>
        </div>

        {/* Sticky Footer (Exact same as 事故・事件概要の編集) */}
        <footer className="cm-incident-drawer-footer">
          {saveError && <p role="alert">{saveError}</p>}
          <div className="cm-incident-footer-meta">
            <span className="cm-incident-case-code">
              {caseCode}
            </span>
            <span className="cm-incident-meta-text">
              {initialEntity ? '関係先の編集' : '関係先の追加'}
            </span>
          </div>

          <div className="cm-incident-footer-actions">
            <button
              type="button"
              className="cm-incident-btn-cancel"
              onClick={onClose}
            >
              <X size={15} />
              <span>キャンセル</span>
            </button>

            <button
              type="button"
              className="cm-incident-btn-save cm-incident-btn-save--entity"
              onClick={handleAddSubmit}
              disabled={saving}
            >
              {saving ? <ButtonSpinner size={16} className="cm-incident-btn-leading" /> : <Plus size={16} className="cm-incident-btn-leading" />}
              <span>{initialEntity ? '変更を保存' : '関係先を追加'}</span>
              <ArrowRight size={14} className="cm-incident-btn-arrow opacity-80" />
            </button>
          </div>
        </footer>
      </aside>
    </>
  )

  return createPortal(drawerElement, document.body)
}
