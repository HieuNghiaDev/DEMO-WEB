<?php

namespace App\Services\Administration;

use App\Contracts\AdministrativeAuthentication;
use App\Models\User;
use App\Services\SecurityAuditLogger;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use SensitiveParameter;

final class MfaAuthenticationService
{
    public function __construct(private readonly AdminContinuityGuard $guard, private readonly Totp $totp,
        private readonly VerifiedMfaSessions $sessions, private readonly SecurityAuditLogger $audit) {}

    public function loginChallenge(User $user, bool $remember): array
    {
        return $this->guard->run(function () use ($user, $remember): array {
            $user = $this->active($user->id);
            $state = DB::table('account_mfa')->where('user_id', $user->id)->first();
            $purpose = $state?->confirmed_at ? 'login_mfa' : 'login_enroll';
            $raw = $this->challenge($user, $purpose, (int) ($state?->version ?? 0), $remember);
            return ['mfa_required' => true, 'purpose' => $purpose, 'challenge' => $raw, 'expires_in' => 300];
        }, $user);
    }

    public function beginOptionalEnrollment(User $user, #[SensitiveParameter] string $password): array
    {
        return $this->guard->run(function () use ($user, $password): array {
            $current = $this->active($user->id);
            abort_if($this->sessions->required($current), 403);
            if (! Hash::check($password, $current->password)) {
                $this->invalid();
            }

            $purpose = 'opt_in_enroll';
            $version = (int) DB::table('account_mfa')->where('user_id', $current->id)->value('version');
            DB::table('authentication_challenges')->where('user_id', $current->id)->where('purpose', $purpose)
                ->whereNull('used_at')->whereNull('revoked_at')->update(['revoked_at' => now()]);
            $raw = $this->challenge($current, $purpose, $version, false);
            $this->record($current, 'administration.mfa_opt_in_requested');

            return ['challenge' => $raw, 'purpose' => $purpose, 'expires_in' => 300];
        }, $user);
    }

    public function startEnrollment(#[SensitiveParameter] string $raw): array
    {
        return $this->attempt($raw, ['login_enroll', 'recovery_enroll', 'opt_in_enroll'], function (User $user, object $challenge): array|false {
            $state = DB::table('account_mfa')->where('user_id', $user->id)->lockForUpdate()->first();
            if (($challenge->purpose !== 'recovery_enroll' && $state?->confirmed_at)
                || $state?->pending_challenge_id === $challenge->id) {
                return false; // Enrollment secret is shown once, not a readable account endpoint.
            }
            $secret = $this->totp->secret();
            if (! $state) {
                DB::table('account_mfa')->insert(['user_id' => $user->id]);
            }
            DB::table('account_mfa')->where('user_id', $user->id)->update([
                'pending_ciphertext' => Crypt::encryptString($secret), 'pending_challenge_id' => $challenge->id,
            ]);
            $this->record($user, 'administration.mfa_enrollment_started');
            // Deliberately not a QR/network request. Client must keep this only in volatile memory.
            return ['secret' => $secret, 'otpauth_uri' => 'otpauth://totp/'.rawurlencode('THEMIS:'.$user->login_id)
                .'?secret='.$secret.'&issuer=THEMIS&algorithm=SHA1&digits=6&period=30'];
        });
    }

    public function confirmEnrollment(#[SensitiveParameter] string $raw, #[SensitiveParameter] string $otp): array
    {
        return $this->attempt($raw, ['login_enroll', 'recovery_enroll', 'opt_in_enroll'], function (User $user, object $challenge) use ($otp): array|false {
            $state = DB::table('account_mfa')->where('user_id', $user->id)->lockForUpdate()->first();
            if (! $state || (int) $state->pending_challenge_id !== (int) $challenge->id || ! $state->pending_ciphertext) {
                return false;
            }
            if (! $this->reserveFactorAttempt($user)) {
                return false;
            }
            $step = $this->totp->matchingStep(Crypt::decryptString($state->pending_ciphertext), $otp, now()->timestamp, -1);
            if ($step === null) {
                return false;
            }
            $this->consumeChallenge($challenge);
            DB::table('account_mfa')->where('user_id', $user->id)->update([
                'secret_ciphertext' => $state->pending_ciphertext, 'pending_ciphertext' => null,
                'pending_challenge_id' => null, 'confirmed_at' => now(), 'last_step' => $step,
                'version' => $state->version + 1,
            ]);
            $user->revokeSessions();
            $codes = $this->rotateCodes($user);
            $this->record($user, 'administration.mfa_enrollment_confirmed');
            return ['recovery_codes' => $codes, 'reauthentication_required' => true];
        });
    }

    public function verifyLogin(#[SensitiveParameter] string $raw, #[SensitiveParameter] ?string $otp, #[SensitiveParameter] ?string $recoveryCode): array
    {
        return $this->attempt($raw, ['login_mfa'], function (User $user, object $challenge) use ($otp, $recoveryCode): array|false {
            if (($otp === null) === ($recoveryCode === null)) {
                return false;
            }
            if ($recoveryCode !== null) {
                if (! $this->reserveFactorAttempt($user)) {
                    return false;
                }
                $code = DB::table('mfa_recovery_codes')->where('user_id', $user->id)
                    ->where('code_hash', hash('sha256', $recoveryCode))->whereNull('used_at')->whereNull('revoked_at')->first();
                if (! $code || DB::table('mfa_recovery_codes')->where('id', $code->id)->whereNull('used_at')->whereNull('revoked_at')
                    ->update(['used_at' => now()]) !== 1) {
                    return false;
                }
                $this->consumeChallenge($challenge);
                $state = DB::table('account_mfa')->where('user_id', $user->id)->first();
                $next = $this->challenge($user, 'recovery_enroll', $state->version, false);
                $this->record($user, 'administration.mfa_recovery_code_used');
                // Password + recovery code permits replacing the device, NOT a business session.
                return ['challenge' => $next, 'purpose' => 'recovery_enroll', 'expires_in' => 300];
            }
            if (! $this->acceptOtp($user, $otp)) {
                return false;
            }
            $this->consumeChallenge($challenge);
            $state = DB::table('account_mfa')->where('user_id', $user->id)->first();
            $user->forceFill(['last_login_at' => now()])->save();
            $expires = $challenge->remember ? now()->addDays(30) : now()->addHours(12);
            $issued = $user->createToken('employee-web', ['*'], $expires);
            DB::table('personal_access_tokens')->where('id', $issued->accessToken->id)->update([
                'mfa_version' => $state->version, 'mfa_verified_at' => now(),
                'mfa_identity_hash' => VerifiedMfaSessions::identityHash($user),
            ]);
            DB::table('account_mfa')->where('user_id', $user->id)->update([
                'last_login_at' => now(), 'login_identity_hash' => VerifiedMfaSessions::identityHash($user),
            ]);
            $this->record($user, 'administration.mfa_login_verified');
            return ['message' => 'ログインしました。', 'token' => $issued->plainTextToken,
                'authentication' => ['requires_mfa' => true],
                'user' => $user->fresh(['employee.office', 'employee.department', 'roles.permissions'])];
        });
    }

    public function stepUp(User $user, #[SensitiveParameter] string $password, #[SensitiveParameter] string $otp, string $action, array $scope): array
    {
        abort_unless(in_array($action, VerifiedMfaSessions::ACTIONS, true), 403);
        $rules = match ($action) {
            AccountEmailChange::ACTION => ['email_hash' => ['required', 'string', 'regex:/^[a-f0-9]{64}$/D']],
            'role.assign' => ['user_id' => ['required', 'integer', 'min:1'], 'role_id' => ['required', 'integer', 'min:1']],
            EmployeePasswordReset::ACTION, AccountActivationService::ISSUE_ACTION =>
                ['user_id' => ['required', 'integer', 'min:1'], 'employee_id' => ['required', 'integer', 'min:1']],
            'role.create' => ['name' => ['required', 'string', 'max:64'], 'permissions' => ['present', 'array', 'max:100']],
            'role.clone', 'role.rename' => ['role_id' => ['required', 'integer', 'min:1'], 'name' => ['required', 'string', 'max:64']],
            'role.permissions' => ['role_id' => ['required', 'integer', 'min:1'], 'permissions' => ['present', 'array', 'max:100']],
            'role.delete' => ['role_id' => ['required', 'integer', 'min:1']],
            default => [],
        };
        abort_if(array_diff(array_keys($scope), array_keys($rules)) !== [], 422);
        $scope = \Illuminate\Support\Facades\Validator::make($scope, [...$rules,
            'permissions.*' => ['string', 'max:80']])->validate();
        foreach (['user_id', 'role_id', 'employee_id'] as $key) {
            if (isset($scope[$key])) {
                $scope[$key] = (int) $scope[$key];
            }
        }
        if ($action === EmployeePasswordReset::ACTION) abort_unless(AdminCapabilities::explicit($user, EmployeePasswordReset::ACTION), 403);
        if ($action === AccountActivationService::ISSUE_ACTION) {
            abort_unless(AdminCapabilities::isCanonicalAdmin($user), 403);
            $employee = \App\Models\Employee::query()->with('user')->find($scope['employee_id']);
            abort_unless($employee && $employee->user?->id === $scope['user_id'], 403);
            \Illuminate\Support\Facades\Gate::forUser($user)->authorize('issueInviteAsAdmin', $employee);
        }
        if ($action === 'bootstrap.finish') {
            $state = DB::table('security_administration_state')->where('id', 1)->first();
            abort_unless($state && (int) $state->bootstrap_user_id === $user->id && ! $state->bootstrap_completed_at && ! $state->admin_seen, 403);
            $scope = ['installation_id' => $state->installation_id, 'user_id' => $user->id];
        }
        $token = $this->sessions->token($user, $user->currentAccessToken());
        abort_unless($token, 403);
        $result = $this->guard->run(function () use ($user, $token, $password, $otp, $action, $scope): array|false {
            $current = $this->active($user->id);
            if (! $this->sessions->token($current, $token) || ! Hash::check($password, $current->password) || ! $this->acceptOtp($current, $otp)) {
                return false;
            }
            DB::table('authentication_challenges')->where('user_id', $current->id)->where('token_id', $token->id)
                ->where('purpose', 'step_up')->whereNull('used_at')->update(['revoked_at' => now()]);
            $this->challenge($current, 'step_up', $token->mfa_version, false, $token->id, $action, $scope);
            $this->record($current, 'administration.mfa_step_up_verified');
            return ['verified' => true, 'action' => $action, 'expires_in' => 300];
        }, $user);
        if ($result === false) {
            $this->invalid();
        }
        return $result;
    }

    public function regenerateCodes(User $user): array
    {
        return $this->guard->run(function () use ($user): array {
            app(AdministrativeAuthentication::class)->consumeMutation($user, 'mfa.recovery_codes');
            $codes = $this->rotateCodes($user);
            DB::table('account_mfa')->where('user_id', $user->id)->increment('version');
            $user->revokeSessions();
            $this->record($user, 'administration.mfa_recovery_codes_rotated');
            return ['recovery_codes' => $codes, 'reauthentication_required' => true];
        }, $user);
    }

    public function startDeviceChange(User $user): array
    {
        return $this->guard->run(function () use ($user): array {
            app(AdministrativeAuthentication::class)->consumeMutation($user, 'mfa.device_change');
            $state = DB::table('account_mfa')->where('user_id', $user->id)->first();
            $raw = $this->challenge($user, 'recovery_enroll', $state->version, false);
            $this->record($user, 'administration.mfa_device_change_started');
            return ['challenge' => $raw, 'purpose' => 'recovery_enroll', 'expires_in' => 300];
        }, $user);
    }

    public function disableOptionalMfa(User $user): array
    {
        return $this->guard->run(function () use ($user): array {
            $current = $this->active($user->id);
            abort_if($this->sessions->policyRequiresMfa($current), 403);
            app(AdministrativeAuthentication::class)->consumeMutation($user, 'mfa.disable');

            DB::table('account_mfa')->where('user_id', $current->id)->update([
                'secret_ciphertext' => null, 'pending_ciphertext' => null, 'pending_challenge_id' => null,
                'confirmed_at' => null, 'last_step' => -1, 'last_login_at' => null,
                'login_identity_hash' => null, 'recovery_issued_at' => null, 'version' => DB::raw('version + 1'),
            ]);
            DB::table('mfa_recovery_codes')->where('user_id', $current->id)->whereNull('used_at')
                ->whereNull('revoked_at')->update(['revoked_at' => now()]);
            $current->revokeSessions();
            $this->record($current, 'administration.mfa_opt_in_disabled');

            return ['reauthentication_required' => true];
        }, $user);
    }

    private function attempt(#[SensitiveParameter] string $raw, array $purposes, callable $work): array
    {
        $hash = hash('sha256', $raw);
        $challenge = DB::table('authentication_challenges')->where('secret_hash', $hash)->first();
        $user = $challenge?->user_id ? User::find($challenge->user_id) : null;
        if (! $user) {
            $this->invalid();
        }
        $result = $this->guard->run(function () use ($user, $hash, $purposes, $work): array|false {
            $user = $this->active($user->id);
            $challenge = DB::table('authentication_challenges')->where('secret_hash', $hash)->lockForUpdate()->first();
            $state = DB::table('account_mfa')->where('user_id', $user->id)->first();
            if (! $challenge || (int) $challenge->user_id !== $user->id || ! in_array($challenge->purpose, $purposes, true) || $challenge->used_at || $challenge->revoked_at
                || $challenge->attempts >= 5 || Carbon::parse($challenge->expires_at)->lte(now())
                || ! hash_equals($challenge->identity_hash, VerifiedMfaSessions::identityHash($user))
                || (int) $challenge->mfa_version !== (int) ($state?->version ?? 0)) {
                return false;
            }
            DB::table('authentication_challenges')->where('id', $challenge->id)->increment('attempts');
            return $work($user, $challenge);
        }, $user);
        if ($result === false) {
            $this->audit->record(request(), 'auth.mfa.failed', 'failure', $user);
            $this->invalid();
        }
        return $result;
    }

    private function active(int $id): User
    {
        $user = User::whereKey($id)->lockForUpdate()->first();
        if (! $user || ! AdminCapabilities::active($user) || $user->must_change_password || ! $user->employee) {
            $this->invalid();
        }
        return $user;
    }

    private function acceptOtp(User $user, #[SensitiveParameter] string $otp): bool
    {
        if (! $this->reserveFactorAttempt($user)) {
            return false;
        }
        $state = DB::table('account_mfa')->where('user_id', $user->id)->lockForUpdate()->first();
        if (! $state?->confirmed_at || ! $state->secret_ciphertext) {
            return false;
        }
        $step = $this->totp->matchingStep(Crypt::decryptString($state->secret_ciphertext), $otp, now()->timestamp, $state->last_step);
        return $step !== null && DB::table('account_mfa')->where('user_id', $user->id)->where('last_step', $state->last_step)
            ->update(['last_step' => $step]) === 1;
    }

    private function consumeChallenge(object $challenge): void
    {
        if (DB::table('authentication_challenges')->where('id', $challenge->id)->whereNull('used_at')->whereNull('revoked_at')
            ->where('expires_at', '>', now())->update(['used_at' => now()]) !== 1) {
            $this->invalid();
        }
    }

    private function reserveFactorAttempt(User $user): bool
    {
        // Account-wide budget across new login challenges/IPs; not just a per-link counter.
        // All callers already hold the common administration serialization lock.
        $key = 'mfa-factor-attempts:'.$user->id;
        if (\Illuminate\Support\Facades\RateLimiter::tooManyAttempts($key, 5)) {
            return false;
        }
        \Illuminate\Support\Facades\RateLimiter::hit($key, 60);
        return true;
    }

    private function challenge(User $user, string $purpose, int $version, bool $remember, ?int $tokenId = null, ?string $action = null, array $scope = []): string
    {
        $raw = bin2hex(random_bytes(32));
        DB::table('authentication_challenges')->insert([
            'user_id' => $user->id, 'token_id' => $tokenId, 'purpose' => $purpose, 'secret_hash' => hash('sha256', $raw),
            'identity_hash' => VerifiedMfaSessions::identityHash($user), 'mfa_version' => $version, 'remember' => $remember,
            'action' => $action, 'scope_hash' => VerifiedMfaSessions::scopeHash($scope), 'expires_at' => now()->addMinutes(5),
            'created_at' => now(), 'updated_at' => now(),
        ]);
        return $raw;
    }

    private function rotateCodes(User $user): array
    {
        DB::table('mfa_recovery_codes')->where('user_id', $user->id)->whereNull('used_at')->update(['revoked_at' => now()]);
        $codes = [];
        for ($i = 0; $i < 10; ++$i) {
            $raw = bin2hex(random_bytes(16));
            DB::table('mfa_recovery_codes')->insert(['user_id' => $user->id, 'code_hash' => hash('sha256', $raw), 'created_at' => now()]);
            $codes[] = $raw;
        }
        DB::table('account_mfa')->where('user_id', $user->id)->update(['recovery_issued_at' => now()]);
        return $codes;
    }

    private function record(User $user, string $event): void
    {
        $this->audit->recordRequired($user, $event, ['type' => 'users', 'id' => $user->id], [], [],
            ['revision' => (int) DB::table('security_administration_state')->where('id', 1)->value('revision')]);
    }

    private function invalid(): never
    {
        throw ValidationException::withMessages(['mfa' => '認証を完了できません。もう一度ログインしてください。']);
    }
}
