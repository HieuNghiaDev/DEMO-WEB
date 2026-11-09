<?php

namespace Tests\Feature\B24;

use App\Contracts\AdministrativeAuthentication;
use App\Models\Employee;
use App\Models\Permission;
use App\Models\Role;
use App\Models\SecurityAuditLog;
use App\Models\User;
use App\Services\Administration\AdminCapabilities;
use App\Services\Administration\FirstAdminBootstrap;
use App\Services\Administration\Totp;
use App\Services\Administration\VerifiedMfaSessions;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\B21\B21TestCase;

class AdministrativeMfaTest extends B21TestCase
{
    private const OWNER_PASSWORD = 'Synthetic-B24!Owner-2026';

    private function bootstrapIdentity(): array
    {
        $context = $this->fixtureEmployee('bootstrap-context');
        $identity = $this->employeePayload($context, 'bootstrap-new');
        $setup = app(FirstAdminBootstrap::class)->prepare()->tokenForDelivery();
        $result = app(FirstAdminBootstrap::class)->provision($setup, $identity);
        $user = User::findOrFail($result['user_id']);
        return [$user, $result['invitation']->tokenForDelivery(), $setup];
    }

    private function activate(User $user, string $invitation): void
    {
        $this->postJson('/api/account-activation/complete', ['token' => $invitation, 'password' => self::OWNER_PASSWORD,
            'password_confirmation' => self::OWNER_PASSWORD])->assertOk()->assertJsonMissingPath('token');
        $this->assertFalse($user->fresh()->activation_required);
    }

    private function passwordChallenge(User $user, string $purpose): string
    {
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        $response = $this->postJson('/api/login', ['email' => $user->email, 'password' => self::OWNER_PASSWORD])
            ->assertStatus(202)->assertJsonMissingPath('token')->assertJsonPath('purpose', $purpose);
        return $response->json('challenge');
    }

    private function enroll(User $user): array
    {
        $challenge = $this->passwordChallenge($user, 'login_enroll');
        $start = $this->postJson('/api/mfa/enrollment/start', ['challenge' => $challenge])->assertOk();
        $secret = $start->json('secret');
        $this->assertStringStartsWith('otpauth://totp/THEMIS', $start->json('otpauth_uri'));
        $this->assertNull(DB::table('account_mfa')->where('user_id', $user->id)->value('confirmed_at'));
        $confirm = $this->postJson('/api/mfa/enrollment/confirm', ['challenge' => $challenge,
            'otp' => app(Totp::class)->code($secret, now()->timestamp)])->assertOk()->assertJsonMissingPath('token');
        return [$secret, $confirm->json('recovery_codes')];
    }

    private function loginMfa(User $user, string $secret): string
    {
        $challenge = $this->passwordChallenge($user, 'login_mfa');
        $this->travel(31)->seconds();
        $response = $this->postJson('/api/mfa/login', ['challenge' => $challenge,
            'otp' => app(Totp::class)->code($secret, now()->timestamp)])->assertOk()->assertJsonPath('user.id', $user->id);
        return $response->json('token');
    }

    private function step(User $user, string $token, string $secret, string $action, array $scope = []): void
    {
        $this->travel(31)->seconds();
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->postJson('/api/mfa/step-up', ['password' => self::OWNER_PASSWORD,
            'otp' => app(Totp::class)->code($secret, now()->timestamp), 'action' => $action, 'scope' => $scope])->assertOk();
    }

    private function readyAdmin(): array
    {
        [$user, $invitation] = $this->bootstrapIdentity();
        $this->activate($user, $invitation);
        [$secret, $codes] = $this->enroll($user);
        $token = $this->loginMfa($user, $secret);
        $this->step($user, $token, $secret, 'bootstrap.finish');
        app(FirstAdminBootstrap::class)->finish($token);
        return [$user->fresh(), $secret, $codes, $token];
    }

