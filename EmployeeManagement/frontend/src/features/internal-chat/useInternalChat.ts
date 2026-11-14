import { createContext, useContext } from 'react'
import type { ChatActionName, ChatDraftMention, ChatMemberSummary, ChatReceipt, ChatReply, ChatTranslationPair, InternalChatMessage } from './types'

export type InternalChatContextValue = {
  messages: InternalChatMessage[]
  unreadCount: number
  firstUnreadId: number | null
  memberSummary: ChatMemberSummary | null
  receipts: Record<number, ChatReceipt>
  draft: string
  setDraft: (value: string) => void
  draftMentions: ChatDraftMention[]
  setMentionDraft: (text: string, mentions: ChatDraftMention[]) => void
  focusedMessageId: number | null
  clearMessageFocus: () => void
  openMessage: (id: number) => void
  files: File[]
  setFiles: (value: File[]) => void
  sendError: string
  reply: ChatReply | null
  setReply: (reply: ChatReply | null) => void
  actionsEnabled: boolean
  hideEnabled: boolean
  canPin: boolean
  actionRevision: number
  loadPins: (signal: AbortSignal) => Promise<InternalChatMessage[]>
  loadMessage: (id: number, signal: AbortSignal) => Promise<InternalChatMessage>
  messageAction: (id: number, action: ChatActionName) => Promise<boolean>
  translationPair: ChatTranslationPair
  setTranslationPair: (pair: ChatTranslationPair) => void
  translateMessage: (id: number, pair: ChatTranslationPair) => Promise<boolean>
  isInitialLoading: boolean
  isLoadingOlder: boolean
  isSending: boolean
  hasOlder: boolean
  error: string
  isReconnecting: boolean
  drawerOpen: boolean
  setDrawerOpen: (open: boolean) => void
  loadOlder: (throughId?: number) => Promise<boolean>
  send: () => Promise<void>
  retry: () => Promise<void>
  markVisibleRead: (ids: number[]) => Promise<void>
}

export const InternalChatContext = createContext<InternalChatContextValue | null>(null)

export const useInternalChat = () => {
  const value = useContext(InternalChatContext)
  if (!value) throw new Error('useInternalChat must be used inside InternalChatProvider')
  return value
}
