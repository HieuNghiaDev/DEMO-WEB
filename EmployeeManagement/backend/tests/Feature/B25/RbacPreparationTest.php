<?php

namespace Tests\Feature\B25;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\Administration\AdminCapabilities;
use App\Services\Administration\CanonicalRbacResolver;
use App\Services\Administration\VerifiedMfaSessions;
use Database\Seeders\CleanV2MasterSeeder;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\TaskVisibilityPermissionSeeder;
use Database\Seeders\TaskWorkflowPermissionSeeder;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\B21\B21TestCase;

class RbacPreparationTest extends B21TestCase
{
    public static function catalogSeeders(): array
    {
        return array_map(fn ($class) => [$class], [RolePermissionSeeder::class, TaskVisibilityPermissionSeeder::class,
            TaskWorkflowPermissionSeeder::class, CleanV2MasterSeeder::class, DatabaseSeeder::class]);
    }

    private function authoritySnapshot(): array
    {
        $snapshot = [];
        foreach (['roles', 'role_permissions', 'user_roles', 'users', 'employees', 'account_action_tokens',
            'account_mfa', 'mfa_recovery_codes', 'personal_access_tokens', 'security_administration_state'] as $table) {
            $snapshot[$table] = DB::table($table)->get()->map(fn ($row) => (array) $row)->all();
        }
        return $snapshot;
    }

    private function canonical(User ...$users): CanonicalRbacResolver
    {
        $this->assertTrue(class_exists(CanonicalRbacResolver::class), 'RED: isolated canonical resolver not implemented.');
        $identities = [];
        foreach ($users as $user) {
            $identities[$user->id] = VerifiedMfaSessions::identityHash($user->fresh());
        }
        $resolver = new CanonicalRbacResolver($identities);
        $this->app->instance(CanonicalRbacResolver::class, $resolver);
        return $resolver;
    }

    #[DataProvider('catalogSeeders')]
    public function test_existing_installation_catalog_rerun_never_changes_authority_or_lifecycle(string $seeder): void
    {
        $user = $this->fixtureEmployee('catalog-empty');
        $user->roles()->detach();
        $user->update(['role' => 'admin', 'is_active' => false]);
        $custom = Role::create(['name' => 'synthetic_custom', 'display_name' => 'Synthetic custom']);
        $custom->permissions()->sync([Permission::where('name', 'employee.view')->value('id')]);
        foreach (['document.update', 'task.review', 'task.view_all'] as $name) {
            DB::table('role_permissions')->where('permission_id', Permission::where('name', $name)->value('id'))->delete();
        }
        $before = $this->authoritySnapshot();
        $this->seed($seeder);
        $this->seed($seeder);
        $this->assertEquals($before, $this->authoritySnapshot(), 'No regrant, auto-role, account activation or custom-role rewrite.');
    }

    #[DataProvider('catalogSeeders')]
    public function test_no_role_is_not_an_instruction_to_bootstrap_legacy_defaults(string $seeder): void
    {
        DB::table('user_roles')->delete();
        Role::query()->each(fn (Role $role) => $role->delete());
        $user = $this->actor('no-defaults', null);
        $this->seed($seeder);
        $this->assertSame(0, $user->roles()->count());
        $this->assertDatabaseCount('roles', 0);
        $this->assertDatabaseCount('role_permissions', 0);
        $this->assertDatabaseCount('user_roles', 0);
    }

    public function test_canonical_legacy_admin_with_low_pivot_cannot_read_case_content(): void
    {
        $user = $this->fixtureConflict('canonical-low');
        $user->roles()->sole()->permissions()->detach(Permission::where('name', 'case.view')->value('id'));
        $case = $this->matter($user->employee);
        $this->canonical($user);
        $this->actingAs($user)->getJson('/api/case-files/'.$case->id)->assertForbidden();
        $this->assertFalse($user->hasRole('level_5'));
        $this->assertFalse($user->hasPermission('case.view'));
    }

