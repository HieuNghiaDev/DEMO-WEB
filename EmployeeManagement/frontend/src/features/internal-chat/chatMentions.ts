import type { ChatDraftMention } from './types'

export function editMentions(previous: string, next: string, mentions: ChatDraftMention[]): ChatDraftMention[] {
  let start = 0
  while (start < previous.length && start < next.length && previous[start] === next[start]) start++
  let oldEnd = previous.length, newEnd = next.length
  while (oldEnd > start && newEnd > start && previous[oldEnd - 1] === next[newEnd - 1]) { oldEnd--; newEnd-- }
  const delta = newEnd - oldEnd
  return mentions.flatMap(mention => mention.end <= start ? [mention]
    : mention.start >= oldEnd ? [{ ...mention, start: mention.start + delta, end: mention.end + delta }] : [])
}

export function mentionQuery(text: string, caret: number, mentions: ChatDraftMention[]) {
  const match = /(?:^|\s)@([^@\n]{0,60})$/.exec(text.slice(0, caret))
  if (!match) return null
  const start = caret - match[1].length - 1
  return mentions.some(mention => start >= mention.start && start < mention.end) ? null : { start, end: caret, search: match[1] }
}

export function trimmedMentions(text: string, mentions: ChatDraftMention[]): ChatDraftMention[] {
  const offset = text.length - text.trimStart().length
  const end = text.trimEnd().length
  return mentions.filter(mention => mention.start >= offset && mention.end <= end)
    .map(mention => ({ ...mention, start: mention.start - offset, end: mention.end - offset }))
}
