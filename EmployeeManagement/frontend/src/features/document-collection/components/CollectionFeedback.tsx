import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { CollectionError } from '../errors'
export default function CollectionFeedback({ error, onRetry, onBack }: { error: CollectionError; onRetry?: () => void; onBack?: () => void }) {
  const { t } = useTranslation()
  return <div className="dc-feedback dc-danger" role="alert"><p>{error.message}</p>
    {Object.entries(error.fields).map(([key, message]) => <p key={key}>{message}</p>)}
    <div className="dc-action-row">
      {error.status === 401 && <Link className="dc-button" to="/login">{t('documentCollection.feedback.login')}</Link>}
      {error.retryable && onRetry && <button className="dc-button" type="button" onClick={onRetry}>{t('documentCollection.feedback.retry')}</button>}
      {error.status === 404 && onBack && <button className="dc-button" type="button" onClick={onBack}>{t('documentCollection.feedback.backToCases')}</button>}
    </div>
  </div>
}
