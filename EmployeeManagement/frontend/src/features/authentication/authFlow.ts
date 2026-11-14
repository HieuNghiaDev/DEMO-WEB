import type { AuthUser } from '../../contexts/AuthContext'

export type AuthEndpoint = '/login' | '/mfa/login' | '/mfa/enrollment/start' | '/mfa/enrollment/confirm' | '/mfa/enrollment/opt-in' | '/mfa/disable'
  | '/mfa/step-up' | '/mfa/recovery-codes/regenerate' | '/mfa/device/change' | '/account-activation/complete'
export type AuthTransport = (path: AuthEndpoint, body: Record<string, unknown>, preAuth: boolean) => Promise<{ status: number; data: unknown }>
export type AuthSession = { user: AuthUser; token: string; authentication: { requires_mfa: boolean } }
export type AuthPhase = 'idle' | 'submitting_password' | 'mfa_required' | 'mfa_enrollment_required'
  | 'verifying_mfa' | 'authenticated' | 'expired_or_failed' | 'recovery_codes'
export type AuthSnapshot = {
  phase: AuthPhase; busy: boolean; error: string; errorStatus?: number; challenge?: string; expiresAt?: number
  enrollment?: { secret: string; uri: string }; codes?: string[]
}
export class AuthFailure extends Error {
  readonly status: number
  constructor(status = 0, message = authErrorMessage(status)) { super(message); this.name = 'AuthFailure'; this.status = status }
}
export function authErrorMessage(status: number): string {
  if (status === 429) return 'Quá nhiều lần thử. Vui lòng chờ ít nhất một phút trước khi thử lại.'
  if (status === 401 || status === 419) return 'Phiên xác thực đã hết hạn. Vui lòng đăng nhập lại.'
  if (status === 403) return 'Thao tác không được phép hoặc phiên xác thực không còn hợp lệ.'
  if (status === 422) return 'Thông tin xác thực không hợp lệ hoặc đã hết hạn. Kiểm tra lại và thử mã mới.'
  return 'Không thể xác nhận kết quả với máy chủ. Kiểm tra kết nối trước khi thử lại.'
}
export function japaneseAuthError(status: number) {
  if (status === 429) return '試行回数が上限に達しました。1分以上待ってから再度お試しください。'
  if (status === 401 || status === 419) return 'セッションの有効期限が切れました。再度ログインしてください。'
  if (status === 403) return 'この操作は許可されていないか、認証が無効です。'
  if (status === 422) return '認証情報が正しくないか、有効期限が切れています。入力内容を確認して再度お試しください。'
  return 'サーバーからの応答を確認できませんでした。接続を確認してください。'
}
export const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const hex = (value: unknown, length: number): value is string => typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value)
export function parseSession(value: unknown): AuthSession {
  if (!record(value) || !record(value.user) || !record(value.authentication)
    || !Number.isSafeInteger(value.user.id) || Number(value.user.id) < 1 || value.user.is_active !== true
    || typeof value.user.email !== 'string' || !Array.isArray(value.user.roles)
    || !Array.isArray(value.user.role_names) || !value.user.role_names.every(name => typeof name === 'string')
    || !Array.isArray(value.user.permission_names) || !value.user.permission_names.every(name => typeof name === 'string')
    || value.user.activation_required === true || typeof value.authentication.requires_mfa !== 'boolean'
    || typeof value.token !== 'string' || !value.token.trim() || value.token.length > 1024) throw new AuthFailure(422)
  return value as AuthSession
}
function challenge(value: unknown, purposes: string[], now: number): Pick<AuthSnapshot, 'challenge' | 'expiresAt'> & { purpose: string } {
  if (!record(value) || !hex(value.challenge, 64) || typeof value.purpose !== 'string' || !purposes.includes(value.purpose)
    || value.expires_in !== 300 || 'token' in value || 'user' in value) throw new AuthFailure(422)
  return { challenge: value.challenge, purpose: value.purpose, expiresAt: now + 300_000 }
}
export function parseRecoveryCodes(value: unknown): string[] {
  if (!record(value) || value.reauthentication_required !== true || 'token' in value || !Array.isArray(value.recovery_codes)
    || value.recovery_codes.length !== 10 || !value.recovery_codes.every(code => hex(code, 32))
    || new Set(value.recovery_codes).size !== 10) throw new AuthFailure(422)
  return [...value.recovery_codes] as string[]
}