    public function test_canonical_level_five_is_only_an_explicit_permission_group(): void
    {
        $user = $this->fixtureUser('canonical-l5', ['employee.view'], 'level_5');
        $this->canonical($user);
        $this->assertTrue($user->hasPermission('employee.view'));
        foreach (['employee.create', 'case.view', 'developer.view', 'task.review', 'unknown.operation', '*'] as $permission) {
            $this->assertFalse($user->hasPermission($permission));
        }
        $this->assertSame(['employee.view'], $user->permission_names);
    }

    public function test_canonical_empty_roles_and_unmapped_identities_fail_closed(): void
    {
        $empty = $this->fixtureUser('canonical-empty', []);
        $empty->roles()->detach();
        $empty->update(['role' => 'admin']);
        $unmapped = $this->fixtureEmployee('canonical-unmapped');
        $resolver = $this->canonical($empty);
        $this->assertSame('BLOCKED_UNMAPPED', $resolver->mappingStatus($unmapped));
        $this->assertSame([], $empty->permission_names);
        $this->assertFalse($empty->hasRole('admin'));
        $this->assertFalse($unmapped->hasPermission('employee.view'));
        $this->actingAs($unmapped)->getJson('/api/organization')->assertForbidden();
        $this->getJson('/api/me')->assertForbidden()->assertJsonMissingPath('user');
        $this->getJson('/api/attendances/active')->assertForbidden();
        $this->postJson('/api/work-sessions', [])->assertForbidden();
    }

    public function test_canonical_work_editor_does_not_inherit_legacy_private_read_bridge(): void
    {
        $user = $this->fixtureUser('canonical-work', ['employee.view', 'employee.update']);
        $user->employee->update(['phone' => '000-SYNTHETIC', 'date_of_birth' => '1990-01-01', 'nationality_code' => 'VN']);
        $this->canonical($user);
        $response = $this->actingAs($user)->getJson('/api/organization')->assertOk();
        foreach ($response->json('employees') as $employee) {
            $this->assertNull($employee['phone']);
            $this->assertNull($employee['date_of_birth']);
            $this->assertNull($employee['nationality_code']);
        }
    }

    public function test_canonical_revoke_is_live_even_on_a_cached_user_and_same_bearer(): void
    {
        $user = $this->fixtureUser('canonical-live', ['employee.view', 'case.view']);
        $case = $this->matter($user->employee);
        $this->canonical($user);
        $user->load('roles.permissions');
        $token = $user->createToken('synthetic-canonical')->plainTextToken;
        $this->withToken($token)->getJson('/api/case-files/'.$case->id)->assertOk();
        $user->roles()->sole()->permissions()->detach(Permission::where('name', 'case.view')->value('id'));
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/case-files/'.$case->id)->assertForbidden();
        $this->assertFalse($user->hasPermission('case.view'));
        $this->assertSame(['employee.view'], $user->permission_names);
    }

    public static function retiredIdentitySeeders(): array
    {
        return array_map(fn ($class) => [$class], [\Database\Seeders\EmployeeUserSeeder::class,
            \Database\Seeders\AdditionalEmployeeUserSeeder::class, \Database\Seeders\ManagerTestUserSeeder::class]);
    }

    #[DataProvider('retiredIdentitySeeders')]
    public function test_retired_identity_seeders_are_no_ops_before_any_database_query(string $seeder): void
    {
        $user = $this->fixtureEmployee('retired-seeder');
        $user->update(['is_active' => false]);
        $before = $this->authoritySnapshot();
        $queries = [];
        DB::listen(function ($query) use (&$queries): void { $queries[] = $query->sql; });
        (new $seeder)->run();
        $this->assertSame([], $queries);
        $this->assertEquals($before, $this->authoritySnapshot());
    }

    public function test_catalog_registration_preserves_custom_labels_and_never_grants_a_recreated_permission(): void
    {
        $permission = Permission::where('name', 'task.review')->sole();
        $permission->update(['display_name' => 'Synthetic custom catalog label']);
        $this->seed(RolePermissionSeeder::class);
        $this->assertSame('Synthetic custom catalog label', $permission->fresh()->display_name);
        $permission->delete();
        $this->seed(TaskWorkflowPermissionSeeder::class);
        $newId = Permission::where('name', 'task.review')->sole()->id;
        $this->assertSame(0, DB::table('role_permissions')->where('permission_id', $newId)->count());
    }

