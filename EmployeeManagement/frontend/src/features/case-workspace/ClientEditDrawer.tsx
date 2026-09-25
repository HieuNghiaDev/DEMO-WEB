import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  Check,
  ArrowRight,
  User,
  Calendar,
  Phone,
  Mail,
  MapPin,
  Users,
} from 'lucide-react'
import type { CaseWorkspace } from './types'
import { ButtonSpinner } from '../../components/loading'
import { useDrawerBodyScrollLock } from './useDrawerBodyScrollLock'

export type ClientEditFormValues = {
  name: string
  name_kana: string
  birth_date: string
  client_type: 'individual' | 'corporate'
  phone: string
  email: string
  address: string
}

export type ClientEditFieldErrors = Partial<Record<keyof ClientEditFormValues | string, string>>

type Props = {
  isOpen: boolean
  onClose: () => void
  caseFile: CaseWorkspace
  onSave?: (values: ClientEditFormValues) => Promise<void>
}

function buildInitialValues(caseFile: CaseWorkspace): ClientEditFormValues {
  const client = caseFile.client
  return {
    name: client?.name ?? '',
    name_kana: client?.name_kana ?? '',
    birth_date: client?.birth_date ?? '',
    client_type: client?.client_type === 'corporate' ? 'corporate' : 'individual',
    phone: client?.phone ?? '',
    email: client?.email ?? '',
    address: client?.address ?? '',
  }
}

