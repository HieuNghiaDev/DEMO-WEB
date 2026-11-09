import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { memo } from 'react'
import { ArrowRight, FileSearch, FileText, FolderOpen } from 'lucide-react'
import type { AiChatMessage } from '../../features/ai/aiChat'
import type { AiNavigationOption } from '../../features/ai/navigationResults'
import { Button } from '../ui'
import TaskResultList from './TaskResultList'
import './assistantMessageContent.css'

function AssistantMessageContent({ content, taskResults, navigation, onNavigate, onOpenTask, onUsePrompt, showTaskGuidance = false }: Pick<AiChatMessage, 'content' | 'taskResults' | 'navigation'> & {
  onNavigate?: (option: AiNavigationOption) => void
  onOpenTask: (caseId: number, taskId: number) => void
  onUsePrompt: (prompt: string) => void
  showTaskGuidance?: boolean
}) {
  if (navigation) {
    if (!navigation.options.length) return <p className="themis-ai-response">{content}</p>
    const japanese = /[\u3040-\u30ff\u3400-\u9fff]/u.test(content)
    const heading = japanese ? '検索結果' : 'Kết quả tìm kiếm'
    return <section className="themis-ai-task-results themis-ai-navigation-results" aria-label={heading}>
      <header className="themis-ai-task-summary">
        <span className="themis-ai-task-summary-icon" aria-hidden="true"><FileSearch size={21} /></span>
        <div><h3>{heading}</h3><p>{content}</p></div>
      </header>
      {navigation.options.map(item => {
        const isDocument = item.action === 'open_case_document'
        const Icon = isDocument ? FileText : FolderOpen
        const kind = isDocument ? (japanese ? '資料' : 'Tài liệu') : (japanese ? '案件' : 'Hồ sơ')
        const action = isDocument ? (japanese ? '資料を開く' : 'Mở tài liệu') : (japanese ? '案件を開く' : 'Mở hồ sơ')
        const title = item.title || item.label
        return <article className="themis-ai-task-card" key={isDocument ? `${item.document_id}:${item.source}:${item.document_version_id}` : item.case_id}>
          <div className="themis-ai-task-card-header">
            <span className="themis-ai-task-icon" aria-hidden="true"><Icon size={20} /></span>
            <div className="themis-ai-task-identity">
              <span className="themis-ai-task-code">{[kind, item.case_code].filter(Boolean).join(' · ')}</span>
              <h4>{item.client_name || title}</h4>
              {item.client_name && item.client_name !== title && <p className="themis-ai-navigation-title">{title}</p>}
              {item.details && <p className="themis-ai-navigation-details">{item.details}</p>}
            </div>
            <Button variant="outline" size="sm" className="themis-ai-task-open" aria-label={[action, item.client_name, item.label].filter(Boolean).join(' · ')} onClick={() => onNavigate?.(item)}>
              {action} <ArrowRight size={13} aria-hidden="true" />
            </Button>
          </div>
        </article>
      })}
    </section>
  }
  return <div className="themis-ai-response">
    <div className="themis-ai-markdown">
      <Markdown remarkPlugins={[remarkGfm]} skipHtml allowedElements={['p', 'strong', 'em', 'ul', 'ol', 'li', 'code', 'pre', 'br', 'a', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'del', 'hr']} unwrapDisallowed
        urlTransform={url => /^(https?:\/\/|mailto:)/i.test(url) ? url : ''}
        components={{
          a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>,
          table: ({ children }) => <div className="themis-ai-markdown-table"><table>{children}</table></div>,
        }}>{content}</Markdown>
    </div>
    {taskResults?.map((result, index) => <TaskResultList key={result.id} result={result} onOpenTask={onOpenTask} onUsePrompt={onUsePrompt} showGuidance={showTaskGuidance && index === 0} />)}
  </div>
}

export default memo(AssistantMessageContent)