    public function test_no_production_binding_or_http_flag_enables_canonical_authority(): void
    {
        $this->assertFalse($this->app->bound(CanonicalRbacResolver::class));
        $user = $this->fixtureEmployee('client-mode');
        $case = $this->matter();
        $this->actingAs($user)->withHeader('X-Authority-Mode', 'canonical')
            ->getJson('/api/case-files/'.$case->id.'?canonical=true&authority_mode=canonical')->assertForbidden();
        $this->assertFalse($this->app->bound(CanonicalRbacResolver::class));
    }

    public function test_resolver_refuses_non_ram_environment_before_database_access(): void
    {
        config(['database.default' => 'mysql']);
        try {
            $this->expectException(\LogicException::class);
            new CanonicalRbacResolver([]);
        } finally {
            config(['database.default' => 'sqlite']);
        }
    }

    public function test_bound_rehearsal_revalidates_environment_and_does_not_fall_back_to_legacy(): void
    {
        $user = $this->fixtureConflict('bound-invalid-environment');
        $this->canonical($user);
        config(['database.connections.sqlite.database' => 'not-an-in-memory-database']);
        try {
            $this->expectException(\LogicException::class);
            $user->hasPermission('case.view');
        } finally {
            config(['database.connections.sqlite.database' => ':memory:']);
        }
    }

    public function test_stale_identity_mapping_is_blocked_not_reinterpreted_or_auto_mapped(): void
    {
        $user = $this->fixtureEmployee('stale-map');
        $resolver = $this->canonical($user);
        $user->update(['email' => 'synthetic-new-identity@example.test']);
        $this->assertSame('BLOCKED_STALE_IDENTITY', $resolver->mappingStatus($user));
        $this->assertFalse($user->hasPermission('employee.view'));
    }

    public function test_canonical_custom_multiple_roles_are_explicit_union_not_wildcard_or_title(): void
    {
        $user = $this->fixtureUser('custom-union', ['employee.view'], 'synthetic_operations');
        $extra = Role::create(['name' => 'synthetic_own', 'display_name' => 'Synthetic own']);
        $extra->permissions()->attach(Permission::where('name', 'attendance.view_own')->value('id'));
        $user->roles()->attach($extra->id);
        $user->employee->update(['position_title' => 'Admin 弁護士 HR']);
        $invalid = Permission::create(['name' => 'CASE.VIEW', 'display_name' => 'Synthetic invalid']);
        $extra->permissions()->attach($invalid->id);
        $this->canonical($user);
        $this->assertSame(['attendance.view_own', 'employee.view'], $user->permission_names);
        foreach (['case.view', 'CASE.VIEW', 'employee.view ', '*', 'unknown.operation', 'developer.view', 'employee.view_private'] as $permission) {
            $this->assertFalse($user->hasPermission($permission));
        }
        $this->assertFalse($user->hasRole('admin'));
        $user->roles()->detach($extra->id);
        $this->assertSame(['employee.view'], $user->permission_names);
    }

