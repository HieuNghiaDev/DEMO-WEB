<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OrganizationController extends Controller
{
    /**
     * Danh sách toàn bộ nhân viên + phòng ban + trạng thái làm việc hiện tại.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        /*
         * Chỉ manager/admin mới xem dữ liệu cá nhân nhạy cảm.
         *
         * Employee thường vẫn xem được:
         * - tên
         * - mã nhân viên
         * - phòng ban
         * - chức vụ
         * - trạng thái làm việc
         * - công việc hiện tại
         */
        $canViewPrivate = in_array(
            $user->role,
            ['manager', 'admin'],
            true
        );

        $employees = Employee::query()
            ->with([
                'office:id,office_code,name,address',

                'department:id,department_code,name',

                'attendances' => function ($query) {
                    $query
                        ->select([
                            'id',
                            'employee_id',
                            'work_date',
                            'clock_in',
                            'break_start',
                            'break_end',
                            'outside_destination',
                            'outside_start',
                            'outside_expected_end',
                            'outside_end',
                            'clock_out',
                            'status',
                        ])
                        ->whereNull('clock_out')
                        ->whereIn('status', [
                            'working',
                            'break',
                            'outside',
                        ])
                        ->orderByDesc('clock_in')
                        ->with('activeWorkSession');
                },

                'tasks' => function ($query) {
                    $query
                        ->select([
                            'id',
                            'employee_id',
                            'title',
                            'status',
                            'due_at',
                            'accepted_at',
                        ])
                        ->whereIn('status', [
                            'pending',
                            'accepted',
                            'in_progress',
                        ])
                        ->orderByRaw("CASE status WHEN 'in_progress' THEN 0 WHEN 'accepted' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END")
                        ->latest('id');
                },
            ])
            ->orderBy('office_id')
            ->orderBy('department_id')
            ->orderBy('full_name')
            ->get()
            ->map(function (Employee $employee) use ($canViewPrivate) {
                $attendance = $employee->attendances->first();
                $quest = $employee->tasks->first();

                return [
                    'id' => $employee->id,

                    'employee_code' => $employee->employee_code,

                    'full_name' => $employee->full_name,

                    'full_name_kana' => $employee->full_name_kana,

                    'gender' => $employee->gender,

                    'position_title' => $employee->position_title,

                    'employment_type' => $employee->employment_type,

                    'work_email' => $employee->work_email,

                    'avatar_path' => $employee->avatar_path,

                    'employee_status' => $employee->status,

                    'hire_date' => $employee->hire_date?->toDateString(),

                    'office' => $employee->office
                        ? [
                            'id' => $employee->office->id,
                            'office_code' => $employee->office->office_code,
                            'name' => $employee->office->name,
                            'address' => $employee->office->address,
                        ]
                        : null,

                    'department' => $employee->department
                        ? [
                            'id' => $employee->department->id,
                            'department_code' => $employee->department->department_code,
                            'name' => $employee->department->name,
                        ]
                        : null,

                    /*
                     * Dữ liệu riêng tư.
                     * Employee thường không nhận các giá trị này.
                     */
                    'phone' => $canViewPrivate
                        ? $employee->phone
                        : null,

                    'date_of_birth' => $canViewPrivate
                        ? $employee->date_of_birth?->toDateString()
                        : null,

                    'nationality_code' => $canViewPrivate
                        ? $employee->nationality_code
                        : null,

                    /*
                     * Nếu không có attendance đang mở
                     * => offline.
                     */
                    'work_status' => $attendance?->status ?? 'offline',

                    'attendance' => $attendance
                        ? [
                            'id' => $attendance->id,

                            'clock_in' => $attendance->clock_in,

                            'break_start' => $attendance->break_start,

                            'break_end' => $attendance->break_end,

                            'outside_destination' =>
                                $attendance->outside_destination,

                            'outside_start' =>
                                $attendance->outside_start,

                            'outside_expected_end' =>
                                $attendance->outside_expected_end,

                            'status' => $attendance->status,

                            'current_task' => $attendance->activeWorkSession
                                ? [
                                    'id' => $attendance->activeWorkSession->id,
                                    'task_description' => $attendance->activeWorkSession->task_description,
                                    'status' => 'in_progress',
                                    'started_at' => $attendance->activeWorkSession->started_at,
                                    'expected_end_at' => $attendance->activeWorkSession->expected_end_at,
                                ]
                                : ($quest
                                    ? [
                                        'id' => $quest->id,
                                        'task_description' => $quest->title,
                                        'status' => $quest->status,
                                        'started_at' => $quest->accepted_at,
                                        'expected_end_at' => $quest->due_at,
                                    ]
                                    : null),
                        ]
                        : null,
                ];
            });

        return response()->json([
            'summary' => [
                'total' => $employees->count(),

                'working' => $employees
                    ->where('work_status', 'working')
                    ->count(),

                'break' => $employees
                    ->where('work_status', 'break')
                    ->count(),

                'outside' => $employees
                    ->where('work_status', 'outside')
                    ->count(),

                'offline' => $employees
                    ->where('work_status', 'offline')
                    ->count(),
            ],

            'employees' => $employees->values(),
        ]);
    }
}
