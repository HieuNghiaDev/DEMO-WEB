<?php

namespace Tests\Feature\B26;

use App\Models\Permission;
use App\Models\User;
use App\Policies\EmployeePolicy;
use App\Services\Administration\AdminCapabilities;
use App\Services\Administration\CanonicalRbacResolver;
use App\Services\Administration\RehearsalHrApprovals;
use App\Services\Administration\VerifiedMfaSessions;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\B21\B21TestCase;
use Tests\Support\B26\EntitlementManifest;

class EntitlementReconciliationTest extends B21TestCase
{
    private function manifest(User $user, array $permissions, array $extra = []): array
    {
        $source = EntitlementManifest::capture($user, 'synthetic-source-v1');
        $reasons = [];
        foreach (array_unique(array_merge(array_diff($source['effective_permissions'], $permissions),
            array_diff($permissions, $source['effective_permissions']))) as $name) {
            $reasons[$name] = 'synthetic-owner-reconciliation';
        }
        $roles = $extra['roles'] ?? ['employee'];
        $sourceRoles = array_column($source['pivot_roles'], 'name');
        foreach (array_unique(array_merge(array_diff($sourceRoles, $roles), array_diff($roles, $sourceRoles))) as $role) {
            $reasons['role:'.$role] = 'synthetic-owner-role-reconciliation';
        }
        return EntitlementManifest::generate($source, array_replace([
            'roles' => ['employee'], 'permissions' => $permissions, 'reasons' => $reasons,
            'hr_scope' => null, 'case_scope' => 'none', 'case_resources' => [],
        ], $extra));
    }

    private function approval(array $manifest, User $approver, array $extra = []): array
    {
        return array_replace(['manifest_hash' => $manifest['manifest_hash'],
            'approver_ref' => 'synthetic:'.$approver->id, 'evidence_ref' => 'synthetic-evidence:owner-1',
            'expires_at' => now()->addHour()->timestamp, 'conflict_approved' => false,
            'protected_permissions' => [], 'protected_roles' => [], 'independent_approver_ref' => null,
            'independent_evidence_ref' => null, 'hr_scope' => null], $extra);
    }

    private function bind(User $user, ?RehearsalHrApprovals $hr = null): CanonicalRbacResolver
    {
        $resolver = new CanonicalRbacResolver([$user->id => VerifiedMfaSessions::identityHash($user->fresh())], $hr);
        $this->app->instance(CanonicalRbacResolver::class, $resolver);
        return $resolver;
    }

    private function pii(string $token, User $subject): array
    {
        $this->app['auth']->forgetGuards();
        return collect($this->withToken($token)->getJson('/api/organization')->assertOk()->json('employees'))
            ->firstWhere('id', $subject->employee_id);
    }

    public function test_manifest_is_redacted_non_applying_and_requires_separate_approval(): void
    {
        $this->assertTrue(class_exists(EntitlementManifest::class), 'RED: manifest generator is not implemented.');
        $user = $this->fixtureEmployee('manifest');
        $user->employee->update(['phone' => '000-SECRET-SYNTHETIC']);
        $manifest = $this->manifest($user, ['employee.view']);
        $json = json_encode($manifest, JSON_THROW_ON_ERROR);
        foreach ([$user->email, $user->password, '000-SECRET-SYNTHETIC', 'secret_ciphertext', 'token_hash'] as $secret) {
            $this->assertStringNotContainsString($secret, $json);
        }
        $this->assertFalse($manifest['owner_approved']);
        $this->assertFalse($manifest['apply_available']);
        $this->assertSame('PENDING_SYNTHETIC_APPROVAL', $manifest['status']);
        $this->assertNotEmpty($manifest['permission_changes']);
        foreach ($manifest['permission_changes'] as $change) {
            $this->assertSame('synthetic-owner-reconciliation', $change['reason']);
        }
        $this->assertFalse(method_exists(EntitlementManifest::class, 'apply'));
    }

