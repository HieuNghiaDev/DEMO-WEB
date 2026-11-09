<?php

use App\Models\User;
use App\Services\Administration\{AdminCapabilities, AdminContinuityGuard, VerifiedMfaSessions};
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;
use Symfony\Component\Console\Command\Command;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('themis:user-password {login_id} {--activate : Reactivate the account after resetting its password}', function () {
    $denied = 'Generic account recovery is unavailable. Use the approved recovery procedure.';
    $eligible = static function (User $subject): bool {
        // Missing MFA/activation/lock state is uncertainty, never evidence of an ordinary account.
        if (! Schema::hasColumns('users', ['activation_required', 'activated_at'])
            || ! Schema::hasTable('account_mfa')
            || ! Schema::hasColumns('security_administration_state', ['phase', 'bootstrap_user_id'])
            || $subject->getConnection()->table('security_administration_state')->where('id', 1)->value('phase') !== 'preparation') {
            return false;
        }
        return ! $subject->activation_required
            && ! AdminCapabilities::isCanonicalAdmin($subject)
            && ! AdminCapabilities::isProtectedLegalSubject($subject)
            && ! $subject->roles()->whereIn('name', AdminCapabilities::PROTECTED_ROLES)->exists()
            && ! app(VerifiedMfaSessions::class)->policyRequiresMfa($subject)
            // Generic recovery also excludes accounts with pending or historical enrollment state.
            && ! $subject->getConnection()->table('account_mfa')->where('user_id', $subject->id)->exists();
    };

    try {
        $user = User::query()->where('login_id', $this->argument('login_id'))->first();
        if ($user === null || ! $eligible($user)) {
            $this->error($denied);
            return Command::FAILURE;
        }
    } catch (\Throwable) {
        // Same response for missing identities, protected subjects and unavailable protection state.
        $this->error($denied);
        return Command::FAILURE;
    }

    $password = $this->secret('New password (11+ chars, uppercase and symbol)');
    $confirmation = $this->secret('Confirm new password');
    $validator = Validator::make([
        'password' => $password,
        'password_confirmation' => $confirmation,
    ], [
        'password' => [
            'required',
            'string',
            'confirmed',
            Password::min(11)->symbols(),
            'regex:/[A-Z]/',
        ],
    ]);

    if ($validator->fails()) {
        foreach ($validator->errors()->all() as $message) {
            $this->error($message);
        }

        return Command::FAILURE;
    }

    try {
        app(AdminContinuityGuard::class)->run(function () use ($user, $eligible, $password): void {
            $current = User::whereKey($user->id)->lockForUpdate()->first();
            // Protection can change while an operator is entering the password.
            if ($current === null || ! $eligible($current)) {
                throw new \LogicException('Generic recovery is unavailable.');
            }
            $updates = ['password' => Hash::make($password), 'must_change_password' => false];
            if ($this->option('activate')) {
                $updates['is_active'] = true;
            }
            $current->forceFill($updates)->save();
            $current->revokeSessions();
        }, $user, 'administration.cli_password_reset', null, true);
    } catch (\Throwable) {
        $this->error($denied);
        return Command::FAILURE;
    }

    $this->info('Password updated and all existing tokens revoked.');

    return Command::SUCCESS;
})->purpose('Securely reset a THEMIS user password without exposing it in shell history');
