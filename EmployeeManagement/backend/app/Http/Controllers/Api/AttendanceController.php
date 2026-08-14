<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\Employee;
use App\Models\WorkSession;
use App\Services\AttendanceExcelService;
use App\Services\PersonalAttendanceReportService;
use App\Services\SecurityAuditLogger;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

class AttendanceController extends Controller
{
    public function __construct(
        private readonly AttendanceExcelService $attendanceExcelService,
        private readonly PersonalAttendanceReportService $personalAttendanceReportService,
        private readonly SecurityAuditLogger $securityAuditLogger
    ) {}

    /** Download the signed-in employee's own attendance workbook. */
    public function personalReport(Request $request): StreamedResponse
    {
        $employee = $this->authenticatedEmployee($request);
        $spreadsheet = $this->personalAttendanceReportService->build($employee);
        $safeEmployeeCode = preg_replace(
            '/[^A-Za-z0-9_-]/',
            '-',
            $employee->employee_code
        ) ?: 'employee';
        $filename = sprintf(
            'attendance-%s-%s.xlsx',
            $safeEmployeeCode,
            now()->format('Ymd-His')
        );

        $this->securityAuditLogger->record(
            request: $request,
            event: 'attendance.personal_report.downloaded',
            outcome: 'success',
            employee: $employee,
            metadata: [
                'filename' => $filename,
            ]
        );

        return response()->streamDownload(
            function () use ($spreadsheet): void {
                $writer = new Xlsx($spreadsheet);
                $writer->save('php://output');
                $spreadsheet->disconnectWorksheets();
            },
            $filename,
            [
                'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Cache-Control' => 'private, no-store, max-age=0',
            ]
        );
    }

    /** Danh sách nhân viên đang hoạt động trong ngày. */
    public function active(Request $request): JsonResponse
    {
        $this->authenticatedEmployee($request);

        $attendances = Attendance::query()
            ->whereNull('clock_out')
            ->whereIn('status', [
                'working',
                'break',
                'outside',
            ])
            ->orderBy('clock_in')
            ->get();

        $attendances->each(
            fn (Attendance $attendance) => $this->attachEmployeeProfile($attendance)
        );

        return response()->json([
            'count' => $attendances->count(),
            'attendances' => $attendances,
        ]);
    }

    /** Bắt đầu làm việc. */
    public function start(Request $request): JsonResponse
    {
        $employee = $this->authenticatedEmployee($request);
        $now = now();

        $existingAttendance = Attendance::query()
            ->where(function ($query) use ($employee) {
                $query
                    ->where('employee_id', $employee->id)
                    ->orWhere(function ($legacyQuery) use ($employee) {
                        $legacyQuery
                            ->whereNull('employee_id')
                            ->where('employee_name', $employee->full_name);
                    });
            })
            ->whereNull('clock_out')
            ->latest('id')
            ->first();

        if ($existingAttendance) {
            if ($existingAttendance->employee_id === null) {
                if (! $this->canClaimLegacyAttendance($existingAttendance, $employee)) {
                    abort(403, 'この勤務記録の所有者を安全に確認できません。');
                }

                $existingAttendance->employee()->associate($employee);
                $existingAttendance->save();
            }

            $this->securityAuditLogger->record(
                request: $request,
                event: 'attendance.start.reused',
                outcome: 'success',
                employee: $employee,
                metadata: [
                    'attendance_id' => $existingAttendance->id,
                ]
            );

            return response()->json([
                'message' => 'すでに勤務を開始しています。',
                'attendance' => $this->attachEmployeeProfile($existingAttendance),
            ]);
        }

        $attendance = Attendance::create([
            'employee_id' => $employee->id,
            'employee_name' => $employee->full_name,
            'work_date' => $now->toDateString(),
            'clock_in' => $now,
            'status' => 'working',
        ]);

        $this->syncExcelSafely($attendance);

        $this->securityAuditLogger->record(
            request: $request,
            event: 'attendance.started',
            outcome: 'success',
            employee: $employee,
            metadata: [
                'attendance_id' => $attendance->id,
            ]
        );

        return response()->json([
            'message' => '勤務を開始しました。',
            'attendance' => $this->attachEmployeeProfile($attendance),
        ], 201);
    }

