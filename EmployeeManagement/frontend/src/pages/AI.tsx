import { SectionSkeleton } from '../components/loading'
import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  AI_CONVERSATION_HISTORY_LIMIT,
  friendlyAiErrorMessage,
  loadAiPersonas,
  sendAiChatMessage,
  type AiChatMessage,
  type AiPersona,
} from '../features/ai/aiChat'
import AiEmployeeWorkspace from '../features/ai/AiEmployeeWorkspace'

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
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

  const recentConversations = useMemo(
    () => personas.flatMap((persona) =>
      (messagesByPersona[persona.name] ?? [])
        .filter((message) => message.role === 'user')
        .map((message) => ({ persona: persona.display_name, content: message.content })),
    ).slice(-4).reverse(),
    [messagesByPersona, personas],
  )

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`
  }, [messageInput])

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

  const usePrompt = (prompt: string) => {
    setMessageInput(prompt)
    window.requestAnimationFrame(() => textareaRef.current?.focus())
  }

  return (
    <div className="ai-employee-page">
      <div className="ai-employee-container">
          {isLoading ? (
            <SectionSkeleton className="min-h-72" label="AI社員の情報を読み込み中です…" rows={4} />
          ) : error ? (
            <div className="rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface)] p-8 text-sm text-[var(--tm-danger)]">{error}</div>
          ) : personas.length === 0 ? (
            <div className="rounded-xl border border-[var(--tm-border)] bg-[var(--tm-surface)] p-8 text-center text-sm text-[var(--tm-text-secondary)]">
              有効なAI社員はまだ登録されていません。
            </div>
          ) : selectedPersona ? (
            <AiEmployeeWorkspace
              chatError={chatError}
              chatMessages={chatMessages}
              isSending={isSending}
              messageInput={messageInput}
              onMessageChange={setMessageInput}
              onMessageKeyDown={handleMessageKeyDown}
              onSelectPersona={setSelectedPersonaId}
              onSelectSkill={(personaName, skill) => setSelectedSkills((current) => ({ ...current, [personaName]: skill }))}
              onSubmit={handleSubmit}
              onUsePrompt={usePrompt}
              personas={personas}
              recentConversations={recentConversations}
              selectedPersona={selectedPersona}
              selectedPersonaId={selectedPersonaId}
              selectedSkill={selectedSkill}
              textareaRef={textareaRef}
            />
          ) : null}
      </div>
    </div>
  )
}

export default AIEmployees
