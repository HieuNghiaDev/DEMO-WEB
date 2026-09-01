import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { caseApi, caseError } from './api'
import { newClientDraft, validateClient } from './helpers'
import { toVietnameseFurigana } from './furigana'
import type { CaseClient, CaseFieldErrors, ClientDraft } from './types'

export default function QuickClientDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (client: CaseClient) => void }) {
  const [draft, setDraft] = useState(newClientDraft)
  const [fields, setFields] = useState<CaseFieldErrors>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const lock = useRef(false)
  const dirtyRef = useRef(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(newClientDraft())
  useEffect(() => { dirtyRef.current = dirty }, [dirty])
  useEffect(() => {
    const origin = document.activeElement as HTMLElement | null
    const element = dialog.current
    element?.showModal()
    element?.querySelector<HTMLInputElement>('input[name=name]')?.focus()
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirtyRef.current || lock.current) event.preventDefault() }
    window.addEventListener('beforeunload', beforeUnload)
    return () => { window.removeEventListener('beforeunload', beforeUnload); element?.close(); if (origin?.isConnected) origin.focus({ preventScroll: true }) }
  }, [])
  const close = () => { if (!lock.current && (!dirty || window.confirm('未保存の依頼者情報を破棄しますか？'))) onClose() }
  const change = (key: keyof ClientDraft, value: string) => setDraft(current => ({ ...current, [key]: value, ...(key === 'name' ? { name_kana: toVietnameseFurigana(value) } : {}) }))
  const showErrors = (errors: CaseFieldErrors) => {
    setFields(errors)
    if (Object.keys(errors).some(key => ['client_type', 'nationality', 'address', 'notes'].includes(key))) setAdvanced(true)
    window.setTimeout(() => dialog.current?.querySelector<HTMLElement>('[aria-invalid=true]')?.focus(), 0)
  }
  const save = async () => {
    if (lock.current) return
    const errors = validateClient(draft)
    if (Object.keys(errors).length) return showErrors(errors)
    lock.current = true; setBusy(true); setError(''); setFields({})
    try { const client = await caseApi.createClient(draft); dirtyRef.current = false; onCreated(client) }
    catch (requestError) { const result = caseError(requestError); setError(result.message); showErrors(result.fields) }
    finally { lock.current = false; setBusy(false) }
  }
  const attrs = (key: keyof ClientDraft) => ({ name: key, 'aria-labelledby': 'quick-label-' + key, 'aria-invalid': !!fields[key], 'aria-describedby': fields[key] ? 'quick-error-' + key : undefined })
  const field = (key: keyof ClientDraft, label: string, control: ReactNode, wide = false) => <label className={wide ? 'cm-wide' : ''}><span id={'quick-label-' + key}>{label}</span>{control}{fields[key] && <span role="alert" id={'quick-error-' + key} className="cm-field-error">{fields[key]}</span>}</label>
  return <dialog ref={dialog} className="dc-confirm cm-client-dialog" aria-labelledby="quick-client-title" onCancel={event => { event.preventDefault(); close() }}>
    <header><div><h2 id="quick-client-title">新規依頼者</h2><p className="dc-meta">登録後、この案件の依頼者として選択します。</p></div><button type="button" className="dc-button" aria-label="閉じる" disabled={busy} onClick={close}><X size={18}/></button></header>
    <form noValidate onSubmit={event => { event.preventDefault(); void save() }}>
      <div className="cm-dialog-body">
        {error && <p className="cm-message" role="alert">{error}</p>}
        <fieldset disabled={busy} className="cm-fields">
          {field('name', '氏名 *', <input {...attrs('name')} required maxLength={255} value={draft.name} onChange={event => change('name', event.target.value)} autoComplete="off"/>, true)}
          {field('name_kana', 'フリガナ', <input {...attrs('name_kana')} maxLength={255} value={draft.name_kana} onChange={event => change('name_kana', event.target.value)}/>, true)}
          {field('phone', '電話番号', <input {...attrs('phone')} type="tel" maxLength={30} value={draft.phone} onChange={event => change('phone', event.target.value)}/>)}
          {field('email', 'メールアドレス', <input {...attrs('email')} type="email" maxLength={255} value={draft.email} onChange={event => change('email', event.target.value)}/>)}
        </fieldset>
        <details className="cm-advanced" open={advanced} onToggle={event => setAdvanced(event.currentTarget.open)}><summary>詳細情報</summary><fieldset disabled={busy} className="cm-fields">
          {field('client_type', '顧客区分', <select {...attrs('client_type')} value={draft.client_type} onChange={event => change('client_type', event.target.value)}><option value="individual">個人</option><option value="corporate">法人</option></select>)}
          {field('nationality', '国籍', <input {...attrs('nationality')} maxLength={50} value={draft.nationality} onChange={event => change('nationality', event.target.value)}/>)}
          {field('address', '住所', <input {...attrs('address')} maxLength={255} value={draft.address} onChange={event => change('address', event.target.value)}/>, true)}
          {field('notes', '備考', <textarea {...attrs('notes')} rows={3} value={draft.notes} onChange={event => change('notes', event.target.value)}/>, true)}
        </fieldset></details>
      </div>
      <footer><p className="dc-meta">依頼者は案件とは別に登録されます。</p><div className="cm-actions"><button type="button" className="dc-button" disabled={busy} onClick={close}>キャンセル</button><button type="submit" className="dc-button dc-primary" disabled={busy}>{busy ? '登録中…' : '登録して選択'}</button></div></footer>
    </form>
  </dialog>
}
