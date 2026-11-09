<?php

namespace Tests\Feature\B23;

use App\Contracts\AdministrativeAuthentication;
use App\Models\SecurityAuditLog;
use App\Models\User;
use App\Services\Administration\AccountActivationService;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\B21\B21TestCase;

class AccountActivationSecurityTest extends B21TestCase
{
    private function service(): AccountActivationService
    {
        return app(AccountActivationService::class);
    }

    private function issuer(): User
    {
        return $this->fixtureUser('invite-issuer', ['employee.view', 'employee.create', 'employee.activation.manage']);
    }

    private function newPending(User $issuer, string $label = 'pending'): User
    {
        $response = $this->actingAs($issuer, 'sanctum')->postJson('/api/employees', [
            ...$this->employeePayload($issuer, $label),
            'role' => 'admin', 'role_ids' => [999], 'activation_required' => false, 'activated_at' => now(),
            'pii_requires_explicit' => false, 'password' => self::SYNTHETIC_PASSWORD,
        ])->assertCreated();
        return User::where('employee_id', $response->json('employee.id'))->sole();
    }

    private function useInvite(string $token)
    {
        return $this->postJson('/api/account-activation/complete', $this->activationPayload($token));
    }

    public function test_real_creation_is_pending_unassigned_and_ignores_lifecycle_and_role_payload(): void
    {
        $issuer = $this->issuer();
        $first = $this->newPending($issuer);
        $second = $this->newPending($issuer, 'pending-two');
        foreach ([$first, $second] as $user) {
            $this->assertTrue($user->activation_required);
            $this->assertTrue($user->pii_requires_explicit);
            $this->assertNull($user->activated_at);
            $this->assertSame('employee', $user->role);
            $this->assertSame(0, $user->roles()->count());
            $this->assertFalse(Hash::check(self::SYNTHETIC_PASSWORD, $user->password));
            $this->assertFalse(Hash::check((string) config('auth.employee_initial_password'), $user->password));
            $this->assertFalse($user->hasPermission('employee.update'));
            $this->assertArrayNotHasKey('password', $user->toArray());
        }
        $this->assertNotSame($first->password, $second->password);
        $this->assertDatabaseCount('account_action_tokens', 0); // no unapproved delivery on create
        Mail::assertNothingSent();
    }

    public function test_direct_eloquent_creation_also_has_random_pending_defaults(): void
    {
        $legacy = $this->fixtureEmployee('legacy-owner');
        $user = User::create(['name' => 'Synthetic new identity', 'email' => 'new-model@example.test',
            'password' => self::SYNTHETIC_PASSWORD, 'is_active' => true, 'role' => 'admin']);
        $this->assertTrue($user->fresh()->activation_required);
        $this->assertTrue($user->fresh()->pii_requires_explicit);
        $this->assertFalse(Hash::check(self::SYNTHETIC_PASSWORD, $user->password));
        $this->assertSame('employee', $user->fresh()->role);
        $this->assertFalse($legacy->fresh()->activation_required);
        $this->assertTrue(Hash::check(self::SYNTHETIC_PASSWORD, $legacy->fresh()->password));
    }

    public function test_issue_has_256_bit_random_hash_only_identity_issuer_and_24_hour_expiry(): void
    {
        $issuer = $this->issuer();
        $user = $this->newPending($issuer);
        $this->freezeTime();
        $invite = $this->service()->issue($issuer, $user);
        $raw = $invite->tokenForDelivery(); // fake handover only; never output this value
        $this->assertMatchesRegularExpression('/^[a-f0-9]{64}$/D', $raw);
        $row = DB::table('account_action_tokens')->sole();
        $this->assertSame(hash('sha256', $raw), $row->token_hash);
        $this->assertSame($issuer->id, (int) $row->issued_by);
        $this->assertSame($user->id, (int) $row->user_id);
        $this->assertSame('activation', $row->purpose);
        $this->assertSame(AccountActivationService::identityHash($user), $row->subject_identity_hash);
        $this->assertSame(hash('sha256', $user->email), $row->subject_email_hash);
        $this->assertSame(now()->addHours(24)->toDateTimeString(), $row->expires_at);
        $this->assertNull($row->used_at);
        $this->assertNull($row->revoked_at);
        $this->assertStringNotContainsString($raw, json_encode((array) $row));
        $this->assertStringNotContainsString($raw, SecurityAuditLog::all()->toJson());
        $this->assertStringNotContainsString($row->token_hash, SecurityAuditLog::all()->toJson());
        $this->assertStringNotContainsString($user->email, SecurityAuditLog::all()->toJson());
        ob_start();
        var_dump($invite);
        $this->assertStringNotContainsString($raw, ob_get_clean());
        Mail::assertNothingSent();
        $this->expectException(\LogicException::class);
        json_encode($invite, JSON_THROW_ON_ERROR);
    }