    public function test_unapproved_private_permission_is_not_an_hr_approval(): void
    {
        $reader = $this->fixtureUser('unapproved-hr', ['employee.view', 'employee.view_private']);
        $reader->employee->update(['phone' => '000-SYNTHETIC']);
        $this->bind($reader);
        $token = $this->authenticatedFixtureToken($reader);
        $this->assertNull($this->pii($token, $reader)['phone']);
        $this->assertFalse(app(EmployeePolicy::class)->viewPrivate($reader, $reader->employee));
    }

    public function test_approved_hr_reader_and_same_bearer_grant_revoke_require_fresh_explicit_mapping(): void
    {
        $this->assertTrue(class_exists(RehearsalHrApprovals::class), 'RED: explicit scoped HR mapping is not implemented.');
        $reader = $this->fixtureUser('approved-hr', ['employee.view', 'employee.update']);
        $owner = $this->fixtureEmployee('independent-hr-owner');
        $reader->employee->update(['phone' => '000-SYNTHETIC']);
        $hr = new RehearsalHrApprovals;
        $this->bind($reader, $hr);
        $token = $this->authenticatedFixtureToken($reader);
        $this->assertNull($this->pii($token, $reader)['phone']);
        $role = $reader->roles()->sole();
        $private = Permission::firstOrCreate(['name' => 'employee.view_private'], ['display_name' => 'Synthetic private']);
        $role->permissions()->attach($private);
        $this->assertNull($this->pii($token, $reader)['phone']);
        $hr->approve($reader, $owner, 'synthetic-evidence:hr-1', RehearsalHrApprovals::SCOPE, now()->addHour()->timestamp);
        $this->assertSame('000-SYNTHETIC', $this->pii($token, $reader)['phone']);
        $this->assertTrue(app(EmployeePolicy::class)->viewPrivate($reader, $reader->employee));
        $hr->revoke($reader);
        $this->assertNull($this->pii($token, $reader)['phone']);
        $hr->approve($reader, $owner, 'synthetic-evidence:hr-2', RehearsalHrApprovals::SCOPE, now()->addHour()->timestamp);
        $role->permissions()->detach($private);
        $this->assertNull($this->pii($token, $reader)['phone']);
        $role->permissions()->attach($private);
        $this->assertNull($this->pii($token, $reader)['phone'], 'Regrant cannot revive a revoked approval.');
    }

    public function test_review_checks_stale_conflict_independence_and_supported_hr_scope(): void
    {
        $user = $this->fixtureConflict('manifest-conflict');
        $owner = $this->fixtureEmployee('manifest-owner');
        $independent = $this->fixtureEmployee('manifest-independent');
        Permission::firstOrCreate(['name' => 'employee.view_private'], ['display_name' => 'Synthetic proposed private']);
        $manifest = $this->manifest($user, ['employee.view', 'employee.view_private'], ['hr_scope' => RehearsalHrApprovals::SCOPE]);
        $approval = $this->approval($manifest, $owner);
        $review = EntitlementManifest::review($manifest, $manifest['source'], $approval);
        $this->assertContains('BLOCKED_CONFLICT', $review['blockers']);
        $this->assertContains('BLOCKED_INDEPENDENT_PROTECTED_APPROVAL', $review['blockers']);
        $this->assertContains('BLOCKED_HR_APPROVAL', $review['blockers']);
        $approval = array_replace($approval, ['conflict_approved' => true,
            'protected_permissions' => ['employee.view_private'], 'independent_approver_ref' => 'synthetic:'.$independent->id,
            'independent_evidence_ref' => 'synthetic-evidence:private-1', 'hr_scope' => RehearsalHrApprovals::SCOPE]);
        $review = EntitlementManifest::review($manifest, EntitlementManifest::capture($user, 'synthetic-source-v1'), $approval);
        $this->assertSame('READY_SYNTHETIC_REHEARSAL_ONLY', $review['status']);
        $this->assertFalse($review['owner_approved']);
        $selfApproval = array_replace($approval, ['independent_approver_ref' => $approval['approver_ref']]);
        $this->assertContains('BLOCKED_INDEPENDENT_PROTECTED_APPROVAL', EntitlementManifest::review($manifest, $manifest['source'], $selfApproval)['blockers']);
        $user->roles()->sole()->permissions()->detach(Permission::where('name', 'employee.view')->value('id'));
        $this->assertContains('BLOCKED_STALE', EntitlementManifest::review($manifest,
            EntitlementManifest::capture($user, 'synthetic-source-v1'), $approval)['blockers']);
        $this->assertContains('BLOCKED_STALE', EntitlementManifest::review($manifest,
            EntitlementManifest::capture($user, 'synthetic-source-v2'), $approval)['blockers']);
    }

