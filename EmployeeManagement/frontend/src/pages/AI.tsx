import { Bot, LoaderCircle, SendHorizontal } from 'lucide-react'
import { type FormEvent, type KeyboardEvent, useEffect, useState } from 'react'
import axios from 'axios'
import api from '../services/api'

type Persona = {
  id: number
  name: string
  display_name: string
  skills: string[]
}

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type ChatResponse = {
  data: {
    message: string
  }
}

const friendlyErrorMessage = (error: unknown) => {
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
    default:
      return 'メッセージを送信できませんでした。しばらくしてからもう一度お試しください。'
  }
}

function AIEmployees() {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [selectedPersonaId, setSelectedPersonaId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [messagesByPersona, setMessagesByPersona] = useState<Record<string, ChatMessage[]>>({})
  const [errorsByPersona, setErrorsByPersona] = useState<Record<string, string | undefined>>({})
  const [messageInput, setMessageInput] = useState('')
  const [isSending, setIsSending] = useState(false)

  useEffect(() => {
    const loadPersonas = async () => {
      try {
        const response = await api.get<{ personas: Persona[] }>('/personas')
        const loadedPersonas = response.data.personas

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

  const sendMessage = async () => {
    const content = messageInput.trim()

    if (!selectedPersona || !content || isSending) {
      return
    }

    const personaName = selectedPersona.name
    const userMessage: ChatMessage = { role: 'user', content }

    setMessagesByPersona((current) => ({
      ...current,
      [personaName]: [...(current[personaName] ?? []), userMessage],
    }))
    setErrorsByPersona((current) => ({ ...current, [personaName]: undefined }))
    setMessageInput('')
    setIsSending(true)

    try {
      const response = await api.post<ChatResponse>('/ai/chat', {
        persona: personaName,
        skill: 'task_management',
        message: content,
      })

      setMessagesByPersona((current) => ({
        ...current,
        [personaName]: [
          ...(current[personaName] ?? []),
          { role: 'assistant', content: response.data.data.message },
        ],
      }))
    } catch (requestError) {
      setErrorsByPersona((current) => ({
        ...current,
        [personaName]: friendlyErrorMessage(requestError),
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
    <div className="mx-auto w-full max-w-5xl py-4 sm:py-8">
      <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-6 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
              <Bot size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">AI社員</h1>
              <p className="mt-1 text-sm text-gray-500">AI Employee Platform</p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-gray-500">
            <LoaderCircle className="animate-spin" size={20} />
            読み込み中です…
          </div>
        ) : error ? (
          <p className="p-8 text-sm text-red-600">{error}</p>
        ) : personas.length === 0 ? (
          <p className="p-8 text-sm text-gray-500">有効なAI社員はまだ登録されていません。</p>
        ) : (
          <>
            <div className="flex gap-2 overflow-x-auto border-b border-gray-200 px-6 pt-4 sm:px-8">
              {personas.map((persona) => (
                <button
                  className={`shrink-0 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                    persona.id === selectedPersonaId
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                  key={persona.id}
                  onClick={() => setSelectedPersonaId(persona.id)}
                  type="button"
                >
                  {persona.display_name}
                </button>
              ))}
            </div>

            {selectedPersona && (
              <div className="p-6 sm:p-8">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-800">
                      {selectedPersona.display_name}
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">タスク管理をお手伝いします。</p>
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                    <Bot size={21} />
                  </div>
                </div>

                <div className="mt-6 min-h-80 space-y-4 rounded-2xl border border-gray-100 bg-gray-50/70 p-4 sm:p-5">
                  {chatMessages.length === 0 ? (
                    <div className="flex min-h-64 flex-col items-center justify-center px-4 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
                        <Bot size={24} />
                      </div>
                      <p className="mt-4 font-medium text-gray-700">こんにちは。{selectedPersona.display_name}です。</p>
                      <p className="mt-1 text-sm text-gray-500">どのようなお手伝いが必要ですか？</p>
                    </div>
                  ) : (
                    chatMessages.map((message, index) => (
                      <div
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        key={`${message.role}-${index}`}
                      >
                        <p
                          className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                            message.role === 'user'
                              ? 'rounded-br-md bg-indigo-600 text-white'
                              : 'rounded-bl-md border border-gray-200 bg-white text-gray-700'
                          }`}
                        >
                          {message.content}
                        </p>
                      </div>
                    ))
                  )}

                  {isSending && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <LoaderCircle className="animate-spin text-indigo-500" size={17} />
                      AIが考えています…
                    </div>
                  )}
                </div>

                {chatError && (
                  <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                    {chatError}
                  </p>
                )}

                <form className="mt-4 flex items-end gap-3" onSubmit={handleSubmit}>
                  <label className="sr-only" htmlFor="ai-chat-message">メッセージ</label>
                  <textarea
                    className="min-h-12 flex-1 resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-gray-100"
                    disabled={isSending}
                    id="ai-chat-message"
                    maxLength={4000}
                    onChange={(event) => setMessageInput(event.target.value)}
                    onKeyDown={handleMessageKeyDown}
                    placeholder={`${selectedPersona.display_name}にメッセージを送る`}
                    rows={2}
                    value={messageInput}
                  />
                  <button
                    className="inline-flex h-12 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
                    disabled={isSending || messageInput.trim() === ''}
                    type="submit"
                  >
                    {isSending ? <LoaderCircle className="animate-spin" size={17} /> : <SendHorizontal size={17} />}
                    送信
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default AIEmployees
