<?php

namespace App\Services\Administration;

use App\Contracts\AdministrativeAuthentication;
use App\Models\{Employee, User};
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\{DB, Hash, Schema};
use SensitiveParameter;

/** Bounded temporary handover, reusing B24 proof/audit and the existing action-token table. */
final class EmployeePasswordReset
{
    public const ACTION = 'employee.reset_password';
    public const PURPOSE = 'password_reset_handover';
    public const TTL_MINUTES = 15;

    public function __construct(private AdminContinuityGuard $guard, private AdministrativeAuthentication $authentication) {}

    public function reset(User $actor, Employee $employee): array
    {
        $target = $employee->user;
        abort_unless($target, 422, 'この社員にはログインアカウントがありません。');
        abort_unless(Schema::hasTable('account_action_tokens'), 409, '安全な再設定の準備が完了していません。');
        return $this->guard->run(function () use ($actor, $employee, $target): array {
            $actor = User::whereKey($actor->id)->lockForUpdate()->firstOrFail();
            $target = User::whereKey($target->id)->lockForUpdate()->firstOrFail();
            $subject = Employee::whereKey($employee->id)->lockForUpdate()->firstOrFail();
            abort_unless(AdminCapabilities::active($actor) && ! $actor->must_change_password
                && AdminCapabilities::explicit($actor, self::ACTION) && $actor->id !== $target->id
                && $target->employee_id === $subject->id && $target->is_active && $subject->status === 'active', 403);
            abort_if(AdminCapabilities::isCanonicalAdmin($target) || AdminCapabilities::isProtectedLegalSubject($target), 403,
                '保護されたアカウントには、承認済みの専用復旧手続きが必要です。');
            abort_if($target->activation_required, 422, '有効化待ちのアカウントには招待を利用してください。');
            // B24 deliberately disallows forced-password business login. Do not strand an enrolled target.
            abort_if(Schema::hasTable('account_mfa') && DB::table('account_mfa')->where('user_id', $target->id)->exists(), 409,
                'MFAアカウントには、承認済みの専用復旧手続きが必要です。');
            $scope = ['user_id' => $target->id, 'employee_id' => $subject->id];
            $this->authentication->consumeMutation($actor, self::ACTION, $scope);
            $temporary = 'Aa!'.bin2hex(random_bytes(16));
            $at = now(); $expires = $at->copy()->addMinutes(self::TTL_MINUTES);
            DB::table('account_action_tokens')->where('user_id', $target->id)->where('purpose', self::PURPOSE)
                ->whereNull('revoked_at')->update(['revoked_at' => $at, 'updated_at' => $at]);
            DB::table('account_action_tokens')->insert(['user_id' => $target->id, 'purpose' => self::PURPOSE,
                'token_hash' => hash('sha256', $temporary), 'issued_by' => $actor->id,
                'subject_email_hash' => hash('sha256', $target->email), 'subject_identity_hash' => AccountActivationService::identityHash($target),
                'issued_at' => $at, 'expires_at' => $expires, 'created_at' => $at, 'updated_at' => $at]);
            $target->forceFill(['password' => Hash::make($temporary), 'must_change_password' => true])->save();
            $target->revokeSessions();
            return ['temporary_password' => $temporary, 'expires_at' => $expires->toIso8601String()];
        }, $target, 'administration.password_reset', $actor, true);
    }

    /** null = no managed handover; false = invalid; otherwise cap every temporary session to this deadline. */
    public static function pendingExpiry(User $user, #[SensitiveParameter] ?string $credential = null): CarbonImmutable|false|null
    {
        if (! $user->must_change_password || ! Schema::hasTable('account_action_tokens')) return null;
        $record = DB::table('account_action_tokens')->where('user_id', $user->id)->where('purpose', self::PURPOSE)->orderByDesc('id')->first();
        if (! $record) return null; // Preserve pre-existing legacy forced-change accounts, never fabricate/reset them.
        if ($record->revoked_at || $record->used_at || CarbonImmutable::parse($record->expires_at)->lte(now())
            || ! hash_equals($record->subject_identity_hash, AccountActivationService::identityHash($user))
            || ($credential !== null && ! hash_equals($record->token_hash, hash('sha256', $credential)))) return false;
        return CarbonImmutable::parse($record->expires_at);
    }
}
