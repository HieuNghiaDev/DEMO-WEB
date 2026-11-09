import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useInternalChat } from '../../features/internal-chat/useInternalChat'
import api from '../../services/api'
import NotificationPopover from './NotificationPopover'
import { NotificationCenterContext, notificationDestination, notificationUnreadCount, type MyTask, type Notice, type NotificationFeed } from './notificationCenterState'

export default function NotificationCenter({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return user ? <NotificationSession key={user.id}>{children}</NotificationSession> : children
}

function NotificationSession({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { unreadCount: chatUnread, setDrawerOpen, openMessage } = useInternalChat()
  const navigate = useNavigate()
  const location = useLocation()
  const [opening, setOpening] = useState<{ anchor: HTMLButtonElement; route: string } | null>(null)
  const anchor = opening?.route === location.key ? opening.anchor : null
  const [feed, setFeed] = useState<NotificationFeed>({ unread_count: 0 })
  const [tasksPage, setTasksPage] = useState<number | null>(null)
  const [task, setTask] = useState<MyTask | null>(null)
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  const mutation = useRef<AbortController | null>(null)
  const panel = useRef<HTMLElement | null>(null)
  const attachPanel = useCallback((element: HTMLElement | null) => { panel.current = element }, [])

  const load = useCallback(async (details = false, before?: number, page?: number) => {
    if (!details && request.current) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    if (details) { setLoading(true); setError('') }
    try {
      const { data } = await api.get<NotificationFeed>('/notifications/center', {
        params: { details: details ? 1 : 0, before_id: before, tasks_page: page }, signal: controller.signal,
      })
      if (controller.signal.aborted) return
      setFeed(current => ({
        ...current, ...data,
        ...(before ? { notifications: [...(current.notifications ?? []), ...(data.notifications ?? [])] } : {}),
      }))
      if (details) setTasksPage(page ?? null)
    } catch {
      if (details && !controller.signal.aborted) setError('通知を読み込めませんでした。')
    } finally {
      if (request.current === controller) {
        request.current = null
        if (details) setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void load() }
    const initial = window.setTimeout(refresh, 0)
    const interval = window.setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refresh)
      request.current?.abort()
      request.current = null
      mutation.current?.abort()
    }
  }, [load])

  const close = useCallback((restoreFocus = false) => {
    if (restoreFocus) anchor?.focus()
    setOpening(null)
  }, [anchor])

  useEffect(() => {
    if (!anchor) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(true) }
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (!anchor.contains(target) && !panel.current?.contains(target)) close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    panel.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [anchor, close])

  const toggle = (button: HTMLButtonElement) => {
    if (anchor) { close(true); return }
    setOpening({ anchor: button, route: location.key })
    setTask(null)
    setTasksPage(null)
    void load(true)
  }

  const run = async (action: (signal: AbortSignal) => Promise<void>) => {
    if (mutation.current) return
    const controller = new AbortController()
    mutation.current = controller
    setWorking(true)
    setError('')
    try {
      await action(controller.signal)
    } catch {
      if (!controller.signal.aborted) setError('操作を完了できませんでした。もう一度お試しください。')
    } finally {
      mutation.current = null
      if (!controller.signal.aborted) setWorking(false)
    }
  }

  const openNotice = (notice: Notice) => void run(async signal => {
    if (!notice.read_at) {
      const { data } = await api.patch<{ notification: Notice }>(`/notifications/${notice.id}/read`, undefined, { signal })
      if (signal.aborted) return
      setFeed(current => ({ ...current, notifications: current.notifications?.map(item => item.id === notice.id ? data.notification : item) }))
      void load(true)
    }
    const target = notificationDestination(notice)
    if (target.chatMessage) {
      openChat()
      openMessage(target.chatMessage)
    } else if (target.employeeTask) {
      const { data } = await api.get<{ task: MyTask }>(`/my/tasks/${target.employeeTask}`, { signal })
      if (!signal.aborted) setTask({ ...data.task, domain: 'employee' })
    } else if (target.path) {
      close()
      navigate(target.path, { state: target.state })
    }
  })

  const openTask = (item: MyTask) => {
    if (item.case_id && item.domain === 'case') {
      close()
      navigate(`/quests/${item.case_id}`, { state: { workspaceTab: 'tasks', taskId: item.id } })
    } else {
      setTask(item)
    }
  }

  const openChat = () => {
    close()
    if (location.pathname === '/') document.querySelector('.internal-chat-panel--embedded')?.scrollIntoView({ block: 'center' })
    else setDrawerOpen(true)
  }

  const unread = notificationUnreadCount(feed.unread_count, chatUnread)
  return (
    <NotificationCenterContext.Provider value={{ unread, anchor: anchor, toggle }}>
      {children}
      {anchor && createPortal(
        <NotificationPopover anchor={anchor} attachPanel={attachPanel} feed={feed} unread={unread} chatUnread={chatUnread}
          error={error} loading={loading} working={working} task={task} tasksPage={tasksPage}
          canUpdateTask={user?.permission_names.includes('task.update') ?? false}
          onClose={() => close(true)} onNotice={openNotice} onTask={openTask} onChat={openChat}
          onRefresh={() => void load(true, undefined, tasksPage ?? undefined)}
          onMore={() => { if (feed.next_before_id) void load(true, feed.next_before_id) }}
          onTasksPage={page => void load(true, undefined, page ?? undefined)}
          onBack={() => setTask(null)}
          onRelatedCase={item => {
            if (!item.case_id) return
            close()
            navigate(`/quests/${item.case_id}`, { state: item.case_document_id
              ? { workspaceTab: 'collection', collectionItemId: item.case_document_id } : undefined })
          }}
          onMarkAll={() => void run(async signal => {
            await api.patch('/notifications/read-all', undefined, { signal })
            if (!signal.aborted) await load(true, undefined, tasksPage ?? undefined)
          })}
          onTaskAction={status => void run(async signal => {
            if (!task) return
            const { data } = await api.patch<{ task: MyTask }>(
              status === 'accepted' ? `/tasks/${task.id}/accept` : `/tasks/${task.id}/status`,
              status === 'accepted' ? undefined : { status }, { signal },
            )
            if (signal.aborted) return
            setTask({ ...task, ...data.task })
            await load(true, undefined, tasksPage ?? undefined)
          })}
        />, document.body,
      )}
    </NotificationCenterContext.Provider>
  )
}