    public function test_canonical_admin_real_mfa_stepup_keeps_operational_access_but_cannot_self_escalate(): void
    {
        $admin = $this->fixtureUser('canonical-admin', AdminCapabilities::ESSENTIAL, 'admin');
        $target = $this->fixtureEmployee('canonical-assignment');
        $token = $this->authenticatedFixtureToken($admin); // actual password/enrollment/TOTP HTTP flow
        $this->canonical($admin, $target);
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/organization')->assertOk();
        $this->getJson('/api/case-files')->assertForbidden();
        $this->assertFalse($admin->hasPermission('employee.view_private'));
        $role = $target->roles()->sole();
        $url = '/api/employees/'.$target->employee_id.'/roles';
        $this->putJson($url, ['role_ids' => [$role->id]])->assertForbidden();
        $secret = \Illuminate\Support\Facades\Crypt::decryptString(DB::table('account_mfa')->where('user_id', $admin->id)->value('secret_ciphertext'));
        $step = function (int $userId, int $roleId) use ($secret): void {
            $this->travel(31)->seconds();
            $this->postJson('/api/mfa/step-up', ['password' => self::SYNTHETIC_PASSWORD,
                'otp' => app(\App\Services\Administration\Totp::class)->code($secret, now()->timestamp),
                'action' => 'role.assign', 'scope' => ['user_id' => $userId, 'role_id' => $roleId]])->assertOk();
        };
        $step($target->id, $role->id);
        $this->putJson($url, ['role_ids' => [$role->id]])->assertOk();
        $this->putJson($url, ['role_ids' => [$role->id]])->assertForbidden();
        $adminRole = $admin->roles()->sole();
        $step($target->id, $adminRole->id);
        $this->putJson($url, ['role_ids' => [$adminRole->id]])->assertForbidden();
        $step($admin->id, $role->id);
        $this->putJson('/api/employees/'.$admin->employee_id.'/roles', ['role_ids' => [$role->id]])->assertForbidden();
        $before = $this->authoritySnapshot();
        $this->seed(DatabaseSeeder::class);
        $this->assertEquals($before, $this->authoritySnapshot());
        $this->assertTrue(app(\App\Contracts\AdministrativeAuthentication::class)->replacementIsReady($admin));
        try {
            $admin->update(['is_active' => false]);
            $this->fail('Canonical rehearsal must preserve the last verified Admin.');
        } catch (\Illuminate\Validation\ValidationException) {
            $this->assertTrue($admin->fresh()->is_active);
        }
    }

    public function test_action_field_and_resource_dry_run_uses_observed_http_decisions_not_a_permission_union(): void
    {
        $user = $this->fixtureUser('scope-diff', ['employee.view', 'employee.update']);
        $user->update(['role' => 'admin']);
        $user->employee->update(['phone' => '000-SYNTHETIC', 'date_of_birth' => '1990-01-01', 'nationality_code' => 'VN']);
        $first = $this->matter();
        $second = $this->matter();
        $token = $this->postJson('/api/login', ['email' => $user->email, 'password' => self::SYNTHETIC_PASSWORD])
            ->assertOk()->json('token');
        $probe = function () use ($user, $token, $first, $second): array {
            $this->app['auth']->forgetGuards();
            $organization = $this->withToken($token)->getJson('/api/organization')->assertOk();
            $employee = collect($organization->json('employees'))->firstWhere('id', $user->employee_id);
            $resources = [];
            foreach ([$first, $second] as $case) {
                $this->app['auth']->forgetGuards();
                $response = $this->withToken($token)->getJson('/api/case-files/'.$case->id);
                $this->assertContains($response->status(), [200, 403]);
                $resources['case:'.$case->id.':view'] = $response->status() === 200;
            }
            return ['identity_ref' => 'synthetic:'.$user->id,
                'revision' => (string) DB::table('security_administration_state')->where('id', 1)->value('revision'),
                'actions' => ['employee.create' => $user->hasPermission('employee.create')],
                'fields' => ['phone' => $employee['phone'] !== null, 'date_of_birth' => $employee['date_of_birth'] !== null,
                    'nationality_code' => $employee['nationality_code'] !== null], 'resources' => $resources];
        };
        $before = $probe();
        $database = $this->authoritySnapshot();
        $this->canonical($user);
        $after = $probe();
        $diff = \Tests\Support\B25\ScopeEntitlementDiff::compare($before, $after);
        // A03/A04 default runtime now denies both implicit actions and the old HR bridge.
        $this->assertSame(['employee.create' => false], $before['actions']);
        $this->assertSame($before['actions'], $after['actions']);
        $this->assertSame([], $diff['changes']['actions']);
        $this->assertSame(['phone' => false, 'date_of_birth' => false, 'nationality_code' => false], $before['fields']);
        $this->assertSame($before['fields'], $after['fields']);
        $this->assertSame([], $diff['changes']['fields']);
        $this->assertSame(['case:'.$first->id.':view' => false, 'case:'.$second->id.':view' => false], $before['resources']);
        $this->assertSame($before['resources'], $after['resources']);
        $this->assertSame([], $diff['changes']['resources']);
        $this->assertFalse($diff['apply_available']);
        $this->assertFalse($diff['case_acl_certified']);
        $this->assertFalse($diff['hr_mapping_approved']);
        $this->assertSame('BLOCKED_OWNER_APPROVAL', $diff['status']);
        // Read requests update PAT presence; compare authority/lifecycle, not last_used_at.
        $afterDatabase = $this->authoritySnapshot();
        unset($database['personal_access_tokens'], $afterDatabase['personal_access_tokens']);
        $this->assertEquals($database, $afterDatabase);
    }

