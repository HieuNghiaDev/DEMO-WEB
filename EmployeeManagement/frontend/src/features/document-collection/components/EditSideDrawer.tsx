import { Check, Pencil } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import InspectorShell from './InspectorShell'
import '../../case-workspace/caseWorkspace.css'

// Reuse the incident editor's layout and the document inspector's nested focus handling.
export default function EditSideDrawer({ title, subtitle, children, onClose, onSave, submitLabel = '変更を保存', disabled = false, className = '', backdropClassName = '' }: {
  title: string; subtitle: string; children: ReactNode; onClose: () => void
  onSave?: () => Promise<boolean>; submitLabel?: string; disabled?: boolean
  className?: string; backdropClassName?: string
}) {
  const formId = useId()
  const [closing, setClosing] = useState(false)
  const [saving, setSaving] = useState(false)
  const timer = useRef<number | null>(null)
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current) }, [])
  const close = () => {
    if (saving || closing) return
    setClosing(true)
    timer.current = window.setTimeout(onClose, 210)
  }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!onSave || saving || disabled) return
    setSaving(true)
    try {
      if (await onSave()) {
        setClosing(true)
        timer.current = window.setTimeout(onClose, 210)
      }
    } finally { setSaving(false) }
  }
  return <InspectorShell forceOverlay editLayout title={title} code={<Pencil size={20}/>} subtitle={subtitle}
    className={`dc-action-drawer ${className} ${closing ? 'is-closing' : ''}`}
    backdropClassName={`dc-received-drawer-backdrop ${backdropClassName} ${closing ? 'is-closing' : ''}`}
    onClose={close}
    footer={<div className="cm-incident-footer-actions"><button type="button" className="cm-incident-btn-cancel" disabled={saving || closing} onClick={close}>キャンセル</button>{onSave && <button type="submit" form={formId} className="cm-incident-btn-save" disabled={saving || closing || disabled}><Check size={16}/>{saving ? '保存中…' : submitLabel}</button>}</div>}
  ><form id={formId} className="dc-document-action-form" onSubmit={event => void submit(event)}><fieldset disabled={saving || closing}>{children}</fieldset></form></InspectorShell>
}
