<?php

namespace Tests\Feature\HostingG5;

use App\Models\User;
use App\Services\Administration\VerifiedMfaSessions;
use Illuminate\Support\Facades\{DB, Hash, Schema};
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\B21\B21TestCase;

class ConsolePasswordResetTest extends B21TestCase
{
    private const DENIED = 'Generic account recovery is unavailable. Use the approved recovery procedure.';
    private const PASSWORD = 'SyntheticG5!Replacement-2026';

    public static function protectedSubjects(): array
    {
        $cases = [];
        foreach (['legal', 'legal_role', 'admin', 'developer', 'level_5', 'mfa', 'pending_mfa', 'bootstrap', 'activation'] as $kind) {
            foreach ([false, true] as $activate) {
                $cases[$kind.($activate ? '_activate' : '_reset')] = [$kind, $activate];
            }
        }
        return $cases;
    }

    private function subject(string $kind = 'ordinary'): User
    {
        $user = match ($kind) {
            'legal' => $this->fixtureUser('g5-legal', ['document.approve_legal']),
            'legal_role' => $this->fixtureUser('g5-lawyer', [], 'verified_lawyer'),
            'admin' => $this->fixtureAdmin('g5-admin'),
            'developer', 'level_5' => $this->fixtureUser('g5-'.$kind, [], $kind),
            default => $this->fixtureEmployee('g5-'.$kind),
        };
        // Raw synthetic arrange avoids changing a protected identity through an application writer.
        DB::table('users')->where('id', $user->id)->update(['login_id' => 'g5-synthetic-'.$user->id]);
        if (in_array($kind, ['mfa', 'pending_mfa'], true)) {
            DB::table('account_mfa')->insert(['user_id' => $user->id, 'version' => 1,
                'secret_ciphertext' => 'synthetic-not-decrypted', 'confirmed_at' => $kind === 'mfa' ? now() : null]);
        }
        if ($kind === 'bootstrap') {
            DB::table('security_administration_state')->where('id', 1)->update(['bootstrap_user_id' => $user->id]);
        }
        if ($kind === 'activation') {
            DB::table('users')->where('id', $user->id)->update(['activation_required' => true, 'activated_at' => null]);
        }
        $user->createToken('synthetic-preserved-session');
        DB::table('sessions')->insert(['id' => 'g5-session-'.$user->id, 'user_id' => $user->id,
            'payload' => 'synthetic-session', 'last_activity' => now()->timestamp]);
        DB::table('authentication_challenges')->insert(['user_id' => $user->id, 'purpose' => 'login',
            'secret_hash' => hash('sha256', 'g5-challenge-'.$user->id),
            'identity_hash' => VerifiedMfaSessions::identityHash($user->fresh()),
            'expires_at' => now()->addMinutes(5), 'created_at' => now(), 'updated_at' => now()]);
        return $user->fresh();
    }

    private function recoverySnapshot(): array
    {
        $state = [];
        foreach (['users', 'personal_access_tokens', 'sessions', 'account_action_tokens', 'account_mfa',
            'authentication_challenges', 'mfa_recovery_codes', 'security_administration_state', 'security_audit_logs'] as $table) {
            if (Schema::hasTable($table)) {
                $state[$table] = DB::table($table)->get()->map(fn ($row) => (array) $row)->all();
            }
        }
        return $state;
    }

    private function deny(string $loginId, bool $activate = false): void
    {
        $before = $this->recoverySnapshot();
        // No question expectations: any password prompt is a failure, even if the command later denies.
        $this->artisan('themis:user-password', ['login_id' => $loginId, '--activate' => $activate])
            ->expectsOutput(self::DENIED)->assertExitCode(1);
        $this->assertSame($before, $this->recoverySnapshot(), 'Denial must not mutate credentials, sessions, lifecycle or success audit.');
    }

    #[DataProvider('protectedSubjects')]
    public function test_protected_identity_is_denied_before_prompts_without_side_effects(string $kind, bool $activate): void
    {
        $user = $this->subject($kind);
        if ($activate) {
            DB::table('users')->where('id', $user->id)->update(['is_active' => false]);
        }
        $this->deny($user->login_id, $activate);
    }

    public static function missingState(): array
    {
        return [['account_mfa'], ['security_administration_state'], ['lock_anchor'], ['unknown_phase']];
    }