    public function test_reissue_revokes_old_secret_and_new_secret_activates_then_real_login_works(): void
    {
        $issuer = $this->issuer();
        $user = $this->newPending($issuer);
        $first = $this->service()->issue($issuer, $user)->tokenForDelivery();
        $second = $this->service()->issue($issuer, $user)->tokenForDelivery();
        $this->assertNotSame($first, $second);
        $this->assertNotNull(DB::table('account_action_tokens')->where('token_hash', hash('sha256', $first))->value('revoked_at'));
        $this->useInvite($first)->assertUnprocessable();
        $this->useInvite($second)->assertOk()->assertJsonMissingPath('token')->assertHeader('Referrer-Policy', 'no-referrer');
        $this->assertTrue($user->fresh()->pii_requires_explicit);
        $this->assertFalse($user->fresh()->activation_required);
        $this->assertNull($user->fresh()->email_verified_at);
        $this->assertSame(0, $user->roles()->count());
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/login', ['email' => $user->email, 'password' => self::SYNTHETIC_PASSWORD.'-Owner'])
            ->assertOk()->assertJsonPath('user.id', $user->id)->assertJsonStructure(['token']);
    }

    public function test_revoke_prevents_activation_without_changing_password_or_hr_state(): void
    {
        $issuer = $this->issuer();
        $user = $this->newPending($issuer);
        $before = $user->getAttributes();
        $token = $this->service()->issue($issuer, $user)->tokenForDelivery();
        $this->service()->revoke($issuer, $user);
        $this->useInvite($token)->assertUnprocessable();
        $this->assertSame($before, $user->fresh()->getAttributes());
        $this->assertSame('active', $user->employee->fresh()->status);
    }

    public function test_pending_bearers_cannot_use_any_authenticated_route_even_with_active_employee(): void
    {
        [$user] = $this->pendingInvite('pending-business');
        foreach (['/api/me', '/api/organization', '/api/case-files'] as $path) {
            $this->app['auth']->forgetGuards();
            $token = $user->createToken('synthetic-stale')->plainTextToken;
            $this->withToken($token)->getJson($path)->assertUnauthorized();
            $this->assertSame(0, $user->tokens()->count());
        }
    }

    public static function ineligibleStates(): array
    {
        return array_map(fn ($state) => [$state], ['disabled', 'resigned', 'on_leave', 'deleted_employee', 'deleted_user', 'unlinked', 'identity', 'purpose', 'user', 'expired', 'already_active']);
    }

    #[DataProvider('ineligibleStates')]
    public function test_ineligible_invite_does_not_change_credentials_or_consume(string $state): void
    {
        [$user, $token, $id] = $this->pendingInvite('state-'.$state);
        $password = $user->password;
        match ($state) {
            'disabled' => $user->update(['is_active' => false]),
            'resigned' => $user->employee->update(['status' => 'resigned']),
            'on_leave' => $user->employee->update(['status' => 'on_leave']),
            'deleted_employee' => $user->employee->delete(),
            'deleted_user' => $user->delete(),
            'unlinked' => $user->update(['employee_id' => null]),
            'identity' => $user->update(['login_id' => 'changed-synthetic']),
            'purpose' => DB::table('account_action_tokens')->where('id', $id)->update(['purpose' => 'password_reset']),
            'user' => DB::table('account_action_tokens')->where('id', $id)->update(['user_id' => $this->fixtureEmployee('other-target')->id]),
            'expired' => $this->travel(24)->hours(),
            'already_active' => $user->forceFill(['activation_required' => false, 'activated_at' => now()])->save(),
        };
        $this->useInvite($token)->assertUnprocessable()->assertJsonValidationErrors('token');
        if ($state !== 'deleted_user') {
            $this->assertSame($password, $user->fresh()->password);
        }
        $this->assertNull(DB::table('account_action_tokens')->where('id', $id)->value('used_at'));
        $this->assertSame(0, SecurityAuditLog::where('event', 'administration.account_activated')->count());
    }

