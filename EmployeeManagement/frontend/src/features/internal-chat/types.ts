export type ChatTranslationStatus = 'pending' | 'completed' | 'failed'
export type ChatTranslationPair = 'ja-vi' | 'ja-zh'
export type ChatTranslations = Partial<Record<ChatTranslationPair, {
  status: ChatTranslationStatus
  revision: number
  language?: 'ja' | 'vi' | 'zh-Hans'
  text?: string
}>>
export type ChatDraftMention = { type: 'user'; user_id: number; start: number; end: number }
export type ChatMention = ChatDraftMention & { name: string }
export type ChatMentionMember = { user_id: number; employee_id: number; name: string; employee_code: string; avatar_path: string | null }

export type ChatMemberSummary = { member_count: number; online_count: number }
export type ChatAttachment = { id: number; name: string; size: number; mime_type: string }
export type ChatReply = { id: number; sender_name: string; excerpt: string | null }
export type ChatActionName = 'recall' | 'pin' | 'unpin' | 'hide' | 'retry'
export type ChatMessageAction = { id?: number; chat_message_id: number; action: ChatActionName; created_at: string | null }
export type ChatReceipt = {
  delivered_count: number
  read_count: number
  eligible_recipient_count: number
  readers: { user_id: number; employee_id: number; display_name: string; avatar_url: string | null }[]
}

export type InternalChatMessage = {
  id: number
  client_message_id: string
  sender: {
    id: number
    name: string
    employee_code: string | null
    avatar_path: string | null
  }
  is_mine: boolean
  original_text: string
  mentions?: ChatMention[]
  attachments?: ChatAttachment[]
  source_language: 'ja' | 'vi'
  japanese_content: string | null
  vietnamese_content: string | null
  translation_status: ChatTranslationStatus
  translation_error_category: string | null
  translation_provider: string
  created_at: string
  recalled_at?: string | null
  pinned_at?: string | null
  pinned_by_name?: string | null
  can_recall?: boolean
  can_retry_translation?: boolean
  translation_attempt?: number
  translations?: ChatTranslations
  reply_to?: ChatReply | null
}

export type ChatUnread = { unread_count: number; first_unread_id?: number | null }

export type ChatMessagesResponse = ChatUnread & {
  messages: InternalChatMessage[]
  pagination: {
    has_more: boolean
    next_before_id: number | null
    latest_id: number | null
  }
  member_summary: ChatMemberSummary
  receipts: Record<number, ChatReceipt>
  delivery_enabled: boolean
  translation_updates?: (Pick<InternalChatMessage, 'id' | 'translation_status' | 'translation_attempt'>
    & Partial<Pick<InternalChatMessage, 'japanese_content' | 'vietnamese_content' | 'translation_provider' | 'translations'>>)[]
  actions_enabled?: boolean
  hide_enabled?: boolean
  can_pin?: boolean
  action_cursor?: number
  message_actions?: ChatMessageAction[]
}
