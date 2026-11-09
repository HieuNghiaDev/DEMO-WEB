<?php

namespace App\Services\Administration;

use App\Models\User;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\PersonalAccessToken;

/** Read-side verification only. Client booleans, cookies and arbitrary bearer abilities are not proof. */
final class VerifiedMfaSessions
{
    public const ACTIONS = ['role.assign', 'role.create', 'role.clone', 'role.rename', 'role.permissions', 'role.delete',
        'mfa.device_change', 'mfa.recovery_codes', 'mfa.disable', 'bootstrap.finish', 'account.password', 'account.email', 'employee.reset_password'];

    public static function identityHash(User $user): string
    {
        return hash('sha256', json_encode([$user->id, $user->email, $user->login_id, $user->employee_id,
            $user->password, (bool) $user->activation_required], JSON_THROW_ON_ERROR));
    }

    public function required(User $user): bool
    {
        return $this->policyRequiresMfa($user) || $this->enrolled($user);
    }

    public function enrolled(User $user): bool
    {
        return Schema::hasTable('account_mfa') && DB::table('account_mfa')->where('user_id', $user->id)
            ->whereNotNull('confirmed_at')->exists();
    }

    public function policyRequiresMfa(User $user): bool
    {
        return AdminCapabilities::isCanonicalAdmin($user)
            || $user->hasAnyRole(['legal_assistant', 'staff'])
            || (Schema::hasColumn('security_administration_state', 'bootstrap_user_id')
                && DB::table('security_administration_state')->where('id', 1)->where('bootstrap_user_id', $user->id)->exists());
    }

    public function token(User $user, mixed $token): ?PersonalAccessToken
    {
        if (! $token instanceof PersonalAccessToken || ! Schema::hasTable('account_mfa')) {
            return null;
        }
        $fresh = PersonalAccessToken::find($token->id);
        $account = $user->fresh();
        $state = DB::table('account_mfa')->where('user_id', $user->id)->first();
        if (! $fresh || ! $account || ! AdminCapabilities::active($account) || $account->must_change_password
            || $fresh->tokenable_type !== $account->getMorphClass() || (int) $fresh->tokenable_id !== $account->id
            || ! $fresh->mfa_verified_at || ! $state?->confirmed_at || ! $state->secret_ciphertext
            || (int) $fresh->mfa_version !== (int) $state->version
            || ! hash_equals((string) $fresh->mfa_identity_hash, self::identityHash($account))
            || ($fresh->expires_at && $fresh->expires_at->isPast())
            || (config('sanctum.expiration') && $fresh->created_at->lte(now()->subMinutes(config('sanctum.expiration'))))) {
            return null;
        }
        try {
            if (preg_match('/^[A-Z2-7]{32}$/D', Crypt::decryptString($state->secret_ciphertext)) !== 1) {
                return null;
            }
        } catch (\Throwable) {
            return null;
        }
        return $fresh;
    }

    public static function scopeHash(array $scope): string
    {
        ksort($scope);
        foreach ($scope as &$value) {
            if (is_array($value)) {
                sort($value);
            }
        }
        return hash('sha256', json_encode($scope, JSON_THROW_ON_ERROR));
    }

    public function proof(User $user, PersonalAccessToken $token, string $action, array $scope): ?object
    {
        $token = $this->token($user, $token);
        if (! $token || ! in_array($action, self::ACTIONS, true)) {
            return null;
        }
        return DB::table('authentication_challenges')->where('user_id', $user->id)->where('token_id', $token->id)
            ->where('purpose', 'step_up')->where('action', $action)->where('scope_hash', self::scopeHash($scope))
            ->where('identity_hash', self::identityHash($user->fresh()))->where('mfa_version', $token->mfa_version)
            ->whereNull('used_at')->whereNull('revoked_at')->where('expires_at', '>', now())->first();
    }

    public function ready(User $user): bool
    {
        $user = $user->fresh();
        if (! $user || ! AdminCapabilities::active($user) || $user->must_change_password || $user->activation_required
            || ! $user->employee || ! Schema::hasTable('account_mfa')) {
            return false;
        }
        if (app()->bound(CanonicalRbacResolver::class)
            && app(CanonicalRbacResolver::class)->mappingStatus($user) !== 'MAPPED_SYNTHETIC') {
            // An MFA-verified but unmapped identity has no usable target authority.
            // Keep protecting it as a candidate, but never count it as a replacement.
            return false;
        }
        $state = DB::table('account_mfa')->where('user_id', $user->id)->first();
        if (! $state?->confirmed_at || ! $state->last_login_at || ! $state->recovery_issued_at
            || ! hash_equals((string) $state->login_identity_hash, self::identityHash($user))) {
            return false;
        }
        try {
            return preg_match('/^[A-Z2-7]{32}$/D', Crypt::decryptString($state->secret_ciphertext)) === 1;
        } catch (\Throwable) {
            return false;
        }
    }
}