    public function test_identity_change_back_or_reactivation_does_not_restore_old_invite(): void
    {
        [$user, $token, $id] = $this->pendingInvite('identity-return');
        $email = $user->email;
        $user->update(['email' => 'temporary-synthetic@example.test']);
        $user->update(['email' => $email]);
        $this->assertNotNull(DB::table('account_action_tokens')->where('id', $id)->value('revoked_at'));
        $this->useInvite($token)->assertUnprocessable();
        [$other, $otherToken] = $this->pendingInvite('disable-return');
        $other->update(['is_active' => false]);
        $other->update(['is_active' => true]);
        $this->useInvite($otherToken)->assertUnprocessable();
    }

    public function test_get_preview_and_query_string_do_not_consume_or_expose_an_invite(): void
    {
        [, $token, $id] = $this->pendingInvite('preview');
        $this->getJson('/api/account-activation/complete?token='.$token)->assertStatus(405);
        $this->postJson('/api/account-activation/complete?token='.$token, $this->activationPayload($token))->assertUnprocessable();
        $this->assertNull(DB::table('account_action_tokens')->where('id', $id)->value('used_at'));
        $this->assertStringNotContainsString($token, SecurityAuditLog::all()->toJson());
    }

    public function test_password_policy_and_confirmation_are_enforced_before_consumption(): void
    {
        [, $token, $id] = $this->pendingInvite('weak-password');
        $this->postJson('/api/account-activation/complete', ['token' => $token, 'password' => 'weak', 'password_confirmation' => 'weak'])
            ->assertUnprocessable()->assertJsonValidationErrors('password');
        $this->postJson('/api/account-activation/complete', ['token' => $token, 'password' => self::SYNTHETIC_PASSWORD, 'password_confirmation' => 'wrong'])
            ->assertUnprocessable()->assertJsonValidationErrors('password');
        $this->assertNull(DB::table('account_action_tokens')->where('id', $id)->value('used_at'));
    }

    public function test_unknown_token_and_valid_shaped_unusable_token_share_the_same_error(): void
    {
        [, $token, $id] = $this->pendingInvite('generic-error');
        DB::table('account_action_tokens')->where('id', $id)->update(['revoked_at' => now()]);
        $first = $this->useInvite($token)->assertUnprocessable()->json();
        $this->assertSame($first, $this->useInvite(str_repeat('0', 64))->assertUnprocessable()->json());
    }

    public function test_activation_is_rate_limited_without_token_or_password_in_audit(): void
    {
        $payload = $this->activationPayload(str_repeat('0', 64));
        for ($i = 0; $i < 5; ++$i) {
            $this->postJson('/api/account-activation/complete', $payload)->assertUnprocessable();
        }
        $this->postJson('/api/account-activation/complete', $payload)->assertStatus(429);
        $logs = SecurityAuditLog::all()->toJson();
        $this->assertStringNotContainsString($payload['token'], $logs);
        $this->assertStringNotContainsString($payload['password'], $logs);
    }

    public function test_missing_invite_permission_cannot_issue_or_revoke(): void
    {
        $issuer = $this->fixtureUser('not-issuer', ['employee.create', 'employee.update']);
        $user = $this->newPending($issuer);
        foreach (['issue', 'revoke'] as $method) {
            try {
                $this->service()->$method($issuer, $user);
                $this->fail('Invite mutation must require explicit permission.');
            } catch (AuthorizationException) {
                $this->assertDatabaseCount('account_action_tokens', 0);
            }
        }
    }

    public function test_existing_user_cannot_be_reset_through_activation_issuance(): void
    {
        $issuer = $this->issuer();
        $target = $this->fixtureEmployee('existing-not-pending');
        $before = $target->getAttributes();
        try {
            $this->service()->issue($issuer, $target);
            $this->fail('An existing active account is not an activation target.');
        } catch (\Illuminate\Validation\ValidationException) {
            $this->assertSame($before, $target->fresh()->getAttributes());
            $this->assertDatabaseCount('account_action_tokens', 0);
        }
    }