/** Volatile state only. A pre-auth challenge never reaches the business-token store. */
export class AuthFlow {
  private snapshot: AuthSnapshot = { phase: 'idle', busy: false, error: '' }
  private listeners = new Set<() => void>()
  private revision = 0
  private remember = false
  private send: AuthTransport
  private commit: (session: AuthSession, remember: boolean) => void
  private now: () => number
  constructor(send: AuthTransport, commit: (session: AuthSession, remember: boolean) => void, now = () => Date.now()) {
    this.send = send; this.commit = commit; this.now = now
  }
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private set(next: AuthSnapshot) { this.snapshot = next; this.listeners.forEach(listener => listener()) }
  reset = () => { ++this.revision; this.remember = false; this.set({ phase: 'idle', busy: false, error: '' }) }
  receiveRecoveryCodes = (data: unknown) => {
    const codes = parseRecoveryCodes(data)
    this.reset(); this.set({ phase: 'recovery_codes', busy: false, error: '', codes })
  }
  receiveDeviceChallenge = (data: unknown) => {
    const next = challenge(data, ['recovery_enroll'], this.now())
    this.reset(); this.set({ ...next, phase: 'mfa_enrollment_required', busy: false, error: '' })
  }
  receiveOptInChallenge = (data: unknown) => {
    const next = challenge(data, ['opt_in_enroll'], this.now())
    this.reset(); this.set({ ...next, phase: 'mfa_enrollment_required', busy: false, error: '' })
  }
  expire = () => {
    if (this.snapshot.expiresAt && this.now() >= this.snapshot.expiresAt) {
      ++this.revision; this.remember = false
      this.set({ phase: 'expired_or_failed', busy: false, error: authErrorMessage(401), errorStatus: 401 })
    }
  }
  private async attempt(phase: AuthPhase, work: (revision: number) => Promise<void>, terminal = false): Promise<void> {
    this.expire()
    if (this.snapshot.busy || this.snapshot.phase === 'expired_or_failed') return
    const revision = this.revision
    const previous = this.snapshot
    this.set({ ...previous, phase, busy: true, error: '' })
    try { await work(revision) } catch (error) {
      if (revision !== this.revision) return
      const failure = error instanceof AuthFailure ? error : new AuthFailure()
      if (terminal || [0, 401, 403, 419].includes(failure.status) || failure.status >= 500) {
        ++this.revision
        this.set({ phase: 'expired_or_failed', busy: false, error: failure.message, errorStatus: failure.status })
      } else this.set({ ...previous, busy: false, error: failure.message, errorStatus: failure.status })
    }
  }
  private finish(data: unknown, revision: number, requiresMfa: boolean) {
    if (revision !== this.revision) return
    const session = parseSession(data)
    if (session.authentication.requires_mfa !== requiresMfa) throw new AuthFailure(422)
    this.commit(session, this.remember)
    this.remember = false
    this.set({ phase: 'authenticated', busy: false, error: '' })
  }
  login = async (credentials: { email: string; password: string; remember: boolean }): Promise<boolean> => {
    if (this.snapshot.busy) return false
    this.reset(); this.remember = credentials.remember
    await this.attempt('submitting_password', async revision => {
      const response = await this.send('/login', credentials, true)
      if (revision !== this.revision) return
      if (response.status === 200) { this.finish(response.data, revision, false); return }
      if (response.status !== 202 || !record(response.data) || response.data.mfa_required !== true) throw new AuthFailure(422)
      const next = challenge(response.data, ['login_mfa', 'login_enroll'], this.now())
      this.set({ ...next, phase: next.purpose === 'login_mfa' ? 'mfa_required' : 'mfa_enrollment_required', busy: false, error: '' })
    })
    return this.snapshot.phase === 'authenticated'
  }
  verify = async (input: { otp: string } | { recovery_code: string }) => {
    if (this.snapshot.phase !== 'mfa_required') return
    const raw = this.snapshot.challenge
    await this.attempt('verifying_mfa', async revision => {
      const response = await this.send('/mfa/login', { challenge: raw, ...input }, true)
      if (revision !== this.revision) return
      if (response.status !== 200) throw new AuthFailure(422)
      if ('otp' in input) { this.finish(response.data, revision, true); return }
      const next = challenge(response.data, ['recovery_enroll'], this.now())
      this.set({ ...next, phase: 'mfa_enrollment_required', busy: false, error: '' })
    })
  }
  startEnrollment = async () => {
    if (this.snapshot.phase !== 'mfa_enrollment_required' || this.snapshot.enrollment) return
    const raw = this.snapshot.challenge
    await this.attempt('mfa_enrollment_required', async revision => {
      const response = await this.send('/mfa/enrollment/start', { challenge: raw }, true)
      if (revision !== this.revision) return
      const data = response.data
      if (response.status !== 200 || !record(data) || typeof data.secret !== 'string' || !/^[A-Z2-7]{32}$/.test(data.secret)
        || typeof data.otpauth_uri !== 'string') throw new AuthFailure(422)
      const uri = new URL(data.otpauth_uri)
      if (uri.protocol !== 'otpauth:' || uri.hostname !== 'totp' || uri.searchParams.get('secret') !== data.secret) throw new AuthFailure(422)
      this.set({ ...this.snapshot, busy: false, enrollment: { secret: data.secret, uri: data.otpauth_uri } })
    }, true) // Start is one-shot: a lost response requires a fresh password challenge.
  }
  confirmEnrollment = async (otp: string) => {
    if (this.snapshot.phase !== 'mfa_enrollment_required' || !this.snapshot.enrollment) return
    const raw = this.snapshot.challenge
    await this.attempt('verifying_mfa', async revision => {
      const response = await this.send('/mfa/enrollment/confirm', { challenge: raw, otp }, true)
      if (revision !== this.revision) return
      if (response.status !== 200) throw new AuthFailure(422)
      this.remember = false
      this.set({ phase: 'recovery_codes', busy: false, error: '', codes: parseRecoveryCodes(response.data) })
    })
  }
}

