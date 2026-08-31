import { useEffect, useRef, useState } from 'react'
import { Check, LockKeyhole, ShieldAlert, X } from 'lucide-react'
import type { CollectionItem } from './types'
import { approvals, collections, exceptions, necessities, reviews, sufficiencies } from './types'
import { isOverdue, purposeNames } from './mockData'
import ReceivedDocumentsSection from './ReceivedDocumentsSection'

interface Props { item: CollectionItem; onClose: () => void; onSave: (item: CollectionItem) => void }
export default function CollectionDetailDrawer({ item, onClose, onSave }: Props) {
  const [draft, setDraft] = useState(() => structuredClone(item))
  const [overlay, setOverlay] = useState(() => window.innerWidth < 1280)
  const [action, setAction] = useState('')
  const [reason, setReason] = useState('')
  const [feedback, setFeedback] = useState('')
  const panel = useRef<HTMLElement>(null)
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose }, [onClose])
  const dirty = JSON.stringify(draft) !== JSON.stringify(item)
  const update = <K extends keyof CollectionItem>(key: K, value: CollectionItem[K]) => { setDraft(previous => ({ ...previous, [key]: value })); setFeedback('') }

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1279px)')
    const change = () => setOverlay(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  useEffect(() => {
    const origin = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    if (overlay) document.body.style.overflow = 'hidden'
    panel.current?.focus({ preventScroll: true })
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current()
      if (event.key !== 'Tab' || !overlay) return
      const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, textarea, [tabindex="0"]') ?? []).filter(element => element.getClientRects().length)
      const first = controls[0]; const last = controls.at(-1)
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = previousOverflow; if (origin?.isConnected) origin.focus() }
  }, [overlay])

  const save = () => {
    if (draft.necessity !== '未判定' && !draft.decisionReason.trim()) { setFeedback('必要・不要の判断理由を入力してください。'); return }
    if (draft.periodStart && draft.periodEnd && draft.periodEnd < draft.periodStart) { setFeedback('対象期間の終了日は開始日以降にしてください。'); return }
    const timestamp = '2026/08/31 14:00（デモ）'
    const changedDecision = draft.necessity !== item.necessity || draft.decisionReason !== item.decisionReason
    const saved = { ...draft, ...(changedDecision ? { decidedBy: '担当者（デモ操作）', decidedAt: timestamp } : {}), history: [{ id: crypto.randomUUID(), at: timestamp, actor: '担当者（デモ操作）', action: '収集項目を更新', reason: `要否: ${item.necessity} → ${draft.necessity} / 取得: ${item.collection} → ${draft.collection} / 充足: ${item.sufficiency} → ${draft.sufficiency} / 確認: ${item.review} → ${draft.review}。${draft.decisionReason}` }, ...draft.history] }
    onSave(saved); setDraft(saved); setFeedback('デモに反映しました。再読み込みで元に戻ります。')
  }
  const recordAction = () => {
    if (!reason.trim()) { setFeedback('理由・確認事項を入力してください。'); return }
    setDraft(previous => ({ ...previous, ...(action === '差戻し' ? { review: '差戻し' as const } : {}), ...(action === '委任状準備' ? { authorityStatus: '準備中' } : {}), history: [{ id: crypto.randomUUID(), at: '2026/08/31 14:00（デモ）', actor: '担当者（デモ操作）', action: `${action}（DRAFT・未送信）`, reason }, ...previous.history] }))
    setAction(''); setReason(''); setFeedback('下書き・理由を追加しました。下部の「デモに反映」で確定します。')
  }
  return <>
    {overlay && <div className="dc-backdrop" onClick={onClose} aria-hidden="true" />}
    <aside className={`dc-inspector ${overlay ? 'is-overlay' : ''}`} ref={panel} tabIndex={-1} role={overlay ? 'dialog' : 'region'} aria-modal={overlay || undefined} aria-labelledby="dc-inspector-title">
      <header className="dc-inspector-head"><div><span className="dc-code">{draft.code} <span>{draft.origin} · 収集項目</span></span><h2 id="dc-inspector-title">{draft.title}</h2><p>{draft.source || '取得先 未設定'}</p></div><button className="dc-icon-button" aria-label="詳細を閉じる" onClick={onClose}><X size={20} /></button></header>
      <div className="dc-inspector-body">
        <div className="dc-access"><LockKeyhole size={14} />案件担当者のみ <span>権限表示のデモ</span></div>
        {draft.priority === '保全優先' && <div className="dc-priority-note"><ShieldAlert size={18} /><div><strong>保全優先</strong><p>保存期間・上書き予定を確認し、弁護士の承認後に対応。</p></div></div>}
        <section className="dc-detail-section"><h3><span>A</span>基本情報</h3><dl className="dc-facts"><dt>確認目的</dt><dd>{draft.purposes.map(purpose => <span key={purpose}>{purpose} · {purposeNames[purpose]}</span>)}</dd><dt>適用条件</dt><dd>{draft.condition || '条件の記載なし。案件担当者が必要性を判断します。'}</dd><dt>保存ルール</dt><dd>v{draft.version} · 2026/08/31 作成時点<br /><small>official-document-collection-v1<br />マスター更新後も、この案件の条件・版は保持します。</small></dd></dl></section>
        <section className="dc-detail-section"><h3><span>B</span>必要性</h3><div className="dc-necessity" aria-label="取得要否">{necessities.map(value => <button key={value} aria-pressed={draft.necessity === value} className={draft.necessity === value ? 'is-active' : ''} onClick={() => update('necessity', value)}>{draft.necessity === value && <Check size={14} />}{value}</button>)}</div><p className="dc-meta">条件は判断の参考です。候補は自動的に必要になりません。</p><label><span>判断理由 {draft.necessity !== '未判定' && <span className="dc-danger">*</span>}</span><textarea value={draft.decisionReason} onChange={event => update('decisionReason', event.target.value)} placeholder="必要・不要と判断した理由" rows={2} /></label><p className="dc-meta">判断者: {draft.decidedBy || '未判定'} · {draft.decidedAt || '日時未設定'}</p></section>
        <section className="dc-detail-section"><h3><span>C</span>取得条件</h3><div className="dc-form-grid"><label>対象者<input value={draft.target || ''} onChange={event => update('target', event.target.value)} placeholder="未指定" /></label><label>取得先<input value={draft.source || ''} onChange={event => update('source', event.target.value)} placeholder="未設定" /></label><label className="dc-wide">取得方法<input value={draft.method} onChange={event => update('method', event.target.value)} placeholder="本人から回収・機関へ請求など" /></label><label>対象期間・開始<input type="date" value={draft.periodStart} onChange={event => update('periodStart', event.target.value)} /></label><label>対象期間・終了<input type="date" value={draft.periodEnd} onChange={event => update('periodEnd', event.target.value)} /></label><label className="dc-wide">対象範囲<textarea rows={2} value={draft.scope || ''} onChange={event => update('scope', event.target.value)} placeholder="未設定。期間・対象書類の範囲を確認してください。" /></label></div>
          <div className="dc-authority"><h4>事前書類・権限確認</h4><label>確認する書類<input value={draft.prerequisite} onChange={event => update('prerequisite', event.target.value)} placeholder="提出先・手続ごとに確認" /></label><label>権限確認の状態<select value={draft.authorityStatus} onChange={event => update('authorityStatus', event.target.value)}>{['未確認', '準備中', '取得済み', '要確認'].map(value => <option key={value}>{value}</option>)}</select></label><p className="dc-meta">C-002 委任状（民事）は、医療・開示請求用の権限書類を代替しません。宛先・手続・対象期間を個別確認。</p></div>
        </section>
        <section className="dc-detail-section"><h3><span>D</span>担当・期限</h3><div className="dc-form-grid"><label className="dc-wide">担当者<select value={draft.assignee} onChange={event => update('assignee', event.target.value)}>{['未割当', 'LE HIEU NGHIA', '担当弁護士'].map(value => <option key={value}>{value}</option>)}</select></label><label>依頼日<input type="date" value={draft.requested} onChange={event => update('requested', event.target.value)} /></label><label>回答期限<input type="date" value={draft.deadline} onChange={event => update('deadline', event.target.value)} /></label><label className="dc-wide">優先度<select value={draft.priority} onChange={event => update('priority', event.target.value as CollectionItem['priority'])}>{['通常', '優先', '保全優先'].map(value => <option key={value}>{value}</option>)}</select></label></div>{isOverdue(draft) && <p className="dc-danger">期限超過 · 次の対応を確認してください。</p>}</section>
        <section className="dc-detail-section"><h3><span>E</span>状態</h3><div className="dc-form-grid"><label>取得作業<select value={draft.collection} onChange={event => update('collection', event.target.value as CollectionItem['collection'])}>{collections.map(value => <option key={value}>{value}</option>)}</select></label><label>内容充足<select value={draft.sufficiency} onChange={event => update('sufficiency', event.target.value as CollectionItem['sufficiency'])}>{sufficiencies.map(value => <option key={value}>{value}</option>)}</select></label><label>確認<select value={draft.review} onChange={event => update('review', event.target.value as CollectionItem['review'])}>{reviews.map(value => <option key={value}>{value}</option>)}</select></label><label>結果・例外<select value={draft.exception} onChange={event => update('exception', event.target.value as CollectionItem['exception'])}>{exceptions.map(value => <option key={value}>{value}</option>)}</select></label></div><p className="dc-meta">受領済み ≠ 確認済み。不存在・不開示は「不要」とは別に記録します。</p>
          <div className="dc-authority"><h4>外部請求・弁護士承認</h4><label>承認状況（表示シナリオ）<select value={draft.approval} onChange={event => update('approval', event.target.value as CollectionItem['approval'])}>{approvals.map(value => <option key={value}>{value}</option>)}</select></label><p>承認者: {draft.approval === '承認済み' ? '担当弁護士（デモ）' : '—'}</p><p className="dc-meta">承認操作ではありません。外部への送信・提出は、このプレビューでは実行できません。</p></div>
          <div className="dc-action-row">{['依頼文案を作成', '追加依頼', '差戻し', '委任状準備'].map(value => <button key={value} className="dc-button" onClick={() => { setAction(value); setFeedback('') }}>{value}</button>)}</div>
          {action && <div className="dc-inline-editor"><strong>DRAFT · {action}</strong><label>理由・確認事項<textarea value={reason} onChange={event => setReason(event.target.value)} rows={3} placeholder="対象・範囲・不足箇所・依頼理由を入力" /></label><div className="dc-action-row"><button className="dc-button" onClick={recordAction}>下書きとして記録</button><button className="dc-button" onClick={() => setAction('')}>キャンセル</button></div></div>}
        </section>
        <ReceivedDocumentsSection files={draft.files} purposes={draft.purposes} onChange={files => update('files', files)} />
        <section className="dc-detail-section"><h3><span>G</span>履歴</h3><ol className="dc-history">{draft.history.map(entry => <li key={entry.id}><time>{entry.at}</time><strong>{entry.action}</strong><p>{entry.reason}</p><span>{entry.actor}</span></li>)}</ol></section>
      </div>
      <footer className="dc-inspector-footer">{feedback && <p role="status">{feedback}</p>}<div><span className="dc-meta">{dirty ? '未反映の変更あり' : 'デモデータ · 保存先なし'}</span><button className="dc-button" onClick={() => { setDraft(structuredClone(item)); setFeedback('') }} disabled={!dirty}>取消</button><button className="dc-button dc-primary" onClick={save} disabled={!dirty}>デモに反映</button></div></footer>
    </aside>
  </>
}