    public function test_required_audit_fault_rolls_back_consumption_credentials_and_session_revocation(): void
    {
        [$user, $token, $id] = $this->pendingInvite('audit-fault');
        $before = $user->fresh()->getAttributes();
        $user->createToken('synthetic-stale');
        Schema::drop('security_audit_logs'); // actual isolated SQLite INSERT fault, not a mocked success
        $this->useInvite($token)->assertStatus(500);
        $this->assertSame($before, $user->fresh()->getAttributes());
        $this->assertNull(DB::table('account_action_tokens')->where('id', $id)->value('used_at'));
        $this->assertSame(1, $user->tokens()->count());
    }

    public function test_required_audit_fault_rolls_back_reissue_and_keeps_previous_invite(): void
    {
        $issuer = $this->issuer();
        $user = $this->newPending($issuer);
        $old = $this->service()->issue($issuer, $user)->tokenForDelivery();
        Schema::drop('security_audit_logs');
        try {
            $this->service()->issue($issuer, $user);
            $this->fail('No unaudited invitation may escape.');
        } catch (QueryException) {
            $this->assertDatabaseCount('account_action_tokens', 1);
            $this->assertNull(DB::table('account_action_tokens')->where('token_hash', hash('sha256', $old))->value('revoked_at'));
        }
    }

    public function test_duplicate_consume_requests_commit_only_one_password_change_and_audit(): void
    {
        [, $token] = $this->pendingInvite('duplicate');
        $this->useInvite($token)->assertOk();
        $this->useInvite($token)->assertUnprocessable();
        $this->assertSame(1, SecurityAuditLog::where('event', 'administration.account_activated')->count());
        $this->assertSame(1, DB::table('account_action_tokens')->whereNotNull('used_at')->count());
        // Sequential SQLite proof only. A separate MySQL concurrent-session rehearsal remains required.
    }

    public function test_activation_does_not_satisfy_mfa_or_bootstrap_existing_canonical_admin(): void
    {
        $admin = $this->fixtureAdmin('pending-admin');
        $this->assertFalse(app(AdministrativeAuthentication::class)->permitsMutation($admin, 'role.assign'));
        $this->assertFalse(app(AdministrativeAuthentication::class)->replacementIsReady($admin));
        $this->actingAs($admin, 'sanctum'); // Arrange a real MFA session before snapshotting account fields.
        $before = $admin->fresh()->getAttributes();
        $this->postJson('/api/employees', $this->employeePayload($admin, 'unprivileged'))->assertCreated();
        $this->assertSame($before, $admin->fresh()->getAttributes());
        $this->assertSame(0, DB::table('account_action_tokens')->where('user_id', $admin->id)->count());
    }

    public function test_conditional_consume_rejects_a_stale_unused_snapshot(): void
    {
        [$user, $token, $id] = $this->pendingInvite('stale-cas');
        $before = $user->fresh()->getAttributes();
        $interleaved = false;
        // In-process SQLite interleaving probe, NOT a MySQL/multi-connection race proof.
        DB::listen(function ($query) use (&$interleaved, $id): void {
            if (! $interleaved && str_starts_with($query->sql, 'select * from "account_action_tokens"')) {
                $interleaved = true;
                DB::table('account_action_tokens')->where('id', $id)->update(['used_at' => now()]);
            }
        });
        $this->useInvite($token)->assertUnprocessable();
        $this->assertTrue($interleaved);
        $this->assertSame($before, $user->fresh()->getAttributes());
        $this->assertSame(0, SecurityAuditLog::where('event', 'administration.account_activated')->count());
    }

    public function test_pending_account_cannot_use_password_reset_or_cli_as_activation(): void
    {
        $manager = $this->fixtureLegacy('reset-manager', 'level_4', 'manager');
        [$target] = $this->pendingInvite('reset-pending');
        $target->update(['login_id' => 'synthetic-pending-cli']);
        $before = $target->fresh()->getAttributes();
        $this->actingAs($manager, 'sanctum')->putJson('/api/employees/'.$target->employee_id.'/password-reset')->assertUnprocessable();
        $this->artisan('themis:user-password', ['login_id' => $target->login_id, '--activate' => true])
            ->expectsQuestion('New password (11+ chars, uppercase and symbol)', self::SYNTHETIC_PASSWORD)
            ->expectsQuestion('Confirm new password', self::SYNTHETIC_PASSWORD)
            ->assertFailed();
        $this->assertSame($before, $target->fresh()->getAttributes());
    }

