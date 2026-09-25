import { ButtonSpinner, InlineLoader } from '../loading'
import {
  Bot,
  BriefcaseBusiness,
  CalendarCheck2,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  SendHorizontal,
  UserRound,
  UserRoundCheck,
  X,
} from 'lucide-react'
import {
  type FormEvent,
  type KeyboardEvent,
  type TransitionEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import ThemisAIMascot from './ThemisAIMascot'
import ThemisAIFloatingButton from './ThemisAIFloatingButton'
import { useMascotFeedback } from './useMascotFeedback'
import {
  AI_CONVERSATION_HISTORY_LIMIT,
  AI_SKILLS_PAUSED_MESSAGE,
  aiSkillLabels,
  friendlyAiErrorMessage,
  loadAiPersonas,
  sendAiChatMessage,
  type AiChatMessage,
  type AiPageContext,
  type AiPersona,
} from '../../features/ai/aiChat'
import './ThemisAiAssistant.css'

type QuickChatMessage = AiChatMessage & {
  createdAt: string
}

const quickActions = [
  { label: '今日のタスク', prompt: '本日のタスクを確認してください。', icon: CalendarCheck2 },
  { label: '必要資料', prompt: '現在の案件に必要な資料を整理してください。', icon: ClipboardList },
  { label: '案件を要約', prompt: '現在の案件を要約してください。', icon: BriefcaseBusiness },
  { label: '担当者を確認', prompt: '現在の案件の担当者を確認してください。', icon: UserRoundCheck },
] as const

const messageTime = () => new Intl.DateTimeFormat('ja-JP', {
  hour: '2-digit',
  minute: '2-digit',
}).format(new Date())

const summaryCardIcons = {
  '本日のタスク': CalendarCheck2,
  '来週の裁判期日': BriefcaseBusiness,
} as const

const emphasizedAssistantTerms = /([^\n]+さん。|THEMIS AIです。|本日のタスク確認|案件の確認|必要資料の整理)/g

const PANEL_ENTER_DURATION = 390
const PANEL_EXIT_DURATION = 260
const REDUCED_MOTION_DURATION = 90

function AssistantText({ content }: { content: string }) {
  return (
    <p className="whitespace-pre-wrap">
      {content.split(emphasizedAssistantTerms).map((part, index) => {
        if (!part) return null

        if (part.endsWith('さん。') || part === 'THEMIS AIです。') {
          return <strong className="font-semibold text-slate-950" key={`${part}-${index}`}>{part}</strong>
        }

        if (part === '本日のタスク確認' || part === '案件の確認' || part === '必要資料の整理') {
          return <span className="font-semibold text-indigo-950" key={`${part}-${index}`}>{part}</span>
        }

        return part
      })}
    </p>
  )
}

function AssistantMessageContent({ content }: { content: string }) {
  const lines = content.split('\n')
  const blocks: Array<
    | { type: 'text'; content: string }
    | { type: 'summary'; title: keyof typeof summaryCardIcons; detail: string }
  > = []
  let textLines: string[] = []

  const flushText = () => {
    const text = textLines.join('\n').trim()
    if (text) blocks.push({ type: 'text', content: text })
    textLines = []
  }

  for (let index = 0; index < lines.length; index += 1) {
    const title = lines[index].trim() as keyof typeof summaryCardIcons
    const detail = lines[index + 1]?.trim()

    if (title in summaryCardIcons && detail) {
      flushText()
      blocks.push({ type: 'summary', title, detail })
      index += 1
      continue
    }

    textLines.push(lines[index])
  }
  flushText()

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        if (block.type === 'text') {
          return <AssistantText content={block.content} key={`text-${index}`} />
        }

        const Icon = summaryCardIcons[block.title]
        return (
          <div className="themis-ai-summary-card" key={`${block.title}-${index}`}>
            <span className="themis-ai-summary-icon"><Icon aria-hidden="true" size={15} /></span>
            <span className="min-w-0 flex-1">
              <strong>{block.title}</strong>
              <small>{block.detail}</small>
            </span>
            <ChevronRight aria-hidden="true" size={15} />
          </div>
        )
      })}
    </div>
  )
}

