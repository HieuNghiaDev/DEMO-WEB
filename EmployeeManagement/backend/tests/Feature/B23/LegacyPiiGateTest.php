<?php

namespace Tests\Feature\B23;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\B21\AdminAContract;
use Tests\Support\B21\B21TestCase;

class LegacyPiiGateTest extends B21TestCase
{
    private function assertPrivateProjection(User $reader, bool $allowed): void
    {
        $target = $reader->employee;
        $target->update(['phone' => '000-SYNTHETIC', 'date_of_birth' => '1990-01-02', 'nationality_code' => 'VN']);
        $this->app['auth']->forgetGuards();
        $token = $this->authenticatedFixtureToken($reader);
        $row = collect($this->withToken($token)->getJson('/api/organization')->assertOk()->json('employees'))->firstWhere('id', $target->id);
        $this->assertNotNull($row);
        foreach (['phone', 'date_of_birth', 'nationality_code'] as $field) {
            $allowed ? $this->assertNotNull($row[$field]) : $this->assertNull($row[$field], 'PII must require approved explicit access: '.$field);
        }
    }

    public function test_unmapped_legacy_account_newly_granted_update_must_not_become_a_private_reader(): void
    {
        $reader = $this->fixtureEmployee('pii-new-grant');
        $role = $reader->roles()->sole();
        $role->permissions()->attach(Permission::where('name', 'employee.update')->sole()->id);
        // RED until an owner-approved HR-reader mapping can distinguish this from a lawful old reader.
        $this->assertPrivateProjection($reader, false);
    }

    public function test_custom_update_role_does_not_prove_legacy_hr_approval(): void
    {
        $reader = $this->fixtureUser('pii-custom', ['employee.view', 'employee.update']);
        $this->assertPrivateProjection($reader, false);
    }

    public function test_canonical_admin_without_private_grant_is_redacted(): void
    {
        $this->assertPrivateProjection($this->fixtureAdmin('pii-canonical'), false);
    }

    public function test_explicit_private_grant_is_effective_on_the_same_bearer_and_revocation_is_immediate(): void
    {
        $reader = $this->fixtureEmployee('pii-live');
        $reader->employee->update(['phone' => '000-SYNTHETIC']);
        $role = $reader->roles()->sole();
        $permission = Permission::firstOrCreate(['name' => 'employee.view_private'], ['display_name' => 'Synthetic private read']);
        $token = $reader->createToken('synthetic-live')->plainTextToken;
        $this->app['auth']->forgetGuards();
        $fetch = fn () => collect($this->withToken($token)->getJson('/api/organization')->assertOk()->json('employees'))->firstWhere('id', $reader->employee_id)['phone'];
        $this->assertNull($fetch());
        $role->permissions()->attach($permission->id);
        $this->assertSame('000-SYNTHETIC', $fetch());
        $role->permissions()->detach($permission->id);
        $this->assertNull($fetch());
    }

    public function test_new_account_does_not_inherit_private_access_after_activation_and_update_grant(): void
    {
        $admin = $this->fixtureAdmin('pii-create');
        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/employees', $this->employeePayload($admin, 'pii-new'))->assertCreated();
        $reader = User::where('employee_id', $response->json('employee.id'))->sole();
        $this->assertTrue((bool) $reader->activation_required);
        $this->assertTrue((bool) $reader->pii_requires_explicit);
        // A completed activation must not turn the account into an approved legacy HR reader.
        $reader->forceFill(['activation_required' => false, 'activated_at' => now(), 'must_change_password' => false])->save();
        $role = Role::create(['name' => 'new_work_editor', 'display_name' => 'Synthetic work editor']);
        $role->permissions()->sync(Permission::whereIn('name', ['employee.view', 'employee.update'])->pluck('id'));
        $reader->roles()->sync([$role->id]);
        $this->assertPrivateProjection($reader->fresh(), false);
    }

    public static function legacyLevels(): array
    {
        return array_map(fn ($level) => [$level], ['level_1', 'level_2', 'level_3', 'level_4', 'level_5']);
    }

    #[DataProvider('legacyLevels')]
    public function test_new_identity_never_uses_level_or_title_as_private_read_approval(string $level): void
    {
        $reader = $this->fixtureLegacy('new-pii-'.$level, $level);
        // Model the persistent marker on a newly provisioned, subsequently activated identity.
        $reader->forceFill(['pii_requires_explicit' => true, 'activated_at' => now()])->save();
        $reader->employee->update(['position_title' => 'HR manager']);
        $this->assertPrivateProjection($reader->fresh(), false);
    }

    public function test_canonical_admin_explicit_private_read_and_revoke_use_the_same_bearer(): void
    {
        $reader = $this->fixtureUser('canonical-private', [...AdminAContract::adminFixturePermissions(), 'employee.view_private'], 'admin');
        $reader->employee->update(['phone' => '000-SYNTHETIC']);
        $this->app['auth']->forgetGuards();
        $token = $this->authenticatedFixtureToken($reader);
        $fetch = fn () => collect($this->withToken($token)->getJson('/api/organization')->assertOk()->json('employees'))->firstWhere('id', $reader->employee_id)['phone'];
        $this->assertSame('000-SYNTHETIC', $fetch());
        $reader->roles()->sole()->permissions()->detach(Permission::where('name', 'employee.view_private')->sole()->id);
        $this->assertNull($fetch());
    }

    public function test_unmapped_legacy_update_grant_on_the_same_bearer_must_not_open_pii(): void
    {
        $reader = $this->fixtureEmployee('legacy-live-update');
        $reader->employee->update(['phone' => '000-SYNTHETIC']);
        $this->app['auth']->forgetGuards();
        $token = $reader->createToken('synthetic-update-grant')->plainTextToken;
        $fetch = fn () => collect($this->withToken($token)->getJson('/api/organization')->assertOk()->json('employees'))->firstWhere('id', $reader->employee_id)['phone'];
        $this->assertNull($fetch());
        $reader->roles()->sole()->permissions()->attach(Permission::where('name', 'employee.update')->sole()->id);
        // RED — no approved identity mapping exists; a new grant is not proof of historic HR approval.
        $this->assertNull($fetch());
    }
}
