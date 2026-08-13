<?php

namespace Tests\Feature;

use App\Services\AttendanceExcelService;
use App\Models\Attendance;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AttendanceOutsideStatusTest extends TestCase
{
    use RefreshDatabase;

    public function test_outside_schedule_is_recorded_and_closed_when_employee_returns(): void
    {
        $excelService = $this->mock(AttendanceExcelService::class);
        $excelService->shouldReceive('sync')->twice();

        Carbon::setTestNow('2026-08-12 10:00:00');

        $attendance = Attendance::create([
            'employee_name' => 'LE HIEU NGHIA',
            'work_date' => '2026-08-12',
            'clock_in' => '2026-08-12 09:00:00',
            'status' => 'working',
        ]);

        $this->patchJson("/api/attendances/{$attendance->id}/status", [
            'status' => 'outside',
            'outside_start' => '10:00',
            'outside_expected_end' => '12:00',
        ])
            ->assertOk()
            ->assertJsonPath('attendance.status', 'outside')
            ->assertJsonStructure([
                'attendance' => [
                    'outside_start',
                    'outside_expected_end',
                ],
            ]);

        $this->assertDatabaseHas('attendances', [
            'id' => $attendance->id,
            'status' => 'outside',
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
            'employee_name' => 'LE HIEU NGHIA',
            'work_date' => '2026-08-12',
            'clock_in' => '2026-08-12 10:00:30',
            'status' => 'working',
        ]);

        $this->patchJson("/api/attendances/{$attendance->id}/status", [
            'status' => 'outside',
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
}
