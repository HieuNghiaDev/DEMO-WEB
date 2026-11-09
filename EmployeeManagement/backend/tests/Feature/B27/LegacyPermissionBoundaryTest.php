<?php

namespace Tests\Feature\B27;

use App\Models\Permission;
use App\Services\Administration\AdminCapabilities;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\B21\B21TestCase;

class LegacyPermissionBoundaryTest extends B21TestCase
{
    public static function newCapabilities(): array
    {
        $cases = [];
        foreach (['level_5', 'legacy_conflict'] as $identity) {
            foreach (['audit.view', 'case.manage_access', 'document.approve_legal', 'document.review_internal',
                'employee.activation.manage', 'employee.reset_password', 'employee.verify_lawyer',
                'employee.view_private', 'settings.manage', 'security.admin.bootstrap', 'future.sensitive_capability'] as $name) {
                $cases[$identity.' '.$name] = [$identity, $name];
            }
        }
        return $cases;
    }

    #[DataProvider('newCapabilities')]
    public function test_catalog_growth_is_not_a_legacy_grant(string $identity, string $name): void
    {
        $user = $identity === 'level_5' ? $this->fixtureLegacy('ceiling', 'level_5') : $this->fixtureConflict();
        Permission::firstOrCreate(['name' => $name], ['display_name' => 'Synthetic capability']);
        $this->assertFalse(AdminCapabilities::isCanonicalAdmin($user));
        $this->assertFalse(AdminCapabilities::explicit($user, $name));
        $this->assertFalse($user->hasPermission($name), 'A catalog row must not elevate a legacy identity.');
        $this->assertNotContains($name, $user->permission_names);
        $this->assertFalse($user->hasPermission('unregistered.sensitive'));
    }

    public function test_explicit_new_grant_and_revoke_are_fresh_on_loaded_model_and_same_bearer(): void
    {
        $user = $this->fixtureLegacy('fresh-ceiling', 'level_5');
        $role = $user->roles()->sole();
        $permission = Permission::create(['name' => 'future.sensitive_capability', 'display_name' => 'Synthetic']);
        $user->load('roles.permissions');
        $token = $user->createToken('synthetic-ceiling')->plainTextToken;
        $this->app['auth']->forgetGuards();
        $fetch = fn () => $this->withToken($token)->getJson('/api/me')->assertOk()->json('user.permission_names');
        $this->assertFalse($user->hasPermission($permission->name));
        $this->assertNotContains($permission->name, $fetch());
        $role->permissions()->attach($permission->id);
        $this->assertTrue($user->hasPermission($permission->name));
        $this->assertContains($permission->name, $user->permission_names);
        $this->assertContains($permission->name, $fetch());
        $role->permissions()->detach($permission->id);
        $this->assertFalse($user->hasPermission($permission->name));
        $this->assertNotContains($permission->name, $user->permission_names);
        $this->assertNotContains($permission->name, $fetch());
    }

    public function test_explicit_workflow_rights_survive_and_legacy_only_extras_are_denied(): void
    {
        $user = $this->fixtureConflict('compatible');
        foreach (['case.view', 'document.view'] as $name) {
            $this->assertTrue($user->hasPermission($name));
            $this->assertContains($name, $user->permission_names);
        }
        foreach (['employee.disable', 'task.manage', 'task.review'] as $name) {
            $this->assertFalse($user->hasPermission($name));
            $this->assertNotContains($name, $user->permission_names);
        }
        $case = $this->matter();
        $this->actingAs($user, 'sanctum')->getJson('/api/case-files/'.$case->id)->assertOk();
        $this->assertFalse($user->hasPermission('developer.view'));
    }

    public function test_canonical_admin_with_conflicting_legacy_role_is_still_explicit_only(): void
    {
        $admin = $this->fixtureAdmin('canonical-conflict');
        // Synthetic pre-existing conflict, not an ordinary role assignment or real account update.
        $admin->getConnection()->table('users')->where('id', $admin->id)->update(['role' => 'admin']);
        $admin = $admin->fresh();
        $this->assertTrue(AdminCapabilities::isCanonicalAdmin($admin));
        $this->assertTrue($admin->hasPermission('employee.manage_roles'));
        foreach (['case.view', 'case.delete', 'document.view', 'approval.approve'] as $name) {
            $this->assertFalse($admin->hasPermission($name));
            $this->assertNotContains($name, $admin->permission_names);
        }
    }

    public function test_even_registered_invalid_names_are_not_grants_or_serialized_capabilities(): void
    {
        $user = $this->fixtureLegacy('invalid-catalog', 'level_5');
        foreach (['*', 'employee.*', 'Employee.view', 'employee.view ', 'employee..view'] as $name) {
            $permission = Permission::create(['name' => $name, 'display_name' => 'Synthetic invalid']);
            $user->roles()->sole()->permissions()->attach($permission->id);
            $this->assertFalse($user->hasPermission($name));
            $this->assertNotContains($name, $user->permission_names);
        }
    }

    public function test_explicit_private_reader_is_not_inferred_from_new_catalog_or_work_update(): void
    {
        $user = $this->fixtureLegacy('new-private', 'level_5');
        $user->forceFill(['pii_requires_explicit' => true])->save();
        $user->employee->update(['phone' => 'SYNTHETIC', 'date_of_birth' => '1990-01-01', 'nationality_code' => 'XX']);
        Permission::firstOrCreate(['name' => 'employee.view_private'], ['display_name' => 'Synthetic']);
        $row = collect($this->actingAs($user, 'sanctum')->getJson('/api/organization')->assertOk()->json('employees'))
            ->firstWhere('id', $user->employee_id);
        foreach (['phone', 'date_of_birth', 'nationality_code'] as $field) {
            $this->assertNull($row[$field]);
        }
    }
}
