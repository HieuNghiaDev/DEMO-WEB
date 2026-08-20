<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Office;
use App\Models\User;
use App\Services\AttendanceExcelService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AttendanceOutsideStatusTest extends TestCase
{
    use RefreshDatabase;

    private Employee $employee;

    protected function setUp(): void
    {
        parent::setUp();

        $office = Office::create([
            'office_code' => 'THEMIS',
            'name' => 'THEMIS株式会社',
            'status' => 'active',
        ]);

        $this->employee = Employee::create([
            'employee_code' => 'TM001',
            'full_name' => 'LE HIEU NGHIA',
            'gender' => 'male',
            'hire_date' => '2026-08-12',
            'office_id' => $office->id,
            'status' => 'active',
        ]);

        $user = User::factory()->create([
            'employee_id' => $this->employee->id,
        ]);

        Sanctum::actingAs($user);
    }

    public function test_outside_schedule_is_recorded_and_closed_when_employee_returns(): void
    {
        $excelService = $this->mock(AttendanceExcelService::class);
        $excelService->shouldReceive('sync')->twice();

        Carbon::setTestNow('2026-08-12 10:00:00');

        $attendance = Attendance::create([
            'employee_id' => $this->employee->id,
            'employee_name' => 'LE HIEU NGHIA',
            'work_date' => '2026-08-12',
            'clock_in' => '2026-08-12 09:00:00',
            'status' => 'working',
        ]);

        $this->patchJson("/api/attendances/{$attendance->id}/status", [
            'status' => 'outside',
            'outside_destination' => '大阪法務局で書類提出',
            'outside_start' => '10:00',
            'outside_expected_end' => '12:00',
        ])
            ->assertOk()
            ->assertJsonPath('attendance.status', 'outside')
            ->assertJsonStructure([
                'attendance' => [
                    'outside_destination',
                    'outside_start',
                    'outside_expected_end',
                ],
            ]);

        $this->assertDatabaseHas('attendances', [
            'id' => $attendance->id,
            'status' => 'outside',
            'outside_destination' => '大阪法務局で書類提出',
            'outside_start' => '2026-08-12 10:00:00',
            'outside_expected_end' => '2026-08-12 12:00:00',
            'outside_end' => null,
        ]);

        Carbon::setTestNow('2026-08-12 11:45:00');

        $this->patchJson("/api/attendances/{$attendance->id}/status", [
            'status' => 'working',
        ])
            ->assertOk()
            ->assertJsonPath('attendance.status', 'working');

        $this->assertDatabaseHas('attendances', [
            'id' => $attendance->id,
            'status' => 'working',
            'outside_end' => '2026-08-12 11:45:00',
        ]);
    }

    public function test_employee_can_go_outside_in_the_same_minute_as_clock_in(): void
    {
        $excelService = $this->mock(AttendanceExcelService::class);
        $excelService->shouldReceive('sync')->once();

        Carbon::setTestNow('2026-08-12 10:00:45');

        $attendance = Attendance::create([
            'employee_id' => $this->employee->id,
            'employee_name' => 'LE HIEU NGHIA',
            'work_date' => '2026-08-12',
            'clock_in' => '2026-08-12 10:00:30',
            'status' => 'working',
        ]);

        $this->patchJson("/api/attendances/{$attendance->id}/status", [
            'status' => 'outside',
            'outside_destination' => '松原市役所',
            'outside_start' => '10:00',
            'outside_expected_end' => '11:00',
        ])
            ->assertOk()
            ->assertJsonPath('attendance.status', 'outside');

        $this->assertDatabaseHas('attendances', [
            'id' => $attendance->id,
            'outside_start' => '2026-08-12 10:00:45',
            'outside_expected_end' => '2026-08-12 11:00:00',
        ]);
    }

    public function test_outside_destination_is_required(): void
    {
        $excelService = $this->mock(AttendanceExcelService::class);
        $excelService->shouldNotReceive('sync');

        $attendance = Attendance::create([
            'employee_id' => $this->employee->id,
            'employee_name' => 'LE HIEU NGHIA',
            'work_date' => '2026-08-12',
            'clock_in' => '2026-08-12 09:00:00',
            'status' => 'working',
        ]);

        $this->patchJson("/api/attendances/{$attendance->id}/status", [
            'status' => 'outside',
            'outside_start' => '10:00',
            'outside_expected_end' => '11:00',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('outside_destination');
    }

    public function test_one_shift_keeps_multiple_breaks_and_outside_periods(): void
    {
        $this->mock(AttendanceExcelService::class)
            ->shouldReceive('sync')
            ->zeroOrMoreTimes();

        Carbon::setTestNow('2026-08-12 09:00:00');
        $attendance = Attendance::create([
            'employee_id' => $this->employee->id,
            'employee_name' => $this->employee->full_name,
            'work_date' => '2026-08-12',
            'clock_in' => now(),
            'status' => 'working',
        ]);

        foreach ([
            ['09:30:00', ['status' => 'break']],
            ['09:45:00', ['status' => 'working']],
            ['11:00:00', ['status' => 'break']],
            ['11:10:00', ['status' => 'working']],
            ['13:00:00', [
                'status' => 'outside',
                'outside_destination' => '大阪法務局',
                'outside_start' => '13:00',
                'outside_expected_end' => '14:00',
            ]],
            ['13:50:00', ['status' => 'working']],
            ['15:00:00', [
                'status' => 'outside',
                'outside_destination' => '松原市役所',
                'outside_start' => '15:00',
                'outside_expected_end' => '16:00',
            ]],
            ['15:40:00', ['status' => 'working']],
        ] as [$time, $payload]) {
            Carbon::setTestNow("2026-08-12 {$time}");
            $this->patchJson("/api/attendances/{$attendance->id}/status", $payload)
                ->assertOk();
        }

        $this->assertDatabaseCount('attendance_periods', 4);
        $this->assertSame(2, $attendance->periods()->where('type', 'break')->count());
        $this->assertSame(2, $attendance->periods()->where('type', 'outside')->count());
        $this->assertSame(
            ['大阪法務局', '松原市役所'],
            $attendance->periods()
                ->where('type', 'outside')
                ->orderBy('started_at')
                ->pluck('destination')
                ->all()
        );
        $this->assertSame(0, $attendance->periods()->whereNull('ended_at')->count());

        $this->getJson('/api/attendances/my-history')
            ->assertOk()
            ->assertJsonPath('attendances.0.break_count', 2)
            ->assertJsonPath('attendances.0.break_minutes', 25)
            ->assertJsonPath('attendances.0.outside_count', 2)
            ->assertJsonPath('attendances.0.outside_minutes', 90);

        $this->getJson('/api/attendances/my-timeline')
            ->assertOk()
            ->assertJsonPath('attendance.id', $attendance->id)
            ->assertJsonPath('summary.break_count', 2)
            ->assertJsonPath('summary.break_seconds', 1500)
            ->assertJsonPath('summary.outside_count', 2)
            ->assertJsonPath('summary.outside_seconds', 5400)
            ->assertJsonPath('summary.work_seconds', 22500)
            ->assertJsonCount(4, 'activities');
    }
}
