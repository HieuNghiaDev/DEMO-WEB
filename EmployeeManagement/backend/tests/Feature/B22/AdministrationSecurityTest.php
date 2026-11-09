<?php

namespace Tests\Feature\B22;

use App\Models\Permission;
use App\Models\Role;
use App\Models\SecurityAuditLog;
use App\Models\User;
use App\Policies\RolePolicy;
use App\Services\Administration\AdminCapabilities;
use App\Services\Administration\AdminContinuityGuard;
use App\Services\Administration\AdministrativeRoleService;
use App\Services\SecurityAuditLogger;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\B21\B21TestCase;

class AdministrationSecurityTest extends B21TestCase
{
    public static function destructiveWriters(): array
    {
        return array_map(fn ($name) => [$name], [
            'user_sync', 'user_detach', 'user_toggle', 'user_pivot_update',
            'role_users_sync', 'role_users_detach', 'permission_roles_sync', 'permission_roles_detach',
            'role_permissions_sync', 'role_permissions_detach', 'role_rename', 'permission_rename',
            'user_disable_quietly', 'user_delete_quietly', 'employee_force_delete', 'employee_force_delete_quietly',
            'employee_resign_quietly', 'employee_unlink', 'identity_change',
            'user_without_events', 'sync_with_pivot_values', 'sync_without_detaching', 'detach_or_fail',
        ]);
    }

    #[DataProvider('destructiveWriters')]
    public function test_all_supported_destructive_writers_rollback_without_token_loss(string $writer): void
    {
        $admin = $this->fixtureAdmin();
        $role = $admin->roles()->sole();
        $permission = Permission::where('name', 'employee.manage_roles')->sole();
        $ordinary = $this->fixtureEmployee();
        $admin->createToken('synthetic-continuity');
        $before = $this->snapshot($admin);
        $auditCount = SecurityAuditLog::count();
        try {
            match ($writer) {
                'user_sync' => $admin->roles()->sync([]),
                'user_detach' => $admin->roles()->detach(),
                'user_toggle' => $admin->roles()->toggle([$role->id]),
                'user_pivot_update' => $admin->roles()->updateExistingPivot($role->id, ['role_id' => $ordinary->roles()->sole()->id]),
                'role_users_sync' => $role->users()->sync([]),
                'role_users_detach' => $role->users()->detach($admin->id),
                'permission_roles_sync' => $permission->roles()->sync([]),
                'permission_roles_detach' => $permission->roles()->detach($role->id),
                'role_permissions_sync' => $role->permissions()->sync([]),
                'role_permissions_detach' => $role->permissions()->detach($permission->id),
                'role_rename' => $role->update(['name' => 'ordinary']),
                'permission_rename' => $permission->update(['name' => 'unknown.permission']),
                'user_disable_quietly' => $admin->forceFill(['is_active' => false])->saveQuietly(),
                'user_delete_quietly' => $admin->deleteQuietly(),
                'employee_force_delete' => $admin->employee->forceDelete(),
                'employee_force_delete_quietly' => $admin->employee->forceDeleteQuietly(),
                'employee_resign_quietly' => $admin->employee->forceFill(['status' => 'resigned'])->saveQuietly(),
                'employee_unlink' => $admin->update(['employee_id' => null]),
                'identity_change' => $admin->update(['email' => 'another-synthetic@example.test']),
                'user_without_events' => User::withoutEvents(fn () => $admin->update(['is_active' => false])),
                'sync_with_pivot_values' => $admin->roles()->syncWithPivotValues([], []),
                'sync_without_detaching' => $admin->roles()->syncWithoutDetaching([Role::where('name', 'level_3')->value('id')]),
                'detach_or_fail' => $admin->roles()->detachOrFail(),
            };
            $this->fail('A supported writer bypassed administrator continuity.');
        } catch (ValidationException $error) {
            $this->assertArrayHasKey('admin', $error->errors());
        }
        $this->assertSame($before, $this->snapshot(User::findOrFail($admin->id)));
        $this->assertSame(1, $admin->tokens()->count());
        $this->assertSame($auditCount, SecurityAuditLog::count());
        $this->assertNotSoftDeleted('employees', ['id' => $ordinary->employee_id]);
    }

    public function test_an_active_but_unverified_second_admin_is_not_a_ready_replacement(): void
    {
        $first = $this->fixtureAdmin('first');
        $this->fixtureAdmin('second');
        $this->expectException(ValidationException::class);
        $first->update(['is_active' => false]);
    }

    public function test_pending_password_change_admin_is_not_a_ready_replacement(): void
    {
        $first = $this->fixtureAdmin('first');
        $second = $this->fixtureAdmin('second');
        DB::table('users')->where('id', $second->id)->update(['must_change_password' => true]);
        $this->expectException(ValidationException::class);
        $first->delete();
    }

