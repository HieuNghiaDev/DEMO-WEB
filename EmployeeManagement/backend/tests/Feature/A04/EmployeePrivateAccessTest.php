<?php

namespace Tests\Feature\A04;

use App\Models\Employee;
use App\Models\Permission;
use App\Policies\EmployeePolicy;
use App\Services\Administration\AdminCapabilities;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\B21\B21TestCase;

class EmployeePrivateAccessTest extends B21TestCase
{
    private function privateEmployee(Employee $employee): Employee
    {
        $employee->update(['phone' => 'SYNTHETIC PRIVATE PHONE', 'date_of_birth' => '2000-01-02',
            'nationality_code' => 'ZZ', 'termination_date' => '2030-01-01']);
        return $employee->fresh();
    }

    private function row(int $id): array
    {
        return collect($this->getJson('/api/organization')->assertOk()->json('employees'))->firstWhere('id', $id);
    }

    private function assertRedacted(array $row): void
    {
        foreach (['phone', 'date_of_birth', 'nationality_code'] as $field) $this->assertNull($row[$field]);
        foreach (['termination_date', 'avatar_data', 'avatar_token'] as $field) $this->assertArrayNotHasKey($field, $row);
    }

    public static function broadReaders(): array
    {
        return [['employee.view'], ['employee.update'], ['employee.manage_roles']];
    }

    #[DataProvider('broadReaders')]
    public function test_work_permission_is_not_private_read_including_own_directory_row(string $permission): void
    {
        $reader = $this->fixtureUser('a04-work-'.str_replace('.', '-', $permission), array_unique(['employee.view', $permission]));
        $own = $this->privateEmployee($reader->employee);
        $other = $this->privateEmployee($this->fixtureEmployee('a04-other')->employee);
        $this->actingAs($reader);
        foreach ([$own, $other] as $employee) {
            $row = $this->row($employee->id);
            $this->assertSame($employee->full_name, $row['full_name']);
            $this->assertSame($employee->employee_code, $row['employee_code']);
            $this->assertRedacted($row);
            $this->assertFalse(Gate::forUser($reader)->allows('viewPrivate', $employee));
        }
    }

    public function test_explicit_private_permission_is_bounded_to_fresh_self_identity(): void
    {
        $reader = $this->fixtureUser('a04-private', ['employee.view', 'employee.view_private']);
        $own = $this->privateEmployee($reader->employee);
        $other = $this->privateEmployee($this->fixtureEmployee('a04-private-other')->employee);
        $this->actingAs($reader);
        $this->assertSame('SYNTHETIC PRIVATE PHONE', $this->row($own->id)['phone']);
        $this->assertTrue(Gate::forUser($reader)->allows('viewPrivate', $own));
        $this->assertRedacted($this->row($other->id));
        $this->assertFalse(Gate::forUser($reader)->allows('viewPrivate', $other));
    }

    public function test_admin_levels_and_hr_title_are_not_private_subject_or_read_authority(): void
    {
        $other = $this->privateEmployee($this->fixtureEmployee('a04-admin-target')->employee);
        foreach (['level_4', 'level_5', 'admin'] as $role) {
            $reader = $this->fixtureUser('a04-'.$role, ['employee.view', 'employee.update', 'employee.manage_roles'], $role);
            $reader->employee->update(['position_title' => 'HR Lawyer Admin']);
            $this->actingAs($reader);
            $this->assertRedacted($this->row($other->id));
            $this->assertFalse(Gate::forUser($reader)->allows('viewPrivate', $other));
        }
    }

    public function test_revoke_is_immediate_on_same_bearer_and_eager_loaded_identity(): void
    {
        $reader = $this->fixtureUser('a04-revoke', ['employee.view', 'employee.view_private']);
        $own = $this->privateEmployee($reader->employee);
        $reader->load('roles.permissions', 'employee');
        $token = $reader->createToken('synthetic-a04')->plainTextToken;
        $this->app['auth']->forgetGuards();
        $this->withToken($token);
        $this->assertSame('SYNTHETIC PRIVATE PHONE', $this->row($own->id)['phone']);
        $reader->roles()->sole()->permissions()->detach(Permission::where('name', 'employee.view_private')->value('id'));
        $this->assertRedacted($this->row($own->id));
        $this->assertFalse(Gate::forUser($reader)->allows('viewPrivate', $own));
        $this->assertFalse(AdminCapabilities::explicit($reader, 'employee.view_private'));
    }

    public function test_stale_employee_relation_does_not_preserve_a_previous_self_binding(): void
    {
        $reader = $this->fixtureUser('a04-binding', ['employee.view', 'employee.view_private']);
        $own = $this->privateEmployee($reader->employee);
        $reader->load('employee');
        $replacement = $this->fixtureEmployee('a04-replacement')->employee;
        // Synthetic persistence only; simulate a changed identity while the old object is held.
        DB::table('users')->where('employee_id', $replacement->id)->update(['employee_id' => null]);
        DB::table('users')->where('id', $reader->id)->update(['employee_id' => $replacement->id]);
        $this->assertFalse(Gate::forUser($reader)->allows('viewPrivate', $own));
    }

