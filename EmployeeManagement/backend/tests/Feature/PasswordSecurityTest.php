<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Office;
use App\Models\User;
use Database\Seeders\EmployeeUserSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Hash;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class PasswordSecurityTest extends TestCase
{
    use RefreshDatabase;

    public function test_temporary_password_only_allows_account_and_password_endpoints(): void
    {
        $user = $this->createEmployeeUser(mustChangePassword: true);
        $token = $this->login($user->email, 'Temporary@123')->json('token');

        $this->withToken($token)
            ->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('user.must_change_password', true);

        $this->withToken($token)
            ->getJson('/api/attendances/active')
            ->assertForbidden()
            ->assertJsonPath('code', 'password_change_required');
    }

    public function test_password_change_requires_current_password_and_revokes_every_token(): void
    {
        $user = $this->createEmployeeUser(mustChangePassword: true);
        $token = $this->login($user->email, 'Temporary@123')->json('token');
        $user->createToken('another-session');

        $this->withToken($token)
            ->putJson('/api/password', [
                'current_password' => 'WrongPassword@123',
                'password' => 'NewSecure@12345',
                'password_confirmation' => 'NewSecure@12345',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('current_password');

        $this->withToken($token)
            ->putJson('/api/password', [
                'current_password' => 'Temporary@123',
                'password' => 'NewSecure@12345',
                'password_confirmation' => 'NewSecure@12345',
            ])
            ->assertOk()
            ->assertJsonPath('reauthentication_required', true);

        $user->refresh();
        $this->assertFalse($user->must_change_password);
        $this->assertTrue(Hash::check('NewSecure@12345', $user->password));
        $this->assertDatabaseCount('personal_access_tokens', 0);
        $this->assertDatabaseHas('security_audit_logs', [
            'event' => 'auth.password.changed',
            'outcome' => 'success',
            'user_id' => $user->id,
        ]);

        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/me')->assertUnauthorized();

        $newLogin = $this->login($user->email, 'NewSecure@12345')
            ->assertOk()
            ->assertJsonPath('user.must_change_password', false);

        $this->withToken($newLogin->json('token'))
            ->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('user.must_change_password', false);
    }

    public function test_password_policy_accepts_eleven_characters_with_uppercase_and_symbol(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);

        $user = $this->createEmployeeUser(mustChangePassword: true);
        $token = $this->login($user->email, 'Temporary@123')->json('token');

        $this->withToken($token)
            ->putJson('/api/password', [
                'current_password' => 'Temporary@123',
                'password' => 'ABCDEFGHIJ!',
                'password_confirmation' => 'ABCDEFGHIJ!',
            ])
            ->assertOk();

        $this->assertTrue(Hash::check('ABCDEFGHIJ!', $user->fresh()->password));
    }

    public function test_password_policy_rejects_short_passwords_or_missing_required_character_types(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);

        $user = $this->createEmployeeUser(mustChangePassword: true);
        $token = $this->login($user->email, 'Temporary@123')->json('token');

        foreach (['ABCDEFGHI!', 'abcdefghij!', 'ABCDEFGHIJK'] as $invalidPassword) {
            $this->withToken($token)
                ->putJson('/api/password', [
                    'current_password' => 'Temporary@123',
                    'password' => $invalidPassword,
                    'password_confirmation' => $invalidPassword,
                ])
                ->assertUnprocessable()
                ->assertJsonValidationErrors('password');
        }
    }

    public function test_security_migration_disables_only_seeded_accounts_still_using_default_password(): void
    {
        $vulnerable = $this->createEmployeeUser(
            mustChangePassword: true,
            loginId: 'TM001',
            email: 'seeded-one@themis.local',
            password: 'Themis@123456',
        );
        $vulnerable->createToken('existing-session');

        $alreadyRotated = $this->createEmployeeUser(
            mustChangePassword: true,
            loginId: 'TM002',
            email: 'seeded-two@themis.local',
            password: 'AlreadySecure@123',
        );

        $migration = require database_path('migrations/2026_08_26_120000_disable_predictable_seeded_credentials.php');
        $migration->up();

        $vulnerable->refresh();
        $alreadyRotated->refresh();

        $this->assertFalse($vulnerable->is_active);
        $this->assertFalse(Hash::check('Themis@123456', $vulnerable->password));
        $this->assertDatabaseMissing('personal_access_tokens', [
            'tokenable_id' => $vulnerable->id,
        ]);

        $this->assertTrue($alreadyRotated->is_active);
        $this->assertTrue(Hash::check('AlreadySecure@123', $alreadyRotated->password));
    }

    public function test_employee_account_seeder_is_a_no_op_outside_local_and_testing(): void
    {
        $previousEnvironment = $this->app->environment();
        $this->app->detectEnvironment(fn () => 'production');

        try {
            $this->app->make(EmployeeUserSeeder::class)->run();
            $this->assertDatabaseCount('users', 0);
            $this->assertDatabaseCount('employees', 0);
        } finally {
            $this->app->detectEnvironment(fn () => $previousEnvironment);
        }
    }

    public function test_operator_can_reactivate_a_rotated_account_with_an_interactive_password(): void
    {
        $user = $this->createEmployeeUser(
            mustChangePassword: true,
            loginId: 'TM001',
            email: 'locked@themis.local',
            password: 'RandomizedAndUnknown@123',
            active: false,
        );
        $user->createToken('stale-session');

        $this->artisan('themis:user-password', [
            'login_id' => 'TM001',
            '--activate' => true,
        ])
            ->expectsQuestion('New password (11+ chars, uppercase and symbol)', 'RecoveredSecure@123')
            ->expectsQuestion('Confirm new password', 'RecoveredSecure@123')
            ->assertSuccessful();

        $user->refresh();
        $this->assertTrue($user->is_active);
        $this->assertFalse($user->must_change_password);
        $this->assertTrue(Hash::check('RecoveredSecure@123', $user->password));
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    private function createEmployeeUser(
        bool $mustChangePassword,
        string $loginId = 'TM-PASSWORD-TEST',
        string $email = 'password-test@themis.local',
        string $password = 'Temporary@123',
        bool $active = true,
    ): User {
        $office = Office::query()->firstOrCreate([
            'office_code' => 'THEMIS',
        ], [
            'name' => 'THEMIS株式会社',
            'status' => 'active',
        ]);
        $employee = Employee::create([
            'employee_code' => $loginId,
            'full_name' => 'PASSWORD TEST USER '.$loginId,
            'hire_date' => '2026-08-26',
            'office_id' => $office->id,
            'status' => 'active',
        ]);

        return User::create([
            'employee_id' => $employee->id,
            'login_id' => $loginId,
            'name' => $employee->full_name,
            'email' => $email,
            'password' => $password,
            'role' => 'employee',
            'is_active' => $active,
            'must_change_password' => $mustChangePassword,
        ]);
    }

    private function login(string $email, string $password): TestResponse
    {
        return $this->postJson('/api/login', [
            'email' => $email,
            'password' => $password,
            'remember' => false,
        ]);
    }
}
