<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\EmployeeCodeSequence;
use App\Models\Office;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\OfficeSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class EmployeeCreationApiTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([OfficeSeeder::class, RolePermissionSeeder::class]);
        $this->manager = User::factory()->create();
        $this->manager->roles()->sync([Role::query()->where('name', 'level_4')->value('id')]);
        Carbon::setTestNow('2026-09-02 09:00:00');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_level_four_user_can_create_an_employee_profile_with_an_automatic_code(): void
    {
        $office = $this->office('THEMIS');

        $this->createEmployee($office, ['work_email' => 'test.employee@themis.local'])
            ->assertCreated()
            ->assertJsonPath('employee.employee_code', 'TMS-26001')
            ->assertJsonPath('employee.office.id', $office->id);

        $this->assertDatabaseHas('employees', [
            'employee_code' => 'TMS-26001',
            'full_name' => 'TEST EMPLOYEE',
            'office_id' => $office->id,
            'status' => 'active',
        ]);
    }

    public function test_second_employee_uses_the_next_yearly_office_sequence(): void
    {
        $office = $this->office('THEMIS');

        $this->createEmployee($office, ['work_email' => 'first@themis.local'])->assertJsonPath('employee.employee_code', 'TMS-26001');
        $this->createEmployee($office, ['work_email' => 'second@themis.local'])->assertJsonPath('employee.employee_code', 'TMS-26002');
    }

    public function test_office_sequences_are_independent_and_use_canonical_prefixes(): void
    {
        $themis = $this->office('THEMIS');
        $law = $this->office('CHUKA_LAW');

        $this->createEmployee($themis, ['work_email' => 'themis@themis.local'])->assertJsonPath('employee.employee_code', 'TMS-26001');
        $this->createEmployee($law, ['work_email' => 'law@themis.local'])->assertJsonPath('employee.employee_code', 'TLW-26001');
        $this->createEmployee($themis, ['work_email' => 'themis-second@themis.local'])->assertJsonPath('employee.employee_code', 'TMS-26002');
    }

    public function test_sequence_resets_for_each_office_in_a_new_year(): void
    {
        $themis = $this->office('THEMIS');
        $law = $this->office('CHUKA_LAW');

        $this->createEmployee($themis, ['work_email' => 'themis-2026@themis.local'])->assertJsonPath('employee.employee_code', 'TMS-26001');
        $this->createEmployee($law, ['work_email' => 'law-2026@themis.local'])->assertJsonPath('employee.employee_code', 'TLW-26001');

        Carbon::setTestNow('2027-01-01 09:00:00');

        $this->createEmployee($themis, ['work_email' => 'themis-2027@themis.local'])->assertJsonPath('employee.employee_code', 'TMS-27001');
        $this->createEmployee($law, ['work_email' => 'law-2027@themis.local'])->assertJsonPath('employee.employee_code', 'TLW-27001');
    }

    public function test_deleted_or_deactivated_employees_do_not_release_their_sequence_numbers(): void
    {
        $office = $this->office('THEMIS');
        $firstId = $this->createEmployee($office, ['work_email' => 'first@themis.local'])->json('employee.id');
        Employee::query()->findOrFail($firstId)->update(['status' => 'resigned']);
        $this->createEmployee($office, ['work_email' => 'second@themis.local'])->assertJsonPath('employee.employee_code', 'TMS-26002');

        Employee::query()->where('employee_code', 'TMS-26002')->firstOrFail()->delete();
        $this->createEmployee($office, ['work_email' => 'third@themis.local'])->assertJsonPath('employee.employee_code', 'TMS-26003');
    }

    public function test_existing_legacy_codes_are_preserved_and_do_not_change_the_new_sequence(): void
    {
        $office = $this->office('THEMIS');
        $legacy = Employee::query()->create([
            'employee_code' => 'TM-MGR001',
            'full_name' => 'Legacy manager',
            'office_id' => $office->id,
            'hire_date' => '2025-01-01',
            'status' => 'active',
        ]);

        $this->createEmployee($office, ['work_email' => 'new@themis.local'])->assertJsonPath('employee.employee_code', 'TMS-26001');
        $this->assertSame('TM-MGR001', $legacy->fresh()->employee_code);
    }

    public function test_historical_new_format_codes_are_not_overwritten_or_reissued(): void
    {
        $office = $this->office('THEMIS');
        Employee::query()->create([
            'employee_code' => 'TMS-26007',
            'full_name' => 'Existing code holder',
            'office_id' => $office->id,
            'hire_date' => '2026-01-01',
            'status' => 'active',
        ]);

        $this->createEmployee($office, ['work_email' => 'after-history@themis.local'])->assertJsonPath('employee.employee_code', 'TMS-26008');
        $this->assertDatabaseHas('employees', ['employee_code' => 'TMS-26007']);
    }

    public function test_employee_code_is_immutable_when_an_employee_changes_office(): void
    {
        $themis = $this->office('THEMIS');
        $law = $this->office('CHUKA_LAW');
        $id = $this->createEmployee($themis, ['work_email' => 'move@themis.local'])->json('employee.id');

        Employee::query()->findOrFail($id)->update(['office_id' => $law->id]);

        $this->assertDatabaseHas('employees', ['id' => $id, 'office_id' => $law->id, 'employee_code' => 'TMS-26001']);
    }

    public function test_manual_employee_codes_are_rejected_and_cannot_override_generation(): void
    {
        $office = $this->office('THEMIS');

        $this->createEmployee($office, ['employee_code' => 'TLW-26999'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('employee_code');

        $this->assertDatabaseCount('employees', 0);
    }

    public function test_sequence_range_is_limited_to_999_per_office_and_year(): void
    {
        $office = $this->office('THEMIS');
        EmployeeCodeSequence::query()->create([
            'office_id' => $office->id,
            'sequence_year' => 2026,
            'last_sequence' => 999,
        ]);

        $this->createEmployee($office, ['work_email' => 'overflow@themis.local'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('employee_code');
    }

    public function test_sequence_allocation_is_unique_and_monotonic_across_separate_requests(): void
    {
        $office = $this->office('THEMIS');
        $codes = collect(['one', 'two', 'three', 'four'])
            ->map(fn (string $name) => $this->createEmployee($office, ['work_email' => "{$name}@themis.local"])->json('employee.employee_code'));

        $this->assertSame(['TMS-26001', 'TMS-26002', 'TMS-26003', 'TMS-26004'], $codes->all());
        $this->assertCount(4, $codes->unique());
        $this->assertDatabaseHas('employee_code_sequences', [
            'office_id' => $office->id,
            'sequence_year' => 2026,
            'last_sequence' => 4,
        ]);
    }

    public function test_user_without_employee_create_permission_cannot_create_employee(): void
    {
        $user = User::factory()->create();
        $user->roles()->sync([Role::query()->where('name', 'level_2')->value('id')]);
        $office = $this->office('THEMIS');

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/employees', [
                'full_name' => 'UNAUTHORIZED EMPLOYEE',
                'office_id' => $office->id,
                'hire_date' => '2026-08-25',
            ])
            ->assertForbidden();

        $this->assertDatabaseMissing('employees', [
            'full_name' => 'UNAUTHORIZED EMPLOYEE',
        ]);
    }

    private function office(string $officeCode): Office
    {
        return Office::query()->where('office_code', $officeCode)->sole();
    }

    private function createEmployee(Office $office, array $overrides = [])
    {
        return $this->actingAs($this->manager, 'sanctum')->postJson('/api/employees', array_merge([
            'full_name' => 'TEST EMPLOYEE',
            'full_name_kana' => 'テスト・エンプロイー',
            'office_id' => $office->id,
            'position_title' => '社員',
            'gender' => 'other',
            'hire_date' => '2026-09-02',
        ], $overrides));
    }
}