    public function test_work_mutation_response_and_nested_models_do_not_serialize_pii(): void
    {
        $reader = $this->fixtureUser('a04-editor', ['employee.view', 'employee.update']);
        $target = $this->privateEmployee($this->fixtureEmployee('a04-edit-target')->employee);
        $this->actingAs($reader)->putJson('/api/employees/'.$target->id.'/employment', [
            'employment_type' => 'contract', 'phone' => 'MUST NOT WRITE', 'nationality_code' => 'YY',
        ])->assertOk()->assertJsonPath('employee.employment_type', 'contract')
            ->assertJsonMissingPath('employee.phone')->assertJsonMissingPath('employee.date_of_birth');
        $this->assertSame('SYNTHETIC PRIVATE PHONE', $target->fresh()->phone);
        $this->assertSame('ZZ', $target->fresh()->nationality_code);
        $this->assertRedacted($this->row($target->id));
        $this->assertArrayNotHasKey('phone', $target->toArray());
        $this->assertArrayNotHasKey('termination_date', $target->toArray());
    }

    public function test_me_preserves_existing_own_account_and_work_profile_without_expanding_private_projection(): void
    {
        $reader = $this->fixtureEmployee('a04-own-profile');
        $own = $this->privateEmployee($reader->employee);
        $response = $this->actingAs($reader)->getJson('/api/me')->assertOk();
        $this->assertSame($reader->id, $response->json('user.id'));
        $this->assertSame($reader->email, $response->json('user.email'));
        $this->assertSame($own->full_name, $response->json('user.employee.full_name'));
        $response->assertJsonMissingPath('user.employee.phone')->assertJsonMissingPath('user.employee.date_of_birth');
    }

    public function test_private_query_parameters_do_not_filter_counts_or_expose_hidden_values(): void
    {
        $reader = $this->fixtureEmployee('a04-search');
        $target = $this->privateEmployee($this->fixtureEmployee('a04-search-target')->employee);
        $this->actingAs($reader);
        $before = $this->getJson('/api/organization')->assertOk();
        $after = $this->getJson('/api/organization?search=NONMATCHING-PRIVATE&phone=NONMATCHING-PRIVATE&nationality_code=ZZ&date_of_birth=2000-01-02')->assertOk();
        $this->assertSame($before->json('summary'), $after->json('summary'));
        $this->assertSame($before->json('employees'), $after->json('employees'));
        $this->assertStringNotContainsString($target->phone, $after->getContent());
    }

    public function test_audit_metadata_keeps_safe_ids_and_field_names_but_drops_private_values(): void
    {
        $reader = $this->fixtureEmployee('a04-audit');
        $target = $this->privateEmployee($reader->employee);
        $this->actingAs($reader);
        app(\App\Services\SecurityAuditLogger::class)->record(request(), 'employee.private.accessed', 'success',
            $reader, $target, null, ['target_employee_id' => $target->id,
                'fields' => ['phone', 'date_of_birth', 'nationality_code'], 'phone' => $target->phone,
                'nested' => ['date_of_birth' => '2000-01-02', 'nationality_code' => 'ZZ', 'termination_date' => '2030-01-01']]);
        $metadata = \App\Models\SecurityAuditLog::where('event', 'employee.private.accessed')->sole()->metadata;
        $this->assertSame($target->id, $metadata['target_employee_id']);
        $this->assertSame(['phone', 'date_of_birth', 'nationality_code'], $metadata['fields']);
        $this->assertArrayNotHasKey('phone', $metadata);
        $this->assertSame([], $metadata['nested']);
    }

    public function test_private_directory_subject_checks_do_not_create_an_employee_n_plus_one(): void
    {
        $reader = $this->fixtureUser('a04-scale', ['employee.view', 'employee.view_private']);
        $this->privateEmployee($reader->employee);
        $this->actingAs($reader);
        $measuring = false;
        $queries = 0;
        DB::listen(function () use (&$measuring, &$queries): void {
            if ($measuring) $queries++;
        });
        $observations = [];
        foreach ([1, 21, 101] as $size) {
            while (Employee::count() < $size) $this->privateEmployee($this->fixtureEmployee('a04-scale-'.Employee::count())->employee);
            $queries = 0;
            $measuring = true;
            try { $response = $this->getJson('/api/organization'); }
            finally { $measuring = false; }
            $response->assertOk()->assertJsonCount($size, 'employees');
            foreach ($response->json('employees') as $row) {
                if ($row['id'] === $reader->employee_id) $this->assertSame('SYNTHETIC PRIVATE PHONE', $row['phone']);
                else $this->assertRedacted($row);
            }
            $observations[] = ['employees' => $size, 'queries' => $queries];
        }
        $counts = array_column($observations, 'queries');
        $this->assertLessThanOrEqual(6, max($counts) - min($counts));
        file_put_contents(storage_path('logs/a04-private-query-counts.json'), json_encode($observations, JSON_THROW_ON_ERROR));
    }
}
