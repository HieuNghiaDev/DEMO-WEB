import type { ReactNode } from 'react'
import type { ChatMention } from './types'

export default function ChatMentionText({ text, mentions = [] }: { text: string; mentions?: ChatMention[] }) {
  const parts: ReactNode[] = []
  let end = 0
  for (const mention of [...mentions].sort((a, b) => a.start - b.start)) {
    if (mention.start < end || mention.end <= mention.start || text.slice(mention.start, mention.end) !== `@${mention.name}`) continue
    parts.push(text.slice(end, mention.start), <mark key={mention.start} className="internal-chat-mention" title={mention.name}>{text.slice(mention.start, mention.end)}</mark>)
    end = mention.end
  }
  parts.push(text.slice(end))
  return <>{parts}</>
}
