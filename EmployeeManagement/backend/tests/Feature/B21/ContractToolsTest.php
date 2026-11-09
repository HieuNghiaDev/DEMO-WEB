<?php

namespace Tests\Feature\B21;

use App\Models\Permission;
use App\Models\User;
use InvalidArgumentException;
use Tests\Support\B21\AdminAContract;
use Tests\Support\B21\B21TestCase;
use Tests\Support\B21\EntitlementDiffDryRun;

/** GREEN here certifies fixture/dry-run correctness, not unimplemented application policies. */
class ContractToolsTest extends B21TestCase
{
    public function test_matrix_covers_existing_catalog_and_requires_approval_for_every_proposal(): void
    {
        $matrix = AdminAContract::permissions();
        foreach (Permission::pluck('name') as $name) $this->assertArrayHasKey($name, $matrix);
        $this->assertCount(43, $matrix);
        foreach ($matrix as $name => $row) {
            $this->assertMatchesRegularExpression('/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/D', $name);
            $this->assertSame('PENDING_OWNER_CATALOG_BUNDLE_AND_ACCOUNT_MAPPING_APPROVAL', $row['enablement']);
            $this->assertNotEmpty($row['condition']);
        }
    }

    public function test_use_and_grant_are_distinct_and_pii_is_not_employee_update(): void
    {
        $matrix = AdminAContract::permissions();
        $this->assertSame('scoped', $matrix['employee.manage_roles']['admin_use']);
        $this->assertSame('protected_approval_only', $matrix['employee.manage_roles']['admin_grant']);
        $this->assertSame('scoped', $matrix['employee.update']['admin_use']);
        foreach (['employee.view_private', 'employee.verify_lawyer', 'document.approve_legal', 'developer.view'] as $permission) {
            $this->assertNotContains($permission, AdminAContract::adminFixturePermissions());
            $this->assertContains($permission, AdminAContract::protectedPermissions());
        }
        $this->assertSame('lawyer_delegation_only', $matrix['document.review_internal']['admin_grant']);
        $this->assertContains('phone', AdminAContract::piiFields());
        $this->assertArrayHasKey('viewPrivate', AdminAContract::policyAbilities()['EmployeePolicy']);
    }

    public function test_admin_employee_and_legacy_conflict_fixtures_remain_separate(): void
    {
        $admin = $this->fixtureAdmin();
        $employee = $this->fixtureEmployee();
        $conflict = $this->fixtureConflict();
        $this->assertSame(['admin'], $admin->roles()->pluck('name')->all());
        $this->assertSame('employee', $admin->role);
        $this->assertSame(['employee'], $employee->roles()->pluck('name')->all());
        $this->assertSame(['level_1'], $conflict->roles()->pluck('name')->all());
        $this->assertSame('admin', $conflict->role);
        foreach ([1, 2, 3, 4, 5] as $level) {
            $legacy = $this->fixtureLegacy('L'.$level, 'level_'.$level);
            $this->assertSame(['level_'.$level], $legacy->roles()->pluck('name')->all());
        }
    }

    public function test_dry_run_reports_real_fixture_entitlement_delta_without_any_write(): void
    {
        $user = $this->fixtureEmployee();
        $before = $this->snapshot($user);
        $persisted = $user->fresh()->getAttributes();
        $counts = $this->tableCounts();
        $next = array_values(array_diff($before['effective_permissions'], ['attendance.export_own']));
        $next[] = 'employee.view_private';
        $result = EntitlementDiffDryRun::compare($before, ['user_id' => $user->id, 'permissions' => $next, 'expected_scope_revision' => 'synthetic-scope-v1']);
        $this->assertSame(['employee.view_private'], $result['added']);
        $this->assertSame(['attendance.export_own'], $result['removed']);
        $this->assertSame(['employee.view_private'], $result['protected_added']);
        $this->assertContains('PROTECTED_GRANT_REQUIRES_INDEPENDENT_APPROVAL', $result['warnings']);
        $this->assertFalse($result['apply_available']);
        $this->assertTrue($result['requires_owner_review']);
        $this->assertSame($before, $this->snapshot($user));
        $this->assertSame($persisted, $user->fresh()->getAttributes());
        $this->assertSame($counts, $this->tableCounts());
    }

