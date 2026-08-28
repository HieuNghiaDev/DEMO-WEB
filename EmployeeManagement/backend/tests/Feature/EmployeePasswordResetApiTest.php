<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Office;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\OfficeSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class EmployeePasswordResetApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_level_four_user_can_generate_a_temporary_password_for_an_employee(): void
    {
        $this->seed([OfficeSeeder::class, RolePermissionSeeder::class]);

        $manager = User::factory()->create();
        $manager->roles()->sync([Role::query()->where('name', 'level_4')->value('id')]);
        $office = Office::query()->firstOrFail();
        $employee = Employee::create([
            'employee_code' => 'TM901',
            'full_name' => 'PASSWORD RESET TARGET',
            'office_id' => $office->id,
            'hire_date' => '2026-08-28',
        ]);
        $targetUser = User::factory()->create([
            'employee_id' => $employee->id,
            'login_id' => 'tm901',
            'password' => Hash::make('OldPassword!1'),
            'must_change_password' => false,
        ]);
        $targetUser->createToken('existing-employee-session');

        $response = $this->actingAs($manager, 'sanctum')
            ->putJson("/api/employees/{$employee->id}/password-reset")
            ->assertOk()
            ->assertJsonStructure(['message', 'temporary_password']);

        $temporaryPassword = $response->json('temporary_password');

        $this->assertIsString($temporaryPassword);
        $this->assertSame(12, strlen($temporaryPassword));
        $this->assertMatchesRegularExpression('/[A-Z]/', $temporaryPassword);
        $this->assertMatchesRegularExpression('/[a-z]/', $temporaryPassword);
        $this->assertStringContainsString('!', $temporaryPassword);

        $targetUser->refresh();
        $this->assertTrue($targetUser->must_change_password);
        $this->assertTrue(Hash::check($temporaryPassword, $targetUser->password));
        $this->assertDatabaseCount('personal_access_tokens', 0);

        $this->app['auth']->forgetGuards();
        $temporaryLogin = $this->postJson('/api/login', [
            'email' => $targetUser->email,
            'password' => $temporaryPassword,
        ])
            ->assertOk()
            ->assertJsonPath('user.must_change_password', true);
        $temporaryToken = $temporaryLogin->json('token');

        $this->withToken($temporaryToken)
            ->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('user.must_change_password', true);

        $newPassword = 'EmployeeSecure@2026';
        $this->withToken($temporaryToken)
            ->putJson('/api/password', [
                'current_password' => $temporaryPassword,
                'password' => $newPassword,
                'password_confirmation' => $newPassword,
            ])
            ->assertOk()
            ->assertJsonPath('reauthentication_required', true);

        $this->app['auth']->forgetGuards();
        $this->withToken($temporaryToken)
            ->getJson('/api/me')
            ->assertUnauthorized();

        $newLogin = $this->postJson('/api/login', [
            'email' => $targetUser->email,
            'password' => $newPassword,
        ])
            ->assertOk()
            ->assertJsonPath('user.must_change_password', false);

        $this->withToken($newLogin->json('token'))
            ->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('user.must_change_password', false);
    }
}
