<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Office;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\OfficeSeeder;
use Tests\Support\LegacyRbacFixtureSeeder as RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class EmployeePasswordResetApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_level_four_without_explicit_reset_permission_cannot_change_a_password(): void
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

        $this->actingAs($manager, 'sanctum')
            ->putJson("/api/employees/{$employee->id}/password-reset")
            ->assertForbidden();

        // HOSTING-G2 supersedes the old Level-only reset policy. Positive recovery with
        // explicit permission, real TOTP, expiry and password change is covered in HostingG2.
        $this->assertFalse($targetUser->fresh()->must_change_password);
        $this->assertTrue(Hash::check('OldPassword!1', $targetUser->fresh()->password));
        $this->assertSame(1, $targetUser->tokens()->count());
    }
}
