<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Office;
use App\Models\Role;
use App\Models\User;
use Tests\Support\LegacyRbacFixtureSeeder as RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EmployeeDeletionApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
    }

    public function test_level_four_can_delete_a_regular_employee_account(): void
    {
        $manager = $this->makeUser('DEL-001', 'level_4');
        $target = $this->makeUser('DEL-002', 'level_2');
        $target->createToken('deletion-test');

        Sanctum::actingAs($manager);
        $this->deleteJson("/api/employees/{$target->employee_id}")
            ->assertOk()
            ->assertJsonPath('message', '社員を削除しました。');

        $this->assertDatabaseMissing('users', ['id' => $target->id]);
        $this->assertDatabaseMissing('personal_access_tokens', [
            'tokenable_type' => User::class,
            'tokenable_id' => $target->id,
        ]);
        $this->assertSoftDeleted('employees', ['id' => $target->employee_id]);
        $this->assertDatabaseHas('employees', [
            'id' => $target->employee_id,
            'status' => 'resigned',
        ]);
        $this->assertDatabaseHas('security_audit_logs', [
            'event' => 'auth.account.deleted_by_manager',
            'outcome' => 'success',
            'user_id' => $manager->id,
        ]);
    }

    public function test_level_two_cannot_delete_an_employee_account(): void
    {
        $employee = $this->makeUser('DEL-003', 'level_2');
        $target = $this->makeUser('DEL-004', 'level_2');

        Sanctum::actingAs($employee);
        $this->deleteJson("/api/employees/{$target->employee_id}")->assertForbidden();

        $this->assertDatabaseHas('users', ['id' => $target->id]);
        $this->assertNotSoftDeleted('employees', ['id' => $target->employee_id]);
    }

    public function test_level_four_can_delete_a_legacy_employee_without_a_login_account(): void
    {
        $manager = $this->makeUser('DEL-010', 'level_4');
        $legacyEmployee = Employee::query()->create([
            'employee_code' => 'DEL-011',
            'full_name' => 'LEGACY EMPLOYEE',
            'hire_date' => now()->toDateString(),
            'office_id' => $manager->employee->office_id,
            'status' => 'active',
        ]);

        Sanctum::actingAs($manager);
        $this->deleteJson("/api/employees/{$legacyEmployee->id}")
            ->assertOk()
            ->assertJsonPath('message', '社員を削除しました。');

        $this->assertSoftDeleted('employees', ['id' => $legacyEmployee->id]);
        $this->assertDatabaseHas('employees', [
            'id' => $legacyEmployee->id,
            'status' => 'resigned',
        ]);
    }

    public function test_manager_cannot_delete_their_own_account(): void
    {
        $manager = $this->makeUser('DEL-005', 'level_4');

        Sanctum::actingAs($manager);
        $this->deleteJson("/api/employees/{$manager->employee_id}")->assertForbidden();

        $this->assertDatabaseHas('users', ['id' => $manager->id]);
        $this->assertNotSoftDeleted('employees', ['id' => $manager->employee_id]);
    }

    public function test_level_four_cannot_delete_a_level_five_account(): void
    {
        $manager = $this->makeUser('DEL-006', 'level_4');
        $superAdmin = $this->makeUser('DEL-007', 'level_5');

        Sanctum::actingAs($manager);
        $this->deleteJson("/api/employees/{$superAdmin->employee_id}")->assertForbidden();

        $this->assertDatabaseHas('users', ['id' => $superAdmin->id]);
        $this->assertNotSoftDeleted('employees', ['id' => $superAdmin->employee_id]);
    }

    public function test_level_five_can_delete_another_level_five_when_one_remains(): void
    {
        $actor = $this->makeUser('DEL-008', 'level_5');
        $target = $this->makeUser('DEL-009', 'level_5');

        Sanctum::actingAs($actor);
        $this->deleteJson("/api/employees/{$target->employee_id}")->assertOk();

        $this->assertDatabaseMissing('users', ['id' => $target->id]);
        $this->assertDatabaseHas('users', ['id' => $actor->id]);
    }

    private function makeUser(string $employeeCode, string $roleName): User
    {
        $office = Office::query()->firstOrCreate(
            ['office_code' => 'DELETE_TEST'],
            ['name' => 'Delete Test Office', 'status' => 'active']
        );
        $employee = Employee::query()->create([
            'employee_code' => $employeeCode,
            'full_name' => $employeeCode,
            'hire_date' => now()->toDateString(),
            'office_id' => $office->id,
            'status' => 'active',
        ]);
        $user = User::factory()->create([
            'employee_id' => $employee->id,
            'login_id' => strtolower($employeeCode),
            'role' => match ($roleName) {
                'level_5' => 'admin',
                'level_4' => 'manager',
                default => 'employee',
            },
            'must_change_password' => false,
        ]);
        $user->roles()->sync([Role::query()->where('name', $roleName)->value('id')]);

        return $user;
    }
}
