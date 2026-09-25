import { useEffect, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  Check,
  ArrowRight,
  ShieldAlert,
  Calendar,
  Clock,
  HeartPulse,
  MapPin,
  FileText,
  StickyNote,
} from 'lucide-react'
import type { CaseWorkspace } from './types'
import { ButtonSpinner } from '../../components/loading'
import { useDrawerBodyScrollLock } from './useDrawerBodyScrollLock'

export type IncidentSummaryFormValues = {
  summary: string
  incidentDate: string
  incidentTime: string
  injuryContent: string
  location: string
  notes: string
}

type Props = {
  isOpen: boolean
  onClose: () => void
  caseFile: CaseWorkspace
  initialValues?: Partial<IncidentSummaryFormValues>
  onSave?: (values: IncidentSummaryFormValues) => Promise<void>
}

function parseInitialDateTime(openedAt?: string | null): { date: string; time: string } {
  if (!openedAt) return { date: '', time: '' }
  try {
    const d = new Date(openedAt)
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const hours = String(d.getHours()).padStart(2, '0')
      const mins = String(d.getMinutes()).padStart(2, '0')
      return { date: `${year}-${month}-${day}`, time: `${hours}:${mins}` }
    }
  } catch {
    // fallback
  }
  return { date: '', time: '' }
}