    public function test_uninitialized_installation_allows_ordinary_work_but_not_model_bootstrap(): void
    {
        $employee = $this->fixtureEmployee();
        $employee->employee->update(['position_title' => 'Synthetic assistant']);
        $this->assertFalse((bool) DB::table('security_administration_state')->value('admin_seen'));
        $role = Role::create(['name' => 'admin', 'display_name' => 'Synthetic protected role']);
        try {
            $employee->roles()->attach($role->id);
            $this->fail('Ordinary pivot attachment became an admin bootstrap.');
        } catch (ValidationException $error) {
            $this->assertArrayHasKey('admin', $error->errors());
        }
        $this->assertFalse(AdminCapabilities::isCanonicalAdmin($employee));
    }

    public function test_previously_initialized_state_cannot_silently_fall_back_to_bootstrap_after_raw_loss(): void
    {
        $admin = $this->fixtureAdmin();
        $admin->roles()->sync($admin->roles()->pluck('id')->all());
        DB::table('user_roles')->where('user_id', $admin->id)->delete(); // Simulated operator bypass, not a supported writer.
        $this->expectException(ValidationException::class);
        $admin->roles()->sync([]);
    }

    public function test_legacy_work_editor_and_new_admin_do_not_receive_pii_or_expand_nested_relations(): void
    {
        $target = $this->fixtureEmployee();
        $target->employee->update(['phone' => '090-0000-0000', 'date_of_birth' => '1990-01-01', 'nationality_code' => 'XX']);
        $legacy = $this->fixtureLegacy('legacy-hr', 'level_4');
        $profile = collect($this->actingAs($legacy, 'sanctum')->getJson('/api/organization')->assertOk()->json('employees'))->firstWhere('id', $target->employee_id);
        foreach (['phone', 'date_of_birth', 'nationality_code'] as $field) $this->assertNull($profile[$field]);
        $this->assertSame($target->employee->full_name, $profile['full_name']);
        $admin = $this->fixtureAdmin();
        $profile = collect($this->actingAs($admin, 'sanctum')->getJson('/api/organization')->assertOk()->json('employees'))->firstWhere('id', $target->employee_id);
        foreach (['phone', 'date_of_birth', 'nationality_code'] as $field) $this->assertNull($profile[$field]);
        $this->assertArrayNotHasKey('phone', $target->employee->toArray());
    }

    public function test_unknown_pii_permission_is_not_synthesized_by_legacy_admin(): void
    {
        $admin = $this->fixtureLegacy('legacy-pii', 'level_5', 'admin');
        $target = $this->fixtureEmployee();
        $this->assertFalse(Gate::forUser($admin)->allows('viewPrivate', $target->employee));
    }

    public function test_non_admin_cannot_manage_roles_and_client_step_up_flags_are_ignored(): void
    {
        $employee = $this->fixtureEmployee();
        $target = $this->fixtureEmployee('target');
        $role = $target->roles()->sole();
        $before = $this->snapshot($target);
        $this->actingAs($employee, 'sanctum')->putJson("/api/employees/{$target->employee_id}/roles", ['role_ids' => [$role->id], 'mfa_verified' => true, 'step_up' => true])->assertForbidden();
        $admin = $this->fixtureAdmin();
        $this->actingAs($admin, 'sanctum')->putJson("/api/employees/{$target->employee_id}/roles", ['role_ids' => [$role->id], 'mfa_verified' => true, 'step_up' => true])->assertForbidden();
        $this->assertSame($before, $this->snapshot($target));
    }

    public function test_policy_grantability_ceiling_is_distinct_from_admin_use_and_shared_role_membership(): void
    {
        $admin = $this->fixtureAdmin();
        $policy = app(RolePolicy::class);
        $this->assertTrue($policy->withinGrantableCeiling(['employee.view', 'task.update']));
        $this->assertTrue(AdminCapabilities::explicit($admin, 'employee.manage_roles'));
        foreach (['employee.manage_roles', 'employee.view_private', 'employee.verify_lawyer', 'document.approve_legal', 'developer.view', 'unknown.permission'] as $name) {
            $this->assertFalse($policy->withinGrantableCeiling([$name]));
        }
        $role = $admin->roles()->sole();
        foreach (['admin', 'verified_lawyer', 'developer', 'level_5'] as $name) {
            $this->assertFalse(Gate::forUser($admin)->allows('create', [Role::class, $name, []]));
            $this->assertFalse(Gate::forUser($admin)->allows('clone', [$role, $name]));
            $this->assertFalse(Gate::forUser($admin)->allows('rename', [$role, $name]));
        }
        $this->assertFalse(Gate::forUser($admin)->allows('grantPermissions', [$role, ['task.update']]));
        $proposed = array_keys(array_filter(\Tests\Support\B21\AdminAContract::permissions(), fn ($row) => $row['admin_grant'] === 'ordinary_in_scope'));
        $implemented = AdminCapabilities::ORDINARY_GRANTABLE;
        sort($implemented);
        $this->assertSame($proposed, $implemented);
    }

