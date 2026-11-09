<?php

namespace Tests\Feature\HostingG2;

use App\Services\Administration\Totp;
use Illuminate\Support\Facades\{DB, Hash, Schema};
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\B21\B21TestCase;

class PasswordResetSecurityTest extends B21TestCase
{
    private function manager(): \App\Models\User
    {
        $manager = $this->fixtureUser('reset-manager', ['employee.reset_password']);
        // Real B24 enrollment/login, using existing synthetic helper without legal authority fixtures.
        $this->c = ['lawyer' => $manager]; $this->enrollAndLogin();
        return $manager;
    }

    use \Tests\Support\C001\BuildsC001DecisionFixtures;

    private function resetProof(\App\Models\User $target): void
    {
        $this->travel(31)->seconds();
        $this->postJson('/api/mfa/step-up', ['password' => self::SYNTHETIC_PASSWORD,
            'otp' => app(Totp::class)->code($this->secret, now()->timestamp), 'action' => 'employee.reset_password',
            'scope' => ['user_id' => $target->id, 'employee_id' => $target->employee_id]])->assertOk();
    }

    public function test_level_and_employee_update_do_not_grant_password_reset(): void
    {
        $manager = $this->fixtureUser('legacy-reset', ['employee.update'], 'level_5');
        $target = $this->fixtureEmployee('target'); $hash = $target->password;
        $this->actingAs($manager)->putJson('/api/employees/'.$target->employee_id.'/password-reset')->assertForbidden();
        $this->assertSame($hash, $target->fresh()->password);
    }

    public function test_explicit_reset_permission_requires_exact_fresh_step_up(): void
    {
        $this->manager(); $target = $this->fixtureEmployee('target'); $hash = $target->password;
        $this->putJson('/api/employees/'.$target->employee_id.'/password-reset')->assertForbidden();
        $this->assertSame($hash, $target->fresh()->password);
    }

    public function test_authorized_reset_preserves_forced_change_recovery_and_revokes_old_tokens(): void
    {
        $manager = $this->manager(); $target = $this->fixtureEmployee('target'); $target->createToken('synthetic-old-session');
        $this->resetProof($target);
        $response = $this->putJson('/api/employees/'.$target->employee_id.'/password-reset')->assertOk()->assertHeader('Cache-Control', 'no-store, private');
        $temporary = $response->json('temporary_password');
        $this->assertIsString($temporary); $this->assertGreaterThanOrEqual(32, strlen($temporary));
        $this->assertTrue(Hash::check($temporary, $target->fresh()->password));
        $this->assertTrue($target->fresh()->must_change_password); $this->assertSame(0, $target->tokens()->count());
        $this->assertNotNull($response->json('expires_at'));
        $this->putJson('/api/employees/'.$target->employee_id.'/password-reset')->assertForbidden();
        $this->flushHeaders(); $this->app['auth']->forgetGuards();
        $login = $this->postJson('/api/login', ['email' => $target->email, 'password' => $temporary])->assertOk();
        $this->withToken($login->json('token'))->getJson('/api/me')->assertOk();
        $this->getJson('/api/organization')->assertForbidden();
        $newPassword = 'SyntheticNew!Password-2026';
        $this->putJson('/api/password', ['current_password' => $temporary, 'password' => $newPassword, 'password_confirmation' => $newPassword])->assertOk();
        $this->app['auth']->forgetGuards(); $this->getJson('/api/me')->assertUnauthorized();
        $this->flushHeaders();
        $this->postJson('/api/login', ['email' => $target->email, 'password' => $newPassword])->assertOk();
        $this->assertFalse($target->fresh()->must_change_password);
        $serialized = DB::table('security_audit_logs')->get()->toJson();
        $this->assertStringNotContainsString($temporary, $serialized);
    }

    public function test_expired_temporary_credential_and_its_session_are_denied(): void
    {
        $this->manager(); $target = $this->fixtureEmployee('target'); $this->resetProof($target);
        $temporary = $this->putJson('/api/employees/'.$target->employee_id.'/password-reset')->assertOk()->json('temporary_password');
        $this->flushHeaders(); $this->app['auth']->forgetGuards();
        $token = $this->postJson('/api/login', ['email' => $target->email, 'password' => $temporary])->assertOk()->json('token');
        $this->travel(16)->minutes(); $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/me')->assertUnauthorized();
        $this->flushHeaders();
        $this->postJson('/api/login', ['email' => $target->email, 'password' => $temporary])->assertUnprocessable();
    }

    public static function invalidProofs(): array { return [['wrong_subject'], ['expired'], ['revoked_permission']]; }

    #[DataProvider('invalidProofs')]
    public function test_invalid_reset_proof_cannot_change_credentials_or_revoke_sessions(string $kind): void
    {
        $manager = $this->manager(); $target = $this->fixtureEmployee('target'); $other = $this->fixtureEmployee('other');
        $target->createToken('synthetic-preserved'); $before = $target->password;
        $this->resetProof($kind === 'wrong_subject' ? $other : $target);
        if ($kind === 'expired') $this->travel(6)->minutes();
        if ($kind === 'revoked_permission') DB::table('role_permissions')->where('role_id', $manager->roles()->sole()->id)->delete();
        $this->putJson('/api/employees/'.$target->employee_id.'/password-reset')->assertForbidden();
        $this->assertSame($before, $target->fresh()->password);
        $this->assertSame(1, $target->tokens()->count());
        $this->assertDatabaseCount('account_action_tokens', 0);
    }

    public function test_required_reset_audit_failure_rolls_back_password_tokens_handover_and_step_up(): void
    {
        $this->manager(); $target = $this->fixtureEmployee('target'); $target->createToken('synthetic-preserved');
        $this->resetProof($target); $before = $target->password;
        $proof = DB::table('authentication_challenges')->where('action', 'employee.reset_password')->sole();
        Schema::drop('security_audit_logs'); // SQLite RAM fault injection only.
        $this->putJson('/api/employees/'.$target->employee_id.'/password-reset')->assertStatus(500);
        $this->assertSame($before, $target->fresh()->password); $this->assertFalse($target->fresh()->must_change_password);
        $this->assertSame(1, $target->tokens()->count()); $this->assertDatabaseCount('account_action_tokens', 0);
        $this->assertNull(DB::table('authentication_challenges')->where('id', $proof->id)->value('used_at'));
    }

    public static function protectedSubjects(): array { return [['legal'], ['admin'], ['mfa']]; }

    #[DataProvider('protectedSubjects')]
    public function test_protected_accounts_require_a_separate_approved_recovery_path(string $kind): void
    {
        $this->manager();
        $target = match ($kind) {
            'legal' => $this->fixtureUser('protected', ['document.approve_legal']),
            'admin' => $this->fixtureAdmin('protected'),
            'mfa' => $this->fixtureEmployee('protected'),
        };
        if ($kind === 'mfa') DB::table('account_mfa')->insert(['user_id' => $target->id, 'secret_ciphertext' => 'not-read',
            'version' => 1, 'confirmed_at' => now()]);
        $before = $target->password; $this->resetProof($target);
        $this->putJson('/api/employees/'.$target->employee_id.'/password-reset')->assertStatus($kind === 'mfa' ? 409 : 403);
        $this->assertSame($before, $target->fresh()->password); $this->assertDatabaseCount('account_action_tokens', 0);
    }
}