    public function test_synthetic_scope_manifest_rejects_stale_wrong_identity_and_raw_pii_without_an_apply_path(): void
    {
        $snapshot = ['identity_ref' => 'synthetic:1', 'revision' => 'synthetic-revision-1',
            'actions' => ['employee.view' => true], 'fields' => ['phone' => false],
            'resources' => ['case:1:view' => 'UNKNOWN_SCOPE']];
        $result = \Tests\Support\B25\ScopeEntitlementDiff::compare($snapshot, $snapshot);
        $this->assertFalse($result['apply_available']);
        $this->assertSame('BLOCKED_OWNER_APPROVAL', $result['status']);
        foreach ([['identity_ref' => 'synthetic:2'], ['revision' => 'stale-revision'], ['password' => 'not-accepted'],
            ['fields' => ['phone' => '000-SYNTHETIC']], ['actions' => ['unknown.operation' => true]],
            ['resources' => []]] as $invalid) {
            try {
                \Tests\Support\B25\ScopeEntitlementDiff::compare($snapshot, array_replace($snapshot, $invalid));
                $this->fail('Wrong/stale/unsafe/incomplete snapshots must not produce an approved manifest.');
            } catch (\InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function test_canonical_explicit_private_reader_and_existing_employee_keep_only_fixture_mapped_business_access(): void
    {
        $reader = $this->fixtureUser('canonical-private-reader', ['employee.view', 'employee.view_private']);
        $owner = $this->fixtureEmployee('canonical-private-synthetic-approver');
        $reader->employee->update(['phone' => '000-SYNTHETIC']);
        // B2.6: an explicit pivot is necessary but no longer sufficient in rehearsal.
        // Independent fixture evidence covers the complete existing organization projection.
        $hr = new \App\Services\Administration\RehearsalHrApprovals;
        $hr->approve($reader, $owner, 'synthetic-evidence:b25-hr',
            \App\Services\Administration\RehearsalHrApprovals::SCOPE, now()->addHour()->timestamp);
        $this->app->instance(CanonicalRbacResolver::class,
            new CanonicalRbacResolver([$reader->id => VerifiedMfaSessions::identityHash($reader->fresh())], $hr));
        $token = $this->postJson('/api/login', ['email' => $reader->email, 'password' => self::SYNTHETIC_PASSWORD])->assertOk()->json('token');
        $this->app['auth']->forgetGuards();
        $response = $this->withToken($token)->getJson('/api/organization')->assertOk();
        $this->assertSame('000-SYNTHETIC', collect($response->json('employees'))->firstWhere('id', $reader->employee_id)['phone']);
        $reader->roles()->sole()->permissions()->detach(Permission::where('name', 'employee.view_private')->value('id'));
        $this->app['auth']->forgetGuards();
        $response = $this->withToken($token)->getJson('/api/organization')->assertOk();
        $this->assertNull(collect($response->json('employees'))->firstWhere('id', $reader->employee_id)['phone']);
        $this->assertArrayNotHasKey('phone', $reader->employee->toArray());
        $this->assertFalse($reader->hasPermission('employee.update'));
    }

    public function test_an_unmapped_mfa_verified_admin_does_not_count_as_a_usable_replacement(): void
    {
        $mapped = $this->fixtureUser('mapped-last-admin', AdminCapabilities::ESSENTIAL, 'admin');
        $unmapped = $this->fixtureUser('unmapped-second-admin', AdminCapabilities::ESSENTIAL, 'admin');
        $this->authenticatedFixtureToken($mapped);
        $this->authenticatedFixtureToken($unmapped);
        $this->canonical($mapped);
        $authentication = app(\App\Contracts\AdministrativeAuthentication::class);
        $this->assertTrue($authentication->replacementIsReady($mapped));
        $this->assertFalse($authentication->replacementIsReady($unmapped));
        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $mapped->update(['is_active' => false]);
    }
}
