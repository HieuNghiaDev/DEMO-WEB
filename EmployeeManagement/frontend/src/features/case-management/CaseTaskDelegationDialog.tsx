import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { caseApi, caseError, type CaseDelegationCandidate, type CaseTaskDelegation } from './api'
import CaseTaskDelegationFields from './CaseTaskDelegationFields'
import { selectedCaseDelegations } from './caseTaskDelegation'

export default function CaseTaskDelegationDialog({ caseId, onClose, onSaved }: {
  caseId: number
  onClose: () => void
  onSaved: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const submitting = useRef(false)
  const [candidates, setCandidates] = useState<CaseDelegationCandidate[] | null>(null)
  const [rows, setRows] = useState<CaseTaskDelegation[]>([])
  const [revision, setRevision] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const element = dialog.current
    element?.showModal()
    void caseApi.taskDelegations(caseId).then(data => {
      if (!active) return
      setRows(data.task_delegations)
      setCandidates(data.candidates)
      setRevision(data.revision)
    }).catch(error => { if (active) setError(caseError(error).message) })
    return () => { active = false; if (element?.open) element.close() }
  }, [caseId])

  const save = async () => {
    if (submitting.current || !candidates || !revision) return
    submitting.current = true
    setSaving(true)
    setError('')
    try {
      await caseApi.saveTaskDelegations(caseId, selectedCaseDelegations(rows), revision)
      onSaved()
    } catch (error) {
      const result = caseError(error)
      setError(result.fields.task_delegations ?? result.message)
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  return <dialog ref={dialog} aria-labelledby="case-delegation-title" className="dc-confirm w-full max-w-[min(34rem,calc(100vw-1.5rem))] rounded-xl border border-tm-border bg-tm-surface-elevated text-tm-text-primary"
    onCancel={event => { event.preventDefault(); if (!submitting.current) onClose() }}>
    <form onSubmit={event => { event.preventDefault(); void save() }}>
      <header className="flex items-center justify-between gap-3 border-b border-tm-border px-5 py-3">
        <h2 id="case-delegation-title" className="text-base font-semibold">担当者の委任設定</h2>
        <Button type="button" size="sm" variant="ghost" disabled={saving} aria-label="閉じる" onClick={onClose} icon={<X size={16}/>}/>
      </header>
      <div className="max-h-[60dvh] overflow-y-auto px-5 pb-4">
        {error && <p className="cm-field-error pt-3" role="alert">{error}</p>}
        {candidates ? <fieldset disabled={saving}><CaseTaskDelegationFields candidates={candidates} rows={rows} onChange={setRows}/></fieldset>
          : !error && <p className="pt-4 text-sm text-tm-text-muted" role="status">読み込み中…</p>}
      </div>
      <footer className="flex justify-end gap-2 border-t border-tm-border px-5 py-3">
        <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>キャンセル</Button>
        <Button type="submit" variant="primary" disabled={saving || !revision}>{saving ? '保存中…' : '保存する'}</Button>
      </footer>
    </form>
  </dialog>
}