    public static function blockedRequirements(): array
    {
        return [
            'missing mapping' => [null, 'BLOCKED_UNMAPPED'],
            'narrow HR fields' => [['permissions' => ['employee.view', 'employee.view_private'],
                'hr_scope' => ['scope' => 'organization', 'fields' => ['phone']]], 'BLOCKED_HR_FIELD_SCOPE'],
            'narrow HR office' => [['permissions' => ['employee.view', 'employee.view_private'],
                'hr_scope' => ['scope' => 'office', 'fields' => ['phone']]], 'BLOCKED_HR_FIELD_SCOPE'],
            'case subset' => [['permissions' => ['employee.view', 'case.view'], 'case_scope' => 'restricted',
                'case_resources' => ['case:999:view']], 'BLOCKED_NO_CASE_ACL'],
            'broad case grant' => [['permissions' => ['case.view']], 'BLOCKED_NO_CASE_ACL'],
            'unknown grant' => [['permissions' => ['unknown.permission']], 'BLOCKED_UNKNOWN_PERMISSION'],
            'admin not ready' => [['permissions' => AdminCapabilities::ESSENTIAL, 'roles' => ['admin']], 'BLOCKED_ADMIN_MFA_NOT_READY'],
        ];
    }

    #[DataProvider('blockedRequirements')]
    public function test_incomplete_scope_or_mapping_is_blocked(?array $proposal, string $blocker): void
    {
        $user = $this->fixtureEmployee('blocked-proposal');
        $manifest = $proposal === null ? EntitlementManifest::generate(EntitlementManifest::capture($user, 'synthetic-source-v1'), null)
            : $this->manifest($user, $proposal['permissions'], array_diff_key($proposal, ['permissions' => true]));
        $this->assertContains($blocker, $manifest['blockers']);
        $owner = $this->fixtureEmployee('blocked-owner');
        $this->assertSame('BLOCKED', EntitlementManifest::review($manifest, $manifest['source'], $this->approval($manifest, $owner))['status']);
        $this->assertFalse($manifest['apply_available']);
    }

    public function test_no_reason_no_manifest_and_edited_manifest_cannot_clear_blockers(): void
    {
        $user = $this->fixtureEmployee('bad-manifest');
        $manifest = $this->manifest($user, ['employee.view']);
        $proposal = $manifest['proposal'];
        $proposal['reasons'] = [];
        try {
            EntitlementManifest::generate($manifest['source'], $proposal);
            $this->fail('Missing reasons must fail closed.');
        } catch (\InvalidArgumentException) {
            $this->addToAssertionCount(1);
        }
        $manifest['proposal']['permissions'][] = 'employee.create';
        $manifest['proposal']['reasons']['employee.create'] = 'synthetic-tampered';
        $owner = $this->fixtureEmployee('tamper-owner');
        $this->assertContains('BLOCKED_STALE', EntitlementManifest::review($manifest, $manifest['source'], $this->approval($manifest, $owner))['blockers']);
    }

    public function test_review_rejects_missing_self_expired_and_wrong_digest_approval(): void
    {
        $user = $this->fixtureEmployee('approval-rejection');
        $owner = $this->fixtureEmployee('approval-rejection-owner');
        $manifest = $this->manifest($user, ['employee.view']);
        $approval = $this->approval($manifest, $owner);
        foreach ([null, array_replace($approval, ['approver_ref' => 'synthetic:'.$user->id]),
            array_replace($approval, ['expires_at' => now()->timestamp]),
            array_replace($approval, ['manifest_hash' => str_repeat('0', 64)])] as $invalid) {
            $this->assertContains('BLOCKED_APPROVAL', EntitlementManifest::review($manifest, $manifest['source'], $invalid)['blockers']);
        }
        $this->assertSame('READY_SYNTHETIC_REHEARSAL_ONLY', EntitlementManifest::review($manifest, $manifest['source'], $approval)['status']);
    }

