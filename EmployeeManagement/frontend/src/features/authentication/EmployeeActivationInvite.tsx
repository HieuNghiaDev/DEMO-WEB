import { useState } from 'react'
import { Check, Copy, KeyRound } from 'lucide-react'
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
  const [copied, setCopied] = useState(false)

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
      setCopied(true)
      setFeedback('招待コードをコピーしました。')
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setFeedback('コピーできませんでした。コードを選択してコピーしてください。')
    }
  }

  return (
    <section className="rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface)] p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--tm-border)] bg-[var(--tm-primary-muted)] text-[var(--tm-primary)]">
          <KeyRound size={15} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xs font-semibold text-[var(--tm-text-primary)]">アカウントの有効化</h3>
            <span className="rounded-full border border-indigo-500/25 bg-[var(--tm-primary-muted)] px-2 py-0.5 text-[10px] font-semibold text-[var(--tm-primary)]">
              有効化待ち
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[var(--tm-text-secondary)]">
            招待コードを発行し、本人に安全な経路で引き渡してください。
          </p>

          {invitation ? (
            <div className="mt-3 space-y-2.5 rounded-lg border border-[var(--tm-border)] bg-[var(--tm-surface-elevated)] p-3">
              <p className="text-[11px] font-medium text-[var(--tm-text-secondary)]">
                有効期限：{expiryFormat.format(new Date(invitation.expiresAt))}（日本時間）· 閉じると再表示できません
              </p>
              <code className="block rounded-md border border-[var(--tm-border)] bg-[var(--tm-surface)] px-3 py-2 font-mono text-xs text-[var(--tm-text-primary)] break-all select-all">
                {invitation.code}
              </code>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void copy(invitation.code)}
                  icon={copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                >
                  {copied ? 'コピー済み' : 'コードをコピー'}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => { setInvitation(null); setFeedback(''); setCopied(false) }}>
                  閉じる
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={verify}
                icon={<KeyRound size={13} aria-hidden="true" />}
                onClick={() => { setFeedback(''); setCopied(false); setVerify(true) }}
              >
                招待コードを発行
              </Button>
            </div>
          )}

          {feedback && <p role="status" className="mt-2.5 text-xs text-[var(--tm-text-secondary)]">{feedback}</p>}
        </div>
      </div>

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
