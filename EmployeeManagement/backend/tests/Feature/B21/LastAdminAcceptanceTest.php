<?php

namespace Tests\Feature\B21;

use App\Models\Role;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;
use Symfony\Component\Console\Command\Command;
use Tests\Support\B21\B21TestCase;

/** These tests protect the requested write entry points; no test-only guard is installed. */
class LastAdminAcceptanceTest extends B21TestCase
{
    public function test_model_cannot_disable_the_last_canonical_admin(): void
    {
        $admin = $this->fixtureAdmin();
        $this->assertContinuityDenial(fn () => $admin->update(['is_active' => false]));
        $this->assertTrue($admin->fresh()->is_active);
    }

    public function test_model_cannot_delete_the_last_canonical_admin(): void
    {
        $admin = $this->fixtureAdmin();
        $this->assertContinuityDenial(fn () => $admin->delete());
        $this->assertNotNull($admin->fresh());
    }

    public function test_employee_resignation_cannot_remove_last_admin_login(): void
    {
        $admin = $this->fixtureAdmin();
        $this->assertContinuityDenial(fn () => $admin->employee->update(['status' => 'resigned']));
        $this->assertSame('active', $admin->employee->fresh()->status);
    }

    public function test_employee_soft_delete_cannot_remove_last_admin_login(): void
    {
        $admin = $this->fixtureAdmin();
        $this->assertContinuityDenial(fn () => $admin->employee->delete());
        $this->assertNotNull($admin->employee->fresh());
    }

    public function test_role_delete_cannot_cascade_away_the_last_admin(): void
    {
        $admin = $this->fixtureAdmin();
        $role = $admin->roles()->first();
        $this->assertContinuityDenial(fn () => $role->delete());
        $this->assertDatabaseHas('user_roles', ['user_id' => $admin->id, 'role_id' => $role->id]);
    }

    public function test_shared_role_permission_edit_cannot_remove_essential_admin_capabilities(): void
    {
        $admin = $this->fixtureAdmin();
        $role = $admin->roles()->first();
        $this->assertNotNull(Gate::getPolicyFor(Role::class), 'RED — PENDING IMPLEMENTATION: shared-role continuity policy is absent.');
        // Proposed final permission set, not a delta. Removing every capability is forbidden.
        $this->assertFalse(Gate::forUser($admin)->allows('grantPermissions', [$role, []]));
    }

    public function test_inactive_second_admin_does_not_count_as_a_replacement(): void
    {
        $first = $this->fixtureAdmin('first');
        $second = $this->fixtureAdmin('inactive');
        // Arrange a pre-existing inactive account. A guarded lifecycle change now correctly
        // requires verified replacement readiness, which is not the operation under test here.
        DB::table('users')->where('id', $second->id)->update(['is_active' => false]);
        $this->assertContinuityDenial(fn () => $first->update(['is_active' => false]));
        $this->assertTrue($first->fresh()->is_active);
    }

    public function test_legacy_role_editor_cannot_remove_last_pivot_admin(): void
    {
        $admin = $this->fixtureAdmin();
        $operator = $this->fixtureLegacy('legacy-operator', 'level_5', 'admin');
        $ordinary = $this->fixtureEmployee();
        $this->actingAs($operator, 'sanctum')->putJson("/api/employees/{$admin->employee_id}/roles", ['role_ids' => $ordinary->roles()->pluck('id')->all()])
            ->assertStatus(422);
        $this->assertSame(['admin'], $admin->roles()->pluck('name')->all());
    }

    public function test_password_cli_cannot_reset_admin_without_approved_recovery(): void
    {
        $admin = $this->fixtureAdmin();
        // Arrange the CLI lookup identity, not an identity-change bypass through a model writer.
        DB::table('users')->where('id', $admin->id)->update(['login_id' => 'B21-SYNTHETIC-ADMIN']);
        $admin->refresh();
        $before = $admin->fresh()->password;
        $this->artisan('themis:user-password', ['login_id' => $admin->login_id, '--activate' => true])
            ->expectsQuestion('New password (11+ chars, uppercase and symbol)', self::SYNTHETIC_PASSWORD.'-CLI')
            ->expectsQuestion('Confirm new password', self::SYNTHETIC_PASSWORD.'-CLI')
            ->assertExitCode(Command::FAILURE);
        $this->assertSame($before, $admin->fresh()->password);
    }

    public function test_ordinary_employee_state_change_remains_legal(): void
    {
        $employee = $this->fixtureEmployee();
        $employee->update(['is_active' => false]);
        $this->assertFalse($employee->fresh()->is_active);
    }

    public function test_last_admin_cannot_be_detached_from_the_employee_required_for_login(): void
    {
        $admin = $this->fixtureAdmin();
        $employeeId = $admin->employee_id;
        $this->assertContinuityDenial(fn () => $admin->update(['employee_id' => null]));
        $this->assertSame($employeeId, $admin->fresh()->employee_id);
    }

    public function test_permission_model_delete_cannot_cascade_away_essential_admin_authority(): void
    {
        $admin = $this->fixtureAdmin();
        $permission = $admin->roles()->first()->permissions()->where('name', 'employee.manage_roles')->sole();
        $this->assertContinuityDenial(fn () => $permission->delete());
        $this->assertNotNull($permission->fresh());
    }

    private function assertContinuityDenial(callable $write): void
    {
        $rejected = false;
        try {
            DB::transaction($write);
        } catch (ValidationException $error) {
            $rejected = true;
            $this->assertArrayHasKey('admin', $error->errors());
        }
        $this->assertTrue($rejected,
            'RED — PENDING IMPLEMENTATION: last-admin transition must fail validation before persisting/revoking sessions.');
    }
}
