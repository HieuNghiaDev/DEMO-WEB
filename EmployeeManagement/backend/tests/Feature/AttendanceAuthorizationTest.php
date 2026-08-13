<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Office;
use App\Models\User;
use App\Services\AttendanceExcelService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AttendanceAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private Office $office;

    protected function setUp(): void
    {
        parent::setUp();

        $this->office = Office::create([
            'office_code' => 'THEMIS',
            'name' => 'THEMIS株式会社',
            'status' => 'active',
        ]);
    }

    public function test_start_uses_the_authenticated_employee_instead_of_submitted_name(): void
    {
        $employee = $this->createEmployee('TM001', 'LE HIEU NGHIA');
        $otherEmployee = $this->createEmployee('TM002', 'TRINH THI THU HUONG');

        Sanctum::actingAs(User::factory()->create([
            'employee_id' => $employee->id,
        ]));

        $excelService = $this->mock(AttendanceExcelService::class);
        $excelService->shouldReceive('sync')->once();

        $this->postJson('/api/attendances/start', [
            'employee_name' => $otherEmployee->full_name,
        ])
            ->assertCreated()
            ->assertJsonPath('attendance.employee_id', $employee->id)
            ->assertJsonPath('attendance.employee_name', $employee->full_name);

        $this->assertDatabaseHas('attendances', [
            'employee_id' => $employee->id,
            'employee_name' => $employee->full_name,
            'status' => 'working',
        ]);

        $this->assertDatabaseMissing('attendances', [
            'employee_id' => $otherEmployee->id,
        ]);
    }

    public function test_employee_cannot_update_another_employees_attendance(): void
    {
        $employee = $this->createEmployee('TM001', 'LE HIEU NGHIA');
        $otherEmployee = $this->createEmployee('TM002', 'TRINH THI THU HUONG');

        Sanctum::actingAs(User::factory()->create([
            'employee_id' => $employee->id,
        ]));

        $attendance = Attendance::create([
            'employee_id' => $otherEmployee->id,
            'employee_name' => $otherEmployee->full_name,
            'work_date' => '2026-08-13',
            'clock_in' => '2026-08-13 09:00:00',
            'status' => 'working',
        ]);

        $this->patchJson("/api/attendances/{$attendance->id}/status", [
            'status' => 'offline',
        ])
            ->assertForbidden()
            ->assertJsonPath('message', '他の社員の勤務記録は変更できません。');

        $this->assertDatabaseHas('attendances', [
            'id' => $attendance->id,
            'status' => 'working',
            'clock_out' => null,
        ]);
    }

    public function test_legacy_attendance_is_claimed_only_by_the_matching_employee(): void
    {
        $employee = $this->createEmployee('TM001', 'LE HIEU NGHIA');

        Sanctum::actingAs(User::factory()->create([
            'employee_id' => $employee->id,
        ]));

        $excelService = $this->mock(AttendanceExcelService::class);
        $excelService->shouldReceive('sync')->once();

        $attendance = Attendance::create([
            'employee_name' => $employee->full_name,
            'work_date' => '2026-08-13',
            'clock_in' => '2026-08-13 09:00:00',
            'status' => 'working',
        ]);

        $this->patchJson("/api/attendances/{$attendance->id}/status", [
            'status' => 'break',
        ])->assertOk();

        $this->assertDatabaseHas('attendances', [
            'id' => $attendance->id,
            'employee_id' => $employee->id,
            'status' => 'break',
        ]);
    }

    public function test_ambiguous_legacy_attendance_cannot_be_claimed_by_name(): void
    {
        $employee = $this->createEmployee('TM001', 'DUPLICATE NAME');
        $this->createEmployee('TM002', 'DUPLICATE NAME');

        Sanctum::actingAs(User::factory()->create([
            'employee_id' => $employee->id,
        ]));

        $attendance = Attendance::create([
            'employee_name' => $employee->full_name,
            'work_date' => '2026-08-13',
            'clock_in' => '2026-08-13 09:00:00',
            'status' => 'working',
        ]);

        $this->patchJson("/api/attendances/{$attendance->id}/status", [
            'status' => 'break',
        ])->assertForbidden();

        $this->assertDatabaseHas('attendances', [
            'id' => $attendance->id,
            'employee_id' => null,
            'status' => 'working',
        ]);
    }

    public function test_account_without_an_active_employee_profile_is_forbidden(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/attendances/active')
            ->assertForbidden()
            ->assertJsonPath(
                'message',
                'このアカウントには有効な社員情報がありません。'
            );
    }

    private function createEmployee(string $code, string $name): Employee
    {
        return Employee::create([
            'employee_code' => $code,
            'full_name' => $name,
            'gender' => 'male',
            'hire_date' => '2026-08-13',
            'office_id' => $this->office->id,
            'status' => 'active',
        ]);
    }
}
