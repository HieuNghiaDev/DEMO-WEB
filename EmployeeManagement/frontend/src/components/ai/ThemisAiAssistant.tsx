import {
  Bot,
  ChevronDown,
  ExternalLink,
  LoaderCircle,
  SendHorizontal,
  X,
} from 'lucide-react'
import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
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
  const [messagesByPersona, setMessagesByPersona] = useState<Record<string, AiChatMessage[]>>({})
  const [messageInput, setMessageInput] = useState('')
  const [isLoadingPersonas, setIsLoadingPersonas] = useState(false)
  const [hasLoadedPersonas, setHasLoadedPersonas] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [chatError, setChatError] = useState<string | null>(null)
  const { feedback, showFeedback } = useMascotFeedback()
  const mascotExpression = isSending || isLoadingPersonas ? 'thinking' : feedback
  const closeTimerRef = useRef<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const selectedPersona = personas.find((persona) => persona.id === selectedPersonaId)
  const selectedSkill = selectedPersona
    ? (selectedPersona.skills.includes(selectedSkills[selectedPersona.name]) ? selectedSkills[selectedPersona.name] : selectedPersona.skills[0] ?? '')
    : ''
  const chatMessages = useMemo(
    () => selectedPersona ? (messagesByPersona[selectedPersona.name] ?? []) : [],
    [messagesByPersona, selectedPersona],
  )

  const loadPersonas = useCallback(async () => {
    setHasLoadedPersonas(true)
    setIsLoadingPersonas(true)
    setLoadError(null)
    showFeedback('idle')

    try {
      const loadedPersonas = await loadAiPersonas()
      setPersonas(loadedPersonas)
      setSelectedPersonaId((current) => current ?? loadedPersonas[0]?.id ?? null)
    } catch {
      setLoadError('AI秘書の情報を読み込めませんでした。')
      showFeedback('sad')
    } finally {
      setIsLoadingPersonas(false)
    }
  }, [showFeedback])

  const openPanel = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }

    setIsMounted(true)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setIsVisible(true))
    })
    if (!hasLoadedPersonas && !isLoadingPersonas) {
      void loadPersonas()
    }
  }

  const closePanel = useCallback(() => {
    setIsVisible(false)
    closeTimerRef.current = window.setTimeout(() => {
      setIsMounted(false)
      closeTimerRef.current = null
    }, 520)
  }, [])

  useEffect(() => {
    if (!isMounted) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => textareaRef.current?.focus(), 320)
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') closePanel()
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closePanel, isMounted])

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
  }, [])

  useEffect(() => {
    if (isVisible) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, isSending, isVisible])

  const sendMessage = async () => {
    const content = messageInput.trim()

    if (!selectedPersona || !selectedSkill || !content || isSending) return

    const personaName = selectedPersona.name
    const userMessage: AiChatMessage = { role: 'user', content }
    const validChatMessages = chatMessages.filter(({ content: itemContent }) => itemContent.trim() !== '')
    const conversationHistory = validChatMessages.slice(-AI_CONVERSATION_HISTORY_LIMIT)

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
    showFeedback('idle')

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
          { role: 'assistant', content: assistantMessage },
        ],
      }))
      showFeedback('happy')
    } catch (error) {
      setChatError(friendlyAiErrorMessage(error))
      showFeedback('sad')
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

  if (!canUseAi) return null

  return (
    <>
      {!isMounted && (
        <ThemisAIFloatingButton onOpen={openPanel} expression={mascotExpression} />
      )}

      {isMounted && (
        <div className="fixed inset-0 z-[90]">
          <button
            aria-label="AIパネルを閉じる"
            className={`absolute inset-0 bg-slate-950/45 backdrop-blur-[2px] transition-[opacity,backdrop-filter] duration-500 ease-out ${isVisible ? 'opacity-100' : 'opacity-0 backdrop-blur-none'}`}
            onClick={closePanel}
            type="button"
          />

          <section
            aria-labelledby="themis-ai-panel-title"
            aria-modal="true"
            className={`absolute inset-x-0 bottom-0 flex h-[min(92dvh,760px)] origin-bottom-right flex-col overflow-hidden rounded-t-[30px] border border-white/15 bg-white shadow-[0_-24px_80px_rgba(15,23,42,0.28)] will-change-transform transition-[transform,opacity] duration-[520ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] dark:border-slate-700 dark:bg-[#0d1426] sm:inset-y-6 sm:left-auto sm:right-7 sm:h-auto sm:w-[410px] sm:rounded-[28px] sm:shadow-[0_28px_90px_rgba(2,6,23,0.42)] lg:right-8 ${isVisible ? 'translate-y-0 scale-100 opacity-100 sm:translate-x-0' : 'translate-y-[105%] scale-[0.985] opacity-0 sm:translate-x-[112%] sm:translate-y-0 sm:scale-[0.97]'}`}
            role="dialog"
          >
            <header className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950 px-5 pb-5 pt-4 text-white dark:border-slate-700">
              <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full border border-indigo-300/20" />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <ThemisAIMascot compact expression={mascotExpression} />
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-black tracking-[0.08em]" id="themis-ai-panel-title">THEMIS AI</h2>
                    <p className="mt-0.5 text-xs font-medium text-indigo-200">AI秘書・クイックアシスト</p>
                  </div>
                </div>
                <button
                  aria-label="AIパネルを閉じる"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                  onClick={closePanel}
                  type="button"
                >
                  <X size={18} />
                </button>
              </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col bg-slate-50 dark:bg-[#0d1426]">
              {isLoadingPersonas ? (
                <div className="flex flex-1 items-center justify-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
                  <LoaderCircle className="animate-spin text-indigo-500" size={19} />
                  AI秘書を準備しています…
                </div>
              ) : loadError ? (
                <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
                  <Bot size={28} className="text-slate-400" />
                  <p className="mt-3 text-sm font-semibold text-red-600 dark:text-red-400">{loadError}</p>
                  <button className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-indigo-700" onClick={() => void loadPersonas()} type="button">再読み込み</button>
                </div>
              ) : !selectedPersona ? (
                <div className="flex flex-1 items-center justify-center px-8 text-center text-sm text-slate-500 dark:text-slate-400">有効なAI秘書はまだ登録されていません。</div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/70">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-800 dark:text-white">{selectedPersona.display_name}</p>
                      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-600 dark:text-emerald-400">{selectedSkill ? '● Online' : '一時停止中'}</p>
                    </div>
                    {selectedPersona.skills.length > 1 && (
                      <label className="relative">
                        <span className="sr-only">AIスキル</span>
                        <select
                          className="h-9 appearance-none rounded-xl border border-slate-200 bg-slate-50 py-0 pl-3 pr-8 text-xs font-bold text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:ring-indigo-500/20"
                          disabled={isSending || !selectedSkill}
                          onChange={(event) => setSelectedSkills((current) => ({ ...current, [selectedPersona.name]: event.target.value }))}
                          value={selectedSkill}
                        >
                          {selectedPersona.skills.map((skill) => <option key={skill} value={skill}>{aiSkillLabels[skill] ?? skill}</option>)}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 text-slate-400" size={14} />
                      </label>
                    )}
                  </div>

                  <div aria-live="polite" className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-5">
                    {!selectedSkill ? (
                      <p role="status" className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{AI_SKILLS_PAUSED_MESSAGE}</p>
                    ) : chatMessages.length === 0 ? (
                      <div className="flex min-h-full flex-col items-center justify-center px-5 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-600 shadow-inner dark:from-indigo-500/15 dark:to-violet-500/15 dark:text-indigo-300">
                          <Bot size={27} />
                        </div>
                        <p className="mt-4 text-sm font-bold text-slate-800 dark:text-white">何をお手伝いしましょうか？</p>
                        <p className="mt-1.5 max-w-xs text-xs leading-5 text-slate-500 dark:text-slate-400">現在のページを離れずに、タスクや今日の予定について相談できます。</p>
                      </div>
                    ) : chatMessages.map((message, index) => (
                      <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`} key={`${message.role}-${index}`}>
                        <p className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-6 shadow-sm ${message.role === 'user' ? 'rounded-br-md bg-gradient-to-br from-indigo-600 to-violet-600 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'}`}>
                          {message.content}
                        </p>
                      </div>
                    ))}
                    {isSending && (
                      <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                        <LoaderCircle className="animate-spin text-indigo-500" size={16} />
                        AIが考えています…
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="border-t border-slate-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 dark:border-slate-700 dark:bg-slate-900/80">
                    {chatError && <p className="mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-600 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300">{chatError}</p>}
                    <form className="flex items-end gap-2" onSubmit={handleSubmit}>
                      <label className="sr-only" htmlFor="floating-ai-message">メッセージ</label>
                      <textarea
                        className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-indigo-500 dark:focus:bg-slate-800 dark:focus:ring-indigo-500/20"
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
                      <button aria-label="メッセージを送信" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/20 transition hover:-translate-y-0.5 hover:shadow-indigo-500/30 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 dark:focus-visible:ring-indigo-500/30" disabled={isSending || !selectedSkill || messageInput.trim() === ''} type="submit">
                        {isSending ? <LoaderCircle className="animate-spin" size={18} /> : <SendHorizontal size={18} />}
                      </button>
                    </form>
                    <button className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs font-bold text-indigo-600 transition hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-500/10" onClick={() => { closePanel(); navigate('/ai') }} type="button">
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
