<?php

use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

return new class extends Migration
{
    /** @var list<string> */
    private const SEEDED_LOGIN_IDS = [
        'TM001',
        'TM002',
        'TM003',
        'TM004',
        'LW001',
        'LW002',
    ];

    public function up(): void
    {
        User::query()
            ->whereIn('login_id', self::SEEDED_LOGIN_IDS)
            ->where('must_change_password', true)
            ->get()
            ->each(function (User $user): void {
                if (! Hash::check('Themis@123456', $user->password)) {
                    return;
                }

                DB::transaction(function () use ($user): void {
                    $user->tokens()->delete();
                    $user->forceFill([
                        'password' => Hash::make(Str::random(64)),
                        'is_active' => false,
                        'must_change_password' => true,
                    ])->save();
                });
            });
    }

    public function down(): void
    {
        // Credential invalidation is intentionally irreversible.
    }
};