    public function test_each_role_transition_needs_a_reason_as_well_as_permission_deltas(): void
    {
        $user = $this->fixtureEmployee('role-reasons');
        $manifest = $this->manifest($user, ['employee.view'], ['roles' => ['synthetic_new_employee']]);
        $this->assertSame('add', $manifest['role_changes']['synthetic_new_employee']['change']);
        $this->assertSame('remove', $manifest['role_changes']['employee']['change']);
        $proposal = $manifest['proposal'];
        unset($proposal['reasons']['role:employee']);
        $this->expectException(\InvalidArgumentException::class);
        EntitlementManifest::generate($manifest['source'], $proposal);
    }

    public function test_inactive_or_pending_identity_cannot_be_reconciled_as_ready(): void
    {
        $user = $this->fixtureEmployee('pending-mapping');
        $user->forceFill(['activation_required' => true, 'activated_at' => null])->save();
        $this->assertContains('BLOCKED_ACCOUNT_NOT_READY', $this->manifest($user, ['employee.view'])['blockers']);
        $user->forceFill(['activation_required' => false, 'is_active' => false])->save();
        $this->assertContains('BLOCKED_ACCOUNT_NOT_READY', $this->manifest($user, ['employee.view'])['blockers']);
    }

    public function test_manifest_generation_and_review_leave_authority_and_lifecycle_unchanged(): void
    {
        $user = $this->fixtureEmployee('read-only-manifest');
        $owner = $this->fixtureEmployee('read-only-owner');
        $tables = ['users', 'employees', 'roles', 'permissions', 'user_roles', 'role_permissions',
            'security_administration_state', 'account_mfa', 'account_action_tokens', 'personal_access_tokens'];
        $snapshot = fn () => array_combine($tables, array_map(fn ($t) => DB::table($t)->get()->toJson(), $tables));
        $before = $snapshot();
        $manifest = $this->manifest($user, ['employee.view']);
        $this->assertSame('READY_SYNTHETIC_REHEARSAL_ONLY', EntitlementManifest::review($manifest,
            EntitlementManifest::capture($user, 'synthetic-source-v1'), $this->approval($manifest, $owner))['status']);
        $this->assertSame($before, $snapshot());
    }

    public static function legacyLevels(): array
    {
        return array_map(fn ($level) => [$level], ['level_1', 'level_2', 'level_3', 'level_4', 'level_5']);
    }

    #[DataProvider('legacyLevels')]
    public function test_legacy_levels_rehearse_explicit_operational_mapping_not_job_titles(string $level): void
    {
        $user = $this->fixtureLegacy('mapping-'.$level, $level, $level === 'level_5' ? 'admin' : 'employee');
        $owner = $this->fixtureEmployee('mapping-owner');
        $permissions = array_merge(['employee.view', 'task.view_own'], match ($level) {
            'level_2' => ['task.update'], 'level_3' => ['task.create'], 'level_4' => ['task.assign'], default => [],
        });
        $manifest = $this->manifest($user, $permissions);
        $approval = $this->approval($manifest, $owner, ['conflict_approved' => true]);
        $this->assertSame('READY_SYNTHETIC_REHEARSAL_ONLY', EntitlementManifest::review($manifest, $manifest['source'], $approval)['status']);
        // Explicit RAM fixture transition only, not a production manifest apply function.
        $role = \App\Models\Role::create(['name' => 'synthetic_employee', 'display_name' => 'Synthetic employee']);
        $role->permissions()->sync(Permission::whereIn('name', $manifest['proposal']['permissions'])->pluck('id')->all());
        $user->roles()->sync([$role->id]);
        $this->bind($user);
        $token = $this->authenticatedFixtureToken($user);
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/me')->assertOk()->assertJsonPath('user.role_names', ['synthetic_employee']);
        $this->assertTrue(app(EmployeePolicy::class)->viewAny($user));
        $this->assertFalse(app(EmployeePolicy::class)->create($user));
        $this->assertFalse($user->hasRole('admin'));
        $this->assertFalse($user->hasRole('verified_lawyer'));
        $this->assertFalse($user->hasPermission('employee.create'));
        $this->assertFalse($user->hasPermission('unknown.permission'));
    }

