import { Check, CheckCheck } from 'lucide-react'
import { UserAvatar } from '../../components/ui/UserAvatar'
import { getEmployeeAvatarImageUrl } from '../../utils/employeeAvatar'
import type { ChatReceipt } from './types'

export default function MessageReceipt({ receipt, readerMarkers: readers = [], showDelivery = true }: {
  receipt?: ChatReceipt
  readerMarkers?: ChatReceipt['readers']
  showDelivery?: boolean
}) {
  const readCount = receipt?.read_count ?? 0
  const overflowCount = readers.length - 3
  const hasDelivery = Boolean(receipt?.delivered_count)
  const hasRead = readCount > 0 || readers.length > 0
  const Icon = hasDelivery ? CheckCheck : Check
  const label = hasDelivery ? '受信済み' : '送信済み'

  if (!readers.length && (hasRead || !showDelivery)) return null

  return (
    <div className="internal-chat-read-receipt">
      {showDelivery && !hasRead && <>
        <Icon size={13} className="internal-chat-read-check" aria-hidden="true" />
        <span className="internal-chat-read-text">{label}</span>
      </>}
      {readers.length > 0 && (
        <details className="internal-chat-reader-details">
          <summary className="internal-chat-read-avatars" aria-label="このメッセージまで読んだメンバー" title={readers.map((reader) => reader.display_name).join('、')}>
            {readers.slice(0, 3).map((reader) => (
              <UserAvatar key={reader.user_id} name={reader.display_name} stableKey={reader.employee_id}
                imageSrc={getEmployeeAvatarImageUrl(reader.avatar_url)} size="xs" shape="circle"
                className="internal-chat-read-avatar-img" />
            ))}
            {overflowCount > 0 && <span className="internal-chat-read-avatar-more">+{overflowCount}</span>}
          </summary>
          <ul className="internal-chat-reader-list">
            {readers.map((reader) => <li key={reader.user_id}>{reader.display_name}</li>)}
          </ul>
        </details>
      )}
    </div>
  )
}