export type StepUpOperation = { action: 'role.assign'; scope: { user_id: number; role_id: number } }
  | { action: 'employee.reset_password'; scope: { user_id: number; employee_id: number } }
  | { action: 'employee.issue_activation_invite'; scope: { user_id: number; employee_id: number } }
  | { action: 'account.password' | 'mfa.recovery_codes' | 'mfa.device_change' | 'mfa.disable'; scope: Record<string, never> }
export class MutationUncertain extends AuthFailure {
  constructor(status = 0) {
    super(status, status >= 400 && status < 500
      ? `${authErrorMessage(status)} Hệ thống không tự gửi lại thao tác; hãy kiểm tra trạng thái trước khi xác minh lại.`
      : 'Thao tác chưa được xác nhận. Kiểm tra trạng thái hiện tại trước khi thực hiện lại; hệ thống không tự gửi lại yêu cầu.')
  }
}
export async function performStepUp<T>(send: AuthTransport, operation: StepUpOperation, password: string, otp: string,
  mutate: () => Promise<T>, isCurrent: () => boolean): Promise<T> {
  // Freeze scope to the exact operation the person chose, not editable form state.
  const scope = { ...operation.scope }
  const action = operation.action
  if (!isCurrent()) throw new AuthFailure(401)
  const response = await send('/mfa/step-up', { password, otp, action, scope }, false)
  if (!isCurrent()) throw new AuthFailure(401)
  if (response.status !== 200 || !record(response.data) || response.data.verified !== true
    || response.data.action !== action || response.data.expires_in !== 300) throw new AuthFailure(422)
  try { return await mutate() } catch (error) { throw new MutationUncertain(error instanceof AuthFailure ? error.status : 0) }
}