    public function test_pending_canonical_admin_does_not_count_as_a_verified_replacement(): void
    {
        $first = $this->fixtureAdmin('last-active');
        $second = $this->fixtureAdmin('second-pending');
        DB::table('users')->where('id', $second->id)->update(['activation_required' => true]); // fixture state only
        try {
            $first->update(['is_active' => false]);
            $this->fail('Pending Admin is not a replacement.');
        } catch (\Illuminate\Validation\ValidationException) {
            $this->assertTrue($first->fresh()->is_active);
        }
    }

    public function test_public_activation_cannot_change_a_canonical_admin_credential_or_supply_a_target_user(): void
    {
        [$user, $token, $id] = $this->pendingInvite('canonical-token');
        $admin = $this->fixtureAdmin('protected-admin');
        DB::table('user_roles')->where('user_id', $user->id)->delete();
        DB::table('user_roles')->insert(['user_id' => $user->id, 'role_id' => $admin->roles()->sole()->id]); // pending bootstrap-like fixture only
        $before = $user->fresh()->getAttributes();
        $this->useInvite($token)->assertUnprocessable();
        $this->postJson('/api/account-activation/complete', [...$this->activationPayload($token), 'user_id' => $admin->id])->assertUnprocessable();
        $this->assertSame($before, $user->fresh()->getAttributes());
        $this->assertNull(DB::table('account_action_tokens')->where('id', $id)->value('used_at'));
    }

    public function test_activation_revokes_stale_bearers_and_issues_no_new_session(): void
    {
        [$user, $token] = $this->pendingInvite('session-cleanup');
        $user->createToken('synthetic-old-one');
        $user->createToken('synthetic-old-two');
        $this->useInvite($token)->assertOk()->assertJsonMissingPath('token');
        $this->assertSame(0, $user->tokens()->count());
        $this->assertSame(1, SecurityAuditLog::where('event', 'administration.account_activated')->count());
        $this->assertFalse(app(AdministrativeAuthentication::class)->replacementIsReady($user->fresh()));
    }

    public static function protectedTargets(): array
    {
        return array_map(fn ($name) => [$name], ['developer', 'verified_lawyer', 'level_5', 'legacy_admin']);
    }

    #[DataProvider('protectedTargets')]
    public function test_invitation_is_not_a_protected_account_activation_or_mfa_bypass(string $role): void
    {
        [$user, $token, $id] = $this->pendingInvite('protected-'.$role);
        if ($role === 'legacy_admin') {
            $user->update(['role' => 'admin']);
        } else {
            $roleId = \App\Models\Role::firstOrCreate(['name' => $role], ['display_name' => 'Synthetic protected role'])->id;
            $user->roles()->sync([$roleId]);
        }
        $before = $user->fresh()->getAttributes();
        $this->useInvite($token)->assertUnprocessable();
        $this->assertSame($before, $user->fresh()->getAttributes());
        $this->assertNull(DB::table('account_action_tokens')->where('id', $id)->value('used_at'));
    }

    public function test_additive_upgrade_preserves_existing_password_state_and_roles(): void
    {
        $user = $this->fixtureEmployee('upgrade-existing');
        $before = $user->fresh()->getAttributes();
        $roles = $user->roles()->pluck('id')->all();
        $migration = require database_path('migrations/2026_10_20_010000_add_secure_account_activation.php');
        // This test is guarded SQLite :memory: only. Reconstruct the pre-B23 schema
        // with an existing identity, then run just the new additive migration forward.
        $migration->down();
        $legacy = DB::table('users')->where('id', $user->id)->first();
        $migration->up();
        $after = $user->fresh();
        $this->assertSame($before['password'], $after->password);
        foreach (get_object_vars($legacy) as $key => $value) {
            $this->assertSame($value, $after->getRawOriginal($key), 'Existing value changed during additive upgrade: '.$key);
        }
        $this->assertFalse($after->activation_required);
        $this->assertFalse($after->pii_requires_explicit);
        $this->assertNull($after->activated_at);
        $this->assertSame($roles, $after->roles()->pluck('id')->all());
        $this->postJson('/api/login', ['email' => $user->email, 'password' => self::SYNTHETIC_PASSWORD])->assertOk();
    }
}
