import { ButtonSpinner } from '../components/loading'
import { Bot,  SendHorizontal } from 'lucide-react'
import { type FormEvent, type KeyboardEvent, useEffect, useState } from 'react'
import {
  AI_CONVERSATION_HISTORY_LIMIT,
  AI_SKILLS_PAUSED_MESSAGE,
  aiSkillLabels,
  friendlyAiErrorMessage,
  loadAiPersonas,
  sendAiChatMessage,
  type AiChatMessage,
  type AiPersona,
} from '../features/ai/aiChat'
import { Button, LoadingState, PageHeader } from '../components/ui'

function AIEmployees() {
  const [personas, setPersonas] = useState<AiPersona[]>([])
  const [selectedPersonaId, setSelectedPersonaId] = useState<number | null>(null)
  const [selectedSkills, setSelectedSkills] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [messagesByPersona, setMessagesByPersona] = useState<Record<string, AiChatMessage[]>>({})
  const [errorsByPersona, setErrorsByPersona] = useState<Record<string, string | undefined>>({})
  const [messageInput, setMessageInput] = useState('')
  const [isSending, setIsSending] = useState(false)

  useEffect(() => {
    const loadPersonas = async () => {
      try {
        const loadedPersonas = await loadAiPersonas()

        setPersonas(loadedPersonas)
        setSelectedPersonaId(loadedPersonas[0]?.id ?? null)
      } catch {
        setError('AI社員の情報を読み込めませんでした。')
      } finally {
        setIsLoading(false)
      }
    }

    void loadPersonas()
  }, [])

  const selectedPersona = personas.find(
    (persona) => persona.id === selectedPersonaId,
  )
  const chatMessages = selectedPersona
    ? (messagesByPersona[selectedPersona.name] ?? [])
    : []
  const chatError = selectedPersona
    ? errorsByPersona[selectedPersona.name]
    : undefined
  const selectedSkill = selectedPersona
    ? (selectedPersona.skills.includes(selectedSkills[selectedPersona.name]) ? selectedSkills[selectedPersona.name] : selectedPersona.skills[0] ?? '')
    : ''

  const sendMessage = async () => {
    const content = messageInput.trim()

    if (!selectedPersona || !selectedSkill || !content || isSending) {
      return
    }

    const personaName = selectedPersona.name
    const userMessage: AiChatMessage = { role: 'user', content }
    const conversationHistory = chatMessages.slice(-AI_CONVERSATION_HISTORY_LIMIT)

    setMessagesByPersona((current) => ({
      ...current,
      [personaName]: [...(current[personaName] ?? []), userMessage],
    }))
    setErrorsByPersona((current) => ({ ...current, [personaName]: undefined }))
    setMessageInput('')
    setIsSending(true)

    try {
      const assistantMessage = await sendAiChatMessage({
        persona: personaName,
        skill: selectedSkill,
        message: content,
        messages: conversationHistory,
      })

      setMessagesByPersona((current) => ({
        ...current,
        [personaName]: [
          ...(current[personaName] ?? []),
          { role: 'assistant', content: assistantMessage },
        ],
      }))
    } catch (requestError) {
      setErrorsByPersona((current) => ({
        ...current,
        [personaName]: friendlyAiErrorMessage(requestError),
      }))
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

  return (
    <div className="min-h-full pb-10">
      <PageHeader
        breadcrumb="AI社員"
        domainKicker="AI OPERATIONS"
        title="AI社員プラットフォーム"
        description="社内業務をサポートするAI専門スタッフとの対話およびタスク連携"
      />

      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface)] shadow-xs overflow-hidden">
          {isLoading ? (
            <LoadingState className="min-h-72" message="AI社員の情報を読み込み中です…" variant="section" />
          ) : error ? (
            <div className="p-8 text-sm text-[var(--tm-danger)]">{error}</div>
          ) : personas.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--tm-text-secondary)]">
              有効なAI社員はまだ登録されていません。
            </div>
          ) : (
            <>
              {/* Persona Tab Bar */}
              <div className="flex gap-2 overflow-x-auto border-b border-[var(--tm-border)] bg-[var(--tm-surface-elevated)]/40 px-4 pt-3 sm:px-6">
                {personas.map((persona) => {
                  const isSelected = persona.id === selectedPersonaId
                  return (
                    <button
                      key={persona.id}
                      onClick={() => setSelectedPersonaId(persona.id)}
                      type="button"
                      className={`
                        flex items-center gap-2 shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-all duration-150
                        ${
                          isSelected
                            ? 'border-[var(--tm-primary)] text-[var(--tm-primary)] font-semibold'
                            : 'border-transparent text-[var(--tm-text-secondary)] hover:text-[var(--tm-text-primary)] hover:border-[var(--tm-border-strong)]'
                        }
                      `.trim()}
                    >
                      <Bot size={16} className={isSelected ? 'text-[var(--tm-primary)]' : 'text-[var(--tm-text-muted)]'} />
                      <span>{persona.display_name}</span>
                    </button>
                  )
                })}
              </div>

              {selectedPersona && (
                <div className="p-5 sm:p-7">
                  {/* Persona Header & Skill Selector */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--tm-border)] pb-4">
                    <div>
                      <h2 className="text-lg font-bold text-[var(--tm-text-primary)]">
                        {selectedPersona.display_name}
                      </h2>
                      <p className="mt-0.5 text-xs text-[var(--tm-text-secondary)]">
                        {selectedSkill ? '選択した専門スキルで実務をサポートします。' : AI_SKILLS_PAUSED_MESSAGE}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      {selectedPersona.skills.length > 1 && (
                        <select
                          aria-label="AIスキル"
                          className="h-9 rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] px-3 text-xs font-medium text-[var(--tm-text-primary)] outline-none transition focus:border-[var(--tm-border-focus)] focus:ring-2 focus:ring-[var(--tm-focus-ring)]/25"
                          disabled={isSending || !selectedSkill}
                          onChange={(event) =>
                            setSelectedSkills((current) => ({
                              ...current,
                              [selectedPersona.name]: event.target.value,
                            }))
                          }
                          value={selectedSkill}
                        >
                          {selectedPersona.skills.map((skill) => (
                            <option key={skill} value={skill} className="bg-[var(--tm-surface)] text-[var(--tm-text-primary)]">
                              {aiSkillLabels[skill] ?? skill}
                            </option>
                          ))}
                        </select>
                      )}
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-[var(--tm-primary)] border border-indigo-500/20">
                        <Bot size={18} />
                      </div>
                    </div>
                  </div>

                  {/* Chat Area */}
                  <div className="mt-5 min-h-[360px] space-y-4 rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)]/50 p-4 sm:p-5">
                    {!selectedSkill ? (
                      <p
                        role="status"
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-[var(--tm-surface)] p-4 text-sm leading-6 text-[var(--tm-text-secondary)]"
                      >
                        {AI_SKILLS_PAUSED_MESSAGE}
                      </p>
                    ) : chatMessages.length === 0 ? (
                      <div className="flex min-h-[280px] flex-col items-center justify-center px-4 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-[var(--tm-primary)] border border-indigo-500/20 mb-3">
                          <Bot size={24} />
                        </div>
                        <p className="font-semibold text-[var(--tm-text-primary)]">
                          こんにちは。{selectedPersona.display_name}です。
                        </p>
                        <p className="mt-1 text-xs text-[var(--tm-text-secondary)] max-w-sm">
                          法的文書の確認、要約、ドラフト作成など、どのようなお手伝いが必要ですか？
                        </p>
                      </div>
                    ) : (
                      chatMessages.map((message, index) => (
                        <div
                          className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          key={`${message.role}-${index}`}
                        >
                          <div
                            className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-4 py-3 text-sm leading-6 shadow-2xs ${
                              message.role === 'user'
                                ? 'bg-[var(--tm-primary)] text-white rounded-br-xs'
                                : 'border border-[var(--tm-border)] bg-[var(--tm-surface)] text-[var(--tm-text-primary)] rounded-bl-xs'
                            }`}
                          >
                            {message.content}
                          </div>
                        </div>
                      ))
                    )}

                    {isSending && (
                      <div className="flex items-center gap-2 text-xs text-[var(--tm-text-secondary)] bg-[var(--tm-surface)] w-fit px-3 py-1.5 rounded-lg border border-[var(--tm-border)]">
                        <ButtonSpinner className="text-[var(--tm-primary)]" size={15} />
                        AIが回答を生成中…
                      </div>
                    )}
                  </div>

                  {chatError && (
                    <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-[var(--tm-danger)]">
                      {chatError}
                    </div>
                  )}

                  {/* Message Input Form */}
                  <form className="mt-4 flex items-end gap-3" onSubmit={handleSubmit}>
                    <label className="sr-only" htmlFor="ai-chat-message">
                      メッセージ
                    </label>
                    <textarea
                      id="ai-chat-message"
                      maxLength={4000}
                      onChange={(event) => setMessageInput(event.target.value)}
                      onKeyDown={handleMessageKeyDown}
                      placeholder={`${selectedPersona.display_name}に指示・質問を入力 (Shift+Enterで改行)`}
                      rows={2}
                      value={messageInput}
                      disabled={isSending || !selectedSkill}
                      className="min-h-12 flex-1 resize-none rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface)] px-3.5 py-2.5 text-sm text-[var(--tm-text-primary)] placeholder:text-[var(--tm-text-muted)] outline-none transition focus:border-[var(--tm-border-focus)] focus:ring-2 focus:ring-[var(--tm-focus-ring)]/25 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <Button
                      variant="primary"
                      size="md"
                      type="submit"
                      disabled={isSending || !selectedSkill || messageInput.trim() === ''}
                      loading={isSending}
                      icon={!isSending ? <SendHorizontal size={16} /> : undefined}
                      className="h-12 px-5"
                    >
                      送信
                    </Button>
                  </form>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default AIEmployees
