import { CalendarDays, CircleDot, Clock3, FileText, Info, Pencil, Target, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { UserAvatar } from '../../../components/ui/UserAvatar'
import { collectionLabels, fulfillmentLabels, necessityLabels } from '../labels'
import type { CollectionDetail } from '../types'
import { formatDate } from '../utils'
import type { RequiredWorkflowPresentation } from '../requiredWorkflowPresentation'
import RequiredWorkflowBadge from './RequiredWorkflowBadge'

export default function RequiredDocumentBasicInfo({ detail, title, code, method, status, creator, createdAt, assigneeImage, onChangeNecessity, onEditTask, onEditAcquisition, onChangeCollection, onChangeFulfillment }: {
  detail?: CollectionDetail; title: string; code: string; method: string
  status: RequiredWorkflowPresentation; creator?: { id?: number | string; name: string; imageSrc?: string | null } | null
  createdAt?: string | null; assigneeImage?: string | null
  onChangeNecessity?: () => void; onEditTask?: () => void
  onEditAcquisition?: () => void; onChangeCollection?: () => void; onChangeFulfillment?: () => void
}) {
  const task = detail?.active_task
  const employee = task?.assigned_employee ?? detail?.assigned_employee
  const deadline = task ? task.due_at : detail?.collection.response_deadline
  const [referenceTime] = useState(Date.now)
  const due = deadline ? new Date(deadline).getTime() - referenceTime : null
  const dueTone = task?.is_overdue ? 'is-overdue' : task?.status === 'completed' || task?.status === 'cancelled' || due === null || due < 0 ? '' : due < 7 * 86400000 ? 'is-due-soon' : ''
  const necessity = detail?.necessity.status
  return <section className="dc-required-drawer-card is-basic">
    <header><div className="dc-required-section-title"><span><Info size={17}/></span><h3>基本情報</h3></div>{onChangeNecessity && <button type="button" className="dc-required-outline-action" onClick={onChangeNecessity}><Pencil size={14}/>必要性を変更</button>}</header>
    <div className="dc-required-info-columns">
      <dl className="dc-required-info-list">
        <InfoRow icon={<FileText/>} label="資料コード" value={code}/>
        <InfoRow icon={<FileText/>} label="資料名" value={title}/>
        <InfoRow icon={<FileText/>} label="取得方法" value={<span className="dc-required-accent-value">{method}</span>} action={onEditAcquisition && <button type="button" onClick={onEditAcquisition} aria-label="取得情報を編集">編集</button>}/>
        <InfoRow icon={<Target/>} label="必要性" value={necessity ? <span className={`dc-required-info-pill ${necessity === 'required' ? 'is-required' : ''}`}><i/>{necessityLabels[necessity]}</span> : '—'}/>
        <InfoRow icon={<CircleDot/>} label="取得状況" value={<RequiredWorkflowBadge status={status.key}/>}/>
      </dl>
      <dl className="dc-required-info-list">
        <InfoRow icon={<UserRound/>} label="担当者" value={employee ? <span className="dc-required-person"><UserAvatar name={employee.display_name} stableKey={employee.id} imageSrc={assigneeImage} size="sm" shape="circle"/><span title={employee.display_name}>{employee.display_name}</span></span> : <span className="dc-required-muted-value">未割当</span>} action={onEditTask && <button type="button" onClick={onEditTask}>変更</button>}/>
        <InfoRow icon={<CalendarDays/>} label="回答期限" tone={dueTone} value={formatDate(deadline ?? null)} action={onEditTask && <button type="button" onClick={onEditTask}>期限を設定</button>}/>
        <InfoRow icon={<CalendarDays/>} label="作成日時" value={formatDate(createdAt ?? detail?.created_at ?? null, true)}/>
        <InfoRow icon={<Clock3/>} label="最終更新" value={formatDate(detail?.updated_at ?? null, true)}/>
        <InfoRow icon={<UserRound/>} label="作成者" value={creator ? <span className="dc-required-person"><UserAvatar name={creator.name} stableKey={creator.id ?? creator.name} imageSrc={creator.imageSrc} size="sm" shape="circle"/><span title={creator.name}>{creator.name}</span></span> : '—'}/>
      </dl>
    </div>
    {detail && <details className="dc-required-acquisition-details">
      <summary>取得先・対象などの詳細</summary>
      <dl className="dc-required-info-list">
        {detail.collection.source && <InfoRow icon={<FileText/>} label="取得先" value={detail.collection.source}/>}
        {detail.collection.method && <InfoRow icon={<FileText/>} label="取得方法詳細" value={detail.collection.method}/>}
        {detail.collection.target_person && <InfoRow icon={<UserRound/>} label="対象者" value={detail.collection.target_person}/>}
        {(detail.collection.target_period_from || detail.collection.target_period_to) && <InfoRow icon={<CalendarDays/>} label="対象期間" value={`${formatDate(detail.collection.target_period_from)} ～ ${formatDate(detail.collection.target_period_to)}`}/>}
        {detail.collection.target_scope && <InfoRow icon={<Target/>} label="対象範囲" value={detail.collection.target_scope}/>}
        <InfoRow icon={<CircleDot/>} label="収集状況" value={collectionLabels[detail.collection.status]} action={onChangeCollection && <button type="button" onClick={onChangeCollection}>変更</button>}/>
        <InfoRow icon={<Target/>} label="内容充足" value={fulfillmentLabels[detail.fulfillment_status]} action={onChangeFulfillment && <button type="button" onClick={onChangeFulfillment}>判定</button>}/>
      </dl>
    </details>}
  </section>
}

function InfoRow({ icon, label, value, tone = '', action }: { icon: ReactNode; label: string; value: ReactNode; tone?: string; action?: ReactNode }) {
  return <div className={`dc-required-info-row ${tone} ${action ? 'has-action' : ''}`.trim()}><span className="dc-required-info-icon" aria-hidden="true">{icon}</span><dt>{label}</dt><dd>{value}</dd>{action && <span className="dc-required-info-action">{action}</span>}</div>
}
