import { useEffect, useImperativeHandle, useRef, useState, type ChangeEvent, type KeyboardEvent, type Ref } from 'react'
import { Image as ImageIcon, Languages, LoaderCircle, Paperclip, Send, X } from 'lucide-react'
import type { ChatDraftMention, ChatMentionMember, ChatReply, ChatTranslationPair } from './types'
import { editMentions, mentionQuery } from './chatMentions'
import { fetchChatMentionMembers } from './api'

const imageExtensions = '.jpg,.jpeg,.png,.webp'
const fileExtensions = `.pdf,.doc,.docx,.xls,.xlsx,${imageExtensions}`
const megabyte = 1024 * 1024

function DraftAttachment({ file, disabled, onRemove }: { file: File; disabled: boolean; onRemove: () => void }) {
  const thumbnail = useRef<HTMLImageElement>(null)
  const image = /\.(jpe?g|png|webp)$/i.test(file.name)

  useEffect(() => {
    if (!image || !thumbnail.current) return
    const url = URL.createObjectURL(file)
    thumbnail.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [file, image])

  return <li className={`internal-chat-draft-file${image ? ' internal-chat-draft-file--image' : ''}`}>
    {image ? <img ref={thumbnail} className="internal-chat-draft-image" alt={`${file.name} の送信前プレビュー`} />
      : <Paperclip size={18} aria-hidden="true" />}
    <span title={file.name}>{file.name}</span>
    <button type="button" className="internal-chat-tool-btn internal-chat-draft-remove" disabled={disabled}
      aria-label={`${file.name} を外す`} onClick={onRemove}><X size={14} aria-hidden="true" /></button>
  </li>
}

export default function ChatComposer({ variant, draft, files, onFiles, sendError, isSending, onDraft, onSend, inputRef, reply, onCancelReply, mentions = [], onMentionDraft, translationPair = 'ja-vi', onTranslationPair }: {
  variant: 'embedded' | 'drawer'
  draft: string
  files: File[]
  onFiles: (files: File[]) => void
  sendError: string
  isSending: boolean
  onDraft: (draft: string) => void
  onSend: () => void
  inputRef?: Ref<HTMLTextAreaElement>
  reply?: ChatReply | null
  onCancelReply?: () => void
  mentions?: ChatDraftMention[]
  onMentionDraft?: (text: string, mentions: ChatDraftMention[]) => void
  translationPair?: ChatTranslationPair
  onTranslationPair?: (pair: ChatTranslationPair) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const [selectionError, setSelectionError] = useState('')
  const textarea = useRef<HTMLTextAreaElement | null>(null)
  useImperativeHandle(inputRef, () => textarea.current!, [])
  const [caret, setCaret] = useState(0)
  const [dismissed, setDismissed] = useState('')
  const [activeMember, setActiveMember] = useState(0)
  const [suggestions, setSuggestions] = useState<{ query: string; members: ChatMentionMember[]; failed?: boolean }>()
  const query = onMentionDraft && mentions.length < 10 ? mentionQuery(draft, caret, mentions) : null
  const queryKey = query ? `${query.start}:${query.end}:${query.search}` : ''
  const search = query && queryKey !== dismissed ? query.search : null
  const candidates = suggestions?.query === search ? suggestions.members : []
  const pickerOpen = search !== null && !isSending
  const activeIndex = Math.min(activeMember, Math.max(0, candidates.length - 1))
  const pickerId = `internal-chat-mentions-${variant}`

  useEffect(() => {
    if (search === null) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void fetchChatMentionMembers(search, controller.signal).then(members => {
        if (!controller.signal.aborted) setSuggestions({ query: search, members })
      }).catch(() => {
        if (!controller.signal.aborted) setSuggestions({ query: search, members: [], failed: true })
      })
    }, 180)
    return () => { clearTimeout(timer); controller.abort() }
  }, [search])

  const chooseMember = (member: ChatMentionMember) => {
    if (!query || !onMentionDraft) return
    const label = `@${member.name}`
    const text = draft.slice(0, query.start) + label + ' ' + draft.slice(query.end)
    if (text.length > 2000) return
    onMentionDraft(text, [...editMentions(draft, text, mentions), {
      type: 'user' as const, user_id: member.user_id, start: query.start, end: query.start + label.length,
    }].sort((a, b) => a.start - b.start))
    const position = query.start + label.length + 1
    setCaret(position)
    setDismissed('')
    requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(position, position) })
  }
  const canSend = !isSending && (draft.trim().length > 0 || files.length > 0)

  const pickFiles = (event: ChangeEvent<HTMLInputElement>, extensions: string) => {
    const selected = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    if (!selected.length) return
    const next = [...files, ...selected]
    if (selected.some(file => !extensions.split(',').includes(file.name.match(/\.[^.]+$/)?.[0].toLowerCase() ?? ''))) {
      setSelectionError('対応していないファイル形式です。')
    } else if (next.length > 4 || next.some(file => !file.size || file.size > 10 * megabyte)
      || next.reduce((total, file) => total + file.size, 0) > 20 * megabyte) {
      setSelectionError('添付は4件まで、1件10MB・合計20MB以下です。空のファイルは添付できません。')
    } else {
      setSelectionError('')
      onFiles(next)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return
    if (pickerOpen) {
      if (event.key === 'Escape') { event.preventDefault(); setDismissed(queryKey); return }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveMember((activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + Math.max(1, candidates.length)) % Math.max(1, candidates.length))
        return
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        if (candidates[activeIndex]) chooseMember(candidates[activeIndex])
        return
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (canSend) {
        void onSend()
      }
    }
  }

  return (
    <div className="internal-chat-composer-wrap">
      {pickerOpen && <div className="internal-chat-mention-picker">
        <div className="internal-chat-mention-picker-title">メンバーを選択</div>
        <ul id={pickerId} role="listbox" aria-label="メンションするメンバー">
          {candidates.map((member, index) => <li key={member.user_id} id={`${pickerId}-${index}`} role="option"
            aria-selected={index === activeIndex} onMouseDown={event => event.preventDefault()}
            onMouseEnter={() => setActiveMember(index)} onClick={() => chooseMember(member)}>
            <strong>{member.name}</strong><span>{member.employee_code}</span>
          </li>)}
        </ul>
        {!candidates.length && <p role="status">{suggestions?.query !== search ? '検索中…'
          : suggestions.failed ? 'メンバーを取得できませんでした。入力し直してください。' : '該当するメンバーがいません。'}</p>}
      </div>}
      <div className="internal-chat-composer-card">
        {reply && <div className="internal-chat-compose-reply">
          <div className="internal-chat-reply-quote">
            <strong>返信先 · {reply.sender_name}</strong>
            <span>{reply.excerpt}</span>
          </div>
          <button type="button" className="internal-chat-icon-btn" disabled={isSending}
            aria-label="返信を解除" onClick={onCancelReply}><X size={15} aria-hidden="true" /></button>
        </div>}
        <textarea
          ref={textarea}
          id={`internal-chat-input-${variant}`}
          value={draft}
          rows={2}
          maxLength={2000}
          disabled={isSending}
          onChange={(e) => { onDraft(e.target.value); setCaret(e.target.selectionStart); setActiveMember(0); setDismissed('') }}
          onSelect={event => setCaret(event.currentTarget.selectionStart)}
          onBlur={() => setDismissed(queryKey)}
          onKeyDown={onKeyDown}
          placeholder="メッセージを入力..."
          className="internal-chat-textarea"
          aria-label="メッセージ入力"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={pickerOpen}
          aria-controls={pickerOpen ? pickerId : undefined}
          aria-activedescendant={pickerOpen && candidates.length ? `${pickerId}-${activeIndex}` : undefined}
        />

        {files.length > 0 && <ul className="internal-chat-attachments internal-chat-draft-attachments" aria-label="送信するファイル">
          {files.map((file, index) => <DraftAttachment key={index} file={file} disabled={isSending} onRemove={() => {
            onFiles(files.filter((_, position) => position !== index))
            setSelectionError('')
          }} />)}
        </ul>}
        {selectionError && <p className="internal-chat-attachment-error" role="alert">{selectionError}</p>}
        {sendError && <p className="internal-chat-attachment-error" role="alert">{sendError}</p>}
        <input type="file" ref={fileInput} hidden multiple accept={fileExtensions} onChange={event => pickFiles(event, fileExtensions)} />
        <input type="file" ref={imageInput} hidden multiple accept={imageExtensions} onChange={event => pickFiles(event, imageExtensions)} />
        <div className="internal-chat-toolbar">
          <div className="internal-chat-toolbar-left">
            <button
              type="button"
              className="internal-chat-tool-btn"
              disabled={isSending}
              onClick={() => fileInput.current?.click()}
              title="ファイルを添付"
              aria-label="ファイルを添付"
            >
              <Paperclip size={18} />
            </button>

            <button
              type="button"
              className="internal-chat-tool-btn"
              disabled={isSending}
              onClick={() => imageInput.current?.click()}
              title="画像を挿入"
              aria-label="画像を挿入"
            >
              <ImageIcon size={18} />
            </button>

            <label className="internal-chat-preview-pill">
              <Languages size={13} aria-hidden="true" />
              <select aria-label="翻訳する言語の組み合わせ" value={translationPair}
                onChange={event => onTranslationPair?.(event.target.value as ChatTranslationPair)}>
                <option value="ja-vi">日本語 ↔ ベトナム語</option>
                <option value="ja-zh">日本語 ↔ 中国語</option>
              </select>
            </label>
          </div>

          <div className="internal-chat-toolbar-right">
            <span className="internal-chat-key-hint" aria-hidden="true">
              Enterで送信・Shift+Enterで改行
            </span>

            <button
              type="button"
              onClick={() => void onSend()}
              disabled={!canSend}
              className="internal-chat-send-btn"
              title="送信"
              aria-label="メッセージを送信"
            >
              {isSending ? (
                <LoaderCircle className="animate-spin" size={17} />
              ) : (
                <Send size={16} className="internal-chat-send-icon" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