    #[DataProvider('missingState')]
    public function test_unknown_protection_state_fails_closed_before_prompts(string $missing): void
    {
        $user = $this->subject();
        if ($missing === 'lock_anchor') {
            DB::table('security_administration_state')->where('id', 1)->delete();
        } elseif ($missing === 'unknown_phase') {
            DB::table('security_administration_state')->where('id', 1)->update(['phase' => 'unknown']);
        } else {
            Schema::drop($missing); // SQLite RAM fault injection only.
        }
        $this->deny($user->login_id, true);
    }

    public function test_unknown_login_has_the_same_fixed_safe_denial_without_echoing_identity(): void
    {
        $this->deny('synthetic-missing@example.test');
    }

    public static function ordinaryModes(): array { return [[false, true], [false, false], [true, false]]; }

    #[DataProvider('ordinaryModes')]
    public function test_ordinary_reset_preserves_authorized_recovery_and_optional_reactivation(bool $activate, bool $wasActive): void
    {
        $user = $this->subject();
        DB::table('users')->where('id', $user->id)->update(['is_active' => $wasActive, 'must_change_password' => true]);
        $this->artisan('themis:user-password', ['login_id' => $user->login_id, '--activate' => $activate])
            ->expectsQuestion('New password (11+ chars, uppercase and symbol)', self::PASSWORD)
            ->expectsQuestion('Confirm new password', self::PASSWORD)
            ->expectsOutput('Password updated and all existing tokens revoked.')->assertExitCode(0);
        $user->refresh();
        $this->assertTrue(Hash::check(self::PASSWORD, $user->password));
        $this->assertSame($activate || $wasActive, $user->is_active);
        $this->assertFalse($user->must_change_password);
        $this->assertSame(0, $user->tokens()->count());
        $this->assertSame(0, DB::table('sessions')->where('user_id', $user->id)->count());
        $this->assertNotNull(DB::table('authentication_challenges')->where('user_id', $user->id)->value('revoked_at'));
        $audit = DB::table('security_audit_logs')->get()->toJson();
        $this->assertStringNotContainsString(self::PASSWORD, $audit);
        $this->assertStringNotContainsString($user->password, $audit);
        $this->assertDatabaseHas('security_audit_logs', ['event' => 'administration.cli_password_reset']);
    }

    public function test_invalid_confirmation_does_not_mutate_any_state(): void
    {
        $user = $this->subject(); $before = $this->recoverySnapshot();
        $this->artisan('themis:user-password', ['login_id' => $user->login_id])
            ->expectsQuestion('New password (11+ chars, uppercase and symbol)', self::PASSWORD)
            ->expectsQuestion('Confirm new password', 'SyntheticMismatch!2026')->assertExitCode(1);
        $this->assertSame($before, $this->recoverySnapshot());
    }

    public function test_protection_is_checked_again_after_the_password_prompt(): void
    {
        $user = $this->subject();
        $armed = true;
        // Synthetic interleaving after the initial check, when the existing mutation guard takes its lock.
        DB::listen(function (\Illuminate\Database\Events\QueryExecuted $query) use ($user, &$armed): void {
            if ($armed && str_starts_with($query->sql, 'update "security_administration_state"')) {
                $armed = false;
                DB::table('account_mfa')->insert(['user_id' => $user->id, 'version' => 1, 'confirmed_at' => now()]);
            }
        });
        $before = $this->recoverySnapshot();
        $this->artisan('themis:user-password', ['login_id' => $user->login_id])
            ->expectsQuestion('New password (11+ chars, uppercase and symbol)', self::PASSWORD)
            ->expectsQuestion('Confirm new password', self::PASSWORD)
            ->expectsOutput(self::DENIED)->assertExitCode(1);
        $this->assertSame($before, $this->recoverySnapshot());
        $this->assertFalse($armed, 'The synthetic interleaving must actually execute.');
    }

    public function test_failed_required_audit_rolls_back_password_lifecycle_and_sessions(): void
    {
        $user = $this->subject();
        Schema::drop('security_audit_logs'); // SQLite RAM fault injection only.
        $before = $this->recoverySnapshot();
        $this->artisan('themis:user-password', ['login_id' => $user->login_id, '--activate' => true])
            ->expectsQuestion('New password (11+ chars, uppercase and symbol)', self::PASSWORD)
            ->expectsQuestion('Confirm new password', self::PASSWORD)
            ->expectsOutput(self::DENIED)->assertExitCode(1);
        $this->assertSame($before, $this->recoverySnapshot());
    }
}
