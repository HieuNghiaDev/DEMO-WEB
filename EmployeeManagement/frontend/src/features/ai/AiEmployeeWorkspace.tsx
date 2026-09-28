import {
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileSearch,
  FileText,
  Paperclip,
  Scale,
  Search,
  SendHorizontal,
  Sparkles,
} from 'lucide-react'
import type { FormEvent, KeyboardEvent, RefObject } from 'react'
import ThemisAIMascot from '../../components/ai/ThemisAIMascot'
import { InlineLoader } from '../../components/loading'
import { Button } from '../../components/ui'
import type { AiChatMessage, AiPersona } from './aiChat'
import { AI_SKILLS_PAUSED_MESSAGE, aiSkillLabels } from './aiChat'
import './aiEmployeePage.css'

type PromptAction = {
  label: string
  prompt: string
  icon: typeof FileText
  tone: 'indigo' | 'blue' | 'amber' | 'green'
}

const capabilityActions: PromptAction[] = [
  { label: '法的文書の作成', prompt: '契約書のドラフトを作成してください。', icon: FileText, tone: 'indigo' },
  { label: '調査・リサーチ', prompt: 'この案件に関連する法令と判例を調査してください。', icon: Search, tone: 'blue' },
  { label: '要約・分析', prompt: 'この文書の要点と注意点を整理してください。', icon: Sparkles, tone: 'amber' },
  { label: 'タスクサポート', prompt: 'この案件の次のタスクを整理してください。', icon: ClipboardCheck, tone: 'green' },
]

const examplePrompts = [
  { label: '契約書のドラフトを作成して', icon: FileText },
  { label: '在留資格申請に必要な書類は？', icon: Scale },
  { label: 'この文書を要約して', icon: FileSearch },
  { label: '社内の規定について教えて', icon: Scale },
  { label: '法律用語をわかりやすく説明して', icon: BookOpen },
  { label: 'タスクの進め方を整理して', icon: ClipboardCheck },
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
}

function PersonaSelector({
  personas,
  selectedPersonaId,
  onSelectPersona,
}: Pick<AiEmployeeWorkspaceProps, 'personas' | 'selectedPersonaId' | 'onSelectPersona'>) {
  if (personas.length < 2) return null

  return (
    <div className="ai-employee-personas" aria-label="AI社員を選択">
      {personas.map((persona) => (
        <button
          className={persona.id === selectedPersonaId ? 'is-selected' : ''}
          key={persona.id}
          onClick={() => onSelectPersona(persona.id)}
          type="button"
        >
          {persona.display_name}
        </button>
      ))}
    </div>
  )
}

function AiComposer({
  selectedPersona,
  selectedSkill,
  messageInput,
  isSending,
  textareaRef,
  onMessageChange,
  onMessageKeyDown,
  onSubmit,
}: Pick<
  AiEmployeeWorkspaceProps,
  | 'selectedPersona'
  | 'selectedSkill'
  | 'messageInput'
  | 'isSending'
  | 'textareaRef'
  | 'onMessageChange'
  | 'onMessageKeyDown'
  | 'onSubmit'
>) {
  return (
    <form className="ai-employee-composer" onSubmit={onSubmit}>
      <button
        aria-label="ファイル添付（準備中）"
        className="ai-employee-attach"
        disabled
        title="ファイル添付は準備中です"
        type="button"
      >
        <Paperclip size={18} />
      </button>
      <label className="sr-only" htmlFor="ai-chat-message">メッセージ</label>
      <textarea
        disabled={isSending || !selectedSkill}
        id="ai-chat-message"
        maxLength={4000}
        onChange={(event) => onMessageChange(event.target.value)}
        onKeyDown={onMessageKeyDown}
        placeholder={`${selectedPersona.display_name}に指示・質問を入力 (Shift+Enterで改行)`}
        ref={textareaRef}
        rows={1}
        value={messageInput}
      />
      <Button
        className="ai-employee-send"
        disabled={isSending || !selectedSkill || messageInput.trim() === ''}
        icon={!isSending ? <SendHorizontal size={16} /> : undefined}
        loading={isSending}
        size="md"
        type="submit"
        variant="primary"
      >
        送信
      </Button>
    </form>
  )
}

