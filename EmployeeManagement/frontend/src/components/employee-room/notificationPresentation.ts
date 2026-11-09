import type { ComponentType } from 'react'
import {
  AlertTriangle,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  FileText,
  Info,
  ListTodo,
  Megaphone,
  Scale,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

export type NotificationPopoverItem = {
  id: string
  title: string
  message: string
  kind: 'success' | 'info' | 'warning' | 'error'
  createdAt: string
  isRead: boolean
  assignedTaskId?: number
  approvalId?: number
  targetPath?: string
}

export type NotificationCategory = 'work' | 'system' | 'other'
export type NotificationTone = 'indigo' | 'emerald' | 'amber' | 'rose' | 'teal' | 'violet' | 'blue' | 'slate'

export type NotificationPresentation = {
  category: NotificationCategory
  badgeLabel: string
  icon: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
  tone: NotificationTone
}

export function getNotificationPresentation(notification: NotificationPopoverItem): NotificationPresentation {
  const searchableText = `${notification.title} ${notification.message} ${notification.targetPath ?? ''}`.toLowerCase()

  if (/themis\s*ai|ai社員|aiアシスタント/u.test(searchableText)) {
    return { category: 'other', badgeLabel: 'AIアシスタント', icon: Sparkles, tone: 'violet' }
  }
  if (notification.approvalId || /承認|approval/u.test(searchableText)) {
    return { category: 'work', badgeLabel: '承認フロー', icon: Scale, tone: 'indigo' }
  }
  if (notification.assignedTaskId || /タスク|業務クエスト|task|quest/u.test(searchableText)) {
    return { category: 'work', badgeLabel: 'タスク', icon: ListTodo, tone: 'amber' }
  }
  if (/文書|書類|ファイル|document|file/u.test(searchableText)) {
    return { category: 'work', badgeLabel: '案件文書', icon: FileText, tone: 'teal' }
  }
  if (/案件|case/u.test(searchableText)) {
    return { category: 'work', badgeLabel: '案件管理', icon: BriefcaseBusiness, tone: 'blue' }
  }
  if (/期限|締切|deadline/u.test(searchableText)) {
    return { category: 'work', badgeLabel: '期限', icon: CalendarClock, tone: 'amber' }
  }
  if (/ログイン|ログアウト|パスワード|セキュリティ|login|security/u.test(searchableText)) {
    return { category: 'system', badgeLabel: 'セキュリティ', icon: ShieldCheck, tone: 'emerald' }
  }
  if (/システム|メンテナンス|system|maintenance/u.test(searchableText)) {
    return { category: 'system', badgeLabel: 'システム', icon: Megaphone, tone: 'blue' }
  }
  if (notification.kind === 'error') {
    return { category: 'system', badgeLabel: 'エラー', icon: AlertTriangle, tone: 'rose' }
  }
  if (notification.kind === 'warning') {
    return { category: 'system', badgeLabel: '注意', icon: AlertTriangle, tone: 'amber' }
  }
  if (notification.kind === 'success') {
    return { category: 'other', badgeLabel: '完了', icon: CheckCircle2, tone: 'emerald' }
  }
  return { category: 'other', badgeLabel: 'お知らせ', icon: Info, tone: 'slate' }
}