export default function IncidentSummaryEditDrawer({
  isOpen,
  onClose,
  caseFile,
  initialValues,
  onSave,
}: Props) {
  const [isRendered, setIsRendered] = useState(isOpen)
  const [isClosing, setIsClosing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const defaultDateTime = parseInitialDateTime(caseFile.occurred_at)

  // Form State - exactly 5 groups
  const [summary, setSummary] = useState(
    initialValues?.summary ??
      caseFile.incident_summary ?? ''
  )
  const [incidentDate, setIncidentDate] = useState(
    initialValues?.incidentDate ?? defaultDateTime.date
  )
  const [incidentTime, setIncidentTime] = useState(
    initialValues?.incidentTime ?? defaultDateTime.time
  )
  const [injuryContent, setInjuryContent] = useState(
    initialValues?.injuryContent ?? caseFile.injury_details ?? ''
  )
  const [location, setLocation] = useState(
    initialValues?.location ?? caseFile.incident_location ?? ''
  )
  const [notes, setNotes] = useState(
    initialValues?.notes ?? caseFile.current_status_memo ?? ''
  )

  // Sync state when drawer opens with fresh props
  useEffect(() => {
    if (isOpen) {
      setIsRendered(true)
      setIsClosing(false)
      setSaveError('')
      if (initialValues) {
        if (initialValues.summary !== undefined) setSummary(initialValues.summary)
        if (initialValues.incidentDate !== undefined) setIncidentDate(initialValues.incidentDate)
        if (initialValues.incidentTime !== undefined) setIncidentTime(initialValues.incidentTime)
        if (initialValues.injuryContent !== undefined) setInjuryContent(initialValues.injuryContent)
        if (initialValues.location !== undefined) setLocation(initialValues.location)
        if (initialValues.notes !== undefined) setNotes(initialValues.notes)
      } else {
        setSummary(caseFile.incident_summary ?? '')
        setIncidentDate(defaultDateTime.date)
        setIncidentTime(defaultDateTime.time)
        setInjuryContent(caseFile.injury_details ?? '')
        setLocation(caseFile.incident_location ?? '')
        setNotes(caseFile.current_status_memo ?? '')
      }
    } else if (!isOpen && isRendered) {
      setIsClosing(true)
      const timer = setTimeout(() => {
        setIsRendered(false)
        setIsClosing(false)
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [isOpen, isRendered, caseFile, initialValues, defaultDateTime.date, defaultDateTime.time])

  useDrawerBodyScrollLock(isRendered, onClose)

  if (!isRendered) return null

  const handleSave = async () => {
    const values: IncidentSummaryFormValues = {
      summary,
      incidentDate,
      incidentTime,
      injuryContent,
      location,
      notes,
    }
    if (!onSave) return
    setSaving(true)
    setSaveError('')
    try {
      await onSave(values)
      onClose()
    } catch {
      setSaveError('保存できませんでした。入力内容を確認して再試行してください。')
    } finally {
      setSaving(false)
    }
  }

  const drawerElement = (
    <>
      <div
        className={`cm-ws-drawer-backdrop ${isClosing ? 'is-closing' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`cm-ws-drawer cm-incident-drawer ${isClosing ? 'is-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="事故・事件概要の編集"
      >
        {/* Header */}
        <header className="cm-incident-drawer-header">
          <div className="cm-incident-drawer-header-left">
            <div className="cm-incident-drawer-iconbox">
              <ShieldAlert size={20} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="cm-incident-drawer-title-wrap">
              <h2 className="cm-incident-drawer-title">事故・事件概要の編集</h2>
              <p className="cm-incident-drawer-subtext">事故・事件に関する基本情報を編集します。</p>
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

        {/* Drawer Body - 5 Form Groups */}
        <div className="cm-incident-drawer-body">
          {/* FIELD 1: 事故・事件概要 */}
          <section className="cm-incident-group">
            <div className="cm-incident-group-header">
              <div className="cm-incident-group-label-wrap">
                <FileText size={15} className="text-indigo-600 dark:text-indigo-400" />
                <label htmlFor="incident-summary" className="cm-incident-label">
                  事故・事件概要 <span className="cm-incident-required">*</span>
                </label>
              </div>
            </div>
            <div className="cm-incident-textarea-wrap">
              <textarea
                id="incident-summary"
                rows={4}
                maxLength={500}
                value={summary}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setSummary(e.target.value)}
                placeholder="事故・事件の経緯を入力してください"
                className="cm-incident-textarea"
                aria-required="true"
              />
              <div className="cm-incident-counter">
                {summary.length} / 500
              </div>
            </div>
            <p className="cm-incident-helper">
              事故・事件の経緯をできるだけ詳しく入力してください。
            </p>
          </section>

          {/* FIELD 2: 発生日時 */}
          <section className="cm-incident-group">
            <div className="cm-incident-group-header">
              <div className="cm-incident-group-label-wrap">
                <Calendar size={15} className="text-indigo-600 dark:text-indigo-400" />
                <span className="cm-incident-label">
                  発生日時 <span className="cm-incident-required">*</span>
                </span>
              </div>
            </div>
            <div className="cm-incident-datetime-grid">
              <div className="cm-incident-input-with-icon">
                <Calendar size={16} className="cm-incident-field-icon" />
                <input
                  type="date"
                  value={incidentDate}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setIncidentDate(e.target.value)}
                  className="cm-incident-input cm-incident-input-date"
                  aria-label="発生日"
                  aria-required="true"
                />
              </div>
              <div className="cm-incident-input-with-icon">
                <Clock size={16} className="cm-incident-field-icon" />
                <input
                  type="time"
                  value={incidentTime}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setIncidentTime(e.target.value)}
                  className="cm-incident-input cm-incident-input-time"
                  aria-label="発生時刻"
                  aria-required="true"
                />
              </div>
            </div>
          </section>

          {/* FIELD 3: 受傷内容 */}
          <section className="cm-incident-group">
            <div className="cm-incident-group-header">
              <div className="cm-incident-group-label-wrap">
                <HeartPulse size={15} className="text-rose-500 dark:text-rose-400" />
                <label htmlFor="incident-injury" className="cm-incident-label">
                  受傷内容 <span className="cm-incident-required">*</span>
                </label>
              </div>
            </div>
            <div className="cm-incident-input-with-icon">
              <HeartPulse size={16} className="cm-incident-field-icon" />
              <input
                id="incident-injury"
                type="text"
                value={injuryContent}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setInjuryContent(e.target.value)}
                placeholder="例: 右手中指の骨折"
                className="cm-incident-input"
                aria-required="true"
              />
            </div>
            <p className="cm-incident-helper">
              診断名・負傷部位・症状などを入力してください。
            </p>
          </section>

          {/* FIELD 4: 発生場所 */}
          <section className="cm-incident-group">
            <div className="cm-incident-group-header">
              <div className="cm-incident-group-label-wrap">
                <MapPin size={15} className="text-indigo-600 dark:text-indigo-400" />
                <label htmlFor="incident-location" className="cm-incident-label">
                  発生場所 <span className="cm-incident-required">*</span>
                </label>
              </div>
            </div>
            <div className="cm-incident-input-with-icon">
              <MapPin size={16} className="cm-incident-field-icon" />
              <input
                id="incident-location"
                type="text"
                value={location}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setLocation(e.target.value)}
                placeholder="例: 大阪府大阪市住之江区北島3丁目（工場内）"
                className="cm-incident-input"
                aria-required="true"
              />
              {location && (
                <button
                  type="button"
                  onClick={() => setLocation('')}
                  className="cm-incident-input-clear"
                  aria-label="場所入力をクリア"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <p className="cm-incident-helper">
              発生した場所の住所や施設名を入力してください。
            </p>
          </section>

          {/* FIELD 5: 現在の状況・メモ */}
          <section className="cm-incident-group">
            <div className="cm-incident-group-header">
              <div className="cm-incident-group-label-wrap">
                <StickyNote size={15} className="text-indigo-600 dark:text-indigo-400" />
                <label htmlFor="incident-notes" className="cm-incident-label">
                  現在の状況・メモ
                </label>
              </div>
            </div>
            <div className="cm-incident-textarea-wrap">
              <textarea
                id="incident-notes"
                rows={3}
                maxLength={500}
                value={notes}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                placeholder="例: 通院治療中（週2回）"
                className="cm-incident-textarea cm-incident-textarea-sm"
              />
              <div className="cm-incident-counter">
                {notes.length} / 500
              </div>
            </div>
            <p className="cm-incident-helper">
              現在の治療状況や特記事項があれば入力してください。
            </p>
          </section>
        </div>

        {/* Sticky Footer */}
        <footer className="cm-incident-drawer-footer">
          {saveError && <p role="alert">{saveError}</p>}
          <div className="cm-incident-footer-meta">
            <span className="cm-incident-case-code">
              {caseFile.reference_number || (caseFile.id ? `CASE-${String(caseFile.id).padStart(6, '0')}` : 'CASE-000021')}
            </span>
            <span className="cm-incident-meta-text">
              基本情報編集
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
              className="cm-incident-btn-save"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <ButtonSpinner size={16} className="cm-incident-btn-leading" /> : <Check size={16} className="cm-incident-btn-leading" />}
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
