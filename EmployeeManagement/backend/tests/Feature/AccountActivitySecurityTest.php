<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\SecurityRemediationTestCase;

class AccountActivitySecurityTest extends SecurityRemediationTestCase
{
    public static function blockedStates(): array
    {
        return [['disabled_user'], ['resigned_employee'], ['inactive_employee'], ['deleted_employee']];
    }

    private function changeState(User $user, string $state, bool $withEvents): void
    {
        if ($withEvents) {
            match ($state) {
                'disabled_user' => $user->update(['is_active' => false]),
                'resigned_employee' => $user->employee->update(['status' => 'resigned']),
                'inactive_employee' => $user->employee->update(['status' => 'inactive']),
                'deleted_employee' => $user->employee->delete(),
            };
        } else {
            // Simulate imports/query-builder writes that bypass model events.
            match ($state) {
                'disabled_user' => DB::table('users')->where('id', $user->id)->update(['is_active' => false]),
                'resigned_employee' => DB::table('employees')->where('id', $user->employee_id)->update(['status' => 'resigned']),
                'inactive_employee' => DB::table('employees')->where('id', $user->employee_id)->update(['status' => 'inactive']),
                'deleted_employee' => DB::table('employees')->where('id', $user->employee_id)->update(['deleted_at' => now()]),
            };
        }
    }

    private function useToken(string $token): void
    {
        $this->app['auth']->forgetGuards();
        $this->withToken($token);
    }

    private function createSession(User $user, string $id): void
    {
        DB::table('sessions')->insert([
            'id' => $id, 'user_id' => $user->id, 'payload' => base64_encode('synthetic-session'),
            'last_activity' => now()->timestamp,
        ]);
    }

    #[DataProvider('blockedStates')]
    public function test_model_state_transition_revokes_all_tokens_and_sessions(string $state): void
    {
        $user = $this->actor('subject', 'level_2');
        $other = $this->actor('other', 'level_2');
        $passwordHash = $user->password;
        $token = $user->createToken('synthetic-one', ['*'], now()->addHour())->plainTextToken;
        $user->createToken('synthetic-two', ['*'], now()->addHour());
        $other->createToken('unaffected', ['*'], now()->addHour());
        $this->createSession($user, 'synthetic-subject');
        $this->createSession($other, 'synthetic-other');

        $this->changeState($user, $state, true);
        $this->assertSame(0, $user->tokens()->count());
        $this->assertDatabaseMissing('sessions', ['user_id' => $user->id]);
        $this->assertSame(1, $other->tokens()->count());
        $this->assertDatabaseHas('sessions', ['user_id' => $other->id]);
        $this->assertSame($passwordHash, $user->fresh()->password);
        $this->useToken($token);
        $this->getJson('/api/me')->assertUnauthorized();
    }

    #[DataProvider('blockedStates')]
    public function test_request_guard_blocks_out_of_band_state_changes_and_revokes_remaining_sessions(string $state): void
    {
        $user = $this->actor('subject', 'level_2');
        $token = $user->createToken('synthetic-one', ['*'], now()->addHour())->plainTextToken;
        $user->createToken('synthetic-two', ['*'], now()->addHour());
        $this->createSession($user, 'synthetic-subject');
        $this->changeState($user, $state, false);
        $this->assertSame(2, $user->tokens()->count());

        $this->useToken($token);
        $this->getJson('/api/me')->assertUnauthorized();
        $this->assertSame(0, $user->tokens()->count());
        $this->assertDatabaseMissing('sessions', ['user_id' => $user->id]);
    }

    public static function exemptEndpoints(): array
    {
        return [['GET', '/api/me'], ['POST', '/api/presence/heartbeat'], ['POST', '/api/logout'],
            ['PUT', '/api/password'], ['GET', '/api/case-files/999999/workspace']];
    }

    #[DataProvider('exemptEndpoints')]
    public function test_password_change_exemptions_and_binding_do_not_bypass_inactive_guard(string $method, string $uri): void
    {
        $user = $this->actor('subject', 'level_2');
        $token = $user->createToken('synthetic', ['*'], now()->addHour())->plainTextToken;
        DB::table('users')->where('id', $user->id)->update(['is_active' => false, 'must_change_password' => true]);
        $this->useToken($token);
        $this->json($method, $uri)->assertUnauthorized();
    }

