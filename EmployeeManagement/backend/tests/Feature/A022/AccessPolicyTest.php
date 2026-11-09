<?php

namespace Tests\Feature\A022;

use App\Models\CaseAccessDelegation;
use App\Models\CaseFile;
use App\Models\CaseMembership;
use App\Models\User;
use App\Services\CaseAccessService;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\Schema;
use Tests\Support\B21\B21TestCase;

class AccessPolicyTest extends B21TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        // Fixture-only shape for the newly approved permanent membership contract.
        Schema::table('case_memberships', fn ($table) => $table->timestamp('expires_at')->nullable()->change());
    }

    private function secret(): CaseFile
    {
        $case = $this->matter();
        $case->forceFill(['is_confidential' => true, 'title' => 'SYNTHETIC-SECRET-CONTENT'])->save();
        return $case;
    }

    private function member(User $user, CaseFile $case, bool $write = false, mixed $expiry = null): CaseMembership
    {
        return CaseMembership::forceCreate(['case_file_id' => $case->id, 'user_id' => $user->id,
            'employee_id' => $user->employee_id, 'can_read' => true, 'can_read_confidential' => true,
            'can_write' => $write, 'expires_at' => $expiry, 'revision' => 1]);
    }

    public function test_permanent_read_allows_read_but_not_write_and_revoke_applies_next_request(): void
    {
        $user = $this->fixtureUser('permanent', ['case.view', 'case.update']);
        $case = $this->secret();
        $member = $this->member($user, $case);
        $this->actingAs($user)->getJson('/api/case-files/'.$case->id.'/workspace')->assertOk();
        $this->patchJson('/api/case-files/'.$case->id.'/incident', ['incident_summary' => 'Synthetic'])->assertForbidden();
        $this->assertNull($case->fresh()->incident_summary);
        $member->forceFill(['revoked_at' => now()])->save();
        $this->getJson('/api/case-files/'.$case->id.'/workspace')->assertNotFound();
    }

    public function test_permanent_read_write_still_requires_functional_permission(): void
    {
        $user = $this->fixtureUser('rw', ['case.view']);
        $case = $this->secret();
        $this->member($user, $case, true);
        $this->actingAs($user)->getJson('/api/case-files/'.$case->id)->assertOk();
        $this->patchJson('/api/case-files/'.$case->id.'/incident', ['incident_summary' => 'Synthetic'])->assertForbidden();
        $role = $user->roles()->sole();
        $role->permissions()->attach(\App\Models\Permission::firstOrCreate(['name' => 'case.update'])->id);
        $this->patchJson('/api/case-files/'.$case->id.'/incident', ['incident_summary' => 'Synthetic'])->assertOk();
        foreach (['task.review', 'approval.approve', 'document.view', 'document.approve_legal'] as $permission) {
            $this->assertFalse($user->fresh()->hasPermission($permission));
        }
    }

    public function test_expired_temporary_membership_denies_and_future_expiry_allows(): void
    {
        $user = $this->fixtureUser('temporary', ['case.view']);
        $case = $this->secret();
        $member = $this->member($user, $case, false, now()->subSecond());
        $this->actingAs($user)->getJson('/api/case-files/'.$case->id)->assertNotFound();
        $member->forceFill(['expires_at' => now()->addMinute()])->save();
        $this->getJson('/api/case-files/'.$case->id)->assertOk();
    }

    public function test_manage_access_catalog_registration_has_no_legacy_or_admin_auto_grant(): void
    {
        $legacy = $this->actor('a022-legacy', 'level_5');
        $manager = $this->actor('a022-manager', 'level_4');
        // adminFixturePermissions includes a synthetic scoped explicit grant; exclude it here
        // because this regression exercises registration without any explicit access grant.
        $admin = $this->fixtureUser('a022-admin', \App\Services\Administration\AdminCapabilities::ESSENTIAL, 'admin');
        $before = \Illuminate\Support\Facades\DB::table('role_permissions')->count();
        $this->seed(\Database\Seeders\RolePermissionSeeder::class);
        $this->assertDatabaseHas('permissions', ['name' => 'case.manage_access']);
        $this->assertSame($before, \Illuminate\Support\Facades\DB::table('role_permissions')->count());
        foreach ([$legacy, $manager, $admin] as $user) {
            $this->assertFalse($user->fresh()->hasPermission('case.manage_access'));
            $this->assertNotContains('case.manage_access', $user->fresh()->permission_names);
        }
        $this->assertFalse(app(\App\Policies\RolePolicy::class)->withinGrantableCeiling(['case.manage_access']));
    }

    public function test_manage_access_only_is_not_content_access_even_with_assignment(): void
    {
        $user = $this->fixtureUser('metadata-only', ['case.manage_access']);
        $case = $this->secret();
        $case->update(['assigned_employee_id' => $user->employee_id]);
        $this->actingAs($user)->getJson('/api/case-files/'.$case->id)->assertForbidden();
        foreach (['case.view', 'case.update', 'document.view', 'employee.view_private', 'document.approve_legal'] as $permission) {
            $this->assertFalse($user->hasPermission($permission));
        }
    }

    private function delegatedManager(CaseFile $case): User
    {
        $manager = $this->fixtureUser('delegated', ['case.manage_access']);
        CaseAccessDelegation::forceCreate(['case_file_id' => $case->id, 'user_id' => $manager->id,
            'employee_id' => $manager->employee_id, 'grantable_scopes' => ['read', 'write', 'confidential'],
            'approval_ref' => 'synthetic-owner-a022', 'expires_at' => now()->addHour()]);
        $this->app->instance(CaseAccessService::class, new CaseAccessService);
        return $manager;
    }

    public function test_self_grant_denied_without_new_membership_or_audit(): void
    {
        $case = $this->secret();
        $manager = $this->delegatedManager($case);
        try {
            app(CaseAccessService::class)->grant($manager, $case->id, $manager, ['read', 'confidential'], now()->addMinute());
            $this->fail('Self grant must never succeed.');
        } catch (AuthorizationException) {
            $this->assertDatabaseCount('case_memberships', 0);
            $this->assertDatabaseCount('security_audit_logs', 0);
        }
    }

    public function test_metadata_projection_requires_exact_delegation_and_contains_only_allowlisted_fields(): void
    {
        $case = $this->secret();
        $manager = $this->delegatedManager($case);
        $member = $this->fixtureUser('metadata-member', ['case.view']);
        $this->member($member, $case);
        $result = app(CaseAccessService::class)->managementSnapshot($manager, $case->id);
        $this->assertSame(['case_id', 'classification', 'management_approval_ref', 'memberships'], array_keys($result));
        $this->assertSame('CONFIDENTIAL', $result['classification']);
        $this->assertSame(['user_id', 'employee_id', 'access', 'expires_at', 'revoked_at', 'revision'], array_keys($result['memberships'][0]));
        $this->assertStringNotContainsString('SYNTHETIC-SECRET', json_encode($result));
        $this->assertFalse(CaseAccessService::contentAllows($manager, $case->id));
        $this->expectException(AuthorizationException::class);
        app(CaseAccessService::class)->managementSnapshot($manager, $this->secret()->id);
    }

    public function test_catalog_permission_without_delegation_cannot_read_management_metadata(): void
    {
        $user = $this->fixtureUser('no-delegation', ['case.manage_access']);
        $this->app->instance(CaseAccessService::class, new CaseAccessService);
        $this->expectException(AuthorizationException::class);
        app(CaseAccessService::class)->managementSnapshot($user, $this->secret()->id);
    }

    public function test_existing_normal_list_unchanged_and_secret_hidden_without_grants(): void
    {
        $user = $this->fixtureUser('normal', ['case.view']);
        $normal = $this->matter();
        $secret = $this->secret();
        $this->actingAs($user)->getJson('/api/case-files')->assertOk()->assertJsonCount(1, 'case_files');
        $this->assertSame([$normal->id], CaseFile::visibleTo($user)->pluck('id')->all());
        $this->getJson('/api/case-files/'.$secret->id)->assertNotFound();
    }
}
