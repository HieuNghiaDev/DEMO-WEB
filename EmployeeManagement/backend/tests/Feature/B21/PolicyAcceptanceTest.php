<?php

namespace Tests\Feature\B21;

use App\Models\Employee;
use App\Models\Role;
use Illuminate\Support\Facades\Gate;
use Tests\Support\B21\B21TestCase;

class PolicyAcceptanceTest extends B21TestCase
{
    public function test_employee_policy_authorizes_admin_create_and_denies_ordinary_employee(): void
    {
        $this->assertNotNull(Gate::getPolicyFor(Employee::class), 'RED — PENDING IMPLEMENTATION: real EmployeePolicy must be registered.');
        $admin = $this->fixtureAdmin();
        $employee = $this->fixtureEmployee();
        $this->assertTrue(Gate::forUser($admin)->allows('create', Employee::class));
        $this->assertFalse(Gate::forUser($employee)->allows('create', Employee::class));
    }

    public function test_employee_policy_does_not_confuse_update_with_private_read(): void
    {
        $this->assertNotNull(Gate::getPolicyFor(Employee::class), 'RED — PENDING IMPLEMENTATION: missing policy must not masquerade as a secure deny.');
        $target = $this->fixtureEmployee();
        $this->assertFalse(Gate::forUser($this->fixtureAdmin())->allows('viewPrivate', $target->employee));
        $reader = $this->fixtureUser('policy-private-reader', ['employee.view', 'employee.view_private']);
        $this->assertTrue(Gate::forUser($reader)->allows('viewPrivate', $reader->employee));
        $this->assertFalse(Gate::forUser($reader)->allows('viewPrivate', $target->employee));
    }

    public function test_role_policy_blocks_self_assignment_and_protected_permission_grants(): void
    {
        $this->assertNotNull(Gate::getPolicyFor(Role::class), 'RED — PENDING IMPLEMENTATION: real RolePolicy must be registered.');
        $admin = $this->fixtureAdmin();
        $role = $admin->roles()->first();
        $this->assertFalse(Gate::forUser($admin)->allows('assign', [$role, $admin]));
        $this->assertFalse(Gate::forUser($admin)->allows('grantPermissions', [$role, ['document.approve_legal']]));
        $this->assertFalse(Gate::forUser($admin)->allows('grantPermissions', [$role, ['employee.verify_lawyer']]));
        $this->assertFalse(Gate::forUser($admin)->allows('grantPermissions', [$role, ['unknown.permission']]));
    }
}
