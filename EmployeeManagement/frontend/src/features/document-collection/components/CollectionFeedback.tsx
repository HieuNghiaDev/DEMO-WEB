import { Link } from 'react-router-dom'
import type { CollectionError } from '../errors'
export default function CollectionFeedback({ error, onRetry, onBack }: { error: CollectionError; onRetry?: () => void; onBack?: () => void }) {
  return <div className="dc-feedback dc-danger" role="alert"><p>{error.message}</p>
    {Object.entries(error.fields).map(([key, message]) => <p key={key}>{message}</p>)}
    <div className="dc-action-row">
      {error.status === 401 && <Link className="dc-button" to="/login">ログイン画面へ</Link>}
      {error.retryable && onRetry && <button className="dc-button" type="button" onClick={onRetry}>再試行</button>}
      {error.status === 404 && onBack && <button className="dc-button" type="button" onClick={onBack}>案件一覧へ戻る</button>}
    </div>
  </div>
}
