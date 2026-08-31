import { useState } from 'react'
import { ArrowLeft, CheckCheck, ClipboardList, FileClock, Files, History, ListChecks, Plus, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import CollectionList, { CollectionToolbar } from './CollectionList'
import CollectionDetailDrawer from './CollectionDetailDrawer'
import { createPreviewItems, emptyFilters, isOverdue, matchesFilters, REVIEW_DATE } from './mockData'
import type { CaseKind, CollectionItem } from './types'
import './documentCollectionMockup.css'

const tabs = [{ label: '概要', icon: ClipboardList }, { label: '資料収集', icon: ListChecks }, { label: 'ファイル', icon: Files }, { label: 'タスク', icon: CheckCheck }, { label: '期限', icon: FileClock }, { label: '履歴', icon: History }]

export default function DocumentCollectionMockupPage() {
  const [caseType, setCaseType] = useState<CaseKind>('労災')
  const [items, setItems] = useState(() => createPreviewItems('労災'))
  const [stage, setStage] = useState('populated')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filters, setFilters] = useState({ ...emptyFilters })
  const [tab, setTab] = useState('資料収集')
  const [notice, setNotice] = useState('')
  const candidateCount = caseType === '労災' ? 55 : 48
  const selected = items.find(item => item.id === selectedId)
  const filtered = items.filter(item => matchesFilters(item, filters))
  const changeScenario = (kind: CaseKind, mode: string) => {
    setCaseType(kind); setStage(mode); setSelectedId(null); setFilters({ ...emptyFilters }); setNotice('')
    setItems(mode === 'empty' ? [] : createPreviewItems(kind, mode === 'populated'))
  }
  const save = (item: CollectionItem) => setItems(previous => previous.map(row => row.id === item.id ? item : row))

  return <div className="dc-preview">
    <div className="dc-review-bar"><span><b>DESIGN PREVIEW</b> データ・操作はすべてデモ</span><div><label>事件類型<select value={caseType} onChange={event => changeScenario(event.target.value as CaseKind, stage)}><option>労災</option><option>交通事故</option></select></label><label>表示シナリオ<select value={stage} onChange={event => changeScenario(caseType, event.target.value)}><option value="populated">対応中の案件</option><option value="empty">リスト未作成</option><option value="fresh">作成直後・全件未判定</option></select></label></div></div>
    <header className="dc-case-header">
      <div className="dc-breadcrumb"><Link to="/quests"><ArrowLeft size={14} />案件管理</Link><span>/</span><span>TH-2026-001</span></div>
      <div className="dc-case-title"><div><h1>NGUYEN VAN A</h1><span className="dc-case-kind">{caseType}</span></div><dl><div><dt>担当者</dt><dd>LE HIEU NGHIA</dd></div><div><dt>案件状態</dt><dd><span className="dc-status-dot" />対応中</dd></div></dl></div>
    </header>
    <nav className="dc-tabs" aria-label="案件詳細のセクション">{tabs.map(({ label, icon: Icon }) => <button key={label} aria-current={tab === label ? 'page' : undefined} className={tab === label ? 'is-active' : ''} onClick={() => { setTab(label); setSelectedId(null) }}><Icon size={17} />{label}</button>)}</nav>
    {tab !== '資料収集' ? <section className="dc-empty-results"><h2>{tab}</h2><p>このレビューでは「資料収集」の画面・操作をご確認ください。</p><button className="dc-button dc-primary" onClick={() => setTab('資料収集')}>資料収集に戻る</button></section> : <>
      <div className="dc-collection-heading"><div><h2>資料収集</h2><p>必要性の判断から取得・確認まで、資料ごとに管理</p></div><span className="dc-meta">デモ基準日 {REVIEW_DATE.replaceAll('-', '/')}</span></div>
      {stage === 'empty' ? <section className="dc-uninitialized"><ClipboardList size={30} /><h3>資料収集リストはまだ作成されていません。</h3><p>事件類型 <strong>{caseType}</strong><span>候補資料 <strong>{candidateCount}件</strong></span></p><p>事件類型に基づく候補を作成します。<br />候補は自動的に「必要」にはなりません。外部への連絡も行いません。</p><button className="dc-button dc-primary" onClick={() => changeScenario(caseType, 'fresh')}><Plus size={17} />資料収集リストを作成</button><small>画面内のデモ操作のみ。生成APIは呼び出しません。</small></section> : <>
        <div className="dc-summary" aria-label="資料収集サマリー"><span>候補 <b>{candidateCount}</b><small>件</small></span>{items.some(item => item.origin === '案件で追加') && <span>別取得先の追加 <b>{items.filter(item => item.origin === '案件で追加').length}</b></span>}<i />{['必要', '不要', '未判定'].map(value => <span key={value}>{value} <b>{items.filter(item => item.necessity === value).length}</b></span>)}<i /><button className="dc-danger" onClick={() => setFilters({ ...emptyFilters, quick: '期限超過' })}>期限超過 <b>{items.filter(isOverdue).length}</b></button><button className="dc-warning" onClick={() => setFilters({ ...emptyFilters, quick: '保全優先' })}><ShieldAlert size={14} />保全優先 <b>{items.filter(item => item.priority === '保全優先').length}</b></button></div>
        {caseType === '交通事故' && <p className="dc-context-note">業務・通勤中の事故では W-301〜W-304 も確認候補です。適用条件は担当者が判断し、共通資料は重複して作成しません。</p>}
        <div className={`dc-workspace ${selected ? 'has-inspector' : ''}`}>
          <div className="dc-master"><CollectionToolbar items={items} filters={filters} onChange={setFilters} /><div className="dc-list-caption"><span>確認目的別 <strong>{filtered.length}</strong> / {items.length}件</span><span>複数目的の資料は1行に集約</span></div><CollectionList items={filtered} selectedId={selectedId} onSelect={id => { setSelectedId(id); setNotice('') }} /><div className="dc-list-footer">必要性・取得作業・内容充足・確認は、それぞれ独立して管理します。</div></div>
          {selected && <CollectionDetailDrawer key={selected.id} item={selected} onSave={save} onClose={() => { setSelectedId(null); setNotice('詳細を閉じました。反映前の変更は保存されません。') }} />}
        </div>
        {notice && <p className="dc-meta" role="status">{notice}</p>}
      </>}
    </>}
  </div>
}
