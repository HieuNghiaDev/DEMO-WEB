<?php

namespace App\Services\Administration;

use App\Contracts\AdministrativeAuthentication;
use App\Mail\EmailChangeCode;
use App\Models\User;
use App\Services\SecurityAuditLogger;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;
use SensitiveParameter;

final class AccountEmailChange
{
    public const ACTION = 'account.email';

    public function __construct(private AdminContinuityGuard $guard, private VerifiedMfaSessions $sessions) {}

    public function available(): bool
    {
        $transport = config('mail.mailers.'.config('mail.default').'.transport');
        return Schema::hasTable('email_change_requests') && (app()->environment('testing') || $this->usesLocalLog()
            || in_array($transport, ['smtp', 'sendmail', 'mailgun', 'ses', 'ses-v2', 'postmark', 'resend'], true));
    }

    public function usesLocalLog(): bool
    {
        return app()->environment('local') && config('mail.default') === 'log';
    }

    public function issue(User $actor, string $email, #[SensitiveParameter] string $password, #[SensitiveParameter] ?string $otp): array
    {
        abort_unless($this->available(), 503, 'メール送信の設定が完了していないため、現在変更できません。');
        $email = strtolower(trim($email));
        $this->validateEmail($actor, $email);
        if ($this->sessions->required($actor)) {
            abort_unless($otp !== null, 422, '認証アプリのコードを入力してください。');
            app(MfaAuthenticationService::class)->stepUp($actor, $password, $otp, self::ACTION, ['email_hash' => hash('sha256', $email)]);
        }
        return $this->guard->run(function () use ($actor, $email, $password): array {
            $account = $this->active($actor);
            if (! Hash::check($password, $account->password)) {
                throw ValidationException::withMessages(['current_password' => '現在のパスワードが正しくありません。']);
            }
            $this->validateEmail($account, $email);
            abort_if(DB::table('email_change_requests')->where('user_id', $account->id)
                ->where('created_at', '>', now()->subSeconds(60))->exists(), 429, '60秒待ってから再送信してください。');
            $ttl = $this->sessions->required($account) ? 300 : 600;
            DB::table('email_change_requests')->where('user_id', $account->id)->whereNull('used_at')->whereNull('revoked_at')
                ->update(['revoked_at' => now(), 'updated_at' => now()]);
            $id = (string) Str::uuid();
            $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            DB::table('email_change_requests')->insert([
                'id' => $id, 'user_id' => $account->id, 'token_id' => $actor->currentAccessToken()->id,
                'email_ciphertext' => Crypt::encryptString($email), 'code_hash' => $this->codeHash($id, $code),
                'identity_hash' => VerifiedMfaSessions::identityHash($account), 'attempts' => 0,
                'expires_at' => now()->addSeconds($ttl), 'created_at' => now(), 'updated_at' => now(),
            ]);
            try {
                $mailer = $this->usesLocalLog() ? Mail::mailer('email_change_log') : Mail::mailer();
                $mailer->to($email)->send(new EmailChangeCode($code, (int) ($ttl / 60)));
            } catch (\Throwable) {
                abort(503, '確認メールを送信できませんでした。時間をおいて再試行してください。');
            }
            return ['challenge_id' => $id, 'expires_in' => $ttl, 'resend_after' => 60];
        }, $actor, 'administration.account_email_code_sent', $actor, true);
    }

    public function confirm(User $actor, string $id, #[SensitiveParameter] string $code): void
    {
        abort_unless(Schema::hasTable('email_change_requests'), 503);
        $pending = DB::table('email_change_requests')->where('id', $id)->where('user_id', $actor->id)->first();
        if (! $pending) $this->invalid();
        $email = Crypt::decryptString($pending->email_ciphertext);
        // Mark the identity mutation before entering the existing last-admin guard.
        $target = $actor->fresh();
        $target->email = $email;
        try {
            $valid = $this->guard->run(function () use ($actor, $id, $code, $email): bool {
                $account = $this->active($actor);
                $pending = DB::table('email_change_requests')->where('id', $id)->where('user_id', $account->id)->lockForUpdate()->first();
                if (! $pending || $pending->used_at || $pending->revoked_at || $pending->attempts >= 5
                    || $pending->expires_at <= now()->toDateTimeString()
                    || (int) $pending->token_id !== (int) $actor->currentAccessToken()->id
                    || ! hash_equals($pending->identity_hash, VerifiedMfaSessions::identityHash($account))) return false;
                if (! hash_equals($pending->code_hash, $this->codeHash($id, $code))) {
                    DB::table('email_change_requests')->where('id', $id)->update([
                        'attempts' => $pending->attempts + 1, 'revoked_at' => $pending->attempts >= 4 ? now() : null, 'updated_at' => now(),
                    ]);
                    return false;
                }
                $this->validateEmail($account, $email);
                if ($this->sessions->required($account)) {
                    app(AdministrativeAuthentication::class)->consumeMutation($account, self::ACTION, ['email_hash' => hash('sha256', $email)]);
                }
                $consumed = DB::table('email_change_requests')->where('id', $id)->whereNull('used_at')->whereNull('revoked_at')
                    ->where('expires_at', '>', now())->update(['used_at' => now(), 'updated_at' => now()]);
                if ($consumed !== 1) return false;
                $oldEmail = $account->email;
                $account->forceFill(['email' => $email, 'email_verified_at' => now()])->save();
                $employee = $account->employee;
                if (strtolower((string) $employee->work_email) === strtolower($oldEmail)) {
                    $employee->forceFill(['work_email' => $email])->save();
                }
                DB::table('email_change_requests')->where('user_id', $account->id)->whereNull('used_at')->whereNull('revoked_at')
                    ->update(['revoked_at' => now(), 'updated_at' => now()]);
                app(SecurityAuditLogger::class)->recordRequired($account, 'administration.account_email_changed',
                    ['type' => 'users', 'id' => $account->id], [], [], ['phase' => 'preparation', 'revision' => 0]);
                return true;
            }, $target, 'administration.account_email_changed', $actor);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages(['email' => 'このメールアドレスには変更できません。']);
        }
        if (! $valid) $this->invalid();
    }

    private function active(User $actor): User
    {
        $account = User::whereKey($actor->id)->lockForUpdate()->firstOrFail();
        $employee = $account->employee()->lockForUpdate()->first();
        $token = $actor->currentAccessToken();
        abort_unless($account->is_active && ! $account->activation_required && ! $account->must_change_password
            && $employee?->status === 'active' && $token instanceof PersonalAccessToken, 403);
        $fresh = PersonalAccessToken::find($token->id);
        abort_unless($fresh && (int) $fresh->tokenable_id === $account->id && $fresh->tokenable_type === $account->getMorphClass()
            && (! $fresh->expires_at || $fresh->expires_at->isFuture())
            && (! config('sanctum.expiration') || $fresh->created_at->gt(now()->subMinutes(config('sanctum.expiration')))), 403);
        abort_if($this->sessions->required($account) && ! $this->sessions->token($account, $fresh), 403);
        $account->withAccessToken($token);
        return $account;
    }

    private function validateEmail(User $actor, string $email): void
    {
        Validator::make(['email' => $email], ['email' => [
            'required', 'email:rfc', 'max:255', Rule::notIn([strtolower($actor->email)]),
            Rule::unique('users', 'email')->ignore($actor->id),
            Rule::unique('employees', 'work_email')->ignore($actor->employee_id),
        ]], ['email' => '利用可能な新しいメールアドレスを入力してください。'])->validate();
    }

    private function codeHash(string $id, #[SensitiveParameter] string $code): string
    {
        return hash_hmac('sha256', $id.'|'.$code, config('app.key'));
    }

    private function invalid(): never
    {
        throw ValidationException::withMessages(['code' => '確認コードが無効、または有効期限が切れています。再送信してください。']);
    }
}