    public function test_empty_roles_and_custom_lawful_grants_are_not_rewritten_or_defaulted(): void
    {
        $user = $this->fixtureUser('custom-lawful', ['employee.view', 'employee.update'], 'synthetic_custom');
        $source = EntitlementManifest::capture($user, 'synthetic-source-v1');
        $manifest = $this->manifest($user, $source['effective_permissions'], ['roles' => ['synthetic_custom']]);
        $this->assertSame([], $manifest['permission_changes']);
        $this->bind($user);
        $this->assertTrue(app(EmployeePolicy::class)->updateWorkData($user, $user->employee));
        $this->assertFalse(app(EmployeePolicy::class)->viewPrivate($user, $user->employee));
        $user->roles()->detach();
        $this->assertSame([], $user->role_names);
        $this->assertSame([], $user->permission_names);
        $this->assertFalse($user->hasRole('level_2'));
        $this->assertFalse(app(EmployeePolicy::class)->viewAny($user));
    }

    public function test_default_explicit_runtime_and_rehearsal_both_deny_ungranted_actions_fields_and_resources(): void
    {
        $user = $this->fixtureUser('delta-real', ['employee.view'], 'synthetic_delta');
        $user->update(['role' => 'admin']);
        $user->employee->update(['phone' => '000-SYNTHETIC']);
        $case = $this->matter();
        $owner = $this->fixtureEmployee('delta-owner');
        $manifest = $this->manifest($user, ['employee.view'], ['roles' => ['synthetic_delta']]);
        $approval = $this->approval($manifest, $owner, ['conflict_approved' => true]);
        $token = $this->authenticatedFixtureToken($user);
        $probe = function () use ($user, $case, $token): array {
            $employee = $this->pii($token, $user);
            $this->app['auth']->forgetGuards();
            $response = $this->withToken($token)->getJson('/api/case-files/'.$case->id);
            $this->assertContains($response->status(), [200, 403]);
            return ['identity_ref' => 'synthetic:'.$user->id, 'revision' => 'synthetic-delta-v1',
                'actions' => ['employee.create' => app(EmployeePolicy::class)->create($user)],
                'fields' => ['phone' => $employee['phone'] !== null],
                'resources' => ['case:'.$case->id.':view' => $response->status() === 200]];
        };
        $before = $probe();
        $this->app->instance(CanonicalRbacResolver::class, EntitlementManifest::resolverFor($user, $manifest, $approval));
        $after = $probe();
        $diff = \Tests\Support\B25\ScopeEntitlementDiff::compare($before, $after);
        // No explicit employee.update/PII/case/create grant was arranged in this fixture.
        $this->assertSame(['employee.create' => false], $before['actions']);
        $this->assertSame(['phone' => false], $before['fields']);
        $this->assertSame(['case:'.$case->id.':view' => false], $before['resources']);
        foreach (['actions', 'fields', 'resources'] as $axis) {
            $this->assertSame($before[$axis], $after[$axis]);
            $this->assertSame([], $diff['changes'][$axis]);
        }
        $this->assertFalse($diff['case_acl_certified']);
    }