    public function test_nonessential_canonical_permission_change_has_required_audit_and_safe_snapshots(): void
    {
        $admin = $this->fixtureAdmin();
        $this->actingAs($admin, 'sanctum');
        $role = $admin->roles()->sole();
        $permissionId = Permission::where('name', 'attendance.export_own')->value('id');
        // Trusted model continuity boundary, not a proof that the gated role editor/MFA works.
        $role->permissions()->detach($permissionId);
        $audit = SecurityAuditLog::where('event', 'administration.pivot_detach')->sole();
        $this->assertSame($admin->id, $audit->user_id);
        $this->assertContains('attendance.export_own', $audit->metadata['before']['target']['permissions']);
        $this->assertNotContains('attendance.export_own', $audit->metadata['after']['target']['permissions']);
        $this->assertSame(1, $audit->metadata['after']['target']['affected_user_count']);
        $json = json_encode($audit->metadata);
        $this->assertStringNotContainsString($admin->email, $json);
        $this->assertStringNotContainsString($admin->password, $json);
        $this->assertStringNotContainsString('090-', $json);
    }

    public function test_actual_audit_database_failure_rolls_back_pivot_and_revision(): void
    {
        $admin = $this->fixtureAdmin();
        $this->actingAs($admin, 'sanctum');
        $role = $admin->roles()->sole();
        $before = $this->snapshot($admin);
        $revision = DB::table('security_administration_state')->value('revision');
        Schema::drop('security_audit_logs'); // Test-only SQLite RAM fault injection, never project DB.
        try {
            $role->permissions()->detach(Permission::where('name', 'attendance.export_own')->value('id'));
            $this->fail('An unaudited privilege mutation committed.');
        } catch (QueryException) {
            $this->assertSame($before, $this->snapshot($admin));
            $this->assertSame($revision, DB::table('security_administration_state')->value('revision'));
        }
    }

    public function test_audit_failure_does_not_return_success_or_partial_legacy_role_assignment(): void
    {
        $manager = $this->fixtureLegacy('operator', 'level_4');
        $target = $this->fixtureEmployee('legacy-target');
        $before = $this->snapshot($target);
        Schema::drop('security_audit_logs');
        $this->actingAs($manager, 'sanctum')->putJson("/api/employees/{$target->employee_id}/roles", ['role_ids' => [Role::where('name', 'level_1')->value('id')]])->assertStatus(500);
        $this->assertSame($before, $this->snapshot($target));
        $this->assertDatabaseCount('employee_notifications', 0);
    }

    public function test_login_logging_stays_fail_open_when_audit_storage_fails(): void
    {
        $user = $this->fixtureEmployee('login-audit-fault');
        Schema::drop('security_audit_logs');
        $this->postJson('/api/login', ['email' => $user->email, 'password' => self::SYNTHETIC_PASSWORD])->assertOk()->assertJsonStructure(['token']);
    }

    public function test_new_administrative_role_service_does_not_accept_bearer_as_step_up(): void
    {
        $admin = $this->fixtureAdmin();
        $target = $this->fixtureEmployee();
        $before = $this->snapshot($target);
        try {
            app(AdministrativeRoleService::class)->assign($admin, $target, $target->roles()->sole());
            $this->fail('No real strong authentication implementation exists.');
        } catch (AuthorizationException) {
            $this->assertSame($before, $this->snapshot($target));
        }
    }

    public function test_account_creation_is_atomic_when_required_audit_cannot_persist(): void
    {
        $manager = $this->fixtureLegacy('creator', 'level_4');
        $beforeUsers = User::count();
        $beforeEmployees = DB::table('employees')->count();
        $payload = $this->employeePayload($manager, 'audit-fault');
        Schema::drop('security_audit_logs');
        $this->actingAs($manager, 'sanctum')->postJson('/api/employees', $payload)->assertStatus(500);
        $this->assertSame($beforeUsers, User::count());
        $this->assertSame($beforeEmployees, DB::table('employees')->count());
        $this->assertDatabaseCount('employee_code_sequences', 0);
    }

