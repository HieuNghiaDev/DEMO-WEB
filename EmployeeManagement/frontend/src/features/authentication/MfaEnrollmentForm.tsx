import { useId, useState, type FormEvent } from 'react'
import { Check, Copy } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '../../components/ui'
import { VerificationCodeInput } from './VerificationCodeInput'
import type { AuthSnapshot } from './authFlow'

export function MfaEnrollmentForm({ enrollment, busy, onConfirm }: {
  enrollment: NonNullable<AuthSnapshot['enrollment']>
  busy: boolean
  onConfirm: (otp: string) => void
}) {
  const inputId = useId()
  const instructionsId = useId()
  const [otp, setOtp] = useState('')
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')

  const copySetupKey = async () => {
    try {
      await navigator.clipboard.writeText(enrollment.secret)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('failed')
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || !/^[0-9]{6}$/.test(otp)) return
    setOtp('')
    onConfirm(otp)
  }

  return <div className="auth-security-form">
    <p id={instructionsId}>QRコードを読み取り、認証アプリの6桁のコードを入力してください。</p>
    <div className="auth-enrollment-qr">
      <QRCodeSVG value={enrollment.uri} size={200} marginSize={4} level="M"
        title="THEMIS 認証アプリ登録用QRコード" role="img" className="h-auto max-w-full rounded-md" />
    </div>
    <form className="auth-security-form" onSubmit={submit} aria-busy={busy}>
      <label htmlFor={inputId}>認証コード
        <VerificationCodeInput id={inputId} name="factor" value={otp} onChange={setOtp}
          disabled={busy} autoFocus describedBy={instructionsId} />
      </label>
      <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>設定を完了する</Button>
    </form>
    <details className="max-w-full justify-self-center">
      <summary className="cursor-pointer text-center text-sm text-[var(--tm-text-secondary)]">QRコードを読み取れない場合</summary>
      <p className="mt-2">認証アプリで時間ベース（TOTP）を選び、設定キーを入力してください。QRコードと設定キーは他の人に共有しないでください。</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1">{enrollment.secret}</code>
        <Button type="button" variant="outline" size="md" className="shrink-0" disabled={busy}
          icon={copyStatus === 'copied' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
          onClick={() => void copySetupKey()}>
          {copyStatus === 'copied' ? 'コピー済み' : 'コピー'}
        </Button>
      </div>
      <p role="status" className={copyStatus === 'failed' ? 'mt-2' : 'sr-only'}>
        {copyStatus === 'copied' ? '設定キーをコピーしました。'
          : copyStatus === 'failed' ? 'コピーできませんでした。設定キーを選択してコピーしてください。' : ''}
      </p>
    </details>
  </div>
}
