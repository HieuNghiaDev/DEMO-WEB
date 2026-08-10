<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Services\AttendanceExcelService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AttendanceController extends Controller
{
    public function __construct(
        private readonly AttendanceExcelService $attendanceExcelService
    ) {
    }

    /**
     * Danh sách nhân viên đang làm việc hoặc đang nghỉ.
     */
    public function active(): JsonResponse
    {
        $attendances = Attendance::query()
            ->whereNull('clock_out')
            ->whereIn('status', [
                'working',
                'break',
            ])
            ->orderBy('clock_in')
            ->get();

        return response()->json([
            'count' => $attendances->count(),
            'attendances' => $attendances,
        ]);
    }

    /**
     * Bắt đầu làm việc.
     */
    public function start(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'employee_name' => [
                'required',
                'string',
                'max:255',
            ],
        ]);

        // Kiểm tra người này có phiên làm việc chưa kết thúc hay không.
        $existingAttendance = Attendance::query()
            ->where('employee_name', $validated['employee_name'])
            ->whereNull('clock_out')
            ->latest('id')
            ->first();

        if ($existingAttendance) {
            return response()->json([
                'message' => 'すでに勤務を開始しています。',
                'attendance' => $existingAttendance,
            ], 409);
        }

        $now = now();

        $attendance = Attendance::create([
            'employee_name' => $validated['employee_name'],
            'work_date' => $now->toDateString(),
            'clock_in' => $now,
            'status' => 'working',
        ]);

        $this->attendanceExcelService->sync($attendance);

        return response()->json([
            'message' => '勤務を開始しました。',
            'attendance' => $attendance,
        ], 201);
    }

    /**
     * Thay đổi trạng thái làm việc.
     */
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
                    'offline',
                ]),
            ],
        ]);

        if ($attendance->clock_out !== null) {
            return response()->json([
                'message' => 'この勤務記録はすでに終了しています。',
            ], 422);
        }

        $newStatus = $validated['status'];
        $now = now();

        switch ($newStatus) {
            case 'working':
                // Nếu quay lại làm việc sau khi nghỉ.
                if (
                    $attendance->status === 'break' &&
                    $attendance->break_start !== null &&
                    $attendance->break_end === null
                ) {
                    $attendance->break_end = $now;
                }

                $message = '勤務中に変更しました。';
                break;

            case 'break':
                // Chỉ ghi giờ nghỉ nếu chưa được ghi trước đó.
                if ($attendance->break_start === null) {
                    $attendance->break_start = $now;
                }

                $message = '休憩を開始しました。';
                break;

            case 'offline':
                // Nếu tan làm khi vẫn đang nghỉ thì kết thúc giờ nghỉ.
                if (
                    $attendance->status === 'break' &&
                    $attendance->break_end === null
                ) {
                    $attendance->break_end = $now;
                }

                $attendance->clock_out = $now;
                $message = '勤務を終了しました。';
                break;
        }

        $attendance->status = $newStatus;
        $attendance->save();

        $attendance = $attendance->fresh();
        $this->attendanceExcelService->sync($attendance);

        return response()->json([
            'message' => $message,
            'attendance' => $attendance,
        ]);
    }
}