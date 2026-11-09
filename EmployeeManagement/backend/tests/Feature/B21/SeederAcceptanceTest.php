<?php

namespace Tests\Feature\B21;

use App\Models\Permission;
use App\Models\Role;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\TaskVisibilityPermissionSeeder;
use Database\Seeders\TaskWorkflowPermissionSeeder;
use Tests\Support\B21\B21TestCase;

class SeederAcceptanceTest extends B21TestCase
{
    public function test_role_seeder_does_not_restore_a_revoked_permission(): void
    {
        $this->assertRevokeSurvives('level_2', 'document.update', RolePermissionSeeder::class);
    }

    public function test_visibility_seeder_does_not_restore_view_all(): void
    {
        $this->assertRevokeSurvives('level_4', 'task.view_all', TaskVisibilityPermissionSeeder::class);
    }

    public function test_workflow_seeder_does_not_restore_review(): void
    {
        $this->assertRevokeSurvives('level_4', 'task.review', TaskWorkflowPermissionSeeder::class);
    }

    public function test_master_deployment_seed_does_not_restore_review(): void
    {
        $this->assertRevokeSurvives('level_4', 'task.review', DatabaseSeeder::class);
    }

    public function test_empty_roles_are_not_automatically_replaced_with_level_two(): void
    {
        $user = $this->fixtureUser('empty-roles', []);
        $user->roles()->detach();
        $this->seed(RolePermissionSeeder::class);
        $this->assertSame(0, $user->roles()->count(), 'RED — PENDING IMPLEMENTATION: no-role may represent intentional revocation.');
    }

    private function assertRevokeSurvives(string $roleName, string $permissionName, string $seeder): void
    {
        $role = Role::where('name', $roleName)->firstOrFail();
        $permission = Permission::where('name', $permissionName)->value('id');
        $role->permissions()->detach($permission);
        $this->assertFalse($role->permissions()->whereKey($permission)->exists());
        $this->seed($seeder);
        $this->assertFalse($role->permissions()->whereKey($permission)->exists(), 'RED — PENDING IMPLEMENTATION: seeder restored '.$permissionName);
    }
}
