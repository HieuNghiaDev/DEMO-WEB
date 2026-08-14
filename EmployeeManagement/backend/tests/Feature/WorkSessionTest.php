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

class WorkSessionTest extends TestCase
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
            'hire_date' => '2026-08-13',
            'office_id' => $office->id,
            'status' => 'active',
        ]);

        Sanctum::actingAs(User::factory()->create([
            'employee_id' => $this->employee->id,
        ]));
    }

    public function test_employee_registers_first_task_after_attendance_starts(): void
    {
        $excelService = $this->mock(AttendanceExcelService::class);
        $excelService->shouldReceive('sync')->once();
        $excelService->shouldReceive('syncWorkSession')->once();

        Carbon::setTestNow('2026-08-13 09:00:00');

        $startResponse = $this->postJson('/api/attendances/start')
            ->assertCreated()
            ->assertJsonPath('attendance.active_work_session', null);

        $this->assertDatabaseCount('work_sessions', 0);

        $this->postJson('/api/work-sessions', [
            'attendance_id' => $startResponse->json('attendance.id'),
            'task_description' => '契約書の確認',
            'expected_end_time' => '10:00',
        ])
            ->assertCreated()
            ->assertJsonPath('work_session.task_description', '契約書の確認')
            ->assertJsonPath('work_session.status', 'active');

        $this->assertDatabaseHas('work_sessions', [
            'task_description' => '契約書の確認',
            'started_at' => '2026-08-13 09:00:00',
            'expected_end_at' => '2026-08-13 10:00:00',
            'status' => 'active',
        ]);
    }

    public function test_starting_a_new_task_completes_the_previous_task(): void
    {
        $excelService = $this->mock(AttendanceExcelService::class);
        $excelService->shouldReceive('syncWorkSession')->twice();

        $attendance = $this->createAttendance();
        $previousSession = $attendance->workSessions()->create([
            'task_description' => 'メール確認',
            'started_at' => '2026-08-13 09:00:00',
            'expected_end_at' => '2026-08-13 09:30:00',
            'status' => 'active',
        ]);

        Carbon::setTestNow('2026-08-13 09:20:00');

        $response = $this->postJson('/api/work-sessions', [
            'attendance_id' => $attendance->id,
            'task_description' => '契約書の作成',
            'expected_end_time' => '11:00',
        ])
            ->assertCreated()
            ->assertJsonPath('work_session.task_description', '契約書の作成')
            ->assertJsonPath('work_session.status', 'active');

        $this->assertDatabaseHas('work_sessions', [
            'id' => $previousSession->id,
            'ended_at' => '2026-08-13 09:20:00',
            'status' => 'completed',
        ]);
        $this->assertDatabaseHas('work_sessions', [
            'id' => $response->json('work_session.id'),
            'attendance_id' => $attendance->id,
            'status' => 'active',
        ]);
    }

    public function test_employee_can_complete_the_current_task(): void
    {
        $excelService = $this->mock(AttendanceExcelService::class);
        $excelService->shouldReceive('syncWorkSession')->once();

        $attendance = $this->createAttendance();
        $workSession = $attendance->workSessions()->create([
            'task_description' => '契約書の確認',
            'started_at' => '2026-08-13 09:00:00',
            'expected_end_at' => '2026-08-13 10:00:00',
            'status' => 'active',
        ]);

        Carbon::setTestNow('2026-08-13 09:45:00');

        $this->patchJson("/api/work-sessions/{$workSession->id}/complete")
            ->assertOk()
            ->assertJsonPath('work_session.status', 'completed')
            ->assertJsonPath(
                'work_session.ended_at',
                '2026-08-13T00:45:00.000000Z'
            );

        $this->assertDatabaseHas('work_sessions', [
            'id' => $workSession->id,
            'ended_at' => '2026-08-13 09:45:00',
            'status' => 'completed',
        ]);
    }

    public function test_employee_cannot_change_another_employees_task(): void
    {
        $otherEmployee = Employee::create([
            'employee_code' => 'TM002',
            'full_name' => 'TRINH THI THU HUONG',
            'gender' => 'female',
            'hire_date' => '2026-08-13',
            'office_id' => $this->employee->office_id,
            'status' => 'active',
        ]);
        $otherAttendance = Attendance::create([
            'employee_id' => $otherEmployee->id,
            'employee_name' => $otherEmployee->full_name,
            'work_date' => '2026-08-13',
            'clock_in' => '2026-08-13 09:00:00',
            'status' => 'working',
        ]);

        $this->postJson('/api/work-sessions', [
            'attendance_id' => $otherAttendance->id,
            'task_description' => '不正な作業',
            'expected_end_time' => '11:00',
        ])
            ->assertForbidden()
            ->assertJsonPath('message', '他の社員の作業記録は変更できません。');

        $this->assertDatabaseMissing('work_sessions', [
            'attendance_id' => $otherAttendance->id,
        ]);
    }

    public function test_missing_work_session_returns_a_safe_message(): void
    {
        $this->patchJson('/api/work-sessions/999999/complete')
            ->assertNotFound()
            ->assertJsonPath(
                'message',
                '対象の作業はすでに削除されたか、完了しています。'
            );
    }

    private function createAttendance(): Attendance
    {
        return Attendance::create([
            'employee_id' => $this->employee->id,
            'employee_name' => $this->employee->full_name,
            'work_date' => '2026-08-13',
            'clock_in' => '2026-08-13 09:00:00',
            'status' => 'working',
        ]);
    }
}
