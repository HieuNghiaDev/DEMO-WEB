<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Office;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RbacTest extends TestCase
{
    use RefreshDatabase;

    public function test_level_four_has_management_permissions(): void
    {
        $this->seed(RolePermissionSeeder::class);
        $user = $this->makeUser('RBAC001');

        $user->roles()->sync($this->roleIds('level_4'));

        $this->assertTrue($user->hasRole('level_4'));
        $this->assertTrue($user->hasAnyRole(['level_1', 'level_4']));
        $this->assertTrue($user->hasPermission('task.assign'));
        $this->assertTrue($user->hasPermission('case.update'));
        $this->assertFalse($user->hasRole('level_5'));
    }

    public function test_only_level_five_can_grant_level_five_and_users_cannot_edit_themselves(): void
    {
        $this->seed(RolePermissionSeeder::class);
        $manager = $this->makeUser('RBAC002');
        $target = $this->makeUser('RBAC003');
        $manager->roles()->sync($this->roleIds('level_4'));
        $target->roles()->sync($this->roleIds('level_2'));

        Sanctum::actingAs($manager);
        $this->putJson("/api/employees/{$target->employee_id}/roles", [
            'role_ids' => $this->roleIds('level_5'),
        ])->assertForbidden();

        $superAdmin = $this->makeUser('RBAC004');
        $superAdmin->roles()->sync($this->roleIds('level_5'));

        Sanctum::actingAs($superAdmin);
        $this->putJson("/api/employees/{$target->employee_id}/roles", [
            'role_ids' => $this->roleIds('level_3'),
        ])->assertOk()
            ->assertJsonPath('message', '権限を更新しました。');

        $this->assertSame(1, $target->fresh()->roles()->count());
        $this->assertDatabaseHas('employee_notifications', [
            'user_id' => $target->id,
            'title' => '権限が更新されました',
        ]);

        Sanctum::actingAs($target->fresh());
        $this->putJson("/api/employees/{$target->employee_id}/roles", [
            'role_ids' => $this->roleIds('level_2'),
        ])->assertForbidden();
    }

    public function test_permission_middleware_blocks_users_without_a_role(): void
    {
        $this->seed(RolePermissionSeeder::class);
        $user = $this->makeUser('RBAC005');

        Sanctum::actingAs($user);
        $this->getJson('/api/organization')->assertForbidden();

        $user->roles()->sync($this->roleIds('level_2'));
        Sanctum::actingAs($user->fresh());
        $this->getJson('/api/organization')->assertOk();
    }

    /** @return list<int> */
    private function roleIds(string ...$names): array
    {
        return Role::query()->whereIn('name', $names)->pluck('id')->all();
    }

    private function makeUser(string $employeeCode): User
    {
        $office = Office::query()->firstOrCreate(
            ['office_code' => 'RBAC'],
            ['name' => 'RBAC Office', 'status' => 'active']
        );

        $employee = Employee::query()->create([
            'employee_code' => $employeeCode,
            'full_name' => $employeeCode,
            'hire_date' => now()->toDateString(),
            'office_id' => $office->id,
            'status' => 'active',
        ]);

        return User::factory()->create([
            'employee_id' => $employee->id,
            'login_id' => strtolower($employeeCode),
            'role' => 'employee',
            'must_change_password' => false,
        ]);
    }
}
