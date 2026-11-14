import { useState } from 'react'
import { Copy, KeyRound } from 'lucide-react'
import { Button } from '../../components/ui'
import api from '../../services/api'
import { AuthFailure, record } from './authFlow'
import StepUpDialog from './StepUpDialog'

type Invitation = { code: string; expiresAt: string }

const expiryFormat = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  dateStyle: 'medium',
  timeStyle: 'short',
})

export default function EmployeeActivationInvite({ employeeId, userId }: { employeeId: number; userId: number }) {
  const [verify, setVerify] = useState(false)
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [feedback, setFeedback] = useState('')

  const issue = async () => {
    const { data, status } = await api.post<unknown>(`/employees/${employeeId}/activation-invite`, undefined, { timeout: 30_000 })
    if (status !== 201 || !record(data) || typeof data.activation_code !== 'string'
      || !/^[a-f0-9]{64}$/.test(data.activation_code) || typeof data.expires_at !== 'string'
      || !Number.isFinite(Date.parse(data.expires_at))) throw new AuthFailure()
    return { code: data.activation_code, expiresAt: data.expires_at }
  }

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setFeedback('招待コードをコピーしました。')
    } catch {
      setFeedback('コピーできませんでした。コードを選択してコピーしてください。')
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] p-3.5">
      <div>
        <h3 className="text-xs font-semibold text-[var(--tm-text-primary)]">アカウントの有効化</h3>
        <p className="mt-1 text-xs text-[var(--tm-text-secondary)]">
          有効化待ちです。招待コードを発行し、本人に安全に渡してください。
        </p>
      </div>
      {invitation ? (
        <div className="space-y-2">
          <p className="text-xs text-[var(--tm-text-secondary)]">
            有効期限 {expiryFormat.format(new Date(invitation.expiresAt))}（日本時間）。閉じると再表示できません。
          </p>
          <code className="block rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface)] p-2.5 font-mono text-sm break-all select-all">
            {invitation.code}
          </code>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => void copy(invitation.code)} icon={<Copy size={14} aria-hidden="true" />}>コピー</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setInvitation(null); setFeedback('') }}>コードを閉じる</Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" disabled={verify} icon={<KeyRound size={14} aria-hidden="true" />}
          onClick={() => { setFeedback(''); setVerify(true) }}>招待コードを発行</Button>
      )}
      {feedback && <p role="status" className="text-xs text-[var(--tm-text-secondary)]">{feedback}</p>}
      {verify && <StepUpDialog
        language="ja"
        operation={{ action: 'employee.issue_activation_invite', scope: { user_id: userId, employee_id: employeeId } }}
        description="招待コードは24時間以内に1回だけ使えます。再発行すると、以前のコードは無効になります。"
        mutate={issue}
        onComplete={result => { setInvitation(result as Invitation); setVerify(false) }}
        onCancel={() => setVerify(false)}
        onMutationError={message => { setVerify(false); setFeedback(message) }}
      />}
    </section>
  )
}
