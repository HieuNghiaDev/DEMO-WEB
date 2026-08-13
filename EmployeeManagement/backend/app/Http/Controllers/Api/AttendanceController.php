<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\Employee;
use App\Services\AttendanceExcelService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use Throwable;

class AttendanceController extends Controller
{
    public function __construct(
        private readonly AttendanceExcelService $attendanceExcelService
    ) {}

    /** Danh sách nhân viên đang hoạt động trong ngày. */
    public function active(): JsonResponse
    {
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
        $validated = $request->validate([
            'employee_name' => [
                'required',
                'string',
                'max:255',
            ],
        ]);

        $employee = Employee::query()
            ->where('full_name', $validated['employee_name'])
            ->where('status', 'active')
            ->first();

        $existingAttendance = Attendance::query()
            ->where('employee_name', $validated['employee_name'])
            ->whereNull('clock_out')
            ->latest('id')
            ->first();

        if ($existingAttendance) {
            if ($existingAttendance->employee_id === null && $employee !== null) {
                $existingAttendance->employee()->associate($employee);
                $existingAttendance->save();
            }

            return response()->json([
                'message' => 'すでに勤務を開始しています。',
                'attendance' => $this->attachEmployeeProfile($existingAttendance),
            ]);
        }

        $now = now();

        $attendance = Attendance::create([
            'employee_id' => $employee?->id,
            'employee_name' => $validated['employee_name'],
            'work_date' => $now->toDateString(),
            'clock_in' => $now,
            'status' => 'working',
        ]);

        $this->syncExcelSafely($attendance);

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
        ]);

        if ($attendance->clock_out !== null) {
            return response()->json([
                'message' => 'この勤務記録はすでに終了しています。',
            ], 422);
        }

        $newStatus = $validated['status'];
        $now = now();

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
                $message = '外出中に変更しました。';
                break;

            case 'offline':
                $attendance->clock_out = $now;
                $message = '勤務を終了しました。';
                break;
        }

        $attendance->status = $newStatus;
        $attendance->save();

        $attendance = $attendance->fresh();
        $this->syncExcelSafely($attendance);

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
}
