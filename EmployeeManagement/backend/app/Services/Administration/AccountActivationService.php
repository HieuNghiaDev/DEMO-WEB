<?php

namespace App\Services\Administration;

use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use SensitiveParameter;

final class AccountActivationService
{
    public function __construct(private readonly AdminContinuityGuard $guard) {}

    public static function identityHash(User $user): string
    {
        return hash('sha256', json_encode([$user->id, $user->email, $user->login_id, $user->employee_id], JSON_THROW_ON_ERROR));
    }

    /** Internal issuance only. No HTTP/CLI delivery route until handover is approved. */
    public function issue(User $actor, User $target): ActivationInvitation
    {
        return $this->guard->run(function () use ($actor, $target): ActivationInvitation {
            $account = User::whereKey($target->id)->lockForUpdate()->firstOrFail();
            $this->requirePending($account);
            Gate::forUser($actor->fresh())->authorize('issueInvite', $account->employee);
            $this->revokeUnused($account);
            $raw = bin2hex(random_bytes(32));
            $expires = now()->addHours(24);
            DB::table('account_action_tokens')->insert([
                'user_id' => $account->id, 'purpose' => 'activation', 'token_hash' => hash('sha256', $raw),
                'issued_by' => $actor->id, 'subject_email_hash' => hash('sha256', $account->email),
                'subject_identity_hash' => self::identityHash($account),
                'issued_at' => now(), 'expires_at' => $expires, 'used_at' => null, 'revoked_at' => null,
                'created_at' => now(), 'updated_at' => now(),
            ]);
            return new ActivationInvitation($raw, $expires);
        }, $target, 'administration.activation_invite_issued', $actor, true);
    }

    public function revoke(User $actor, User $target): void
    {
        $this->guard->run(function () use ($actor, $target): void {
            $account = User::whereKey($target->id)->lockForUpdate()->firstOrFail();
            $this->requirePending($account);
            Gate::forUser($actor->fresh())->authorize('issueInvite', $account->employee);
            $this->revokeUnused($account);
        }, $target, 'administration.activation_invite_revoked', $actor, true);
    }

    public function complete(#[SensitiveParameter] string $raw, #[SensitiveParameter] string $password): void
    {
        \Illuminate\Support\Facades\Validator::make(['password' => $password], [
            'password' => ['required', 'string', 'max:128', \Illuminate\Validation\Rules\Password::min(11)->symbols(), 'regex:/[A-Z]/'],
        ])->validate();
        // Only a hash enters a DB query/exception; no raw token in SQL bindings or URLs.
        $hash = hash('sha256', $raw);
        $userId = DB::table('account_action_tokens')->where('token_hash', $hash)->where('purpose', 'activation')->value('user_id');
        $target = $userId ? User::find($userId) : null;
        if (! $target) {
            $this->invalid();
        }
        $this->guard->run(function () use ($target, $hash, $password): void {
            // Consistent ordering with issue/reissue: guard -> user -> employee -> token.
            $account = User::whereKey($target->id)->lockForUpdate()->first();
            $this->requirePending($account);
            $token = DB::table('account_action_tokens')->where('token_hash', $hash)->lockForUpdate()->first();
            if (! $token || (int) $token->user_id !== $account->id || $token->purpose !== 'activation'
                || $token->used_at !== null || $token->revoked_at !== null
                || Carbon::parse($token->expires_at)->lessThanOrEqualTo(now())
                || ! hash_equals($token->subject_email_hash, hash('sha256', $account->email))
                || ! hash_equals($token->subject_identity_hash, self::identityHash($account))) {
                $this->invalid();
            }
            // CAS is a second single-use backstop, including on SQLite where FOR UPDATE is absent.
            $consumed = DB::table('account_action_tokens')->where('id', $token->id)
                ->whereNull('used_at')->whereNull('revoked_at')->where('expires_at', '>', now())
                ->update(['used_at' => now(), 'updated_at' => now()]);
            if ($consumed !== 1) {
                $this->invalid();
            }
            $account->forceFill([
                'password' => Hash::make($password), 'activation_required' => false,
                'activated_at' => now(), 'must_change_password' => false, 'pii_requires_explicit' => true,
            ])->save();
            $this->revokeUnused($account);
            $account->revokeSessions();
        }, $target, 'administration.account_activated', null, true);
    }

    private function requirePending(?User $account): void
    {
        $employee = $account?->employee()->withTrashed()->lockForUpdate()->first();
        if (! $account || ! $account->activation_required || $account->activated_at !== null || ! $account->is_active
            || ! $employee || $employee->trashed() || $employee->status !== 'active'
            // Bootstrap/recovery must supply their approved continuity/MFA protocol in B2.4.
            // No nested guard bypass for an existing canonical Admin credential mutation.
            || $account->role === 'admin'
            || $account->roles()->whereIn('name', AdminCapabilities::PROTECTED_ROLES)->exists()) {
            $this->invalid();
        }
    }

    private function revokeUnused(User $account): void
    {
        DB::table('account_action_tokens')->where('user_id', $account->id)->where('purpose', 'activation')
            ->whereNull('used_at')->whereNull('revoked_at')->update(['revoked_at' => now(), 'updated_at' => now()]);
    }

    private function invalid(): never
    {
        throw ValidationException::withMessages(['token' => '招待を利用できません。承認済みの窓口に再発行を依頼してください。']);
    }
}