    public function test_legacy_authorized_role_assignment_has_atomic_required_actor_and_entitlement_audit(): void
    {
        $manager = $this->fixtureLegacy('audit-operator', 'level_4');
        $target = $this->fixtureEmployee('audit-target');
        $this->actingAs($manager, 'sanctum')->putJson("/api/employees/{$target->employee_id}/roles", ['role_ids' => [Role::where('name', 'level_1')->value('id')]])->assertOk();
        $audit = SecurityAuditLog::where('event', 'administration.roles_assigned')->sole();
        $this->assertSame($manager->id, $audit->user_id);
        $this->assertSame(['employee'], $audit->metadata['before']['target']['roles']);
        $this->assertSame(['level_1'], $audit->metadata['after']['target']['roles']);
        $this->assertSame('organization', $audit->metadata['scope']['domain']);
        try {
            $audit->update(['outcome' => 'hidden']);
            $this->fail('Security audit history was editable.');
        } catch (\LogicException) {
            $this->assertSame('success', $audit->fresh()->outcome);
        }
        try {
            $audit->delete();
            $this->fail('Security audit history was deletable.');
        } catch (\LogicException) {
            $this->assertNotNull($audit->fresh());
        }
    }

    public function test_custom_role_alias_cannot_smuggle_lawyer_pii_or_developer_grants(): void
    {
        $manager = $this->fixtureLegacy('alias-operator', 'level_4');
        $target = $this->fixtureEmployee('alias-target');
        $before = $this->snapshot($target);
        foreach (['employee.view_private', 'employee.verify_lawyer', 'document.approve_legal', 'developer.view'] as $name) {
            $permission = Permission::firstOrCreate(['name' => $name], ['display_name' => 'Synthetic protected']);
            $role = Role::create(['name' => 'alias_'.str_replace('.', '_', $name), 'display_name' => 'Synthetic alias']);
            $role->permissions()->sync([$permission->id]);
            $this->actingAs($manager, 'sanctum')->putJson("/api/employees/{$target->employee_id}/roles", ['role_ids' => [$role->id]])->assertForbidden();
            $this->assertSame($before, $this->snapshot($target));
        }
    }

    public static function gatedRoleWriters(): array
    {
        return [['create'], ['clone'], ['rename'], ['permissions'], ['delete']];
    }

    public function test_legacy_hr_remains_usable_and_audited_before_additive_guard_migration(): void
    {
        $manager = $this->fixtureLegacy('old-schema-manager', 'level_4');
        $target = $this->fixtureEmployee('old-schema-target');
        $payload = $this->employeePayload($manager, 'old-schema-new');
        Schema::drop('security_administration_state'); // Simulated existing installation, RAM only.
        $this->actingAs($manager, 'sanctum')->putJson("/api/employees/{$target->employee_id}/roles", ['role_ids' => [Role::where('name', 'level_1')->value('id')]])->assertOk();
        $this->postJson('/api/employees', $payload)->assertCreated();
        $this->deleteJson("/api/employees/{$target->employee_id}")->assertOk();
        $this->assertSame(3, SecurityAuditLog::where('event', 'like', 'administration.%')->count());
        $this->assertSame('legacy_compat', SecurityAuditLog::where('event', 'administration.roles_assigned')->sole()->metadata['scope']['phase']);
        $this->assertFalse(Schema::hasTable('security_administration_state')); // No runtime migration/bootstrap.
    }

    public function test_canonical_admin_never_falls_back_to_legacy_when_guard_schema_is_missing(): void
    {
        $admin = $this->fixtureAdmin();
        Schema::drop('security_administration_state');
        try {
            $admin->update(['is_active' => false]);
            $this->fail('Canonical administration fell back to an unguarded legacy writer.');
        } catch (\LogicException) {
            $this->assertTrue($admin->fresh()->is_active);
        }
    }

    #[DataProvider('gatedRoleWriters')]
    public function test_new_role_service_writers_deny_without_real_step_up_and_leave_no_partial_write(string $operation): void
    {
        $admin = $this->fixtureAdmin();
        $role = Role::create(['name' => 'ordinary_scope', 'display_name' => 'Synthetic ordinary role']);
        $service = app(AdministrativeRoleService::class);
        $roleCount = Role::count();
        $auditCount = SecurityAuditLog::count();
        try {
            match ($operation) {
                'create' => $service->create($admin, 'ordinary_new', ['employee.view']),
                'clone' => $service->clone($admin, $role, 'ordinary_copy'),
                'rename' => $service->rename($admin, $role, 'ordinary_renamed'),
                'permissions' => $service->replacePermissions($admin, $role, ['employee.view']),
                'delete' => $service->delete($admin, $role),
            };
            $this->fail('A new privileged writer became available without real strong authentication.');
        } catch (AuthorizationException) {
            $this->assertSame($roleCount, Role::count());
            $this->assertSame('ordinary_scope', $role->fresh()->name);
            $this->assertSame(0, $role->permissions()->count());
            $this->assertSame($auditCount, SecurityAuditLog::count());
        }
    }
}
