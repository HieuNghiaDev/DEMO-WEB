import { ArrowLeft, Bell, CheckCheck, ChevronRight, ClipboardList, MessageCircle, ShieldCheck, X } from 'lucide-react'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { notificationCategory, type MyTask, type Notice, type NotificationFeed } from './notificationCenterState'

const filters = { all: 'すべて', task: 'タスク', approval: '承認', chat: 'チャット' } as const
const taskStatuses: Record<string, string> = {
  pending: '未着手', unaccepted: '未着手', accepted: '受領済み', in_progress: '対応中',
  pending_review: '確認待ち', changes_requested: '差し戻し', completed: '完了', cancelled: 'キャンセル',
}
const priority: Record<string, string> = { high: '高', critical: '高', normal: '中', low: '低' }
const actionNames = { accepted: '受領する', in_progress: '対応を開始', completed: '完了にする' } as const
type TaskAction = keyof typeof actionNames
const dateFormat = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const formatDate = (value: string) => Number.isNaN(Date.parse(value)) ? '' : dateFormat.format(new Date(value))
const buttonStyle = 'rounded-md px-2 py-1.5 text-xs font-semibold text-[var(--tm-text-secondary)] hover:bg-slate-500/10 focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-50'
const rowStyle = 'flex w-full min-w-0 items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left hover:bg-slate-500/10 focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-60'

type Props = {
  anchor: HTMLButtonElement
  attachPanel: (element: HTMLElement | null) => void
  feed: NotificationFeed
  unread: number
  chatUnread: number
  error: string
  loading: boolean
  working: boolean
  task: MyTask | null
  tasksPage: number | null
  canUpdateTask: boolean
  onClose: () => void
  onNotice: (notice: Notice) => void
  onTask: (task: MyTask) => void
  onChat: () => void
  onRefresh: () => void
  onMore: () => void
  onTasksPage: (page: number | null) => void
  onBack: () => void
  onRelatedCase: (task: MyTask) => void
  onMarkAll: () => void
  onTaskAction: (status: TaskAction) => void
}

function TaskStatus({ item }: { item: MyTask }) {
  return <span className={item.attention === 0 ? 'text-rose-600 dark:text-rose-300'
    : item.attention === 1 ? 'text-amber-700 dark:text-amber-300' : 'text-[var(--tm-text-secondary)]'}>
    {item.attention === 0 ? '期限超過' : item.attention === 1 ? '期限間近' : taskStatuses[item.status] ?? item.status}
  </span>
}