export default function ClientEditDrawer({ isOpen, onClose, caseFile, onSave }: Props) {
  const [isRendered, setIsRendered] = useState(isOpen)
  const [isClosing, setIsClosing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<ClientEditFieldErrors>({})

  const [values, setValues] = useState<ClientEditFormValues>(() => buildInitialValues(caseFile))

  // Sync state when drawer opens
  useEffect(() => {
    if (isOpen) {
      setIsRendered(true)
      setIsClosing(false)
      setSaveError('')
      setFieldErrors({})
      setValues(buildInitialValues(caseFile))
    } else if (!isOpen && isRendered) {
      setIsClosing(true)
      const timer = setTimeout(() => {
        setIsRendered(false)
        setIsClosing(false)
      }, 200)
      return () => clearTimeout(timer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  useDrawerBodyScrollLock(isRendered, onClose)

  if (!isRendered) return null

  const set = <K extends keyof ClientEditFormValues>(key: K, value: ClientEditFormValues[K]) => {
    setValues(prev => ({ ...prev, [key]: value }))
    setFieldErrors(prev => { const next = { ...prev }; delete next[key]; return next })
  }

  const handleSave = async () => {
    // Basic frontend validation
    const errors: ClientEditFieldErrors = {}
    if (!values.name.trim()) {
      errors.name = values.client_type === 'corporate' ? '組織名を入力してください。' : '氏名を入力してください。'
    }
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
      errors.email = 'メールアドレスの形式を確認してください。'
    }
    if (Object.keys(errors).length) {
      setFieldErrors(errors)
      return
    }

    if (!onSave) return
    setSaving(true)
    setSaveError('')
    setFieldErrors({})
    try {
      await onSave(values)
      onClose()
    } catch (err: unknown) {
      // Parse Laravel field validation errors (422)
      const anyErr = err as { response?: { data?: { errors?: Record<string, string[]>; message?: string } } }
      const laravelErrors = anyErr?.response?.data?.errors
      if (laravelErrors && typeof laravelErrors === 'object') {
        const mapped: ClientEditFieldErrors = {}
        for (const [field, messages] of Object.entries(laravelErrors)) {
          mapped[field] = Array.isArray(messages) ? messages[0] : String(messages)
        }
        setFieldErrors(mapped)
        setSaveError('入力内容を確認してください。')
      } else {
        setSaveError('保存できませんでした。入力内容を確認して再試行してください。')
      }
    } finally {
      setSaving(false)
    }
  }

  const code = caseFile.reference_number || `CASE-${String(caseFile.id ?? 0).padStart(6, '0')}`
  const nameLabel = values.client_type === 'corporate' ? '組織名' : '氏名'

  const drawerElement = (
    <>
      {/* Backdrop */}
      <div
        className={`cm-ws-drawer-backdrop ${isClosing ? 'is-closing' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <aside
        className={`cm-ws-drawer cm-incident-drawer cm-cled-drawer ${isClosing ? 'is-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="依頼者情報の編集"
      >
        {/* Header */}
        <header className="cm-incident-drawer-header cm-cled-drawer-header">
          <div className="cm-incident-drawer-header-left">
            <div className="cm-incident-drawer-iconbox cm-cled-header-iconbox">
              <User size={22} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="cm-incident-drawer-title-wrap">
              <h2 className="cm-incident-drawer-title cm-cled-header-title">依頼者情報の編集</h2>
              <p className="cm-incident-drawer-subtext cm-cled-header-subtext">依頼者の基本情報を更新します。</p>
            </div>
          </div>
          <button
            type="button"
            className="cm-incident-drawer-close-btn cm-cled-header-close-btn"
            onClick={onClose}
            aria-label="閉じる"
          >
            <X size={19} />
          </button>
        </header>

        {/* Body */}
        <div className="cm-incident-drawer-body">
          {/* Main Form Card */}
          <div className="cm-cled-card">
            {/* Section Header */}
            <div className="cm-cled-card-head">
              <div className="cm-cled-head-iconbox">
                <User size={18} className="text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="cm-cled-head-text">
                <h3 className="cm-cled-card-title">依頼者の基本情報</h3>
                <p className="cm-cled-card-subtitle">氏名・連絡先・住所などの基本情報</p>
              </div>
            </div>

            {/* Vertical Stack of Fields */}
            <div className="cm-cled-fields-stack">
              {/* 氏名 / 組織名 */}
              <div className="cm-cled-field">
                <label htmlFor="cled-name" className="cm-cled-label">
                  {nameLabel} <span className="cm-cled-required">*</span>
                </label>
                <div className="cm-cled-input-wrap">
                  <User size={16} className="cm-cled-icon" />
                  <input
                    id="cled-name"
                    type="text"
                    className={`cm-cled-input cm-cled-input--icon${fieldErrors.name ? ' cm-cled-input--error' : ''}`}
                    value={values.name}
                    maxLength={255}
                    placeholder={values.client_type === 'corporate' ? '例：THEMIS合同事務所' : '例：田中 太郎'}
                    onChange={e => set('name', e.target.value)}
                    aria-required="true"
                    aria-invalid={!!fieldErrors.name}
                  />
                </div>
                {fieldErrors.name && <p className="cm-cled-field-error" role="alert">{fieldErrors.name}</p>}
              </div>

              {/* フリガナ */}
              <div className="cm-cled-field">
                <label htmlFor="cled-name-kana" className="cm-cled-label">フリガナ</label>
                <div className="cm-cled-input-wrap">
                  <User size={16} className="cm-cled-icon" />
                  <input
                    id="cled-name-kana"
                    type="text"
                    className={`cm-cled-input cm-cled-input--icon${fieldErrors.name_kana ? ' cm-cled-input--error' : ''}`}
                    value={values.name_kana}
                    maxLength={255}
                    placeholder="例：タナカ タロウ"
                    onChange={e => set('name_kana', e.target.value)}
                  />
                </div>
                {fieldErrors.name_kana && <p className="cm-cled-field-error" role="alert">{fieldErrors.name_kana}</p>}
              </div>

              {/* 生年月日 */}
              <div className="cm-cled-field">
                <label htmlFor="cled-birth" className="cm-cled-label">生年月日</label>
                <div className="cm-cled-input-wrap">
                  <Calendar size={16} className="cm-cled-icon" />
                  <input
                    id="cled-birth"
                    type="date"
                    className={`cm-cled-input cm-cled-input--icon${fieldErrors.birth_date ? ' cm-cled-input--error' : ''}`}
                    value={values.birth_date}
                    onChange={e => set('birth_date', e.target.value)}
                    aria-label="生年月日"
                  />
                </div>
                {fieldErrors.birth_date && <p className="cm-cled-field-error" role="alert">{fieldErrors.birth_date}</p>}
              </div>

              {/* 依頼者区分 segmented control */}
              <div className="cm-cled-field">
                <span className="cm-cled-label">依頼者区分</span>
                <div className="cm-cled-segment" role="group" aria-label="依頼者区分">
                  <button
                    type="button"
                    className={`cm-cled-segment-btn${values.client_type === 'individual' ? ' is-active' : ''}`}
                    aria-pressed={values.client_type === 'individual'}
                    onClick={() => set('client_type', 'individual')}
                  >
                    <User size={14} />
                    <span>個人</span>
                  </button>
                  <button
                    type="button"
                    className={`cm-cled-segment-btn${values.client_type === 'corporate' ? ' is-active' : ''}`}
                    aria-pressed={values.client_type === 'corporate'}
                    onClick={() => set('client_type', 'corporate')}
                  >
                    <Users size={14} />
                    <span>組織</span>
                  </button>
                </div>
              </div>

              {/* 電話番号 */}
              <div className="cm-cled-field">
                <label htmlFor="cled-phone" className="cm-cled-label">電話番号</label>
                <div className="cm-cled-input-wrap">
                  <Phone size={16} className="cm-cled-icon" />
                  <input
                    id="cled-phone"
                    type="tel"
                    inputMode="tel"
                    className={`cm-cled-input cm-cled-input--icon${fieldErrors.phone ? ' cm-cled-input--error' : ''}`}
                    value={values.phone}
                    maxLength={30}
                    placeholder="例：090-1234-5678"
                    onChange={e => set('phone', e.target.value)}
                  />
                </div>
                {fieldErrors.phone && <p className="cm-cled-field-error" role="alert">{fieldErrors.phone}</p>}
              </div>

              {/* メールアドレス */}
              <div className="cm-cled-field">
                <label htmlFor="cled-email" className="cm-cled-label">メールアドレス</label>
                <div className="cm-cled-input-wrap">
                  <Mail size={16} className="cm-cled-icon" />
                  <input
                    id="cled-email"
                    type="email"
                    className={`cm-cled-input cm-cled-input--icon${fieldErrors.email ? ' cm-cled-input--error' : ''}`}
                    value={values.email}
                    maxLength={255}
                    placeholder="例：tanaka@example.com"
                    onChange={e => set('email', e.target.value)}
                  />
                </div>
                {fieldErrors.email && <p className="cm-cled-field-error" role="alert">{fieldErrors.email}</p>}
              </div>

              {/* 住所 */}
              <div className="cm-cled-field">
                <label htmlFor="cled-address" className="cm-cled-label">住所</label>
                <div className="cm-cled-input-wrap">
                  <MapPin size={16} className="cm-cled-icon" />
                  <input
                    id="cled-address"
                    type="text"
                    className={`cm-cled-input cm-cled-input--icon${fieldErrors.address ? ' cm-cled-input--error' : ''}`}
                    value={values.address}
                    maxLength={255}
                    placeholder="例：東京都新宿区西新宿2-8-1"
                    onChange={e => set('address', e.target.value)}
                  />
                </div>
                {fieldErrors.address && <p className="cm-cled-field-error" role="alert">{fieldErrors.address}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Footer */}
        <footer className="cm-incident-drawer-footer cm-cled-drawer-footer">
          {saveError && (
            <div className="cm-cled-save-error-wrap" role="alert">
              <span className="cm-cled-save-error">{saveError}</span>
            </div>
          )}
          <div className="cm-incident-footer-meta">
            <span className="cm-incident-case-code">{code}</span>
            <span className="cm-incident-meta-text">基本情報編集</span>
          </div>

          <div className="cm-incident-footer-actions">
            <button
              type="button"
              className="cm-incident-btn-cancel"
              onClick={onClose}
              disabled={saving}
            >
              <X size={15} />
              <span>キャンセル</span>
            </button>

            <button
              type="button"
              className="cm-incident-btn-save"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving
                ? <ButtonSpinner size={16} className="cm-incident-btn-leading" />
                : <Check size={16} className="cm-incident-btn-leading" />}
              <span>変更を保存</span>
              <ArrowRight size={14} className="cm-incident-btn-arrow opacity-80" />
            </button>
          </div>
        </footer>
      </aside>
    </>
  )

  return createPortal(drawerElement, document.body)
}