function AiSidebar({ recentConversations, onUsePrompt }: Pick<AiEmployeeWorkspaceProps, 'recentConversations' | 'onUsePrompt'>) {
  const quickTools = capabilityActions.slice(0, 4)

  return (
    <aside className="ai-employee-sidebar" aria-label="AI社員の補助機能">
      <section className="ai-side-panel">
        <h2><span className="ai-side-title-icon"><Sparkles size={17} /></span>クイックツール</h2>
        <div className="ai-quick-tools">
          {quickTools.map(({ label, prompt, icon: Icon, tone }) => (
            <button key={label} onClick={() => onUsePrompt(prompt)} type="button">
              <span className={`ai-tool-icon is-${tone}`}><Icon size={18} /></span>
              <span><strong>{label}</strong><small>プロンプトに入力</small></span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      </section>

      <section className="ai-side-panel">
        <h2><span className="ai-side-title-icon"><Clock3 size={17} /></span>最近の会話</h2>
        {recentConversations.length > 0 ? (
          <div className="ai-recent-list">
            {recentConversations.map((conversation, index) => (
              <button key={`${conversation.persona}-${index}`} onClick={() => onUsePrompt(conversation.content)} type="button">
                <span className="ai-recent-icon"><FileText size={16} /></span>
                <span><strong>{conversation.content}</strong><small>{conversation.persona}</small></span>
              </button>
            ))}
          </div>
        ) : (
          <div className="ai-recent-empty">
            <Clock3 size={20} />
            <p>会話履歴はまだありません</p>
            <span>AI社員との会話がここに表示されます。</span>
          </div>
        )}
      </section>
    </aside>
  )
}

export default function AiEmployeeWorkspace(props: AiEmployeeWorkspaceProps) {
  const {
    personas,
    selectedPersona,
    selectedPersonaId,
    selectedSkill,
    chatMessages,
    chatError,
    isSending,
    recentConversations,
    onSelectPersona,
    onSelectSkill,
    onUsePrompt,
  } = props
  const hasConversation = chatMessages.length > 0 || isSending || Boolean(chatError)

  return (
    <div className={`ai-employee-layout ${hasConversation ? 'has-conversation' : ''}`}>
      <main className="ai-employee-main">
        <PersonaSelector personas={personas} selectedPersonaId={selectedPersonaId} onSelectPersona={onSelectPersona} />

        {!hasConversation ? (
          <>
            <section className="ai-employee-hero">
              <div className="ai-hero-copy">
                <div className="ai-presence-row">
                  <span className="ai-identity-badge">THEMIS AI</span>
                  <span className="ai-online-badge"><i />オンライン</span>
                </div>
                <h2>こんにちは！<br /><span>THEMIS AI</span>です</h2>
                <p>社内の法務業務・書類作成・調査・要約など、<br className="hidden sm:block" />様々な業務をサポートします。<br />どのようなお手伝いが必要ですか？</p>
              </div>
              <div className="ai-hero-visual">
                <span className="ai-orbit-icon ai-orbit-document"><FileText size={25} /></span>
                <span className="ai-orbit-icon ai-orbit-scale"><Scale size={25} /></span>
                <span className="ai-orbit-icon ai-orbit-search"><Search size={23} /></span>
                <ThemisAIMascot className="ai-hero-mascot" expression="happy" interactive />
              </div>
            </section>

            <section className="ai-capability-grid" aria-label="AI社員の機能">
              {capabilityActions.map(({ label, prompt, icon: Icon, tone }) => (
                <button key={label} onClick={() => onUsePrompt(prompt)} type="button">
                  <span className={`ai-capability-icon is-${tone}`}><Icon size={22} /></span>
                  <span><strong>{label}</strong><small>{tone === 'blue' ? '法令・判例・制度の調査' : tone === 'amber' ? '文書の要約・論点整理' : tone === 'green' ? '業務手順・チェックリスト' : '契約書・申請書・社内文書'}</small></span>
                  <ChevronRight size={17} />
                </button>
              ))}
            </section>

            <section className="ai-example-section">
              <div className="ai-example-heading">
                <h3><Sparkles size={17} />こんなことができます</h3>
                <span>例を選ぶと入力欄に反映されます</span>
              </div>
              <div className="ai-example-grid">
                {examplePrompts.map(({ label, icon: Icon }) => (
                  <button key={label} onClick={() => onUsePrompt(label)} type="button"><Icon size={16} />{label}</button>
                ))}
              </div>
            </section>
          </>
        ) : (
          <section className="ai-conversation-shell">
            <header className="ai-conversation-header">
              <ThemisAIMascot compact expression={isSending ? 'thinking' : 'softSmile'} interactive={!isSending} />
              <div>
                <strong>{selectedPersona.display_name}</strong>
                <span className="ai-conversation-status"><i />オンライン</span>
              </div>
              {selectedPersona.skills.length > 1 && (
                <select
                  aria-label="AIスキル"
                  disabled={isSending || !selectedSkill}
                  onChange={(event) => onSelectSkill(selectedPersona.name, event.target.value)}
                  value={selectedSkill}
                >
                  {selectedPersona.skills.map((skill) => <option key={skill} value={skill}>{aiSkillLabels[skill] ?? skill}</option>)}
                </select>
              )}
            </header>
            <div className="ai-conversation-messages" aria-live="polite">
              {!selectedSkill && <p className="ai-skill-paused" role="status">{AI_SKILLS_PAUSED_MESSAGE}</p>}
              {chatMessages.map((message, index) => (
                <div className={`ai-message is-${message.role}`} key={`${message.role}-${index}`}>
                  {message.role === 'assistant' && <ThemisAIMascot compact expression="softSmile" interactive={false} />}
                  <div>{message.content}</div>
                </div>
              ))}
              {isSending && <div className="ai-message is-assistant"><ThemisAIMascot compact activity="processing" interactive={false} /><div><InlineLoader ai label="AIが回答を生成中…" /></div></div>}
            </div>
          </section>
        )}

        {!selectedSkill && !hasConversation && <p className="ai-skill-paused" role="status">{AI_SKILLS_PAUSED_MESSAGE}</p>}
        {chatError && <div className="ai-chat-error" role="alert">{chatError}</div>}
        <AiComposer {...props} />
      </main>

      <AiSidebar recentConversations={recentConversations} onUsePrompt={onUsePrompt} />
    </div>
  )
}
