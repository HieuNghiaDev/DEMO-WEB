<?php

namespace Tests\Feature\A03;

use App\Models\ApprovalRequest;
use App\Models\Permission;
use App\Services\Administration\AdminCapabilities;
use App\Services\ApprovalNotificationService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\B21\B21TestCase;

class ExplicitAuthorityTest extends B21TestCase
{
    public static function legacyIdentities(): array
    {
        return [['level_5', 'employee'], ['level_4', 'employee'], ['level_1', 'admin'], ['level_1', 'manager']];
    }

    #[DataProvider('legacyIdentities')]
    public function test_level_alias_or_title_without_pivot_is_not_action_authority(string $role, string $legacy): void
    {
        $actor = $this->fixtureLegacy('a03-no-grants', $role, $legacy);
        DB::table('role_permissions')->whereIn('role_id', $actor->roles()->pluck('id'))->delete();
        $actor->employee->update(['position_title' => 'Admin Lawyer Level 5']);
        foreach (['case.view', 'case.update', 'document.create', 'document.update', 'task.review', 'approval.approve', 'employee.manage_roles', 'employee.disable'] as $permission) {
            $this->assertFalse($actor->hasPermission($permission), $permission.' needs an explicit pivot.');
            $this->assertNotContains($permission, $actor->permission_names);
        }
        $this->actingAs($actor)->getJson('/api/case-files')->assertForbidden();
        $this->postJson('/api/case-files', [])->assertForbidden();
        $this->getJson('/api/approvals')->assertForbidden();
    }

    public function test_legacy_column_is_not_a_role_membership(): void
    {
        $actor = $this->fixtureConflict('a03-role-membership');
        $this->assertFalse($actor->hasRole('level_5'));
        $this->assertFalse($actor->hasRole('admin'));
        $this->assertTrue($actor->hasRole('level_1'));
        $actor->load('roles.permissions');
        DB::table('user_roles')->where('user_id', $actor->id)->delete();
        $this->assertFalse($actor->hasRole('level_1'));
        $this->assertSame([], $actor->role_names);
    }

    public function test_explicit_role_permissions_work_without_level_or_title_authority(): void
    {
        $actor = $this->fixtureUser('a03-explicit', ['case.view', 'case.update', 'document.view', 'approval.view']);
        $case = $this->matter();
        $this->actingAs($actor)->getJson('/api/case-files/'.$case->id)->assertOk();
        $this->getJson('/api/case-files/'.$case->id.'/documents')->assertOk();
        $this->getJson('/api/approvals')->assertOk();
        $this->putJson('/api/case-files/'.$case->id, ['summary' => 'Synthetic explicit update'])->assertOk();
        $this->assertDatabaseHas('case_files', ['id' => $case->id, 'summary' => 'Synthetic explicit update']);
        $this->assertFalse($actor->hasPermission('task.review'));
        $this->assertFalse($actor->hasPermission('employee.view_private'));
    }

    public function test_old_permission_revoke_on_loaded_model_and_same_bearer_is_effective_next_request(): void
    {
        $actor = $this->fixtureLegacy('a03-revoke', 'level_5', 'admin');
        $role = $actor->roles()->sole();
        $actor->load('roles.permissions');
        $token = $actor->createToken('synthetic-a03')->plainTextToken;
        $this->app['auth']->forgetGuards();
        $case = $this->matter();
        $this->withToken($token)->getJson('/api/case-files/'.$case->id)->assertOk();
        $this->putJson('/api/case-files/'.$case->id, ['summary' => 'Synthetic before revoke'])->assertOk();
        $role->permissions()->detach(Permission::whereIn('name', ['case.view', 'case.update'])->pluck('id'));
        foreach (['case.view', 'case.update'] as $permission) {
            $this->assertFalse($actor->hasPermission($permission));
            $this->assertNotContains($permission, $actor->permission_names);
        }
        $this->getJson('/api/case-files/'.$case->id)->assertForbidden();
        $this->putJson('/api/case-files/'.$case->id, ['summary' => 'Must not persist'])->assertForbidden();
        $this->assertSame('Synthetic before revoke', $case->fresh()->summary);
        $this->assertNotContains('case.view', $this->getJson('/api/me')->assertOk()->json('user.permission_names'));
    }