    public static function vectors(): array
    {
        return [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037'], [20000000000, '353130']];
    }

    #[DataProvider('vectors')]
    public function test_rfc_sha1_six_digit_vectors_including_after_2038(int $time, string $expected): void
    {
        $this->assertSame($expected, app(Totp::class)->code('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', $time));
    }

    public function test_new_identity_is_linked_pending_unprivileged_and_setup_cannot_be_replayed(): void
    {
        [$user, , $setup] = $this->bootstrapIdentity();
        $this->assertTrue($user->activation_required);
        $this->assertTrue($user->pii_requires_explicit);
        $this->assertSame(0, $user->roles()->count());
        $this->assertSame('active', $user->employee->status);
        $this->assertMatchesRegularExpression('/^TMS-\d{5}$/', $user->employee->employee_code);
        $this->assertFalse(Hash::check(self::OWNER_PASSWORD, $user->password));
        $count = User::count();
        try {
            app(FirstAdminBootstrap::class)->provision($setup);
            $this->fail('Setup replay must fail.');
        } catch (\Illuminate\Validation\ValidationException) {
            $this->assertSame($count, User::count());
        }
        $this->app['auth']->forgetGuards();
        $this->withToken($user->createToken('synthetic-unverified')->plainTextToken)->getJson('/api/organization')->assertUnauthorized();
        Mail::assertNothingSent();
    }

    public function test_complete_real_activation_enrollment_password_totp_stepup_then_admin_flow(): void
    {
        [$user, $secret, $codes, $token] = $this->readyAdmin();
        $this->assertSame(['admin'], $user->roles()->pluck('name')->all());
        $this->assertEqualsCanonicalizing(AdminCapabilities::ESSENTIAL, $user->roles()->sole()->permissions()->pluck('name')->all());
        $this->assertTrue(app(AdministrativeAuthentication::class)->replacementIsReady($user));
        foreach (['employee.view_private', 'case.view', 'developer.view', 'employee.verify_lawyer', 'document.approve_legal'] as $permission) {
            $this->assertFalse($user->hasPermission($permission));
        }
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/organization')->assertOk();
        $this->getJson('/api/case-files')->assertForbidden();
        $this->assertCount(10, $codes);
        $encrypted = DB::table('account_mfa')->where('user_id', $user->id)->value('secret_ciphertext');
        $this->assertNotSame($secret, $encrypted);
        $this->assertSame($secret, Crypt::decryptString($encrypted));
        $this->assertStringNotContainsString($secret, SecurityAuditLog::all()->toJson());
        foreach ($codes as $code) {
            $this->assertDatabaseHas('mfa_recovery_codes', ['user_id' => $user->id, 'code_hash' => hash('sha256', $code)]);
            $this->assertStringNotContainsString($code, SecurityAuditLog::all()->toJson());
        }
        $this->expectException(\Illuminate\Validation\ValidationException::class);
        app(FirstAdminBootstrap::class)->prepare();
    }

    public function test_correct_password_alone_never_issues_an_admin_bearer_or_enables_mfa(): void
    {
        [$user, $invitation] = $this->bootstrapIdentity();
        $this->activate($user, $invitation);
        $challenge = $this->passwordChallenge($user, 'login_enroll');
        $this->assertSame(0, $user->tokens()->count());
        $this->postJson('/api/mfa/enrollment/confirm', ['challenge' => $challenge, 'otp' => '000000'])->assertUnprocessable();
        $this->assertNull(DB::table('account_mfa')->where('user_id', $user->id)->value('confirmed_at'));
        $this->assertFalse(app(AdministrativeAuthentication::class)->replacementIsReady($user));
    }

    public function test_wrong_setup_and_expiry_do_not_provision_an_identity(): void
    {
        $context = $this->fixtureEmployee('setup-expiry');
        $identity = $this->employeePayload($context);
        $setup = app(FirstAdminBootstrap::class)->prepare()->tokenForDelivery();
        $count = User::count();
        foreach ([str_repeat('0', 64), $setup] as $index => $candidate) {
            if ($index === 1) {
                $this->travel(16)->minutes();
            }
            try {
                app(FirstAdminBootstrap::class)->provision($candidate, $identity);
                $this->fail('Invalid/expired setup must not create a user.');
            } catch (\Illuminate\Validation\ValidationException) {
                $this->assertSame($count, User::count());
            }
        }
    }

    public function test_resume_keeps_exact_identity_revokes_old_invite_and_never_creates_a_second_pending_admin(): void
    {
        [$user, $old] = $this->bootstrapIdentity();
        $count = User::count();
        $setup = app(FirstAdminBootstrap::class)->prepare()->tokenForDelivery();
        $result = app(FirstAdminBootstrap::class)->provision($setup);
        $this->assertSame($user->id, $result['user_id']);
        $this->assertSame($count, User::count());
        $this->postJson('/api/account-activation/complete', ['token' => $old, 'password' => self::OWNER_PASSWORD,
            'password_confirmation' => self::OWNER_PASSWORD])->assertUnprocessable();
        $this->activate($user, $result['invitation']->tokenForDelivery());
    }

    public function test_mfa_otp_replay_expired_window_and_wrong_identity_are_denied(): void
    {
        [$user, $invitation] = $this->bootstrapIdentity();
        $this->activate($user, $invitation);
        [$secret] = $this->enroll($user);
        $challenge = $this->passwordChallenge($user, 'login_mfa');
        $replay = app(Totp::class)->code($secret, now()->timestamp); // just consumed by enrollment
        $this->postJson('/api/mfa/login', ['challenge' => $challenge, 'otp' => $replay])->assertUnprocessable();
        $this->postJson('/api/mfa/login', ['challenge' => $challenge, 'otp' => app(Totp::class)->code($secret, now()->subMinutes(2)->timestamp)])->assertUnprocessable();
        $this->postJson('/api/mfa/login', ['challenge' => $challenge, 'otp' => $replay, 'user_id' => 999])->assertUnprocessable();
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_ordinary_employee_keeps_existing_password_login_without_mfa_enrollment(): void
    {
        $user = $this->fixtureEmployee('ordinary-login');
        $this->postJson('/api/login', ['email' => $user->email, 'password' => self::SYNTHETIC_PASSWORD])
            ->assertOk()->assertJsonStructure(['token'])->assertJsonMissingPath('challenge');
        $this->assertDatabaseCount('account_mfa', 0);
    }

    public function test_lawyer_can_opt_in_to_mfa_and_disable_it_only_with_a_fresh_scoped_proof(): void
    {
        $user = $this->fixtureUser('lawyer-opt-in', [], 'lawyer');
        $user->forceFill(['password' => Hash::make(self::OWNER_PASSWORD)])->save();
        $credentials = ['email' => $user->email, 'password' => self::OWNER_PASSWORD];
        $token = $this->postJson('/api/login', $credentials)->assertOk()
            ->assertJsonPath('authentication.requires_mfa', false)->json('token');
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/mfa/settings')->assertExactJson(['enabled' => false, 'required' => false]);
        $this->postJson('/api/mfa/enrollment/opt-in', ['password' => 'wrong'])->assertUnprocessable();
        $challenge = $this->postJson('/api/mfa/enrollment/opt-in', ['password' => self::OWNER_PASSWORD])->assertOk()
            ->assertJsonPath('purpose', 'opt_in_enroll')->assertJsonMissingPath('token')->json('challenge');

        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        $secret = $this->postJson('/api/mfa/enrollment/start', ['challenge' => $challenge])->assertOk()->json('secret');
        // Stopping after the setup key is shown must never force enrollment at the next login.
        $this->postJson('/api/login', $credentials)->assertOk()->assertJsonPath('authentication.requires_mfa', false);
        $this->postJson('/api/mfa/enrollment/confirm', ['challenge' => $challenge,
            'otp' => app(Totp::class)->code($secret, now()->timestamp)])->assertOk()
            ->assertJsonCount(10, 'recovery_codes')->assertJsonMissingPath('token');
        $this->assertSame(0, $user->tokens()->count());

        $mfaToken = $this->loginMfa($user, $secret);
        $this->app['auth']->forgetGuards();
        $this->withToken($mfaToken)->getJson('/api/mfa/settings')->assertExactJson(['enabled' => true, 'required' => false]);
        $this->postJson('/api/mfa/disable')->assertForbidden();
        $this->step($user, $mfaToken, $secret, 'account.password');
        $this->postJson('/api/mfa/disable')->assertForbidden();
        $this->step($user, $mfaToken, $secret, 'mfa.disable');
        $this->postJson('/api/mfa/disable')->assertOk()->assertJsonPath('reauthentication_required', true);
        $this->assertSame(0, $user->tokens()->count());
        $this->assertSame(0, DB::table('mfa_recovery_codes')->where('user_id', $user->id)->whereNull('revoked_at')->count());
        $this->assertDatabaseHas('security_audit_logs', ['user_id' => $user->id, 'event' => 'administration.mfa_opt_in_disabled']);
        $this->assertSame(['lawyer'], $user->fresh()->role_names);
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/login', $credentials)->assertOk()->assertJsonPath('authentication.requires_mfa', false);
    }

    public function test_required_administration_mfa_cannot_be_disabled_from_settings(): void
    {
        [$admin, $secret, , $token] = $this->readyAdmin();
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/mfa/settings')->assertExactJson(['enabled' => true, 'required' => true]);
        $this->step($admin, $token, $secret, 'mfa.disable');
        $this->postJson('/api/mfa/disable')->assertForbidden();
        $this->assertTrue(app(VerifiedMfaSessions::class)->enrolled($admin));
        $this->assertDatabaseMissing('security_audit_logs', ['user_id' => $admin->id, 'event' => 'administration.mfa_opt_in_disabled']);
    }

    public function test_setup_is_hash_only_and_audit_failure_rolls_back_reservation_and_code_sequence(): void
    {
        $context = $this->fixtureEmployee('setup-audit');
        $identity = $this->employeePayload($context);
        $setup = app(FirstAdminBootstrap::class)->prepare()->tokenForDelivery();
        $this->assertDatabaseHas('authentication_challenges', ['secret_hash' => hash('sha256', $setup)]);
        $this->assertStringNotContainsString($setup, SecurityAuditLog::all()->toJson());
        Schema::drop('security_audit_logs');
        try {
            app(FirstAdminBootstrap::class)->provision($setup, $identity);
            $this->fail('No unaudited bootstrap identity.');
        } catch (\Illuminate\Database\QueryException) {
            $this->assertSame(1, User::count());
            $this->assertSame(1, Employee::count());
            $this->assertDatabaseCount('employee_code_sequences', 0);
            $this->assertNull(DB::table('security_administration_state')->where('id', 1)->value('bootstrap_user_id'));
            $this->assertNull(DB::table('authentication_challenges')->where('secret_hash', hash('sha256', $setup))->value('used_at'));
        }
    }

    public function test_real_stepup_allows_only_the_exact_policy_approved_assignment_once(): void
    {
        [$admin, $secret, , $token] = $this->readyAdmin();
        $target = $this->fixtureEmployee('assignment-target');
        $role = Role::create(['name' => 'ordinary_work', 'display_name' => 'Synthetic ordinary work']);
        $role->permissions()->sync([Permission::where('name', 'employee.view')->sole()->id]);
        $url = '/api/employees/'.$target->employee_id.'/roles';
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->putJson($url, ['role_ids' => [$role->id]])->assertForbidden();
        $this->step($admin, $token, $secret, 'role.assign', ['user_id' => $target->id, 'role_id' => $role->id]);
        $this->putJson($url, ['role_ids' => [$role->id]])->assertOk();
        $this->assertSame([$role->id], $target->roles()->pluck('id')->all());
        $this->putJson($url, ['role_ids' => [$role->id]])->assertForbidden();
    }

    public function test_cli_dry_run_and_offline_recovery_do_not_change_any_account(): void
    {
        $this->artisan('themis:admin-bootstrap')->expectsOutputToContain('DRY RUN')->assertSuccessful();
        $this->artisan('themis:admin-recovery')->expectsOutputToContain('DRY RUN')->assertSuccessful();
        $this->artisan('themis:admin-recovery', ['--apply' => true])->expectsOutputToContain('BLOCKED')->assertFailed();
        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseCount('authentication_challenges', 0);
    }

    public function test_password_plus_recovery_code_only_permits_new_device_enrollment_and_code_is_single_use(): void
    {
        [$user, , $codes, $oldToken] = $this->readyAdmin();
        $roles = $user->roles()->pluck('id')->all();
        $challenge = $this->passwordChallenge($user, 'login_mfa');
        $recovery = $this->postJson('/api/mfa/login', ['challenge' => $challenge, 'recovery_code' => $codes[0]])
            ->assertOk()->assertJsonMissingPath('token')->assertJsonPath('purpose', 'recovery_enroll');
        $this->assertNotNull(DB::table('mfa_recovery_codes')->where('code_hash', hash('sha256', $codes[0]))->value('used_at'));
        $replay = $this->passwordChallenge($user, 'login_mfa');
        $this->postJson('/api/mfa/login', ['challenge' => $replay, 'recovery_code' => $codes[0]])->assertUnprocessable();
        $newSecret = $this->postJson('/api/mfa/enrollment/start', ['challenge' => $recovery->json('challenge')])->assertOk()->json('secret');
        $newCodes = $this->postJson('/api/mfa/enrollment/confirm', ['challenge' => $recovery->json('challenge'),
            'otp' => app(Totp::class)->code($newSecret, now()->timestamp)])->assertOk()->assertJsonMissingPath('token')->json('recovery_codes');
        $this->assertCount(10, $newCodes);
        $this->assertSame($roles, $user->roles()->pluck('id')->all());
        $this->assertTrue(app(AdministrativeAuthentication::class)->replacementIsReady($user));
        $this->app['auth']->forgetGuards();
        $this->withToken($oldToken)->getJson('/api/me')->assertUnauthorized();
        $newToken = $this->loginMfa($user, $newSecret);
        $this->app['auth']->forgetGuards();
        $this->withToken($newToken)->getJson('/api/me')->assertOk();
    }

    public function test_wrong_and_other_users_recovery_codes_cannot_change_mfa_or_grants(): void
    {
        [$user, , $codes] = $this->readyAdmin();
        $other = $this->fixtureUser('other-mfa-owner', AdminCapabilities::ESSENTIAL, 'admin');
        $this->authenticatedFixtureToken($other); // real second enrollment/password+TOTP verification
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        $challenge = $this->postJson('/api/login', ['email' => $other->email, 'password' => self::SYNTHETIC_PASSWORD])
            ->assertStatus(202)->json('challenge');
        $before = DB::table('account_mfa')->where('user_id', $other->id)->first();
        foreach ([$codes[1], str_repeat('0', 32)] as $code) {
            $this->postJson('/api/mfa/login', ['challenge' => $challenge, 'recovery_code' => $code])->assertUnprocessable();
        }
        $this->assertEquals($before, DB::table('account_mfa')->where('user_id', $other->id)->first());
        $this->assertNull(DB::table('mfa_recovery_codes')->where('code_hash', hash('sha256', $codes[1]))->value('used_at'));
        $this->assertEqualsCanonicalizing(AdminCapabilities::ESSENTIAL, $other->roles()->sole()->permissions()->pluck('name')->all());
        $this->assertFalse($user->hasPermission('developer.view'));
    }

    public function test_recovery_code_regeneration_requires_real_stepup_and_revokes_all_old_codes(): void
    {
        [$user, $secret, $oldCodes, $token] = $this->readyAdmin();
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->postJson('/api/mfa/recovery-codes/regenerate')->assertForbidden();
        $this->step($user, $token, $secret, 'mfa.recovery_codes');
        $new = $this->postJson('/api/mfa/recovery-codes/regenerate')->assertOk()->json('recovery_codes');
        $this->assertCount(10, $new);
        $this->assertSame([], array_intersect($oldCodes, $new));
        foreach ($oldCodes as $code) {
            $this->assertNotNull(DB::table('mfa_recovery_codes')->where('code_hash', hash('sha256', $code))->value('revoked_at'));
        }
        $this->assertSame(0, $user->tokens()->count());
        $this->assertTrue(app(AdministrativeAuthentication::class)->replacementIsReady($user));
        $challenge = $this->passwordChallenge($user, 'login_mfa');
        $this->postJson('/api/mfa/login', ['challenge' => $challenge, 'recovery_code' => $oldCodes[0]])->assertUnprocessable();
    }

    public function test_stepup_scope_expiry_session_and_action_are_enforced_without_revoking_readiness(): void
    {
        [$user, $secret, , $firstToken] = $this->readyAdmin();
        $target = $this->fixtureEmployee('scope-target');
        $other = $this->fixtureEmployee('different-scope-target');
        $role = Role::create(['name' => 'scoped_ordinary', 'display_name' => 'Synthetic scoped role']);
        $role->permissions()->sync([Permission::where('name', 'employee.view')->sole()->id]);
        $secondToken = $this->loginMfa($user, $secret);
        $this->step($user, $firstToken, $secret, 'role.assign', ['user_id' => $target->id, 'role_id' => $role->id]);
        $this->putJson('/api/employees/'.$other->employee_id.'/roles', ['role_ids' => [$role->id]])->assertForbidden();
        $this->app['auth']->forgetGuards();
        $this->withToken($secondToken)->putJson('/api/employees/'.$target->employee_id.'/roles', ['role_ids' => [$role->id]])->assertForbidden();
        $this->travel(6)->minutes();
        $this->app['auth']->forgetGuards();
        $this->withToken($firstToken)->putJson('/api/employees/'.$target->employee_id.'/roles', ['role_ids' => [$role->id]])->assertForbidden();
        $this->assertTrue(app(AdministrativeAuthentication::class)->replacementIsReady($user));
        $this->step($user, $firstToken, $secret, 'role.delete', ['role_id' => $role->id]);
        $this->putJson('/api/employees/'.$target->employee_id.'/roles', ['role_ids' => [$role->id]])->assertForbidden();
    }

    public function test_logout_revokes_stepup_but_not_persistent_replacement_readiness(): void
    {
        [$user, $secret, , $token] = $this->readyAdmin();
        $this->step($user, $token, $secret, 'mfa.recovery_codes');
        $tokenId = \Laravel\Sanctum\PersonalAccessToken::findToken($token)->id;
        $this->postJson('/api/logout')->assertOk();
        $this->assertSame(0, DB::table('authentication_challenges')->where('token_id', $tokenId)->count());
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->postJson('/api/mfa/recovery-codes/regenerate')->assertUnauthorized();
        $this->assertTrue(app(AdministrativeAuthentication::class)->replacementIsReady($user));
    }

    public function test_privileged_audit_failure_rolls_back_assignment_and_stepup_consumption(): void
    {
        [$admin, $secret, , $token] = $this->readyAdmin();
        $target = $this->fixtureEmployee('audit-assignment');
        $role = Role::create(['name' => 'audited_ordinary', 'display_name' => 'Synthetic audited role']);
        $role->permissions()->sync([Permission::where('name', 'employee.view')->sole()->id]);
        $before = $target->roles()->pluck('id')->all();
        $this->step($admin, $token, $secret, 'role.assign', ['user_id' => $target->id, 'role_id' => $role->id]);
        $proof = DB::table('authentication_challenges')->where('purpose', 'step_up')->where('action', 'role.assign')->sole();
        Schema::drop('security_audit_logs');
        $this->putJson('/api/employees/'.$target->employee_id.'/roles', ['role_ids' => [$role->id]])->assertStatus(500);
        $this->assertSame($before, $target->roles()->pluck('id')->all());
        $this->assertNull(DB::table('authentication_challenges')->where('id', $proof->id)->value('used_at'));
    }

    public function test_missing_mfa_and_client_flags_or_a_foreign_session_cannot_authenticate_an_admin(): void
    {
        $user = $this->fixtureAdmin('no-mfa');
        $this->postJson('/api/login', ['email' => $user->email, 'password' => self::SYNTHETIC_PASSWORD, 'mfa_verified' => true])
            ->assertStatus(202)->assertJsonMissingPath('token');
        $this->app['auth']->forgetGuards();
        $this->withToken($user->createToken('synthetic-password-only')->plainTextToken)->getJson('/api/me')->assertUnauthorized();
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        $challenge = $this->postJson('/api/login', ['email' => $user->email, 'password' => self::SYNTHETIC_PASSWORD])->assertStatus(202)->json('challenge');
        $other = $this->fixtureEmployee('foreign-session');
        $this->withToken($other->createToken('synthetic-other')->plainTextToken)
            ->postJson('/api/mfa/enrollment/start', ['challenge' => $challenge])->assertForbidden();
        $this->assertDatabaseCount('account_mfa', 0);
    }

    public function test_account_wide_otp_budget_cannot_be_reset_by_new_challenges(): void
    {
        [$user, $invitation] = $this->bootstrapIdentity();
        $this->activate($user, $invitation);
        [$secret] = $this->enroll($user);
        $this->travel(61)->seconds();
        $challenge = $this->passwordChallenge($user, 'login_mfa');
        for ($i = 0; $i < 5; ++$i) {
            $this->postJson('/api/mfa/login', ['challenge' => $challenge, 'otp' => '000000'])->assertUnprocessable();
        }
        $this->postJson('/api/mfa/login', ['challenge' => $challenge, 'otp' => '000000'])->assertStatus(429);
        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.99']);
        $newChallenge = $this->passwordChallenge($user, 'login_mfa');
        $this->postJson('/api/mfa/login', ['challenge' => $newChallenge, 'otp' => app(Totp::class)->code($secret, now()->timestamp)])->assertUnprocessable();
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_last_admin_is_protected_and_only_a_real_mfa_replacement_allows_retirement(): void
    {
        [$first] = $this->readyAdmin();
        try {
            $first->update(['is_active' => false]);
            $this->fail('Last Admin must remain protected.');
        } catch (\Illuminate\Validation\ValidationException) {
            $this->assertTrue($first->fresh()->is_active);
        }
        $second = $this->fixtureUser('verified-replacement', AdminCapabilities::ESSENTIAL, 'admin');
        $this->assertFalse(app(AdministrativeAuthentication::class)->replacementIsReady($second));
        $this->authenticatedFixtureToken($second); // real password/TOTP, not a ready=true fixture flag
        $this->assertTrue(app(AdministrativeAuthentication::class)->replacementIsReady($second));
        $first->refresh()->update(['is_active' => false]);
        $this->assertFalse($first->fresh()->is_active);
        $this->assertSame(0, $first->tokens()->count());
    }

    public function test_mfa_secret_tampering_is_fail_closed_and_not_a_valid_replacement(): void
    {
        [$user, , , $token] = $this->readyAdmin();
        DB::table('account_mfa')->where('user_id', $user->id)->update(['secret_ciphertext' => 'synthetic-invalid-ciphertext']);
        $this->assertFalse(app(AdministrativeAuthentication::class)->replacementIsReady($user));
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/me')->assertUnauthorized();
    }

    public function test_bootstrap_finish_audit_failure_rolls_back_role_grants_marker_and_stepup(): void
    {
        [$user, $invite] = $this->bootstrapIdentity();
        $this->activate($user, $invite);
        [$secret] = $this->enroll($user);
        $token = $this->loginMfa($user, $secret);
        $this->step($user, $token, $secret, 'bootstrap.finish');
        Schema::drop('security_audit_logs');
        try {
            app(FirstAdminBootstrap::class)->finish($token);
            $this->fail('No unaudited Admin grant.');
        } catch (\Illuminate\Database\QueryException) {
            $state = DB::table('security_administration_state')->where('id', 1)->first();
            $this->assertFalse((bool) $state->admin_seen);
            $this->assertNull($state->bootstrap_completed_at);
            $this->assertSame(0, $user->roles()->count());
            $this->assertNull(DB::table('authentication_challenges')->where('purpose', 'step_up')->value('used_at'));
        }
    }

    public function test_observed_lost_admin_does_not_reopen_setup_or_offline_recovery(): void
    {
        [$admin] = $this->readyAdmin();
        DB::table('user_roles')->where('user_id', $admin->id)->delete(); // out-of-band loss fixture
        $count = User::count();
        try {
            app(FirstAdminBootstrap::class)->prepare();
            $this->fail('No automatic rebootstrap after observed Admin loss.');
        } catch (\Illuminate\Validation\ValidationException) {
            $this->assertSame($count, User::count());
        }
        $this->artisan('themis:admin-recovery', ['--apply' => true])->expectsOutputToContain('BLOCKED')->assertFailed();
    }

    public static function invalidLoginStates(): array
    {
        return array_map(fn ($state) => [$state], ['disabled', 'resigned', 'deleted_profile', 'unlinked', 'changed_credential', 'expired_challenge']);
    }

    #[DataProvider('invalidLoginStates')]
    public function test_pre_auth_challenge_cannot_outlive_account_identity_or_profile_state(string $state): void
    {
        [$user, $invitation] = $this->bootstrapIdentity();
        $this->activate($user, $invitation);
        [$secret] = $this->enroll($user);
        $this->travel(31)->seconds();
        $challenge = $this->passwordChallenge($user, 'login_mfa');
        match ($state) {
            'disabled' => DB::table('users')->where('id', $user->id)->update(['is_active' => false]),
            'resigned' => DB::table('employees')->where('id', $user->employee_id)->update(['status' => 'resigned']),
            'deleted_profile' => DB::table('employees')->where('id', $user->employee_id)->update(['deleted_at' => now()]),
            'unlinked' => DB::table('users')->where('id', $user->id)->update(['employee_id' => null]),
            'changed_credential' => DB::table('users')->where('id', $user->id)->update(['password' => Hash::make('Synthetic-New!Credential')]),
            'expired_challenge' => $this->travel(6)->minutes(),
        };
        $this->postJson('/api/mfa/login', ['challenge' => $challenge, 'otp' => app(Totp::class)->code($secret, now()->timestamp)])->assertUnprocessable();
        $this->assertSame(0, $user->tokens()->count());
        $this->assertNull(DB::table('authentication_challenges')->where('secret_hash', hash('sha256', $challenge))->value('used_at'));
    }

    public function test_password_verified_login_challenge_is_single_use_after_valid_totp(): void
    {
        [$user, $invitation] = $this->bootstrapIdentity();
        $this->activate($user, $invitation);
        [$secret] = $this->enroll($user);
        $challenge = $this->passwordChallenge($user, 'login_mfa');
        $this->travel(31)->seconds();
        $payload = ['challenge' => $challenge, 'otp' => app(Totp::class)->code($secret, now()->timestamp)];
        $this->postJson('/api/mfa/login', $payload)->assertOk()->assertJsonStructure(['token']);
        $this->postJson('/api/mfa/login', $payload)->assertUnprocessable();
        $this->assertSame(1, $user->tokens()->count());
    }

    public function test_bootstrap_cli_apply_provisions_only_a_new_pending_identity_in_ram(): void
    {
        $context = $this->fixtureEmployee('cli-context');
        $context->employee->office->update(['office_code' => 'THEMIS']);
        $setup = app(FirstAdminBootstrap::class)->prepare()->tokenForDelivery();
        $this->artisan('themis:admin-bootstrap', ['--apply' => true])
            ->expectsConfirmation('Apply ONLY to synthetic SQLite :memory:?', 'yes')
            ->expectsQuestion('One-time installation setup challenge', $setup)
            ->expectsQuestion('New Employee full name', 'Synthetic CLI Owner')
            ->expectsQuestion('New Employee login email', 'synthetic-cli-owner@example.test')
            ->expectsQuestion('Existing valid office ID', (string) $context->employee->office_id)
            ->expectsQuestion('Hire date (YYYY-MM-DD)', '2026-01-01')
            ->expectsOutputToContain('Pending identity reserved')->assertSuccessful();
        $user = User::where('email', 'synthetic-cli-owner@example.test')->sole();
        $this->assertTrue($user->activation_required);
        $this->assertSame(0, $user->roles()->count());
        $this->assertDatabaseCount('users', 2);
    }

    public function test_non_sandbox_apply_is_rejected_before_any_database_access_and_dry_run_is_safe(): void
    {
        $old = config('database.default');
        config(['database.default' => 'mysql']);
        try {
            $this->artisan('themis:admin-bootstrap')->expectsOutputToContain('DRY RUN')->assertSuccessful();
            try {
                app(FirstAdminBootstrap::class)->prepare();
                $this->fail('Real database apply must not be attempted.');
            } catch (\LogicException $error) {
                $this->assertStringContainsString('synthetic testing SQLite :memory:', $error->getMessage());
            }
        } finally {
            config(['database.default' => $old]);
        }
        $this->assertDatabaseCount('authentication_challenges', 0);
        $this->assertDatabaseCount('users', 0);
    }

    public function test_credential_change_revokes_existing_stepup_and_bearers_after_valid_replacement_exists(): void
    {
        [$user, $secret, , $token] = $this->readyAdmin();
        $second = $this->fixtureUser('credential-replacement', AdminCapabilities::ESSENTIAL, 'admin');
        $this->authenticatedFixtureToken($second);
        $this->step($user, $token, $secret, 'mfa.recovery_codes');
        $user->update(['password' => Hash::make('Synthetic-Replaced!Credential')]);
        $this->assertSame(0, $user->tokens()->count());
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->postJson('/api/mfa/recovery-codes/regenerate')->assertUnauthorized();
        $this->assertFalse(app(AdministrativeAuthentication::class)->replacementIsReady($user));
        $this->assertTrue(app(AdministrativeAuthentication::class)->replacementIsReady($second));
    }

    public function test_enrollment_secret_is_shown_only_once_and_mfa_session_metadata_never_exposes_it(): void
    {
        [$user, $invitation] = $this->bootstrapIdentity();
        $this->activate($user, $invitation);
        $challenge = $this->passwordChallenge($user, 'login_enroll');
        $secret = $this->postJson('/api/mfa/enrollment/start', ['challenge' => $challenge])->assertOk()->json('secret');
        $this->postJson('/api/mfa/enrollment/start', ['challenge' => $challenge])->assertUnprocessable()->assertJsonMissingPath('secret');
        $this->postJson('/api/mfa/enrollment/confirm', ['challenge' => $challenge, 'otp' => app(Totp::class)->code($secret, now()->timestamp)])->assertOk();
        $token = $this->loginMfa($user, $secret);
        $this->app['auth']->forgetGuards();
        $response = $this->withToken($token)->getJson('/api/me')->assertOk();
        $this->assertStringNotContainsString($secret, $response->getContent());
        $this->assertStringNotContainsString('ciphertext', $response->getContent());
        $this->assertStringNotContainsString($secret, SecurityAuditLog::all()->toJson());
    }

    public function test_real_stepup_does_not_allow_self_escalation_or_protected_admin_assignment(): void
    {
        [$user, $secret, , $token] = $this->readyAdmin();
        $target = $this->fixtureEmployee('protected-assignment');
        $adminRole = $user->roles()->sole();
        $this->step($user, $token, $secret, 'role.assign', ['user_id' => $target->id, 'role_id' => $adminRole->id]);
        $this->putJson('/api/employees/'.$target->employee_id.'/roles', ['role_ids' => [$adminRole->id]])->assertForbidden();
        $this->step($user, $token, $secret, 'role.assign', ['user_id' => $user->id, 'role_id' => $adminRole->id]);
        $this->putJson('/api/employees/'.$user->employee_id.'/roles', ['role_ids' => [$adminRole->id]])->assertForbidden();
        $this->assertFalse($target->hasPermission('employee.manage_roles'));
    }

    public function test_required_mfa_login_audit_failure_rolls_back_otp_challenge_and_bearer(): void
    {
        [$user, $invite] = $this->bootstrapIdentity();
        $this->activate($user, $invite);
        [$secret] = $this->enroll($user);
        $challenge = $this->passwordChallenge($user, 'login_mfa');
        $state = DB::table('account_mfa')->where('user_id', $user->id)->first();
        $this->travel(31)->seconds();
        Schema::drop('security_audit_logs');
        $this->postJson('/api/mfa/login', ['challenge' => $challenge,
            'otp' => app(Totp::class)->code($secret, now()->timestamp)])->assertStatus(500)->assertJsonMissingPath('token');
        $this->assertSame(0, $user->tokens()->count());
        $this->assertEquals($state, DB::table('account_mfa')->where('user_id', $user->id)->first());
        $this->assertNull(DB::table('authentication_challenges')->where('secret_hash', hash('sha256', $challenge))->value('used_at'));
    }

    public function test_admin_password_change_requires_scoped_stepup_and_a_verified_replacement(): void
    {
        [$user, $secret, , $token] = $this->readyAdmin();
        $newPassword = 'Synthetic-Rotated!Owner-2026';
        $payload = ['current_password' => self::OWNER_PASSWORD, 'password' => $newPassword, 'password_confirmation' => $newPassword];
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->putJson('/api/password', $payload)->assertForbidden();
        $this->step($user, $token, $secret, 'account.password');
        $this->putJson('/api/password', $payload)->assertUnprocessable(); // no verified replacement yet
        $this->assertTrue(Hash::check(self::OWNER_PASSWORD, $user->fresh()->password));
        $other = $this->fixtureUser('password-replacement', AdminCapabilities::ESSENTIAL, 'admin');
        $this->authenticatedFixtureToken($other);
        $this->step($user, $token, $secret, 'account.password');
        $this->putJson('/api/password', $payload)->assertOk()->assertJsonPath('reauthentication_required', true);
        $this->assertTrue(Hash::check($newPassword, $user->fresh()->password));
        $this->assertSame(0, $user->tokens()->count());
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        $challenge = $this->postJson('/api/login', ['email' => $user->email, 'password' => $newPassword])->assertStatus(202)->json('challenge');
        $this->travel(31)->seconds();
        $this->postJson('/api/mfa/login', ['challenge' => $challenge, 'otp' => app(Totp::class)->code($secret, now()->timestamp)])
            ->assertOk()->assertJsonStructure(['token']);
        $this->assertTrue(app(AdministrativeAuthentication::class)->replacementIsReady($user));
    }

    public function test_device_change_requires_real_stepup_and_keeps_old_device_until_new_one_is_verified(): void
    {
        [$user, $secret, , $token] = $this->readyAdmin();
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->postJson('/api/mfa/device/change')->assertForbidden();
        $this->step($user, $token, $secret, 'mfa.device_change');
        $change = $this->postJson('/api/mfa/device/change')->assertOk()->assertJsonMissingPath('token')->json('challenge');
        $this->postJson('/api/mfa/device/change')->assertForbidden(); // proof consumed
        $this->assertTrue(app(AdministrativeAuthentication::class)->replacementIsReady($user));
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        $newSecret = $this->postJson('/api/mfa/enrollment/start', ['challenge' => $change])->assertOk()->json('secret');
        $this->assertSame($secret, Crypt::decryptString(DB::table('account_mfa')->where('user_id', $user->id)->value('secret_ciphertext')));
        $this->postJson('/api/mfa/enrollment/confirm', ['challenge' => $change,
            'otp' => app(Totp::class)->code($newSecret, now()->timestamp)])->assertOk()->assertJsonCount(10, 'recovery_codes');
        $this->assertSame(0, $user->tokens()->count());
        $this->assertTrue(app(AdministrativeAuthentication::class)->replacementIsReady($user));
        $this->assertSame(['admin'], $user->roles()->pluck('name')->all());
        $newToken = $this->loginMfa($user, $newSecret);
        $this->withToken($newToken)->getJson('/api/me')->assertOk();
    }

    public function test_each_role_writer_uses_its_own_real_action_scoped_single_use_proof(): void
    {
        [$user, $secret, , $token] = $this->readyAdmin();
        $service = app(\App\Services\Administration\AdministrativeRoleService::class);
        $this->step($user, $token, $secret, 'role.create', ['name' => 'synthetic_role', 'permissions' => ['employee.view']]);
        $role = $service->create($user, 'synthetic_role', ['employee.view']);
        $this->assertSame(['employee.view'], $role->permissions()->pluck('name')->all());
        $this->assertFalse(app(AdministrativeAuthentication::class)->permitsMutation($user, 'role.create', ['name' => 'synthetic_role', 'permissions' => ['employee.view']]));
        $this->step($user, $token, $secret, 'role.clone', ['role_id' => $role->id, 'name' => 'synthetic_copy']);
        $copy = $service->clone($user, $role, 'synthetic_copy');
        $this->assertSame(['employee.view'], $copy->permissions()->pluck('name')->all());
        $this->step($user, $token, $secret, 'role.rename', ['role_id' => $copy->id, 'name' => 'synthetic_renamed']);
        $service->rename($user, $copy, 'synthetic_renamed');
        $this->assertSame('synthetic_renamed', $copy->fresh()->name);
        $this->step($user, $token, $secret, 'role.permissions', ['role_id' => $copy->id, 'permissions' => []]);
        $service->replacePermissions($user, $copy, []);
        $this->assertSame(0, $copy->permissions()->count());
        $this->step($user, $token, $secret, 'role.delete', ['role_id' => $copy->id]);
        $service->delete($user, $copy);
        $this->assertNull(Role::find($copy->id));
        $this->assertTrue(app(AdministrativeAuthentication::class)->replacementIsReady($user));
    }
}
