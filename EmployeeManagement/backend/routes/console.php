<?php

use App\Models\User;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;
use Symfony\Component\Console\Command\Command;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('themis:user-password {login_id} {--activate : Reactivate the account after resetting its password}', function () {
    $user = User::query()->where('login_id', $this->argument('login_id'))->first();

    if ($user === null) {
        $this->error('User was not found.');

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

    $updates = [
        'password' => Hash::make($password),
        'must_change_password' => false,
    ];

    if ($this->option('activate')) {
        $updates['is_active'] = true;
    }

    $user->forceFill($updates)->save();
    $user->tokens()->delete();

    $this->info('Password updated and all existing tokens revoked.');

    return Command::SUCCESS;
})->purpose('Securely reset a THEMIS user password without exposing it in shell history');
