import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import type { CaseClient } from './types'

export default function ClientSelector({ clients, value, error, onChange, onCreate }: {
  clients: CaseClient[]; value: string; error?: string; onChange: (id: string) => void; onCreate?: () => void
}) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const selected = clients.find(client => String(client.id) === value)
  const matches = clients.filter(client => [client.name, client.name_kana, client.phone, client.email].some(text => text?.toLowerCase().includes(search.trim().toLowerCase())))
  return <div className="cm-client-selector">
    <div className="cm-client-search-row">
      <div onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
        <label htmlFor="case-client-search">依頼者 *</label>
        <div className="cm-search-control"><Search size={16} aria-hidden="true"/>
          <input id="case-client-search" name="client_id" type="search" aria-invalid={!!error} aria-describedby={error ? 'client-selection-error' : undefined}
            aria-expanded={open} aria-controls="client-search-results" value={search}
            onFocus={() => setOpen(true)} onChange={event => { setSearch(event.target.value); setOpen(true) }}
            onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false) } }}
            placeholder="氏名・フリガナ・電話・メールで検索"/>
        </div>
        {open && <div id="client-search-results" className="cm-client-results" aria-label="依頼者の検索結果">
          {matches.slice(0, 20).map(client => <button type="button" key={client.id} aria-pressed={String(client.id) === value}
            onClick={() => { onChange(String(client.id)); setSearch(''); setOpen(false) }}>
            <strong>{client.name}</strong><span>{[client.phone, client.email, client.name_kana].filter(Boolean).join(' · ')}</span>
          </button>)}
          {!matches.length && <p className="dc-meta cm-no-results">該当する依頼者はいません。新規依頼者を登録できます。</p>}
          {matches.length > 20 && <p className="dc-meta cm-no-results">先頭20件を表示。検索語で絞り込んでください。</p>}
        </div>}
      </div>
      {onCreate && <button type="button" className="dc-button" onClick={onCreate}><Plus size={15}/>新規依頼者</button>}
    </div>
    {error && <p role="alert" id="client-selection-error" className="cm-field-error">{error}</p>}
    {selected && <div className="cm-selected-client" aria-label="選択した依頼者">
      <strong>{selected.name}</strong><p>{[selected.phone, selected.email].filter(Boolean).join(' · ') || '連絡先未登録'}</p>
      <details><summary>依頼者の詳細</summary><dl className="cm-client-info">
        <dt>フリガナ</dt><dd>{selected.name_kana || '未登録'}</dd><dt>国籍</dt><dd>{selected.nationality || '未登録'}</dd>
        <dt>住所</dt><dd>{selected.address || '未登録'}</dd><dt>メモ</dt><dd>{selected.notes || '—'}</dd>
      </dl></details>
    </div>}
  </div>
}
