import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Languages, Plus, RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { MetricCard } from '../../components/ui/MetricCard'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { interpretationApi } from './api'
import { interpretationError, interpretationLabels, interpretationModes, interpretationTones, officeDate, workTypes } from './presentation'
import InterpretationDrawer from './InterpretationDrawer'
import type { InterpretationResponse } from './types'
import './interpretation.css'

export type InterpretationPanelProps = { caseId: number; caseLabel: string; clientName: string; onChanged?: () => void }

export default function InterpretationPanel({ caseId, caseLabel, clientName, onChanged }: InterpretationPanelProps) {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<InterpretationResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [drawer, setDrawer] = useState<number | 'new' | null>(null)
  const revision = useRef(0)
  const reload = useCallback(async (signal?: AbortSignal) => {
    const current = ++revision.current
    setLoading(true); setError('')
    try {
      const result = await interpretationApi.list(caseId, page, signal)
      if (current === revision.current && !signal?.aborted) setData(result)
    } catch (failure) {
      if (current === revision.current && !signal?.aborted) { setData(null); setError(interpretationError(failure).message) }
    } finally {
      if (current === revision.current && !signal?.aborted) setLoading(false)
    }
  }, [caseId, page])
  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => { void reload(controller.signal) }, 0)
    // The abort also fences settled continuations; each next load increments its own revision.
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [reload])
  const open = (id: number | 'new') => { setNotice(''); setDrawer(id) }

  return <section className="ip-panel" aria-label="通訳管理">
    <header className="ip-heading">
      <div><h2><Languages size={19} aria-hidden="true" />通訳管理</h2><p>案件に関連する通訳の手配・実績・費用を管理します。</p></div>
      <div className="ip-actions"><Button size="sm" variant="outline" disabled={loading} onClick={() => void reload()} icon={<RefreshCw size={14} />}>再取得</Button>
        {data?.capabilities.can_create && <Button size="sm" variant="primary" onClick={() => open('new')} icon={<Plus size={14} />}>通訳依頼を追加</Button>}</div>
    </header>
    {notice && <p className="ip-success" role="status">{notice}</p>}
    {error && <div className="ip-error" role="alert"><p>{error}</p><Button size="sm" variant="outline" onClick={() => void reload()}>再試行</Button></div>}
    {loading ? <div className="ip-skeleton" role="status" aria-label="通訳依頼を読み込み中"><div /><div /><div /></div> : data && <>
      <div className="ip-metrics" aria-label="通訳依頼の集計">{(['pending', 'arranging', 'confirmed', 'completed'] as const).map(status => <MetricCard key={status} className={`ip-metric is-${status}`} label={interpretationLabels[status]} value={data.statistics[status]} status={interpretationTones[status]}/>)}</div>
      {data.items.length === 0 ? <div className="ip-empty"><Languages size={25} aria-hidden="true"/><h3>通訳依頼はまだありません。</h3><p>この案件の通訳を手配すると、予定と状態が表示されます。</p>{data.capabilities.can_create && <Button size="sm" onClick={() => open('new')}>通訳依頼を追加</Button>}</div>
        : <div className="ip-list" role="list">{data.items.map(item => <article className="ip-row" role="listitem" key={item.id}>
          <div className="ip-row-time"><time dateTime={item.starts_at}>{officeDate(item.starts_at)}</time><span>～ {officeDate(item.ends_at)} JST</span></div>
          <div className="ip-row-main"><strong>{item.language}</strong><span>{workTypes[item.work_type as keyof typeof workTypes] ?? item.work_type}</span></div>
          <div className="ip-row-person"><strong>{item.interpreter?.name ?? '未割当'}</strong><span>{interpretationModes[item.mode as keyof typeof interpretationModes] ?? item.mode}</span></div>
          <StatusBadge size="sm" className="ip-status" variant={interpretationTones[item.status]} dot>{interpretationLabels[item.status]}</StatusBadge>
          <Button size="sm" variant="ghost" icon={<ChevronRight size={14}/>} iconPosition="right" onClick={() => open(item.id)} aria-label={`${item.language}・${officeDate(item.starts_at)}の詳細`}>詳細</Button>
        </article>)}</div>}
      <footer className="ip-pagination"><span>{data.pagination.total}件</span><div className="ip-actions"><Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="前のページ"><ChevronLeft size={14}/></Button><span>{data.pagination.page} / {data.pagination.last_page}</span><Button size="sm" disabled={page >= data.pagination.last_page} onClick={() => setPage(page + 1)} aria-label="次のページ"><ChevronRight size={14}/></Button></div></footer>
    </>}
    {drawer !== null && <InterpretationDrawer key={drawer} caseId={caseId} caseLabel={caseLabel} clientName={clientName} itemId={drawer === 'new' ? undefined : drawer} capabilities={data?.capabilities} onClose={() => setDrawer(null)} onSaved={async message => { setNotice(message); await reload(); onChanged?.() }} />}
  </section>
}
