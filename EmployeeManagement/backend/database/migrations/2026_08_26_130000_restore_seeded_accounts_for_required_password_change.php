<?php

use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

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
            ->where('is_active', false)
            ->where('must_change_password', true)
            ->get()
            ->each(function (User $user): void {
                DB::transaction(function () use ($user): void {
                    // These accounts were disabled only by the preceding
                    // credential-invalidation migration. Restore the known
                    // temporary credential, but force the password-change
                    // route before any business endpoint can be accessed.
                    $user->tokens()->delete();
                    $user->forceFill([
                        'password' => Hash::make('Themis@123456'),
                        'is_active' => true,
                        'must_change_password' => true,
                    ])->save();
                });
            });
    }

    public function down(): void
    {
        // The temporary-password state is intentionally retained on rollback.
    }
};
