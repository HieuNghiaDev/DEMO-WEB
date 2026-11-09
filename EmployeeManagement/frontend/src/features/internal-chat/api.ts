import api from '../../services/api'
import type { ChatActionName, ChatDraftMention, ChatMentionMember, ChatMessageAction, ChatMessagesResponse, InternalChatMessage } from './types'

const chatSyncTimeout = 12_000
export const CHAT_PAGE_SIZE = 20

export const fetchChatMessages = async (params: { afterId?: number; beforeId?: number; limit?: number; receiptIds?: number[]; translationIds?: number[]; afterActionId?: number } = {}, signal?: AbortSignal) => {
  const response = await api.get<ChatMessagesResponse>('/internal-chat/messages', {
    signal,
    timeout: chatSyncTimeout,
    params: {
      after_id: params.afterId,
      before_id: params.beforeId,
      limit: params.limit ?? CHAT_PAGE_SIZE,
      ...(params.afterActionId !== undefined ? { after_action_id: params.afterActionId } : {}),
      ...(params.receiptIds?.length ? { receipt_ids: params.receiptIds } : {}),
      ...(params.translationIds?.length ? { translation_ids: params.translationIds } : {}),
    },
  })
  return response.data
}

export const fetchChatMentionMembers = async (q: string, signal: AbortSignal) => {
  const response = await api.get<{ members: ChatMentionMember[] }>('/internal-chat/members', { params: { q }, signal, timeout: chatSyncTimeout })
  return response.data.members
}

export const sendChatMessage = async (text: string, clientMessageId: string, signal?: AbortSignal, replyId?: number, files: File[] = [], mentions: ChatDraftMention[] = []) => {
  const fields = {
    text,
    client_message_id: clientMessageId,
    ...(replyId === undefined ? {} : { reply_to_message_id: replyId }),
  }
  if (files.length) {
    const form = new FormData()
    for (const [name, value] of Object.entries(fields)) form.append(name, String(value))
    for (const file of files) form.append('attachments[]', file)
    mentions.forEach((mention, index) => Object.entries(mention).forEach(([key, value]) => form.append(`mentions[${index}][${key}]`, String(value))))
    const response = await api.post<{ message: InternalChatMessage }>('/internal-chat/messages', form, {
      signal, headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60_000,
    })
    return response.data.message
  }
  const response = await api.post<{ message: InternalChatMessage }>('/internal-chat/messages', { ...fields, ...(mentions.length ? { mentions } : {}) }, { signal })
  return response.data.message
}

export const fetchChatAttachment = async (messageId: number, attachmentId: number, signal: AbortSignal) => {
  const response = await api.get<Blob>(`/internal-chat/messages/${messageId}/attachments/${attachmentId}`, {
    signal, responseType: 'blob', timeout: 60_000,
  })
  return response.data
}

export const changeChatMessage = async (id: number, action: ChatActionName, signal: AbortSignal) => {
  const response = await api.patch<ChatMessageAction>(`/internal-chat/messages/${id}/${action}`, undefined, { signal, timeout: chatSyncTimeout })
  return response.data
}

export const fetchChatPins = async (signal: AbortSignal) => {
  const response = await api.get<{ messages: InternalChatMessage[] }>('/internal-chat/pins', { signal, timeout: chatSyncTimeout })
  return response.data.messages
}

export const fetchChatMessage = async (id: number, signal: AbortSignal) => {
  const response = await api.get<{ message: InternalChatMessage }>(`/internal-chat/messages/${id}`, { signal, timeout: chatSyncTimeout })
  return response.data.message
}

export const fetchChatUnreadCount = async () => {
  const response = await api.get<{ unread_count: number }>('/internal-chat/unread')
  return response.data.unread_count
}

export const markChatRead = async (messageId: number, visibleIds: number[], signal?: AbortSignal) => {
  const response = await api.patch<{ unread_count: number; read_cursor: number; acknowledged_ids?: number[] }>('/internal-chat/read', {
    message_id: messageId, visible_ids: visibleIds,
  }, { signal, timeout: chatSyncTimeout })
  return response.data
}

export const markChatDelivered = async (messageId: number, signal?: AbortSignal) => {
  await api.patch('/internal-chat/delivered', { message_id: messageId }, { signal, timeout: chatSyncTimeout })
}