    /** Thay đổi trạng thái làm việc. */
    public function updateStatus(
        Request $request,
        Attendance $attendance
    ): JsonResponse {
        $employee = $this->authenticatedEmployee($request);

        if (
            $attendance->employee_id === null &&
            $this->canClaimLegacyAttendance($attendance, $employee)
        ) {
            $attendance->employee()->associate($employee);
            $attendance->save();
        }

        if ((int) $attendance->employee_id !== $employee->id) {
            abort(403, '他の社員の勤務記録は変更できません。');
        }

        $validated = $request->validate([
            'status' => [
                'required',
                Rule::in([
                    'working',
                    'break',
                    'outside',
                    'offline',
                ]),
            ],
            'outside_start' => [
                'required_if:status,outside',
                'nullable',
                'date_format:H:i',
            ],
            'outside_expected_end' => [
                'required_if:status,outside',
                'nullable',
                'date_format:H:i',
            ],
            'outside_destination' => [
                'required_if:status,outside',
                'nullable',
                'string',
                'max:255',
            ],
        ]);

        if ($attendance->clock_out !== null) {
            return response()->json([
                'message' => 'この勤務記録はすでに終了しています。',
            ], 422);
        }

        $previousStatus = $attendance->status;
        $newStatus = $validated['status'];
        $now = now();
        $completedWorkSession = null;

        $this->closePreviousStatusPeriod($attendance, $newStatus, $now);

        switch ($newStatus) {
            case 'working':
                $message = '勤務中に変更しました。';
                break;

            case 'break':
                if ($attendance->break_start === null) {
                    $attendance->break_start = $now;
                }

                $message = '休憩を開始しました。';
                break;

            case 'outside':
                [$outsideStart, $outsideExpectedEnd] = $this->parseOutsideTimes(
                    $validated['outside_start'],
                    $validated['outside_expected_end'],
                    $now
                );

                if ($outsideStart->lessThan($attendance->clock_in)) {
                    $isSameMinuteAsClockIn = $outsideStart->format('Y-m-d H:i')
                        === $attendance->clock_in->format('Y-m-d H:i');

                    if (! $isSameMinuteAsClockIn) {
                        return response()->json([
                            'message' => '外出時刻は出勤時刻以降に設定してください。',
                        ], 422);
                    }

                    // Bộ chọn chỉ lưu đến phút. Nếu vừa chấm công và ra
                    // ngoài trong cùng phút thì lấy thời điểm hiện tại.
                    $outsideStart = $now;
                }

                $attendance->outside_start = $outsideStart;
                $attendance->outside_expected_end = $outsideExpectedEnd;
                $attendance->outside_end = null;
                $attendance->outside_destination = trim(
                    $validated['outside_destination']
                );
                $message = '外出中に変更しました。';
                break;

            case 'offline':
                $attendance->clock_out = $now;
                $completedWorkSession = $attendance->activeWorkSession()
                    ->first();

                if ($completedWorkSession !== null) {
                    $completedWorkSession->update([
                        'ended_at' => $now,
                        'status' => 'completed',
                    ]);
                }
                $message = '勤務を終了しました。';
                break;
        }

        $attendance->status = $newStatus;
        $attendance->save();

        $attendance = $attendance->fresh();
        $this->syncExcelSafely($attendance);

        if ($completedWorkSession !== null) {
            $this->syncWorkSessionExcelSafely($completedWorkSession);
        }

        $this->securityAuditLogger->record(
            request: $request,
            event: 'attendance.status.changed',
            outcome: 'success',
            employee: $employee,
            metadata: [
                'attendance_id' => $attendance->id,
                'from_status' => $previousStatus,
                'to_status' => $newStatus,
            ]
        );

        return response()->json([
            'message' => $message,
            'attendance' => $this->attachEmployeeProfile($attendance),
        ]);
    }

    private function closePreviousStatusPeriod(
        Attendance $attendance,
        string $newStatus,
        Carbon $now
    ): void {
        if (
            $attendance->status === 'break' &&
            $newStatus !== 'break' &&
            $attendance->break_start !== null &&
            $attendance->break_end === null
        ) {
            $attendance->break_end = $now;
        }

        if (
            $attendance->status === 'outside' &&
            $newStatus !== 'outside' &&
            $attendance->outside_start !== null &&
            $attendance->outside_end === null
        ) {
            $attendance->outside_end = $now;
        }
    }

    /** @return array{0: Carbon, 1: Carbon} */
    private function parseOutsideTimes(
        string $startTime,
        string $expectedEndTime,
        Carbon $now
    ): array {
        $outsideStart = Carbon::createFromFormat(
            'Y-m-d H:i',
            $now->toDateString().' '.$startTime,
            config('app.timezone')
        );

        $outsideExpectedEnd = Carbon::createFromFormat(
            'Y-m-d H:i',
            $now->toDateString().' '.$expectedEndTime,
            config('app.timezone')
        );

        if ($outsideExpectedEnd->lessThanOrEqualTo($outsideStart)) {
            $outsideExpectedEnd->addDay();
        }

        return [$outsideStart, $outsideExpectedEnd];
    }

    private function attachEmployeeProfile(Attendance $attendance): Attendance
    {
        $attendance->loadMissing([
            'employee:id,employee_code,full_name,full_name_kana,gender,avatar_path',
            'activeWorkSession',
        ]);

        if ($attendance->employee === null) {
            $employee = Employee::query()
                ->where('full_name', $attendance->employee_name)
                ->first([
                    'id',
                    'employee_code',
                    'full_name',
                    'full_name_kana',
                    'gender',
                    'avatar_path',
                ]);

            $attendance->setRelation('employee', $employee);
        }

        return $attendance;
    }

    private function authenticatedEmployee(Request $request): Employee
    {
        $employee = $request->user()?->employee;

        if ($employee === null || $employee->status !== 'active') {
            abort(403, 'このアカウントには有効な社員情報がありません。');
        }

        return $employee;
    }

    private function canClaimLegacyAttendance(
        Attendance $attendance,
        Employee $employee
    ): bool {
        if (
            $attendance->employee_id !== null ||
            $attendance->employee_name !== $employee->full_name
        ) {
            return false;
        }

        return Employee::query()
            ->where('full_name', $employee->full_name)
            ->where('status', 'active')
            ->count() === 1;
    }

    private function syncExcelSafely(Attendance $attendance): void
    {
        try {
            $this->attendanceExcelService->sync($attendance);
        } catch (Throwable $exception) {
            Log::warning('Attendance Excel sync failed.', [
                'attendance_id' => $attendance->id,
                'error' => $exception->getMessage(),
            ]);
        }
    }

    private function syncWorkSessionExcelSafely(
        WorkSession $workSession
    ): void {
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