    public function test_canonical_admin_has_only_explicit_actions_and_retains_operational_access(): void
    {
        $admin = $this->fixtureUser('a03-canonical', AdminCapabilities::ESSENTIAL, 'admin');
        Permission::firstOrCreate(['name' => 'case.manage_access'], ['display_name' => 'Synthetic scoped access']);
        $this->assertTrue(AdminCapabilities::isCanonicalAdmin($admin));
        $this->assertTrue($admin->hasPermission('employee.view'));
        $this->assertTrue($admin->hasPermission('employee.manage_roles'));
        foreach (['case.view', 'case.manage_access', 'approval.approve', 'document.approve_legal', 'employee.view_private', 'employee.verify_lawyer'] as $permission) {
            $this->assertFalse($admin->hasPermission($permission));
        }
        $this->actingAs($admin)->getJson('/api/organization')->assertOk();
        $this->getJson('/api/case-files')->assertForbidden();
        $this->getJson('/api/approvals')->assertForbidden();
    }

    public function test_unknown_and_new_catalog_capabilities_are_not_inherited(): void
    {
        foreach (['level_5', 'level_4'] as $role) {
            $actor = $this->fixtureLegacy('a03-ceiling-'.$role, $role);
            foreach (['case.manage_access', 'document.approve_legal', 'future.sensitive'] as $permission) {
                Permission::firstOrCreate(['name' => $permission], ['display_name' => 'Synthetic']);
                $this->assertFalse($actor->hasPermission($permission));
                $this->assertNotContains($permission, $actor->permission_names);
            }
            foreach (['does.not_exist', '*', 'case.*', 'Case.view', 'case.view '] as $permission) {
                $this->assertFalse($actor->hasPermission($permission));
            }
        }
    }

    public function test_read_and_mutation_middleware_require_their_own_explicit_permission(): void
    {
        Route::middleware(['api', 'auth:sanctum', 'permission:case.view'])->get('/api/a03-read', fn () => response()->json(['ok' => true]));
        Route::middleware(['api', 'auth:sanctum', 'permission:task.review'])->post('/api/a03-review', fn () => response()->json(['ok' => true]));
        $actor = $this->fixtureLegacy('a03-middleware', 'level_5', 'admin');
        $role = $actor->roles()->sole();
        $role->permissions()->detach(Permission::whereIn('name', ['case.view', 'task.review'])->pluck('id'));
        $actor->load('roles.permissions');
        $this->actingAs($actor)->getJson('/api/a03-read')->assertForbidden();
        $this->postJson('/api/a03-review')->assertForbidden();
        $role->permissions()->attach(Permission::where('name', 'case.view')->value('id'));
        $this->getJson('/api/a03-read')->assertOk();
        $this->postJson('/api/a03-review')->assertForbidden();
        $role->permissions()->attach(Permission::where('name', 'task.review')->value('id'));
        $this->postJson('/api/a03-review')->assertOk();
        $role->permissions()->detach(Permission::where('name', 'task.review')->value('id'));
        $this->postJson('/api/a03-review')->assertForbidden();
    }

    public function test_approval_notifications_do_not_use_level_or_admin_alias_after_revoke(): void
    {
        $legacy = $this->fixtureLegacy('a03-notification', 'level_5', 'admin');
        $legacy->roles()->sole()->permissions()->detach(Permission::where('name', 'approval.approve')->value('id'));
        $reviewer = $this->fixtureUser('a03-notify-explicit', ['approval.approve']);
        $requester = $this->fixtureEmployee('a03-requester');
        $approval = ApprovalRequest::create(['requested_by' => $requester->id, 'action_type' => 'synthetic_action', 'status' => 'pending', 'payload' => []]);
        $count = app(ApprovalNotificationService::class)->notify($approval);
        $this->assertSame(1, $count);
        $this->assertDatabaseMissing('employee_notifications', ['user_id' => $legacy->id, 'kind' => 'warning']);
        $this->assertDatabaseHas('employee_notifications', ['user_id' => $reviewer->id, 'kind' => 'warning']);
    }
}
