<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\Employee;
use App\Models\EmployeeTask;
use App\Models\WorkSession;
use App\Services\AttendanceExcelService;
use App\Services\SecurityAuditLogger;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

class WorkSessionController extends Controller
{
    public function __construct(
        private readonly AttendanceExcelService $attendanceExcelService,
        private readonly SecurityAuditLogger $securityAuditLogger
    ) {}

    public function start(Request $request): JsonResponse
    {
        $employee = $this->authenticatedEmployee($request);
        $validated = $this->validateTask($request);

        $attendance = Attendance::query()->findOrFail(
            $validated['attendance_id']
        );
        $this->authorizeAttendance($attendance, $employee);

        if ($attendance->clock_out !== null) {
            return response()->json([
                'message' => '勤務終了後に作業を登録することはできません。',
            ], 422);
        }

        $now = now();
        $expectedEnd = $this->parseExpectedEnd(
            $validated['expected_end_time'],
            $now
        );

        [$workSession, $completedSessions] = DB::transaction(
            function () use ($attendance, $validated, $now, $expectedEnd) {
                $completedSessions = $attendance->workSessions()
                    ->where('status', 'active')
                    ->lockForUpdate()
                    ->get();

                foreach ($completedSessions as $session) {
                    $session->update([
                        'ended_at' => $now,
                        'status' => 'completed',
                    ]);

                    EmployeeTask::query()
                        ->where('work_session_id', $session->id)
                        ->where('status', 'in_progress')
                        ->update([
                            'status' => 'completed',
                            'completed_at' => $now,
                        ]);
                }

                $workSession = $attendance->workSessions()->create([
                    'task_description' => trim($validated['task_description']),
                    'started_at' => $now,
                    'expected_end_at' => $expectedEnd,
                    'status' => 'active',
                ]);

                return [$workSession, $completedSessions];
            }
        );

        foreach ($completedSessions as $completedSession) {
            $this->syncExcelSafely($completedSession);
        }
        $this->syncExcelSafely($workSession);

        $this->securityAuditLogger->record(
            request: $request,
            event: 'work_session.started',
            outcome: 'success',
            employee: $employee,
            metadata: [
                'attendance_id' => $attendance->id,
                'work_session_id' => $workSession->id,
            ]
        );

        return response()->json([
            'message' => '作業を開始しました。',
            'work_session' => $workSession,
        ], 201);
    }

    public function complete(
        Request $request,
        WorkSession $workSession
    ): JsonResponse {
        $employee = $this->authenticatedEmployee($request);
        $workSession->loadMissing('attendance');
        $this->authorizeAttendance($workSession->attendance, $employee);

        DB::transaction(function () use ($workSession) {
            $now = now();

            if ($workSession->status !== 'completed') {
                $workSession->update([
                    'ended_at' => $now,
                    'status' => 'completed',
                ]);
            }

            EmployeeTask::query()
                ->where('work_session_id', $workSession->id)
                ->where('status', 'in_progress')
                ->update([
                    'status' => 'completed',
                    'completed_at' => $now,
                ]);
        });

        $workSession = $workSession->fresh();
        $this->syncExcelSafely($workSession);

        $this->securityAuditLogger->record(
            request: $request,
            event: 'work_session.completed',
            outcome: 'success',
            employee: $employee,
            metadata: [
                'attendance_id' => $workSession->attendance_id,
                'work_session_id' => $workSession->id,
            ]
        );

        return response()->json([
            'message' => '作業を完了しました。',
            'work_session' => $workSession,
        ]);
    }

    /** @return array{attendance_id: int, task_description: string, expected_end_time: string} */
    private function validateTask(Request $request): array
    {
        return $request->validate([
            'attendance_id' => ['required', 'integer', 'exists:attendances,id'],
            'task_description' => ['required', 'string', 'max:255'],
            'expected_end_time' => ['required', 'date_format:H:i'],
        ], [
            'task_description.required' => '作業内容を入力してください。',
            'expected_end_time.required' => '完了予定時刻を選択してください。',
        ]);
    }

    private function parseExpectedEnd(string $time, Carbon $now): Carbon
    {
        $expectedEnd = Carbon::createFromFormat(
            'Y-m-d H:i',
            $now->toDateString().' '.$time,
            config('app.timezone')
        );

        if ($expectedEnd->lessThanOrEqualTo($now)) {
            $expectedEnd->addDay();
        }

        return $expectedEnd;
    }

    private function authorizeAttendance(
        Attendance $attendance,
        Employee $employee
    ): void {
        if ((int) $attendance->employee_id !== $employee->id) {
            abort(403, '他の社員の作業記録は変更できません。');
        }
    }

    private function authenticatedEmployee(Request $request): Employee
    {
        $employee = $request->user()?->employee;

        if ($employee === null || $employee->status !== 'active') {
            abort(403, 'このアカウントには有効な社員情報がありません。');
        }

        return $employee;
    }

    private function syncExcelSafely(WorkSession $workSession): void
    {
        try {
            $this->attendanceExcelService->syncWorkSession($workSession);
        } catch (Throwable $exception) {
            Log::warning('Work session Excel sync failed.', [
                'work_session_id' => $workSession->id,
                'error' => $exception->getMessage(),
            ]);
        }
    }
}
