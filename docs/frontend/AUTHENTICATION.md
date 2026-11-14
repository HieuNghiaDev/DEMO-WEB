# THEMIS frontend MFA — local integration (2026-10-21)

This extends the existing React AuthContext / Sanctum bearer setup. It does not
enable canonical RBAC, change roles/permissions, or fix SEC-09 browser bearer storage.
See `../../SECURITY_PHASE3_FRONTEND_MFA_REPORT.md` for evidence and release blockers.

## State and session boundary

`features/authentication/AuthFlow` is a volatile external store consumed with
useSyncExternalStore. States: idle, submitting_password, mfa_required,
mfa_enrollment_required, verifying_mfa, authenticated, expired_or_failed, recovery_codes.
Only a valid HTTP200 user/token response commits the existing bearer store. Password
HTTP202 is not authenticated and must contain mfa_required=true, login_mfa/login_enroll,
hex64 challenge and expires_in=300, without token/user. Invalid/pending responses deny.
Revision fencing ignores late replies after reset/logout/account switch/expiry.

Ordinary employee login stays HTTP200. `/me`, ordinary login and completed MFA login
now include `authentication.requires_mfa` (server-derived UX hint, NOT a permission
or a client-side MFA verifier). Existing user projections remain unchanged. New
frontend/backend must be released together; no deployment is authorized here.

## Clean pre-authentication transport

`authApi` reuses the configured Axios client with Authorization=false and
withCredentials=false for password/challenge/enrollment/activation requests. Its
request interceptor honors that explicit opt-out, even if another bearer is stored.
Requests use fixed POST paths and bodies, never secret URLs or query parameters.
Authentication calls and protected auth mutations use a 30-second timeout, sanitized
errors, no retry and no logging of Axios request/config/response data.

Only a completed session uses existing remember-me storage. No challenge, factor,
enrollment secret/URI, recovery code, proof or activation token is persisted. Logout
clears local state immediately while revoking the captured old bearer, and never
overwrites a newer login with a late response. Auth-only 401/419 events clear context;
403 is a permission/context failure, 422 allows manual fresh OTP retry, 429 asks the
user to wait. Server expiry/attempt budgets remain authoritative.

## Enrollment / recovery

`AuthChallengePage` uses manual setup in Google/Microsoft Authenticator: time-based
TOTP, six digits, 30-second period. Secret and otpauth URI are text in volatile state,
not hyperlinks/remote QR requests. Start is one-shot; lost response requires restarting
password login. Viewing configuration does not activate MFA. Confirmation must return
ten unique hex32 recovery codes + reauthentication_required=true, without a token.
Codes display once with an explicit saved acknowledgment; leaving/refresh/logout clears
the display. No copy/download/delivery or old-code retrieval API is added.

Password challenge + recovery code only returns recovery_enroll. New device enrollment
and TOTP confirmation still required, then clean password + new OTP login. Total loss
of device and codes has a contact instruction only; offline recovery remains BLOCKED.

Settings → Security shows 「二段階認証」 with 「推奨」 and opens `/system/mfa`.
The screen reads the account's enabled status and whether policy requires MFA.
An eligible employee can confirm their password to start setup. The browser signs
out and uses the short-lived enrollment challenge. MFA becomes active only when the
server accepts a code from the registered authenticator app. Setup, device changes
and code rotation use the existing recovery-code screen.

Users with optional MFA can disable it with a fresh password and authenticator code.
The server revokes sessions and recovery codes on disable. Policy-mandated accounts
can manage their device and recovery codes.

## Step-up

Reuse ModalShell for focus trap, body lock, inert background, ESC/backdrop and focus
restore. Busy verification/mutation disables dismissal and repeat submits. Fields are
uncontrolled and reset after capture. No global/persistent proof state exists.

Backend stores proof server-side, bound to the current PAT/user/MFA version/action/
scope. Response is `{verified:true,action,expires_in:300}`, not a reusable proof token.
After verification, send exactly one existing mutation on the same captured session.

| UI action | Action and exact scope | Mutation |
| --- | --- | --- |
| Existing organization role assignment | role.assign / user_id=employee.user_id, role_id=chosen role | PUT /employees/{employee.id}/roles, role_ids=[chosen role] |
| Password change | account.password / {} | PUT /password, original current/new/confirmation fields |
| New recovery codes | mfa.recovery_codes / {} | POST /mfa/recovery-codes/regenerate |
| Device replacement | mfa.device_change / {} | POST /mfa/device/change |

Role payload/scope is captured, not read again from editable selection. Permission
denial, expired/replayed proof or protected-role denial still comes from backend.
No role creation/clone/rename/delete/permission editor or bootstrap UI is added.
Existing non-MFA legacy role/password flows remain; this is not a legacy cutover.

On mutation error/timeout or malformed result, close verification and show an explicit
reconciliation message. Never retry a mutation automatically. Changing session while
verification is running prevents mutation. A successful step-up alone is never success
for the mutation. Cancelling UI does not revoke an already-issued server proof (no
such endpoint); its scope/one-use/expiry remain server-enforced.

## Activation

`/activate-account` is public and accepts manually entered invitation token + new
password/confirmation only. Uses real POST /account-activation/complete, no auto-login.
No token from URL, storage, database or fake invite API. New-employee copy now describes
pending activation/no shared password. Actual invitation issuance/delivery remains
BLOCKED: no approved public delivery endpoint exists. Existing-account temporary
password reset is a separate legacy workflow and was not changed.

## Design / verification

New surfaces use THEMIS tokens, shared Button/ModalShell, compact labelled controls,
Vietnamese instructions, password-manager/autocomplete/paste support, responsive widths
and wrapping secret text. Ordinary login/dashboard styles are not redesigned.
No QR/library dependency. UI skills informed semantics/focus/error/paste handling;
DESIGN_SYSTEM.md remains authoritative over skill suggestions.

Node fake-transport tests and actual Axios-fetch adapter tests cover state/session
boundaries and secret handling. Backend tests use the safe SQLite RAM runner only.
`tests/fixtures/mfa.html`/mfa.tsx provide an all-mocked, no-fallback fixture for later
browser checks on a separate origin. Browser access to its localhost server was
blocked in this run; desktop/mobile/light/dark visual and real-device E2E are not
certified. Do not test with project accounts as a workaround.

## Post-recovery stability fixes (2026-10-22)

Ordinary password-login server/network failures use a neutral authentication-error
heading, not an MFA heading. The challenge form requires a challenge-bearing MFA
state; malformed HTTP202 cannot expose the OTP/enrollment controls. Existing valid
challenge, enrollment and recovery flows remain unchanged.

A validated HTTP200 session commit retires initial loading immediately, including
after OTP verification, even if an older bootstrap `/me` is still pending. Logout
and auth-expiry also retire that loading state. The existing auth-revision fence
still rejects old `/me` results. `/me` has a 30-second request timeout; temporary
network/server failures retain the bearer and offer session-restoration retry,
whereas explicit 401/419 still clear an invalid session. HTTP202 never commits a
business session. Hook-scheduler and transport regressions cover these boundaries;
the current browser retest is BLOCKED by browser URL policy, not certified E2E.
