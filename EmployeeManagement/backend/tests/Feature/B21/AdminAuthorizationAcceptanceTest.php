<?php

namespace Tests\Feature\B21;

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Tests\Support\B21\AdminAContract;
use Tests\Support\B21\B21TestCase;

/** Exercises application endpoints/resolver, not a test-only policy implementation. */
class AdminAuthorizationAcceptanceTest extends B21TestCase
{
    public function test_guest_and_employee_cannot_create_accounts(): void
    {
        $employee = $this->fixtureEmployee();
        $payload = $this->employeePayload($employee);
        $this->postJson('/api/employees', $payload)->assertUnauthorized();
        $this->actingAs($employee, 'sanctum')->postJson('/api/employees', $payload)->assertForbidden();
        $this->assertDatabaseCount('users', 1);
    }

    public function test_operational_admin_can_edit_work_metadata_without_being_a_lawyer(): void
    {
        $admin = $this->fixtureAdmin();
        $target = $this->fixtureEmployee();
        $this->assertFalse($admin->hasPermission('employee.verify_lawyer'));
        $this->assertFalse($admin->hasPermission('document.approve_legal'));
        $this->actingAs($admin, 'sanctum')->putJson("/api/employees/{$target->employee_id}/employment", ['employment_type' => 'contract'])
            ->assertOk()->assertJsonPath('employee.employment_type', 'contract');
    }

    public function test_clean_admin_fixture_has_no_implicit_case_content_access(): void
    {
        $admin = $this->fixtureAdmin();
        $case = $this->matter();
        // No fictional confidential flag/membership is created. This checks lack of case.view only.
        $this->actingAs($admin, 'sanctum')->getJson("/api/case-files/{$case->id}")->assertForbidden();
        $this->getJson("/api/case-files/{$case->id}/workspace")->assertForbidden();
    }

    public function test_admin_cannot_change_own_roles(): void
    {
        $admin = $this->fixtureAdmin();
        $this->actingAs($admin, 'sanctum')->putJson("/api/employees/{$admin->employee_id}/roles", ['role_ids' => $admin->roles()->pluck('id')->all()])->assertForbidden();
    }

    public function test_explicit_admin_fixture_can_login_with_its_own_password_and_use_operational_api(): void
    {
        $admin = $this->fixtureAdmin();
        $target = $this->fixtureEmployee();
        // B2.4: password alone yields a pre-auth challenge; complete actual TOTP first.
        $token = $this->authenticatedFixtureToken($admin);
        $this->assertNotEmpty($token);
        $this->withToken($token)->putJson("/api/employees/{$target->employee_id}/employment", ['employment_type' => 'contract'])
            ->assertOk()->assertJsonPath('employee.employment_type', 'contract');
    }

    public function test_employee_update_alone_never_grants_private_hr_read(): void
    {
        $admin = $this->fixtureAdmin();
        $target = $this->fixtureEmployee();
        $target->employee->update(['phone' => '090-0000-0000', 'date_of_birth' => '1991-01-01', 'nationality_code' => 'XX']);
        $this->assertFalse($admin->hasPermission('employee.view_private'));
        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/organization')->assertOk();
        $profile = collect($response->json('employees'))->firstWhere('id', $target->employee_id);
        $this->assertNotNull($profile);
        foreach (['phone', 'date_of_birth', 'nationality_code'] as $field) {
            $this->assertNull($profile[$field] ?? null, 'RED — PENDING IMPLEMENTATION: employee.update must not authorize '.$field);
        }
    }

    public function test_explicit_private_reader_does_not_need_employee_update(): void
    {
        $reader = $this->fixtureUser('private-reader', ['employee.view', 'employee.view_private']);
        $target = $reader; // A04: the implemented default subject scope is self, not all employees.
        $target->employee->update(['phone' => '090-0000-0000']);
        $this->assertFalse($reader->hasPermission('employee.update'));
        $profile = collect($this->actingAs($reader, 'sanctum')->getJson('/api/organization')->assertOk()->json('employees'))->firstWhere('id', $target->employee_id);
        $this->assertSame('090-0000-0000', $profile['phone'] ?? null,
            'RED — PENDING IMPLEMENTATION: legitimate PII read is an independent capability.');
        $outside = $this->fixtureEmployee('private-outside');
        $this->assertFalse(\Illuminate\Support\Facades\Gate::forUser($reader)->allows('viewPrivate', $outside->employee));
    }

    public function test_admin_cannot_give_another_user_the_admin_role_through_ordinary_role_editor(): void
    {
        $this->denyProtectedRole('admin');
    }

    public function test_admin_cannot_verify_a_lawyer_by_assigning_a_role(): void
    {
        $this->denyProtectedRole('verified_lawyer');
    }

    public function test_role_management_requires_step_up_even_for_an_ordinary_role(): void
    {
        $admin = $this->fixtureAdmin();
        $target = $this->fixtureEmployee();
        $this->actingAs($admin, 'sanctum')->putJson("/api/employees/{$target->employee_id}/roles", ['role_ids' => $target->roles()->pluck('id')->all()])
            ->assertForbidden();
    }

    public function test_legacy_admin_conflict_cannot_read_cases_without_explicit_pivot_permission(): void
    {
        $user = $this->fixtureConflict();
        $case = $this->matter();
        $this->assertFalse($user->roles()->whereHas('permissions', fn ($query) => $query->where('name', 'case.delete'))->exists());
        // Use a revoked pivot read grant, rather than treating assignment as an ACL that does not exist.
        $user->roles()->first()->permissions()->detach(\App\Models\Permission::where('name', 'case.view')->value('id'));
        $this->actingAs($user, 'sanctum')->getJson("/api/case-files/{$case->id}")->assertForbidden();
    }

    public function test_role_ids_in_employee_creation_cannot_spoof_protected_role(): void
    {
        $admin = $this->fixtureAdmin();
        $this->actingAs($admin, 'sanctum')->postJson('/api/employees', [
            ...$this->employeePayload($admin, 'spoof'), 'role_ids' => $admin->roles()->pluck('id')->all(), 'role' => 'admin',
        ])->assertCreated();
        $created = User::where('email', 'b21-spoof@example.test')->sole();
        $this->assertFalse($created->roles()->where('name', 'admin')->exists());
    }

    public function test_new_account_is_not_created_with_shared_password(): void
    {
        config(['auth.employee_initial_password' => 'SYNTHETIC-B21-SHARED']);
        $admin = $this->fixtureAdmin();
        $this->actingAs($admin, 'sanctum')->postJson('/api/employees', $this->employeePayload($admin))->assertCreated();
        $created = User::where('email', 'b21-new@example.test')->sole();
        $this->assertFalse(Hash::check('SYNTHETIC-B21-SHARED', $created->password),
            'RED — PENDING IMPLEMENTATION: account creation still uses the shared credential.');
    }

    private function denyProtectedRole(string $name): void
    {
        $admin = $this->fixtureAdmin();
        $target = $this->fixtureEmployee();
        $role = \App\Models\Role::firstOrCreate(['name' => $name], ['display_name' => 'Synthetic protected role']);
        $before = $target->roles()->pluck('name')->all();
        $this->actingAs($admin, 'sanctum')->putJson("/api/employees/{$target->employee_id}/roles", ['role_ids' => [$role->id]])->assertForbidden();
        $this->assertSame($before, $target->roles()->pluck('name')->all());
        $this->assertContains($name, AdminAContract::protectedRoles());
    }
}
