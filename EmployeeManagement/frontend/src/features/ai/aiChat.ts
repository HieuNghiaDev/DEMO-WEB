import axios from 'axios'
import api from '../../services/api'
import { aiTaskIntroduction, aiTaskResults, type AiTaskResult } from './taskResults'
import { parseAiNavigation, type AiNavigationResult } from './navigationResults'

export type AiPersona = {
  id: number
  name: string
  display_name: string
  skills: string[]
}

export type AiChatMessage = {
  role: 'user' | 'assistant'
  content: string
  taskResults?: AiTaskResult[]
  navigation?: AiNavigationResult
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
    tool_executions?: unknown
    navigation?: unknown
  }
}

export const AI_CONVERSATION_HISTORY_LIMIT = 20
export const AI_SKILLS_PAUSED_MESSAGE = '朝会ブリーフィングは現在利用できません。'
const disabledSkills = ['morning_briefing']

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

  return response.data.personas.map((persona) => ({ ...persona, skills: persona.skills.filter((skill) => !disabledSkills.includes(skill)) }))
}

export const sendAiChatMessage = async ({
  persona,
  skill,
  message,
  messages,
  context,
  employeeName,
}: {
  persona: string
  skill: string
  message: string
  messages: AiChatMessage[]
  context?: AiPageContext
  employeeName?: string
}) => {
  if (!skill || disabledSkills.includes(skill)) throw new Error(AI_SKILLS_PAUSED_MESSAGE)
  const response = await api.post<ChatResponse>('/ai/chat', {
    persona,
    skill,
    message,
    messages: messages.map(({ role, content }) => ({ role, content })),
    ...(context ? { context } : {}),
  })

  const data = response.data.data
  const navigation = parseAiNavigation(data.navigation)
  if (navigation) return { content: data.message, navigation }
  const taskResults = aiTaskResults(data.tool_executions).map(result => ({ ...result, today: result.scope === 'my' && /今日|本日/.test(message) }))
  // Task facts are rendered once, from authorized tool output, never an LLM table.
  return { content: taskResults.length
    ? taskResults.every(result => result.error)
      ? 'タスク情報の確認中に問題が発生しました。'
      : aiTaskIntroduction(message, employeeName, taskResults.some(result => result.today))
    : data.message, taskResults }
}
