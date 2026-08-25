<?php

namespace Tests\Feature;

use App\Models\Office;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\OfficeSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EmployeeCreationApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_level_four_user_can_create_an_employee_profile(): void
    {
        $this->seed([OfficeSeeder::class, RolePermissionSeeder::class]);
        $user = User::factory()->create();
        $user->roles()->sync([Role::query()->where('name', 'level_4')->value('id')]);
        $office = Office::query()->firstOrFail();

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/employees', [
                'employee_code' => 'TM099',
                'full_name' => 'TEST EMPLOYEE',
                'full_name_kana' => 'テスト・エンプロイー',
                'office_id' => $office->id,
                'position_title' => '社員',
                'work_email' => 'test.employee@themis.local',
                'gender' => 'other',
                'hire_date' => '2026-08-25',
            ])
            ->assertCreated()
            ->assertJsonPath('employee.employee_code', 'TM099')
            ->assertJsonPath('employee.office.id', $office->id);

        $this->assertDatabaseHas('employees', [
            'employee_code' => 'TM099',
            'full_name' => 'TEST EMPLOYEE',
            'office_id' => $office->id,
            'status' => 'active',
        ]);
    }

    public function test_user_without_employee_create_permission_cannot_create_employee(): void
    {
        $this->seed([OfficeSeeder::class, RolePermissionSeeder::class]);
        $user = User::factory()->create();
        $user->roles()->sync([Role::query()->where('name', 'level_2')->value('id')]);
        $office = Office::query()->firstOrFail();

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/employees', [
                'employee_code' => 'TM098',
                'full_name' => 'UNAUTHORIZED EMPLOYEE',
                'office_id' => $office->id,
                'hire_date' => '2026-08-25',
            ])
            ->assertForbidden();

        $this->assertDatabaseMissing('employees', [
            'employee_code' => 'TM098',
        ]);
    }
}