    #[DataProvider('blockedStates')]
    public function test_blocked_account_cannot_create_a_new_login_token(string $state): void
    {
        $user = $this->actor('subject', 'level_2');
        $this->changeState($user, $state, false);
        $this->postJson('/api/login', ['email' => $user->email, 'password' => 'password'])
            ->assertStatus($state === 'disabled_user' ? 422 : 403);
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_active_account_keeps_access_and_unrelated_profile_edits_do_not_revoke_tokens(): void
    {
        $user = $this->actor('subject', 'level_2');
        $token = $user->createToken('synthetic', ['*'], now()->addHour())->plainTextToken;
        $user->employee->update(['position_title' => 'Synthetic new title']);
        $user->update(['name' => 'Synthetic new name']);
        $this->useToken($token);
        $this->getJson('/api/me')->assertOk()->assertJsonPath('user.name', 'Synthetic new name');
        $this->getJson('/api/case-files')->assertOk();
        $this->assertSame(1, $user->tokens()->count());
    }

    public function test_active_forced_password_change_is_still_enforced_without_locking_out_password_route(): void
    {
        $user = $this->actor('subject', 'level_2');
        $user->update(['must_change_password' => true]);
        $token = $user->createToken('synthetic', ['*'], now()->addHour())->plainTextToken;
        $this->useToken($token);
        $this->getJson('/api/me')->assertOk();
        $this->getJson('/api/case-files')->assertForbidden()->assertJsonPath('code', 'password_change_required');
        $this->putJson('/api/password', [
            'current_password' => 'password', 'password' => 'Synthetic-Secure!2026',
            'password_confirmation' => 'Synthetic-Secure!2026',
        ])->assertOk();
        $this->assertFalse($user->fresh()->must_change_password);
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_logout_and_expired_tokens_are_rejected(): void
    {
        $user = $this->actor('subject', 'level_2');
        $token = $user->createToken('synthetic', ['*'], now()->addHour())->plainTextToken;
        $expired = $user->createToken('expired', ['*'], now()->subMinute())->plainTextToken;
        $this->useToken($expired);
        $this->getJson('/api/me')->assertUnauthorized();
        $this->useToken($token);
        $this->postJson('/api/logout')->assertOk();
        $this->useToken($token);
        $this->getJson('/api/me')->assertUnauthorized();
    }

    public function test_reactivation_never_restores_old_tokens_or_changes_password(): void
    {
        $user = $this->actor('subject', 'level_2');
        $hash = $user->password;
        $old = $user->createToken('old', ['*'], now()->addHour())->plainTextToken;
        $user->update(['is_active' => false]);
        $user->update(['is_active' => true]);
        $this->useToken($old);
        $this->getJson('/api/me')->assertUnauthorized();
        $this->assertSame($hash, $user->fresh()->password);
        $this->postJson('/api/login', ['email' => $user->email, 'password' => 'password'])->assertOk();
    }

    public function test_employee_restore_does_not_restore_old_sessions(): void
    {
        $user = $this->actor('subject', 'level_2');
        $employee = $user->employee;
        $old = $user->createToken('old', ['*'], now()->addHour())->plainTextToken;
        $employee->delete();
        $employee->restore();
        $this->useToken($old);
        $this->getJson('/api/me')->assertUnauthorized();
        $this->postJson('/api/login', ['email' => $user->email, 'password' => 'password'])->assertOk();
    }

    public function test_model_user_deletion_revokes_tokens_before_orphaning_them(): void
    {
        $user = $this->actor('subject', 'level_2');
        $token = $user->createToken('old', ['*'], now()->addHour())->plainTextToken;
        $this->createSession($user, 'synthetic-subject');
        $user->delete();
        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $user->id]);
        $this->assertDatabaseMissing('sessions', ['user_id' => $user->id]);
        $this->useToken($token);
        $this->getJson('/api/me')->assertUnauthorized();
    }

    public function test_cookie_guard_cannot_bypass_database_account_status(): void
    {
        $user = $this->actor('subject', 'level_2');
        $this->actingAs($user, 'web');
        DB::table('users')->where('id', $user->id)->update(['is_active' => false]);
        $this->getJson('/api/me')->assertUnauthorized();
    }

    public function test_every_internal_authenticated_api_route_has_active_account_guard(): void
    {
        $checked = 0;
        foreach ($this->app['router']->getRoutes() as $route) {
            if (! str_starts_with($route->uri(), 'api/') || ! in_array('auth:sanctum', $route->gatherMiddleware(), true)) {
                continue;
            }
            $this->assertContains('account.active', $route->gatherMiddleware(), $route->uri());
            $checked++;
        }
        $this->assertGreaterThan(80, $checked);
    }
}
