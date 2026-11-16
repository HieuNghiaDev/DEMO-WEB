import { KeyRound } from 'lucide-react'
import { useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { SettingsSection } from '../../components/settings/SettingsSection'
import { useAuth } from '../../contexts/AuthContext'
import { RecoveryCodes } from './RecoveryCodes'
import './authentication.css'

export default function MfaBackupCodesPage() {
  const { user, isLoading, authFlow, authState } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    window.addEventListener('pagehide', authFlow.reset)
    return () => window.removeEventListener('pagehide', authFlow.reset)
  }, [authFlow])

  if (isLoading) return <main className="auth-security-page" lang="ja"><p role="status">読み込んでいます…</p></main>
  if (user) return <Navigate to="/system/mfa" replace />
  if (authState.phase !== 'recovery_codes' || !authState.codes?.length) return <Navigate to="/login" replace />

  return <main className="auth-security-page" lang="ja">
    <div className="w-full max-w-2xl min-w-0">
      <SettingsSection icon={KeyRound} title="バックアップコードを保存" description="設定 ／ セキュリティ">
        <div className="p-4 sm:p-6">
          <RecoveryCodes codes={authState.codes} onDone={() => {
            authFlow.reset()
            navigate('/login', { replace: true })
          }} />
        </div>
      </SettingsSection>
    </div>
  </main>
}
