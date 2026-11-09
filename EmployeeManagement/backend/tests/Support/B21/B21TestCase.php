<?php

namespace Tests\Support\B21;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Tests\Support\SecurityRemediationTestCase;

abstract class B21TestCase extends SecurityRemediationTestCase
{
    public const SYNTHETIC_PASSWORD = 'B21-Synthetic!Password-2026';
    private array $fixtureMfaSecrets = [];
    private array $fixtureMfaTokens = [];

    public function actingAs(\Illuminate\Contracts\Auth\Authenticatable $user, $guard = null)
    {
        if ($user instanceof User && \App\Services\Administration\AdminCapabilities::isCanonicalAdmin($user)
            && $user->is_active && ! $user->activation_required) {
            // Only fixture arrange changes: use REAL password/enrollment/TOTP HTTP verification,
            // never a fake mfa_verified flag or a TransientToken bypass in the application.
            $token = $this->authenticatedFixtureToken($user);
            $this->app['auth']->forgetGuards();
            $this->withToken($token)->getJson('/api/me')->assertOk();
            return $this;
        }
        $this->flushHeaders();
        return parent::actingAs($user, $guard);
    }

    protected function authenticatedFixtureToken(User $user): string
    {
        if (! \App\Services\Administration\AdminCapabilities::isCanonicalAdmin($user)) {
            return $user->createToken('synthetic-existing-session')->plainTextToken;
        }
        $sessions = app(\App\Services\Administration\VerifiedMfaSessions::class);
        $cached = $this->fixtureMfaTokens[$user->id] ?? null;
        if ($cached && $sessions->token($user, \Laravel\Sanctum\PersonalAccessToken::findToken($cached))) {
            return $cached;
        }
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        $data = ['email' => $user->email, 'password' => self::SYNTHETIC_PASSWORD];
        $challenge = $this->postJson('/api/login', $data)->assertStatus(202)->assertJsonMissingPath('token');
        $totp = app(\App\Services\Administration\Totp::class);
        if ($challenge->json('purpose') === 'login_enroll') {
            $raw = $challenge->json('challenge');
            $secret = $this->postJson('/api/mfa/enrollment/start', ['challenge' => $raw])->assertOk()->json('secret');
            $this->fixtureMfaSecrets[$user->id] = $secret;
            $this->postJson('/api/mfa/enrollment/confirm', ['challenge' => $raw, 'otp' => $totp->code($secret, now()->timestamp)])->assertOk();
            $challenge = $this->postJson('/api/login', $data)->assertStatus(202)->assertJsonMissingPath('token');
        }
        $this->travel(31)->seconds();
        $response = $this->postJson('/api/mfa/login', ['challenge' => $challenge->json('challenge'),
            'otp' => $totp->code($this->fixtureMfaSecrets[$user->id], now()->timestamp)])->assertOk()->assertJsonPath('user.id', $user->id);
        return $this->fixtureMfaTokens[$user->id] = $response->json('token');
    }

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $this->assertSame('sqlite', config('session.connection'));
        $this->assertSame('array', config('mail.default'));
    }

    protected function fixtureUser(string $label, array $permissions, ?string $roleName = null): User
    {
        // A second guard before any proposed catalog/role fixture write.
        $this->assertSame(':memory:', config('database.connections.sqlite.database'));
        $this->assertSame('sqlite', config('database.default'));
        $user = $this->actor('B21-'.$label, null);
        $user->update(['name' => 'Synthetic B21 '.$label, 'email' => strtolower($user->email),
            'password' => Hash::make(self::SYNTHETIC_PASSWORD)]);
        $role = Role::firstOrCreate(['name' => $roleName ?? 'b21-'.$label], ['display_name' => 'Synthetic B21 '.$label]);
        $ids = array_map(fn (string $name): int => Permission::firstOrCreate(['name' => $name], ['display_name' => 'Proposed '.$name])->id, $permissions);
        $role->permissions()->sync($ids);
        // Fixture setup only: raw SQLite pivot creation is not an application bootstrap route.
        // B2.2 deliberately rejects first-admin grants through ordinary model/pivot writers.
        $user->getConnection()->table('user_roles')->where('user_id', $user->id)->delete();
        $user->getConnection()->table('user_roles')->insert(['user_id' => $user->id, 'role_id' => $role->id]);
        return $user->fresh();
    }

    protected function fixtureAdmin(string $label = 'admin'): User
    {
        // This is only a pivot fixture. It is NOT proof of activation/MFA/Admin A implementation.
        return $this->fixtureUser($label, AdminAContract::adminFixturePermissions(), 'admin');
    }

    protected function fixtureEmployee(string $label = 'employee'): User
    {
        return $this->fixtureUser($label, AdminAContract::employeeFixturePermissions(), 'employee');
    }

    protected function fixtureLegacy(string $label, string $level, string $legacy = 'employee'): User
    {
        $user = $this->actor('B21-'.$label, $level);
        $user->update(['role' => $legacy, 'email' => strtolower($user->email),
            'password' => Hash::make(self::SYNTHETIC_PASSWORD)]);
        return $user->fresh();
    }

    protected function fixtureConflict(string $label = 'legacy-conflict'): User
    {
        return $this->fixtureLegacy($label, 'level_1', 'admin');
    }

    protected function snapshot(User $user): array
    {
        $user = $user->fresh();
        return [
            'user_id' => $user->id,
            'legacy_role' => $user->role,
            'source_roles' => $user->roles()->orderBy('name')->pluck('name')->all(),
            'effective_permissions' => Permission::orderBy('name')->pluck('name')->filter(fn (string $name): bool => $user->hasPermission($name))->values()->all(),
            'scope_revision' => 'synthetic-scope-v1',
        ];
    }

    protected function employeePayload(User $admin, string $suffix = 'new'): array
    {
        // The fake office needs a supported code allocation prefix, not production data.
        $admin->employee->office->update(['office_code' => 'THEMIS']);
        return ['full_name' => 'Synthetic invited employee', 'work_email' => 'b21-'.$suffix.'@example.test',
            'office_id' => $admin->employee->office_id, 'hire_date' => '2026-01-01', 'position_title' => 'Synthetic assistant'];
    }

    protected function requireActivationImplementation(): void
    {
        $this->assertTrue(Schema::hasColumns('users', ['activation_required', 'activated_at']),
            'RED — PENDING IMPLEMENTATION: additive account activation fields are absent.');
        $this->assertTrue(Schema::hasTable('account_action_tokens'),
            'RED — PENDING IMPLEMENTATION: activation token persistence is absent.');
        $route = collect(app('router')->getRoutes()->getRoutes())->contains(fn ($route): bool =>
            $route->uri() === AdminAContract::ACTIVATION_ROUTE && in_array('POST', $route->methods(), true));
        $this->assertTrue($route, 'RED — PENDING IMPLEMENTATION: public token-bound activation endpoint is absent.');
    }

    protected function pendingInvite(string $label): array
    {
        $this->requireActivationImplementation();
        $user = $this->fixtureEmployee($label);
        $user->forceFill(['activation_required' => true, 'activated_at' => null])->save();
        $token = bin2hex(random_bytes(32));
        $id = $user->getConnection()->table('account_action_tokens')->insertGetId([
            'user_id' => $user->id, 'purpose' => 'activation', 'token_hash' => hash('sha256', $token),
            'issued_by' => null, 'subject_email_hash' => hash('sha256', $user->email), 'issued_at' => now(),
            'subject_identity_hash' => \App\Services\Administration\AccountActivationService::identityHash($user),
            'expires_at' => now()->addHours(AdminAContract::ACTIVATION_TTL_HOURS),
            'used_at' => null, 'revoked_at' => null, 'created_at' => now(), 'updated_at' => now(),
        ]);
        return [$user, $token, $id];
    }

    protected function activationPayload(string $token): array
    {
        return ['token' => $token, 'password' => self::SYNTHETIC_PASSWORD.'-Owner', 'password_confirmation' => self::SYNTHETIC_PASSWORD.'-Owner'];
    }
}
