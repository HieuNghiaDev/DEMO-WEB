import { createContext } from 'react'

export type Notice = {
  id: number
  kind: string
  title: string
  message: string
  created_at: string
  read_at: string | null
  assigned_task_id: number | null
  approval_id: number | null
  case_task_id: number | null
  case_document_id: number | null
  target_path: string | null
  chat_message_id?: number | null
}

export type MyTask = {
  domain: 'employee' | 'case'
  id: number
  title: string
  description: string | null
  status: string
  due_at: string | null
  case_id: number | null
  case_document_id?: number | null
  priority: string | null
  attention: number
}

export type NotificationFeed = {
  unread_count: number
  notifications?: Notice[]
  next_before_id?: number | null
  my_tasks_summary?: { items: MyTask[]; has_more: boolean }
}

export const NotificationCenterContext = createContext<{
  unread: number
  anchor: HTMLButtonElement | null
  toggle: (anchor: HTMLButtonElement) => void
} | null>(null)

export const notificationCategory = (notice: Notice) => notice.approval_id ? 'approval'
  : notice.assigned_task_id || notice.case_task_id || notice.case_document_id ? 'task' : 'system'

export function notificationDestination(notice: Notice) {
  if (Number.isSafeInteger(notice.chat_message_id) && notice.chat_message_id! > 0) return { chatMessage: notice.chat_message_id! }
  if (notice.approval_id) return { path: `/approvals?approval=${notice.approval_id}` }
  if (notice.assigned_task_id) return { employeeTask: notice.assigned_task_id }
  if (notice.target_path && /^\/quests\/[1-9]\d*$/.test(notice.target_path)) {
    return {
      path: notice.target_path,
      state: notice.case_task_id ? { workspaceTab: 'tasks', taskId: notice.case_task_id }
        : notice.case_document_id ? { workspaceTab: 'collection', collectionItemId: notice.case_document_id } : undefined,
    }
  }
  return { path: notice.target_path && /^\/(system|organization|quests)(?:\?[^#]*)?$/.test(notice.target_path) ? notice.target_path : undefined }
}

export const formatBellCount = (count: number) => count > 99 ? '99+' : String(count)

export const notificationUnreadCount = (unread: number, chatUnread: number) => unread + Number(chatUnread > 0)