function FeedRow({ title, description, time, icon, unread, disabled, onClick }: {
  title: string; description: string; time?: string; icon: ReactNode; unread: boolean; disabled?: boolean; onClick: () => void
}) {
  return <button type="button" onClick={onClick} disabled={disabled} className={rowStyle + (unread ? ' bg-indigo-500/8' : '')}>
    <span aria-hidden="true" className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">{icon}</span>
    <span className="min-w-0 flex-1">
      <span className="flex items-start gap-2">
        <span className="min-w-0 flex-1 break-words text-xs font-bold">{title}</span>
        {time && <span className="shrink-0 whitespace-nowrap text-[10px] text-[var(--tm-text-secondary)]">{time}</span>}
        {unread && <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-indigo-500"><span className="sr-only">未読</span></span>}
      </span>
      {description && <span className="mt-1 block line-clamp-2 break-words text-xs text-[var(--tm-text-secondary)]">{description}</span>}
    </span>
  </button>
}

export default function NotificationPopover({ attachPanel, anchor, ...p }: Props) {
  const [filter, setFilter] = useState<keyof typeof filters>('all')
  const [position, setPosition] = useState({ left: 12, top: 64 })
  useEffect(() => {
    const measure = () => {
      const rect = anchor.getBoundingClientRect()
      const width = Math.min(416, window.innerWidth - 24)
      setPosition({
        left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)),
        top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 230)),
      })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [anchor])

  const notices = (p.feed.notifications ?? []).filter(notice => filter === 'all' || notificationCategory(notice) === filter)
  const showTasks = p.tasksPage !== null || filter === 'all' || filter === 'task'
  const showChat = p.chatUnread > 0 && (filter === 'all' || filter === 'chat')
  const taskAction: TaskAction | null = p.task?.domain !== 'employee' ? null
    : p.task.status === 'pending' ? 'accepted' : p.task.status === 'accepted' ? 'in_progress'
      : p.task.status === 'in_progress' ? 'completed' : null

  return <section ref={attachPanel} role="dialog" aria-label="通知" tabIndex={-1}
    style={{ '--notice-left': position.left + 'px', '--notice-top': position.top + 'px' } as CSSProperties}
    className="fixed inset-x-2 top-[calc(3.75rem+env(safe-area-inset-top))] z-[90] flex max-h-[calc(100dvh-5rem-env(safe-area-inset-top))] flex-col overflow-hidden rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface)] text-[var(--tm-text-primary)] shadow-xl outline-none sm:inset-x-auto sm:left-[var(--notice-left)] sm:top-[var(--notice-top)] sm:max-h-[min(70dvh,calc(100dvh-var(--notice-top)-.75rem))] sm:w-[min(26rem,calc(100vw-1.5rem))]">
    <header className="flex shrink-0 items-center gap-2 border-b border-[var(--tm-border)] px-3 py-2.5">
      {(p.task || p.tasksPage !== null) && <button type="button" aria-label="戻る" className={buttonStyle} onClick={p.task ? p.onBack : () => p.onTasksPage(null)}><ArrowLeft size={16} /></button>}
      <h2 className="min-w-0 flex-1 text-sm font-bold">{p.task ? 'タスク詳細' : p.tasksPage !== null ? 'マイタスク' : '通知'}</h2>
      {!p.task && p.tasksPage === null && <>
        <span className="text-xs text-[var(--tm-text-secondary)]">未読 {p.unread}</span>
        <button type="button" className={buttonStyle + ' inline-flex items-center gap-1'} title="チャットの未読はチャット内で更新されます"
          onClick={p.onMarkAll} disabled={!p.feed.unread_count || p.working}><CheckCheck size={14} aria-hidden="true" />すべて既読</button>
      </>}
      <button type="button" className={buttonStyle} onClick={p.onClose} aria-label="通知を閉じる"><X size={17} /></button>
    </header>
    {!p.task && p.tasksPage === null && <div role="group" aria-label="通知の種類" className="flex shrink-0 gap-1 border-b border-[var(--tm-border)] px-3 py-2">
      {Object.entries(filters).map(([id, label]) => <button type="button" key={id} aria-pressed={id === filter}
        onClick={() => setFilter(id as keyof typeof filters)} className={buttonStyle + (id === filter ? ' bg-indigo-500/12 text-indigo-700 dark:text-indigo-200' : '')}>{label}</button>)}
    </div>}
    <div className="min-h-0 overflow-y-auto overscroll-contain p-2.5" aria-busy={p.loading}>
      {p.error && <div role="alert" className="mb-2 flex items-center justify-between gap-2 rounded-md border border-rose-500/25 bg-rose-500/8 p-2 text-xs text-rose-700 dark:text-rose-300">
        {p.error}<button type="button" className={buttonStyle + ' shrink-0'} onClick={p.onRefresh}>再試行</button>
      </div>}
      {p.task ? <div className="space-y-3 p-2">
        <h3 className="break-words text-sm font-bold">{p.task.title}</h3>
        <p className="flex flex-wrap gap-2 text-xs"><TaskStatus item={p.task} />{p.task.due_at && <span>期限：{formatDate(p.task.due_at)}</span>}</p>
        {p.task.description && <p className="whitespace-pre-wrap break-words text-xs text-[var(--tm-text-secondary)]">{p.task.description}</p>}
        {p.canUpdateTask && taskAction && <button type="button" disabled={p.working} onClick={() => p.onTaskAction(taskAction)} className="rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{actionNames[taskAction]}</button>}
        {p.task.case_id && <button type="button" className={buttonStyle} onClick={() => p.onRelatedCase(p.task!)}>関連案件を開く</button>}
      </div> : <>
        {showTasks && p.feed.my_tasks_summary && <section aria-label="マイタスク" className="mb-2 border-b border-[var(--tm-border)] pb-2">
          <div className="flex items-center justify-between gap-2 px-2">
            <h3 className="text-xs font-bold">マイタスク</h3>
            {p.tasksPage === null && <button type="button" onClick={() => p.onTasksPage(1)} className={buttonStyle + ' inline-flex items-center gap-1'}>すべてのタスクを見る <ChevronRight size={13} /></button>}
          </div>
          {p.feed.my_tasks_summary.items.map(item => <button type="button" key={item.domain + ':' + item.id} className={rowStyle + ' items-center'} onClick={() => p.onTask(item)}>
            <ClipboardList size={15} className="shrink-0 text-indigo-600 dark:text-indigo-300" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold">{item.title}</span>
              <span className="mt-0.5 block text-[10px] text-[var(--tm-text-secondary)]">{[item.due_at ? '期限：' + formatDate(item.due_at) : '', item.priority && priority[item.priority] ? '優先度：' + priority[item.priority] : ''].filter(Boolean).join(' ・ ')}</span>
            </span>
            <span className="shrink-0 text-[10px] font-semibold"><TaskStatus item={item} /></span>
            <ChevronRight size={13} className="shrink-0 text-[var(--tm-text-secondary)]" aria-hidden="true" />
          </button>)}
          {p.feed.my_tasks_summary.items.length === 0 && <p className="px-2 py-2 text-xs text-[var(--tm-text-secondary)]">対応が必要なタスクはありません。</p>}
          {p.tasksPage !== null && <div className="flex items-center justify-between px-2 pt-2 text-xs">
            <button type="button" className={buttonStyle} disabled={p.loading || p.tasksPage <= 1} onClick={() => p.onTasksPage(p.tasksPage! - 1)}>前へ</button>
            <span>{p.tasksPage} ページ</span>
            <button type="button" className={buttonStyle} disabled={p.loading || !p.feed.my_tasks_summary.has_more} onClick={() => p.onTasksPage(p.tasksPage! + 1)}>次へ</button>
          </div>}
        </section>}
        {p.tasksPage === null && <>
          {showChat && <FeedRow title="社内チャット" description={p.chatUnread + '件の未読メッセージ'} icon={<MessageCircle size={15} />} unread onClick={p.onChat} />}
          {notices.map(notice => {
            const kind = notificationCategory(notice)
            const Icon = kind === 'approval' ? ShieldCheck : kind === 'task' ? ClipboardList : Bell
            return <FeedRow key={notice.id} title={notice.title} description={notice.message} time={formatDate(notice.created_at)}
              icon={<Icon size={15} />} unread={!notice.read_at} disabled={p.working} onClick={() => p.onNotice(notice)} />
          })}
          {!p.loading && !p.error && !showChat && notices.length === 0 && <p className="p-3 text-center text-xs text-[var(--tm-text-secondary)]">表示する通知はありません。</p>}
          {p.feed.next_before_id && filter !== 'chat' && <button type="button" className={buttonStyle + ' mt-1 w-full'} onClick={p.onMore} disabled={p.loading}>さらに表示</button>}
        </>}
      </>}
      {p.loading && <p role="status" className="p-2 text-center text-xs text-[var(--tm-text-secondary)]">読み込み中…</p>}
    </div>
  </section>
}
