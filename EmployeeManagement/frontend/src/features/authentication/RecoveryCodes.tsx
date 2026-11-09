import { useState } from 'react'
import { Button } from '../../components/ui'

export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false)
  return <section className="auth-security-form" aria-labelledby="recovery-codes-title">
    <h2 id="recovery-codes-title" className="text-base font-semibold">バックアップコードを安全に保存</h2>
    <p>10個のコードは一度だけ表示され、各コードは1回使用できます。メールやチャットで共有せず、安全な場所に保存してください。</p>
    <ul className="auth-security-codes">{codes.map(code => <li key={code}><code>{code}</code></li>)}</ul>
    <p>ページを閉じたり再読み込みしたりすると、このコードは再表示できません。</p>
    <label className="auth-security-ack"><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} />コードを安全な場所に保存しました。</label>
    <Button variant="primary" fullWidth disabled={!saved} onClick={onDone}>保存してログインに戻る</Button>
  </section>
}
