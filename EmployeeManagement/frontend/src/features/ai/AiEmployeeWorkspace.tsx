import {
  ArrowUpRight,
  BookOpen,
  Bot,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileSearch,
  FileText,
  MessageSquareText,
  Paperclip,
  RotateCcw,
  Scale,
  Search,
  SendHorizontal,
  Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useRef, type FormEvent, type KeyboardEvent, type RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import AssistantMessageContent from '../../components/ai/AssistantMessageContent'
import { InlineLoader } from '../../components/loading'
import { CasePageHeader } from '../case-management/CasePrimitives'
import { aiTaskLocation } from './taskResults'
import type { AiChatMessage, AiPersona } from './aiChat'
import { AI_SKILLS_PAUSED_MESSAGE, aiSkillLabels } from './aiChat'
import { aiNavigationLocation, type AiNavigationOption } from './navigationResults'
import './aiEmployeePage.css'

type StarterAction = {
  title: string
  description: string
  prompt: string
  icon: typeof FileText
  tone: 'violet' | 'indigo' | 'amber' | 'emerald'
}

const starterActions: StarterAction[] = [
  {
    title: '担当タスク・期限の確認',
    description: '未完了タスクや期限が近い業務を一覧で整理します',
    prompt: '今日の担当タスクと期限が近い案件を整理してください。',
    icon: ClipboardCheck,
    tone: 'emerald',
  },
  {
    title: '法的文書のドラフト作成',
    description: '契約書・通知書・社内文書の下書きを作成します',
    prompt: '契約書のドラフトを作成してください。',
    icon: FileText,
    tone: 'violet',
  },
  {
    title: '法令・在留手続きの調査',
    description: '必要書類・申請手順・関連法令のポイントを確認します',
    prompt: '在留資格申請に必要な書類と注意点を教えてください。',
    icon: Scale,
    tone: 'indigo',
  },
  {
    title: '文書の要約・論点整理',
    description: '長文の要点抽出やリスク・確認事項を構造化します',
    prompt: 'この文書の要点と確認すべきリスクを整理してください。',
    icon: FileSearch,
    tone: 'amber',
  },
]

const quickPrompts = [
  { label: '期限超過のタスクを確認して', icon: ClipboardCheck },
  { label: '社内の規定について教えて', icon: Scale },
  { label: '法律用語をわかりやすく説明して', icon: BookOpen },
  { label: 'この案件の次の進め方を整理して', icon: Search },
]

type RecentConversation = {
  persona: string
  content: string
}

type AiEmployeeWorkspaceProps = {
  personas: AiPersona[]
  selectedPersona: AiPersona
  selectedPersonaId: number | null
  selectedSkill: string
  chatMessages: AiChatMessage[]
  chatError?: string
  messageInput: string
  isSending: boolean
  recentConversations: RecentConversation[]
  textareaRef: RefObject<HTMLTextAreaElement | null>
  onSelectPersona: (personaId: number) => void
  onSelectSkill: (personaName: string, skill: string) => void
  onMessageChange: (value: string) => void
  onMessageKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onUsePrompt: (prompt: string) => void
  onResetConversation?: () => void
}

export default function AiEmployeeWorkspace(props: AiEmployeeWorkspaceProps) {
  const navigate = useNavigate()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const openNavigation = (option: AiNavigationOption) => {
    const target = aiNavigationLocation(option)
    navigate({ pathname: target.pathname, search: target.search }, { state: target.state })
  }

  const handleOpenTask = useCallback((caseId: number, taskId: number) => {
    const target = aiTaskLocation({ case_id: caseId, task_id: taskId })
    navigate(target.pathname, { state: target.state })
  }, [navigate])

  const {
    personas,
    selectedPersona,
    selectedPersonaId,
    selectedSkill,
    chatMessages,
    chatError,
    messageInput,
    isSending,
    recentConversations,
    textareaRef,
    onSelectPersona,
    onSelectSkill,
    onMessageChange,
    onMessageKeyDown,
    onSubmit,
    onUsePrompt,
    onResetConversation,
  } = props

  const firstTaskResponseIndex = chatMessages.findIndex(
    (message) => message.taskResults?.some((result) => !result.error && result.tasks.length > 0),
  )
  const hasConversation = chatMessages.length > 0 || isSending || Boolean(chatError)
  const activeSkillLabel = selectedSkill ? (aiSkillLabels[selectedSkill] ?? selectedSkill) : '一時停止中'

  useEffect(() => {
    if (!hasConversation) return
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [chatMessages.length, hasConversation, isSending])

  return (
    <div className="ai-wb-root">
      {/* Canonical THEMIS Command page hero */}
      <section className="cm-clv-hero" aria-label="AI社員">
        <CasePageHeader
          title="AI社員"
          description="法務調査・書類ドラフト・案件タスク整理をAI社員がサポートします。"
          kicker={
            <span className="inline-flex items-center gap-1.5 text-[var(--tm-ai)]">
              <Sparkles size={12} aria-hidden="true" />
              AIオペレーション / Legal AI Workspace
            </span>
          }
          showIllustration={false}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <span className="ai-wb-status-pill">
                <span className="ai-wb-status-dot" aria-hidden="true" />
                {selectedPersona.display_name} · オンライン
              </span>
              {hasConversation && onResetConversation && (
                <button
                  type="button"
                  className="dc-button"
                  disabled={isSending}
                  onClick={onResetConversation}
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  新しい会話
                </button>
              )}
            </div>
          }
        />
      </section>

      {/* Main 2-column Legal AI Workbench */}
      <div className="ai-wb-grid">
        <section className="ai-wb-main" aria-label="AI会話ワークスペース">
          {/* Compact workspace toolbar: persona & skill selector */}
          <header className="ai-wb-toolbar">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="ai-wb-avatar" aria-hidden="true">
                <Bot size={17} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <strong className="truncate text-[13px] font-bold text-[var(--tm-text-primary)]">
                    {selectedPersona.display_name}
                  </strong>
                  <span className="ai-wb-tag">AI</span>
                </div>
                <p className="truncate text-[11px] text-[var(--tm-text-muted)]">
                  スキル: {activeSkillLabel}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {personas.length > 1 && (
                <div className="ai-wb-persona-tabs" role="tablist" aria-label="AI社員を選択">
                  {personas.map((persona) => (
                    <button
                      key={persona.id}
                      type="button"
                      role="tab"
                      aria-selected={persona.id === selectedPersonaId}
                      className={persona.id === selectedPersonaId ? 'is-selected' : ''}
                      onClick={() => onSelectPersona(persona.id)}
                    >
                      {persona.display_name}
                    </button>
                  ))}
                </div>
              )}

              {selectedPersona.skills.length > 1 && (
                <select
                  aria-label="AIスキル"
                  className="ai-wb-skill-select"
                  disabled={isSending || !selectedSkill}
                  onChange={(event) => onSelectSkill(selectedPersona.name, event.target.value)}
                  value={selectedSkill}
                >
                  {selectedPersona.skills.map((skill) => (
                    <option key={skill} value={skill}>
                      {aiSkillLabels[skill] ?? skill}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </header>

          {/* Conversation body or calm structured empty state */}
          <div className="ai-wb-canvas" aria-live="polite">
            {!selectedSkill && (
              <p className="ai-wb-notice" role="status">
                {AI_SKILLS_PAUSED_MESSAGE}
              </p>
            )}

            {!hasConversation ? (
              <div className="ai-wb-empty">
                <div className="ai-wb-empty-head">
                  <span className="ai-wb-empty-mark" aria-hidden="true">
                    <Sparkles size={19} />
                  </span>
                  <div>
                    <h2>どのような業務をサポートしますか？</h2>
                    <p>
                      下のテンプレートから開始するか、下部の入力欄から直接指示を入力してください。
                    </p>
                  </div>
                </div>

                <div className="ai-wb-starter-grid" aria-label="業務テンプレート">
                  {starterActions.map(({ title, description, prompt, icon: Icon, tone }) => (
                    <button
                      key={title}
                      type="button"
                      className="ai-wb-starter-card"
                      onClick={() => onUsePrompt(prompt)}
                    >
                      <span className={`ai-wb-starter-icon is-${tone}`} aria-hidden="true">
                        <Icon size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="ai-wb-starter-title">{title}</span>
                        <span className="ai-wb-starter-desc">{description}</span>
                      </span>
                      <ArrowUpRight size={14} className="ai-wb-starter-arrow" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="ai-wb-messages">
                {chatMessages.map((message, index) => (
                  <div className={`ai-wb-msg is-${message.role}`} key={`${message.role}-${index}`}>
                    {message.role === 'assistant' && (
                      <span className="ai-wb-msg-avatar" aria-hidden="true">
                        <Bot size={15} />
                      </span>
                    )}
                    <div
                      className={`ai-wb-msg-bubble ${
                        message.taskResults?.length || message.navigation?.options.length
                          ? 'themis-ai-structured-body'
                          : ''
                      }`}
                    >
                      {message.role === 'assistant' ? (
                        <AssistantMessageContent
                          content={message.content}
                          navigation={message.navigation}
                          onNavigate={openNavigation}
                          taskResults={message.taskResults}
                          onUsePrompt={onUsePrompt}
                          onOpenTask={handleOpenTask}
                          showTaskGuidance={index === firstTaskResponseIndex}
                        />
                      ) : (
                        message.content
                      )}
                    </div>
                  </div>
                ))}

                {isSending && (
                  <div className="ai-wb-msg is-assistant">
                    <span className="ai-wb-msg-avatar" aria-hidden="true">
                      <Bot size={15} />
                    </span>
                    <div className="ai-wb-msg-bubble">
                      <InlineLoader ai label="AIが回答を生成中…" />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}

            {chatError && (
              <div className="ai-wb-error" role="alert">
                {chatError}
              </div>
            )}
          </div>

          {/* Anchored composer */}
          <div className="ai-wb-composer-shell">
            <form className="ai-wb-composer" onSubmit={onSubmit}>
              <label className="sr-only" htmlFor="ai-chat-message">
                メッセージ
              </label>
              <textarea
                disabled={isSending || !selectedSkill}
                id="ai-chat-message"
                maxLength={4000}
                onChange={(event) => onMessageChange(event.target.value)}
                onKeyDown={onMessageKeyDown}
                placeholder={`${selectedPersona.display_name}に指示・質問を入力…`}
                ref={textareaRef}
                rows={2}
                value={messageInput}
              />

              <div className="ai-wb-composer-bar">
                <div className="flex items-center gap-2">
                  <button
                    aria-label="ファイル添付（準備中）"
                    className="ai-wb-attach-btn"
                    disabled
                    title="ファイル添付は準備中です"
                    type="button"
                  >
                    <Paperclip size={15} aria-hidden="true" />
                    <span className="hidden sm:inline">添付（準備中）</span>
                  </button>
                  <span className="hidden text-[11px] text-[var(--tm-text-dim)] md:inline">
                    Enterで送信 · Shift+Enterで改行
                  </span>
                </div>

                <button
                  type="submit"
                  className="ai-wb-send-btn"
                  disabled={isSending || !selectedSkill || messageInput.trim() === ''}
                >
                  <SendHorizontal size={14} aria-hidden="true" />
                  <span>{isSending ? '送信中…' : '送信'}</span>
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* Right Context Rail — no duplicate 4-card list */}
        <aside className="ai-wb-rail" aria-label="AIセッション情報と履歴">
          <section className="ai-wb-side-card">
            <div className="ai-wb-side-header">
              <Sparkles size={14} className="text-[var(--tm-ai)]" aria-hidden="true" />
              <h2>セッション概要</h2>
            </div>
            <dl className="ai-wb-meta-list">
              <div>
                <dt>担当AI</dt>
                <dd>{selectedPersona.display_name}</dd>
              </div>
              <div>
                <dt>現在のスキル</dt>
                <dd>{activeSkillLabel}</dd>
              </div>
              <div>
                <dt>メッセージ数</dt>
                <dd className="tabular-nums">{chatMessages.length}件</dd>
              </div>
            </dl>
          </section>

          <section className="ai-wb-side-card">
            <div className="ai-wb-side-header">
              <MessageSquareText size={14} className="text-[var(--tm-primary)]" aria-hidden="true" />
              <h2>よく使う質問</h2>
            </div>
            <div className="ai-wb-prompt-list">
              {quickPrompts.map(({ label, icon: Icon }) => (
                <button key={label} type="button" onClick={() => onUsePrompt(label)}>
                  <Icon size={14} className="ai-wb-prompt-icon" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <ChevronRight size={13} className="shrink-0 text-[var(--tm-text-dim)]" aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>

          <section className="ai-wb-side-card ai-wb-recent-card">
            <div className="ai-wb-side-header">
              <Clock3 size={14} className="text-[var(--tm-text-muted)]" aria-hidden="true" />
              <h2>最近の会話</h2>
            </div>
            {recentConversations.length > 0 ? (
              <div className="ai-wb-recent-list">
                {recentConversations.map((conversation, index) => (
                  <button
                    key={`${conversation.persona}-${index}`}
                    type="button"
                    onClick={() => onUsePrompt(conversation.content)}
                    title={conversation.content}
                  >
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-xs font-semibold text-[var(--tm-text-primary)]">
                        {conversation.content}
                      </strong>
                      <small className="mt-0.5 block text-[10.5px] text-[var(--tm-text-muted)]">
                        {conversation.persona}
                      </small>
                    </span>
                    <ChevronRight size={13} className="shrink-0 text-[var(--tm-text-dim)]" aria-hidden="true" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="ai-wb-recent-empty">
                <Clock3 size={18} aria-hidden="true" />
                <p>会話履歴はまだありません</p>
                <span>送信した指示がここに記録されます</span>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