const pageContextFromPath = (pathname: string): AiPageContext => {
  const caseMatch = pathname.match(/^\/quests\/(\d+)/)
  const approvalMatch = pathname.match(/^\/approvals\/(\d+)/)

  if (caseMatch) {
    return { page: 'business_quest', case_id: Number(caseMatch[1]) }
  }

  if (approvalMatch) {
    return { page: 'approvals', approval_id: Number(approvalMatch[1]) }
  }

  if (pathname.startsWith('/organization')) return { page: 'organization' }
  if (pathname.startsWith('/quests')) return { page: 'business_quest' }
  if (pathname.startsWith('/manual')) return { page: 'manual_workshop' }
  if (pathname.startsWith('/ai')) return { page: 'ai_workspace' }
  if (pathname.startsWith('/approvals')) return { page: 'approvals' }

  return { page: 'employee_room' }
}

function ThemisAiAssistant() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const canUseAi = user?.permission_names.includes('ai.use') ?? false
  const [isMounted, setIsMounted] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [personas, setPersonas] = useState<AiPersona[]>([])
  const [selectedPersonaId, setSelectedPersonaId] = useState<number | null>(null)
  const [selectedSkills, setSelectedSkills] = useState<Record<string, string>>({})
  const [messagesByPersona, setMessagesByPersona] = useState<Record<string, QuickChatMessage[]>>({})
  const [messageInput, setMessageInput] = useState('')
  const [isLoadingPersonas, setIsLoadingPersonas] = useState(false)
  const [hasLoadedPersonas, setHasLoadedPersonas] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [chatError, setChatError] = useState<string | null>(null)
  const { feedback, showFeedback } = useMascotFeedback()
  const mascotExpression = feedback === 'error'
    ? 'concerned'
    : feedback === 'success'
      ? 'happy'
      : isSending || isLoadingPersonas
        ? 'focused'
        : messageInput.trim()
          ? 'listening'
          : 'idle'
  const mascotAction = isSending || isLoadingPersonas ? 'processing' : feedback
  const closeTimerRef = useRef<number | null>(null)
  const isClosingRef = useRef(false)
  const launcherFocusRef = useRef<HTMLElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const selectedPersona = personas.find((persona) => persona.id === selectedPersonaId)
  const selectedSkill = selectedPersona
    ? (selectedPersona.skills.includes(selectedSkills[selectedPersona.name]) ? selectedSkills[selectedPersona.name] : selectedPersona.skills[0] ?? '')
    : ''
  const employeeName = user?.employee?.full_name?.trim() || user?.name?.trim() || ''
  const initialGreeting = employeeName
    ? `こんにちは、\n${employeeName}さん。\n\nTHEMIS AIです。\n\n本日のタスク確認、案件の確認、必要資料の整理などをサポートできます。\n今日は何をお手伝いしましょうか？`
    : 'こんにちは。\n\nTHEMIS AIです。\n\n本日のタスク確認、案件の確認、必要資料の整理などをサポートできます。\n今日は何をお手伝いしましょうか？'
  const chatMessages = useMemo(
    () => selectedPersona ? (messagesByPersona[selectedPersona.name] ?? []) : [],
    [messagesByPersona, selectedPersona],
  )

  useEffect(() => {
    if (!isMounted || !selectedPersona) return

    const personaName = selectedPersona.name
    setMessagesByPersona((current) => {
      if ((current[personaName]?.length ?? 0) > 0) return current

      return {
        ...current,
        [personaName]: [{ role: 'assistant', content: initialGreeting, createdAt: messageTime() }],
      }
    })
  }, [initialGreeting, isMounted, selectedPersona])

  const loadPersonas = useCallback(async () => {
    setHasLoadedPersonas(true)
    setIsLoadingPersonas(true)
    setLoadError(null)
    showFeedback('none')

    try {
      const loadedPersonas = await loadAiPersonas()
      setPersonas(loadedPersonas)
      setSelectedPersonaId((current) => current ?? loadedPersonas[0]?.id ?? null)
    } catch {
      setLoadError('AI秘書の情報を読み込めませんでした。')
      showFeedback('error')
    } finally {
      setIsLoadingPersonas(false)
    }
  }, [showFeedback])

  const finishClosing = useCallback(() => {
    if (!isClosingRef.current) return

    isClosingRef.current = false
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }

    setIsMounted(false)
    window.requestAnimationFrame(() => {
      const launcher = launcherFocusRef.current?.isConnected
        ? launcherFocusRef.current
        : document.querySelector<HTMLButtonElement>('.themis-ai-launcher-button')
      launcher?.focus()
    })
  }, [])

  const openPanel = () => {
    const activeElement = document.activeElement
    launcherFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null

    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    isClosingRef.current = false

    setIsMounted(true)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setIsVisible(true))
    })
    if (!hasLoadedPersonas && !isLoadingPersonas) {
      void loadPersonas()
    }
  }

  const closePanel = useCallback(() => {
    if (!isMounted || !isVisible || isClosingRef.current) return

    isClosingRef.current = true
    setIsVisible(false)
    const closeDelay = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? REDUCED_MOTION_DURATION
      : PANEL_EXIT_DURATION
    closeTimerRef.current = window.setTimeout(() => {
      finishClosing()
    }, closeDelay + 80)
  }, [finishClosing, isMounted, isVisible])

  const handlePanelTransitionEnd = (event: TransitionEvent<HTMLElement>) => {
    if (
      event.target !== event.currentTarget
      || isVisible
      || (event.propertyName !== 'opacity' && event.propertyName !== 'transform')
    ) return

    finishClosing()
  }

  useEffect(() => {
    if (!isMounted) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') closePanel()
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closePanel, isMounted])

  useEffect(() => {
    if (!isVisible) return

    const focusDelay = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? REDUCED_MOTION_DURATION
      : PANEL_ENTER_DURATION
    const focusTimer = window.setTimeout(() => textareaRef.current?.focus(), focusDelay)

    return () => window.clearTimeout(focusTimer)
  }, [isVisible])

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
  }, [])

  useEffect(() => {
    if (!isVisible) return

    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    messagesEndRef.current?.scrollIntoView({ behavior })
  }, [chatMessages, isSending, isVisible])

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = 'auto'
    const nextHeight = Math.min(textarea.scrollHeight, 120)
    textarea.style.height = `${nextHeight}px`
    textarea.style.overflowY = textarea.scrollHeight > 120 ? 'auto' : 'hidden'
  }, [messageInput])

  const sendMessage = async () => {
    const content = messageInput.trim()

    if (!selectedPersona || !selectedSkill || !content || isSending) return

    const personaName = selectedPersona.name
    const userMessage: QuickChatMessage = { role: 'user', content, createdAt: messageTime() }
    const validChatMessages = chatMessages.filter(({ content: itemContent }) => itemContent.trim() !== '')
    const conversationHistory: AiChatMessage[] = validChatMessages
      .slice(-AI_CONVERSATION_HISTORY_LIMIT)
      .map(({ role, content: historyContent }) => ({ role, content: historyContent }))

    setMessagesByPersona((current) => ({
      ...current,
      [personaName]: [
        ...(current[personaName] ?? []).filter(({ content: itemContent }) => itemContent.trim() !== ''),
        userMessage,
      ],
    }))
    setMessageInput('')
    setChatError(null)
    setIsSending(true)
    showFeedback('none')

    try {
      const assistantMessage = await sendAiChatMessage({
        persona: personaName,
        skill: selectedSkill,
        message: content,
        messages: conversationHistory,
        context: pageContextFromPath(location.pathname),
      })

      if (assistantMessage.trim() === '') {
        throw new Error('AI returned an empty message.')
      }

      setMessagesByPersona((current) => ({
        ...current,
        [personaName]: [
          ...(current[personaName] ?? []),
          { role: 'assistant', content: assistantMessage, createdAt: messageTime() },
        ],
      }))
      showFeedback('success')
    } catch (error) {
      setChatError(friendlyAiErrorMessage(error))
      showFeedback('error')
    } finally {
      setIsSending(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void sendMessage()
  }

  const handleMessageKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendMessage()
    }
  }

  const handleQuickAction = (prompt: string) => {
    setMessageInput(prompt)
    window.requestAnimationFrame(() => textareaRef.current?.focus())
  }

  if (!canUseAi) return null

  return (
    <>
      {!isMounted && (
        <ThemisAIFloatingButton onOpen={openPanel} expression={mascotExpression} action={mascotAction} />
      )}

      {isMounted && (
        <div className="fixed inset-0 z-[90]">
          <button
            aria-label="AIパネルを閉じる"
            className={`absolute inset-0 bg-slate-950/30 backdrop-blur-[2px] transition-opacity [transition-timing-function:cubic-bezier(.22,1,.36,1)] motion-reduce:duration-[90ms] ${isVisible ? 'opacity-100 duration-[240ms]' : 'opacity-0 duration-[200ms]'}`}
            onClick={closePanel}
            type="button"
          />

          <section
            aria-labelledby="themis-ai-panel-title"
            aria-modal="true"
            className={`themis-ai-panel absolute inset-x-0 bottom-0 flex h-[min(94dvh,800px)] origin-bottom-right flex-col overflow-hidden rounded-t-[30px] border border-white/90 bg-white shadow-[0_-18px_60px_rgba(15,23,42,0.2)] transition-[transform,opacity] motion-reduce:translate-x-0 motion-reduce:translate-y-0 motion-reduce:scale-100 motion-reduce:duration-[90ms] sm:inset-y-6 sm:left-auto sm:right-6 sm:h-auto sm:w-[402px] sm:rounded-[30px] sm:border-slate-200/90 sm:shadow-[0_24px_60px_rgba(15,23,42,0.2)] lg:right-8 ${isVisible ? 'translate-x-0 translate-y-0 scale-100 opacity-100 duration-[390ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]' : 'translate-x-[18px] translate-y-6 scale-[0.88] opacity-0 duration-[260ms] [transition-timing-function:cubic-bezier(0.4,0,1,1)]'}`}
            onTransitionEnd={handlePanelTransitionEnd}
            role="dialog"
          >
            <header className={`themis-ai-panel-header themis-ai-panel-content themis-ai-panel-content--header relative h-[84px] min-h-[84px] shrink-0 overflow-hidden border-b border-white/10 bg-gradient-to-r from-[#101b4d] via-[#312e81] to-[#5b21b6] px-4 py-3 text-white sm:px-5 ${isVisible ? 'themis-ai-panel-content--enter' : ''}`}>
              <div className="pointer-events-none absolute -right-12 -top-20 h-48 w-48 rounded-full bg-violet-300/10 blur-2xl" />
              <svg aria-hidden="true" className="pointer-events-none absolute -right-8 -top-7 h-36 w-56 text-white/30" fill="none" viewBox="0 0 240 150">
                <path d="M40 132C88 43 146 20 238 22" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
                <path d="M82 150C119 75 169 45 246 48" stroke="currentColor" strokeLinecap="round" strokeWidth="1" />
              </svg>
              <div className="pointer-events-none absolute -bottom-20 left-16 h-32 w-72 rotate-[-7deg] rounded-[50%] border border-white/20" />
              <div className="relative flex h-full items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
                  <div className="themis-ai-header-mascot-frame">
                    <ThemisAIMascot className="themis-ai-header-mascot" expression={mascotExpression} action={mascotAction} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate whitespace-nowrap text-[17px] font-bold leading-6 tracking-[0.08em]" id="themis-ai-panel-title">THEMIS AI</h2>
                    <p className="mt-0.5 truncate whitespace-nowrap text-[11px] font-medium leading-4 text-indigo-100/90">AI秘書・クイックアシスト</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center justify-center">
                  <button
                    aria-label="AIパネルを閉じる"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-200/25 bg-violet-300/15 text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_6px_18px_rgba(15,23,42,0.16)] backdrop-blur-md transition-[background-color,color,transform,box-shadow] duration-150 hover:bg-violet-200/25 hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 motion-reduce:transform-none"
                    onClick={closePanel}
                    type="button"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
            </header>

            <div className="themis-ai-panel-body flex min-h-0 flex-1 flex-col bg-[#fcfcff]">
              {isLoadingPersonas ? (
                <div className="flex flex-1 items-center justify-center">
                  <InlineLoader ai label="AI秘書を準備しています…" />
                </div>
              ) : loadError ? (
                <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
                  <Bot size={28} className="text-slate-400" />
                  <p className="mt-3 text-sm font-semibold text-red-600">{loadError}</p>
                  <button className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2" onClick={() => void loadPersonas()} type="button">再読み込み</button>
                </div>
              ) : !selectedPersona ? (
                <div className="flex flex-1 items-center justify-center px-8 text-center text-sm text-slate-500">有効なAI秘書はまだ登録されていません。</div>
              ) : (
                <>
                  <div className="themis-ai-statusbar flex min-h-[54px] items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold tracking-[0.03em] text-slate-800">AI 秘書</p>
                      <span className={`mt-1 inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] ${selectedSkill ? 'text-emerald-600' : 'text-slate-400'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${selectedSkill ? 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]' : 'bg-slate-300'}`} />
                        {selectedSkill ? 'ONLINE' : '一時停止中'}
                      </span>
                    </div>
                    {selectedPersona.skills.length > 1 && (
                      <label className="relative">
                        <span className="sr-only">AIスキル</span>
                        <select
                          className="h-8 max-w-40 appearance-none rounded-full border border-violet-100 bg-violet-50 py-0 pl-3 pr-8 text-[11px] font-semibold text-violet-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                          disabled={isSending || !selectedSkill}
                          onChange={(event) => setSelectedSkills((current) => ({ ...current, [selectedPersona.name]: event.target.value }))}
                          value={selectedSkill}
                        >
                          {selectedPersona.skills.map((skill) => <option key={skill} value={skill}>{aiSkillLabels[skill] ?? skill}</option>)}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2.5 top-2 text-violet-400" size={14} />
                      </label>
                    )}
                    {selectedPersona.skills.length <= 1 && (
                      <span className="shrink-0 rounded-full border border-violet-100 bg-[#f5f3ff] px-3 py-1.5 text-[10px] font-semibold text-violet-700">業務のご相談を承ります</span>
                    )}
                  </div>

                  <div aria-live="polite" className={`themis-ai-chat-scroll themis-ai-panel-content themis-ai-panel-content--chat min-h-0 flex-1 space-y-6 overflow-y-auto bg-[#fcfcff] px-4 py-4 sm:px-5 sm:py-4 ${isVisible ? 'themis-ai-panel-content--enter' : ''}`}>
                    {!selectedSkill ? (
                      <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600 shadow-sm">{AI_SKILLS_PAUSED_MESSAGE}</p>
                    ) : chatMessages.map((message, index) => (
                      <div className={`themis-ai-message flex items-start gap-2.5 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`} key={`${message.role}-${message.createdAt}-${index}`}>
                        {message.role === 'assistant' && (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eef2ff] shadow-[0_4px_14px_rgba(15,23,42,0.05)]">
                            <ThemisAIMascot className="themis-ai-message-mascot" compact expression={index === chatMessages.length - 1 ? mascotExpression : 'idle'} action={index === chatMessages.length - 1 ? mascotAction : 'none'} interactive={false} />
                          </div>
                        )}
                        <div className={`flex max-w-[84%] flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                          <div className={`relative overflow-hidden rounded-[20px] px-4 py-3.5 text-sm leading-6 ${message.role === 'user' ? 'themis-ai-user-bubble rounded-br-md bg-gradient-to-br from-[#ede9fe] to-[#ddd6fe] text-slate-800 shadow-[0_4px_14px_rgba(15,23,42,0.06)]' : 'themis-ai-assistant-bubble rounded-bl-md bg-[#f5f3ff] text-slate-800 shadow-[0_4px_14px_rgba(15,23,42,0.05)]'}`}>
                            {message.role === 'assistant'
                              ? <AssistantMessageContent content={message.content} />
                              : <p className="whitespace-pre-wrap">{message.content}</p>}
                          </div>
                          <div className="mt-1.5 flex items-center gap-1 px-1 text-[10px] font-medium text-slate-400">
                            <time>{message.createdAt}</time>
                            {message.role === 'user' && <CheckCheck aria-label="送信済み" className="text-violet-500" size={12} />}
                          </div>
                        </div>
                        {message.role === 'user' && (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-[0_4px_14px_rgba(15,23,42,0.05)]">
                            <UserRound aria-hidden="true" size={17} />
                          </div>
                        )}
                      </div>
                    ))}
                    {isSending && (
                      <div className="themis-ai-message flex items-start gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eef2ff] shadow-[0_4px_14px_rgba(15,23,42,0.05)]">
                          <ThemisAIMascot className="themis-ai-message-mascot" compact expression="thinking" action="processing" interactive={false} />
                        </div>
                        <div className="rounded-[20px] rounded-bl-md bg-[#f5f3ff] px-3.5 py-2.5 shadow-[0_4px_14px_rgba(15,23,42,0.05)]">
                          <InlineLoader ai label="AIが考えています…" />
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className={`themis-ai-composer-area themis-ai-panel-content themis-ai-panel-content--composer border-t border-slate-200 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-6px_20px_rgba(15,23,42,0.04)] sm:px-5 ${isVisible ? 'themis-ai-panel-content--enter' : ''}`}>
                    {chatError && <p className="mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-600">{chatError}</p>}
                    <div aria-label="クイックアクション" className="mb-2.5 grid grid-cols-4 gap-1.5">
                      {quickActions.map(({ label, prompt, icon: Icon }) => (
                        <button
                          className="themis-ai-quick-action inline-flex h-9 min-w-0 items-center justify-center gap-0.5 rounded-[12px] border border-violet-200 bg-white px-1 text-[10px] font-semibold text-slate-700 shadow-[0_2px_8px_rgba(15,23,42,0.04)] transition-[background-color,border-color,color,transform,box-shadow] duration-150 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 hover:shadow-[0_4px_12px_rgba(109,40,217,0.08)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transform-none"
                          disabled={isSending || !selectedSkill}
                          key={label}
                          onClick={() => handleQuickAction(prompt)}
                          type="button"
                        >
                          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded bg-violet-100 text-violet-600">
                            <Icon aria-hidden="true" size={9} />
                          </span>
                          <span className="whitespace-nowrap">{label}</span>
                        </button>
                      ))}
                    </div>
                    <form className="flex items-end gap-2.5" onSubmit={handleSubmit}>
                      <div className="themis-ai-composer flex min-h-14 min-w-0 flex-1 items-center rounded-[20px] border border-violet-300 bg-white px-3 py-1 shadow-[0_4px_14px_rgba(15,23,42,0.05)] transition-[border-color,box-shadow] focus-within:border-indigo-500 focus-within:shadow-[0_0_0_3px_rgba(79,70,229,0.12)]">
                        <label className="sr-only" htmlFor="floating-ai-message">メッセージ</label>
                        <textarea
                          className="min-h-6 max-h-[120px] w-full resize-none overflow-y-hidden border-0 bg-transparent px-1 py-0 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-70"
                          disabled={isSending || !selectedSkill}
                          id="floating-ai-message"
                          maxLength={4000}
                          onChange={(event) => setMessageInput(event.target.value)}
                          onKeyDown={handleMessageKeyDown}
                          placeholder="THEMIS AI に相談する"
                          ref={textareaRef}
                          rows={1}
                          value={messageInput}
                        />
                      </div>
                      <button aria-label="メッセージを送信" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/30 bg-gradient-to-br from-[#4f46e5] to-[#6d28d9] text-white shadow-[0_8px_20px_rgba(79,70,229,0.28),inset_0_1px_0_rgba(255,255,255,0.22)] transition-[transform,box-shadow,filter] duration-150 hover:-translate-y-px hover:brightness-105 hover:shadow-[0_10px_24px_rgba(79,70,229,0.34)] active:translate-y-0 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none motion-reduce:transform-none" disabled={isSending || !selectedSkill || messageInput.trim() === ''} type="submit">
                        {isSending ? <ButtonSpinner size={18} /> : <SendHorizontal size={18} />}
                      </button>
                    </form>
                    <button className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs font-semibold text-violet-600 transition-colors hover:bg-violet-50 hover:text-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300" onClick={() => { closePanel(); navigate('/ai') }} type="button">
                      AI社員を開く <ExternalLink size={13} />
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  )
}

export default ThemisAiAssistant