    public function test_conflict_is_flagged_in_a_synthetic_manifest_not_automatically_mapped(): void
    {
        $user = $this->fixtureConflict();
        $snapshot = $this->snapshot($user);
        $result = EntitlementDiffDryRun::compare($snapshot, ['user_id' => $user->id, 'permissions' => ['employee.view'], 'expected_scope_revision' => $snapshot['scope_revision']]);
        $this->assertContains('LEGACY_PIVOT_AUTHORITY_CONFLICT', $result['warnings']);
        // A03 has already denied this ungranted action; it is not a pending removal anymore.
        $this->assertFalse($user->hasPermission('employee.disable'));
        $this->assertNotContains('employee.disable', $snapshot['effective_permissions']);
        $this->assertNotContains('employee.disable', $result['removed']);
        $this->assertContains('attendance.view_own', $result['removed']);
        $this->assertTrue($result['requires_owner_review']);
        $this->assertFalse($result['apply_available']);
        $this->assertSame(['level_1'], $user->roles()->pluck('name')->all());
    }

    public function test_dry_run_rejects_unknown_permission(): void
    {
        $this->invalidProposal(['permissions' => ['typo.permission']]);
    }

    public function test_dry_run_rejects_wrong_account(): void
    {
        $this->invalidProposal(['user_id' => 999999]);
    }

    public function test_dry_run_rejects_stale_scope_revision(): void
    {
        $this->invalidProposal(['expected_scope_revision' => 'stale']);
    }

    public function test_dry_run_rejects_credentials_in_input(): void
    {
        $user = $this->fixtureEmployee();
        $snapshot = $this->snapshot($user);
        $snapshot['password'] = 'SYNTHETIC-SECRET';
        $this->expectException(InvalidArgumentException::class);
        EntitlementDiffDryRun::compare($snapshot, ['user_id' => $user->id, 'permissions' => [], 'expected_scope_revision' => 'synthetic-scope-v1']);
    }

    public function test_dry_run_requires_an_explicit_nonempty_revision(): void
    {
        $user = $this->fixtureEmployee();
        $snapshot = array_replace($this->snapshot($user), ['scope_revision' => '']);
        $this->expectException(InvalidArgumentException::class);
        EntitlementDiffDryRun::compare($snapshot, ['user_id' => $user->id, 'permissions' => [], 'expected_scope_revision' => '']);
    }

    public function test_unchanged_manifest_still_requires_owner_review_and_cannot_apply(): void
    {
        $user = $this->fixtureEmployee();
        $snapshot = $this->snapshot($user);
        $result = EntitlementDiffDryRun::compare($snapshot, ['user_id' => $user->id,
            'permissions' => $snapshot['effective_permissions'], 'expected_scope_revision' => $snapshot['scope_revision']]);
        $this->assertSame([], $result['added']);
        $this->assertSame([], $result['removed']);
        $this->assertSame($snapshot['effective_permissions'], $result['unchanged']);
        $this->assertTrue($result['requires_owner_review']);
        $this->assertFalse($result['apply_available']);
    }

    private function invalidProposal(array $overrides): void
    {
        $user = $this->fixtureEmployee();
        $this->expectException(InvalidArgumentException::class);
        EntitlementDiffDryRun::compare($this->snapshot($user), array_replace(['user_id' => $user->id,
            'permissions' => [], 'expected_scope_revision' => 'synthetic-scope-v1'], $overrides));
    }

    private function tableCounts(): array
    {
        return array_map(fn (string $table): int => User::query()->getConnection()->table($table)->count(),
            ['users', 'employees', 'roles', 'permissions', 'user_roles', 'role_permissions', 'security_audit_logs']);
    }
}
