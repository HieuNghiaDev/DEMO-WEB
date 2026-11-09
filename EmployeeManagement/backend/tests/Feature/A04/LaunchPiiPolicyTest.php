<?php

namespace Tests\Feature\A04;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\B21\B21TestCase;

class LaunchPiiPolicyTest extends B21TestCase
{
    public static function formerBridgeReaders(): array
    {
        return ['user-8' => [8, 'level_4'], 'user-9' => [9, 'level_4'],
            'user-10' => [10, 'level_4'], 'user-14' => [14, 'level_5']];
    }

    #[DataProvider('formerBridgeReaders')]
    public function test_former_bridge_ids_have_no_replacement_private_grant(int $id, string $level): void
    {
        // Reproduce only numeric IDs/role names in RAM, never real account or HR data.
        while (User::count() < $id - 1) {
            $this->actor('a041-padding-'.User::count(), null);
        }
        $reader = $this->fixtureLegacy('a041-reader-'.$id, $level);
        $this->assertSame($id, $reader->id);
        if ($id === 14) {
            DB::table('user_roles')->insert(['user_id' => $id,
                'role_id' => Role::where('name', 'level_4')->sole()->id]);
        }
        $this->assertTrue($reader->hasPermission('employee.update'));
        $this->assertTrue($reader->hasPermission('employee.manage_roles'));
        $this->assertLaunchProjection($reader);
    }

    public static function otherReaders(): array
    {
        return ['legacy-admin-alias' => ['admin'], 'manager' => ['manager'],
            'developer' => ['developer'], 'work-view-only' => ['work_reader']];
    }

    #[DataProvider('otherReaders')]
    public function test_role_alias_or_work_view_does_not_create_private_access(string $role): void
    {
        if ($role === 'admin') {
            $reader = $this->fixtureLegacy('a041-admin-alias', 'level_4', 'admin');
            $this->assertFalse($reader->hasRole('admin'));
        } else {
            $reader = $this->fixtureUser('a041-'.$role, ['employee.view'], $role);
        }
        $this->assertLaunchProjection($reader);
    }

    private function authoritySnapshot(): array
    {
        $snapshot = [];
        foreach (['permissions' => ['id'], 'roles' => ['id'],
            'user_roles' => ['user_id', 'role_id'], 'role_permissions' => ['role_id', 'permission_id']] as $table => $order) {
            $query = DB::table($table);
            foreach ($order as $column) $query->orderBy($column);
            $snapshot[$table] = $query->get()->toJson();
        }
        return $snapshot;
    }

    private function assertLaunchProjection(User $reader): void
    {
        $target = $this->actor('a041-other-subject', null)->employee;
        foreach ([$reader->employee, $target] as $employee) {
            $employee->update(['phone' => 'SYNTHETIC-A041-PRIVATE', 'date_of_birth' => '2000-01-02',
                'nationality_code' => 'ZZ', 'gender' => 'female', 'work_email' => 'a041-'.$employee->id.'@example.test']);
        }
        $this->assertSame(0, Permission::where('name', 'employee.view_private')->count());
        $before = $this->authoritySnapshot();
        $this->actingAs($reader);

        // Repeat requests: directory/profile hydration must not bootstrap grants or roles.
        for ($request = 0; $request < 2; $request++) {
            $response = $this->getJson('/api/organization')->assertOk();
            $this->assertStringNotContainsString('SYNTHETIC-A041-PRIVATE', $response->getContent());
            foreach ($response->json('employees') as $row) {
                foreach (['phone', 'date_of_birth', 'nationality_code'] as $field) {
                    $this->assertArrayHasKey($field, $row);
                    $this->assertNull($row[$field]);
                }
            }
            foreach ([$reader->employee->fresh(), $target->fresh()] as $employee) {
                $row = collect($response->json('employees'))->firstWhere('id', $employee->id);
                $this->assertNotNull($row);
                foreach (['employee_code', 'full_name', 'gender', 'work_email', 'position_title', 'employment_type'] as $field) {
                    $this->assertSame($employee->$field, $row[$field], 'Existing work/profile contract: '.$field);
                }
                $this->assertSame($employee->hire_date->toDateString(), $row['hire_date']);
                $this->assertFalse(Gate::forUser($reader)->allows('viewPrivate', $employee));
            }
            $me = $this->getJson('/api/me')->assertOk()->assertJsonPath('user.id', $reader->id);
            foreach (['phone', 'date_of_birth', 'nationality_code'] as $field) {
                $me->assertJsonMissingPath('user.employee.'.$field);
            }
            $this->assertFalse($reader->fresh()->hasPermission('employee.view_private'));
        }
        $this->assertSame($before, $this->authoritySnapshot(), 'No auto-catalog, replacement grants or role changes.');
        $this->assertSame(0, Permission::where('name', 'employee.view_private')->count());
    }
}