    public function test_rehearsal_binding_rejects_unapproved_conflict_and_stale_manifest_before_authority_changes(): void
    {
        $user = $this->fixtureUser('binding-conflict', ['employee.view'], 'synthetic_binding');
        $user->update(['role' => 'admin']);
        $owner = $this->fixtureEmployee('binding-owner');
        $manifest = $this->manifest($user, ['employee.view'], ['roles' => ['synthetic_binding']]);
        $approval = $this->approval($manifest, $owner);
        try {
            EntitlementManifest::resolverFor($user, $manifest, $approval);
            $this->fail('Unapproved legacy conflict cannot bind rehearsal.');
        } catch (\LogicException) {
            $this->assertFalse($this->app->bound(CanonicalRbacResolver::class));
        }
        $approval['conflict_approved'] = true;
        $resolver = EntitlementManifest::resolverFor($user, $manifest, $approval);
        $this->assertTrue($resolver->hasPermission($user, 'employee.view'));
        $this->assertFalse($resolver->hasPermission($user, 'employee.create'));
        $user->roles()->detach();
        $this->expectException(\LogicException::class);
        EntitlementManifest::resolverFor($user, $manifest, $approval);
    }

    public function test_canonical_admin_uses_real_password_totp_login_and_has_no_implicit_pii_or_case_access(): void
    {
        $admin = $this->fixtureUser('real-mfa-admin', AdminCapabilities::ESSENTIAL, 'admin');
        $admin->employee->update(['phone' => '000-SYNTHETIC']);
        $case = $this->matter();
        $this->bind($admin);
        $token = $this->authenticatedFixtureToken($admin);
        $this->assertTrue(app(VerifiedMfaSessions::class)->ready($admin));
        $this->assertTrue(app(EmployeePolicy::class)->create($admin));
        $this->assertNull($this->pii($token, $admin)['phone']);
        $this->withToken($token)->getJson('/api/case-files/'.$case->id)->assertForbidden();
        $this->assertFalse($admin->hasPermission('document.approve_legal'));
        $this->assertFalse($admin->hasPermission('unknown.permission'));
    }

    public function test_hr_evidence_expiry_self_approval_narrow_scope_and_unobserved_regrant_fail_closed(): void
    {
        $reader = $this->fixtureUser('hr-scope', ['employee.view', 'employee.view_private']);
        $owner = $this->fixtureEmployee('hr-scope-owner');
        $hr = new RehearsalHrApprovals;
        foreach ([[$reader, RehearsalHrApprovals::SCOPE, now()->addHour()->timestamp],
            [$owner, ['scope' => 'office', 'fields' => ['phone']], now()->addHour()->timestamp],
            [$owner, RehearsalHrApprovals::SCOPE, now()->subSecond()->timestamp]] as [$approver, $scope, $expiry]) {
            try {
                $hr->approve($reader, $approver, 'synthetic-evidence:scope', $scope, $expiry);
                $this->fail('Self/narrow/expired approvals cannot become mappings.');
            } catch (\LogicException) {
                $this->addToAssertionCount(1);
            }
        }
        $hr->approve($reader, $owner, 'synthetic-evidence:scope', RehearsalHrApprovals::SCOPE, now()->addMinute()->timestamp);
        $this->assertTrue($hr->allows($reader));
        $privateId = Permission::where('name', 'employee.view_private')->value('id');
        $reader->roles()->sole()->permissions()->detach($privateId);
        $reader->roles()->sole()->permissions()->attach($privateId);
        $this->assertFalse($hr->allows($reader), 'Guard revision detects revoke/regrant even between reads.');
        $hr->approve($reader, $owner, 'synthetic-evidence:scope-2', RehearsalHrApprovals::SCOPE, now()->addMinute()->timestamp);
        $this->travel(61)->seconds();
        $this->assertFalse($hr->allows($reader));
    }

    public function test_tools_reject_non_memory_environment_before_any_query(): void
    {
        $user = $this->fixtureEmployee('sandbox');
        config(['database.connections.sqlite.database' => 'not-memory.sqlite']);
        DB::enableQueryLog();
        DB::flushQueryLog();
        try {
            EntitlementManifest::capture($user, 'synthetic-source-v1');
            $this->fail('Non-RAM must fail before a query.');
        } catch (\LogicException) {
            $this->assertSame([], DB::getQueryLog());
        } finally {
            config(['database.connections.sqlite.database' => ':memory:']);
            DB::disableQueryLog();
        }
    }
}
