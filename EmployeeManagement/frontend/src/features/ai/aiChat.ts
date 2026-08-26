import axios from 'axios'
import api from '../../services/api'

export type AiPersona = {
  id: number
  name: string
  display_name: string
  skills: string[]
}

export type AiChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type AiPageContext = {
  page:
    | 'employee_room'
    | 'organization'
    | 'business_quest'
    | 'manual_workshop'
    | 'ai_workspace'
    | 'approvals'
  case_id?: number
  approval_id?: number
}

type ChatResponse = {
  data: {
    message: string
  }
}

export const AI_CONVERSATION_HISTORY_LIMIT = 20

export const aiSkillLabels: Record<string, string> = {
  task_management: 'タスク管理',
  morning_briefing: '朝会ブリーフィング',
}

export const friendlyAiErrorMessage = (error: unknown) => {
  if (!axios.isAxiosError(error)) {
    return 'メッセージを送信できませんでした。しばらくしてからもう一度お試しください。'
  }

  switch (error.response?.status) {
    case 401:
      return 'セッションの有効期限が切れました。もう一度ログインしてください。'
    case 403:
      return 'このAI社員は現在利用できません。'
    case 422:
      return 'リクエストを処理できませんでした。内容を確認してもう一度お試しください。'
    case 502:
      return 'AIサービスが一時的に利用できません。しばらくしてからもう一度お試しください。'
    case 503:
      return 'AIが混み合っています。数秒待ってからもう一度お試しください。'
    default:
      return 'メッセージを送信できませんでした。しばらくしてからもう一度お試しください。'
  }
}

export const loadAiPersonas = async () => {
  const response = await api.get<{ personas: AiPersona[] }>('/personas')

  return response.data.personas
}

export const sendAiChatMessage = async ({
  persona,
  skill,
  message,
  messages,
  context,
}: {
  persona: string
  skill: string
  message: string
  messages: AiChatMessage[]
  context?: AiPageContext
}) => {
  const response = await api.post<ChatResponse>('/ai/chat', {
    persona,
    skill,
    message,
    messages,
    ...(context ? { context } : {}),
  })

  return response.data.data.message
}
