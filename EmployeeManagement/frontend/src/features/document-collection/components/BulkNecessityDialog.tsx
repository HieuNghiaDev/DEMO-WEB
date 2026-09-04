import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { NecessityStatus } from '../types'

export type BulkNecessityAction = Exclude<NecessityStatus, 'undetermined'> | 'undetermined'

const actionLabels: Record<BulkNecessityAction, string> = {
  required: '必要にする',
  not_required: '不要にする',
  undetermined: '未判定に戻す',
}

export default function BulkNecessityDialog({ action, count, busy, error, onClose, onConfirm }: {
  action: BulkNecessityAction; count: number; busy: boolean; error: string | null
  onClose: () => void; onConfirm: (reason?: string) => void
}) {
  const [reasonType, setReasonType] = useState('')
  const [detail, setDetail] = useState('')
  const isNotRequired = action === 'not_required'
  const reason = reasonType === 'その他'
    ? detail.trim()
    : [reasonType, detail.trim()].filter(Boolean).join('：')
  const canConfirm = !busy && (!isNotRequired || reason !== '')

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [busy, onClose])

  return <div className="dc-bulk-dialog-backdrop" role="presentation" onMouseDown={event => {
    if (event.target === event.currentTarget && !busy) onClose()
  }}>
    <section className="dc-bulk-dialog" role="dialog" aria-modal="true" aria-busy={busy} aria-labelledby="bulk-necessity-title">
      <header className="dc-bulk-dialog-head">
        <div>
          <span className="dc-dialog-pretitle">選択資料の一括変更</span>
          <h3 id="bulk-necessity-title">{count}件を{actionLabels[action]}</h3>
          <p>{isNotRequired ? '不要と判断した理由を選択してください。' : `選択した資料の必要性を「${action === 'required' ? '必要' : '未判定'}」に変更します。`}</p>
        </div>
        <button type="button" className="dc-bulk-dialog-close" aria-label="閉じる" disabled={busy} onClick={onClose}><X size={16} /></button>
      </header>
      <div className="dc-bulk-dialog-body">
        {isNotRequired && <>
          <fieldset className="dc-bulk-reason-options" aria-describedby="bulk-reason-help">
            <legend>不要にする理由 <span>必須</span></legend>
            {['本件では使用しない', '他の資料で代替できる', '適用条件に該当しない', 'その他'].map((option, index) => <label key={option} className={reasonType === option ? 'is-selected' : ''}><input autoFocus={index === 0} type="radio" name="bulk-necessity-reason" value={option} checked={reasonType === option} onChange={event => setReasonType(event.target.value)} /><span>{option}</span></label>)}
          </fieldset>
          <p id="bulk-reason-help" className="dc-bulk-help">理由は変更履歴の確認に使用します。</p>
          <label className="dc-bulk-detail" htmlFor="bulk-necessity-detail"><span>詳細理由 <small>{reasonType === 'その他' ? '必須' : '任意'}</small></span><textarea id="bulk-necessity-detail" value={detail} maxLength={5000} required={reasonType === 'その他'} aria-required={reasonType === 'その他'} onChange={event => setDetail(event.target.value)} placeholder={reasonType === 'その他' ? '具体的な理由を入力' : '補足がある場合のみ入力'} /></label>
        </>}
        {error && <p className="dc-form-error" role="alert">{error}</p>}
      </div>
      <footer className="dc-bulk-dialog-foot">
        <p className="dc-bulk-target-summary"><span>対象資料</span><strong>{count}件</strong></p>
        <div className="dc-bulk-foot-actions">
          <button type="button" className="dc-button dc-dialog-cancel" disabled={busy} onClick={onClose}>キャンセル</button>
          <button type="button" autoFocus={!isNotRequired} className={`dc-button ${action === 'not_required' ? 'dc-btn-not-required' : 'dc-primary'}`} disabled={!canConfirm} onClick={() => onConfirm(isNotRequired ? reason : undefined)}>{busy ? '変更中…' : actionLabels[action]}</button>
        </div>
      </footer>
    </section>
  </div>
}
