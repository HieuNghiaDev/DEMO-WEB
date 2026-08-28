<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\EmployeeNotification;
use App\Models\Role;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use App\Services\SecurityAuditLogger;

class OrganizationController extends Controller
{
    public function resetPassword(Request $request, Employee $employee, SecurityAuditLogger $auditLogger): JsonResponse
    {
        $actor = $request->user();
        abort_unless($actor?->hasAnyRole(['level_4', 'level_5']), 403, 'Level 4以上の権限が必要です。');

        $targetUser = $employee->user;
        abort_unless($targetUser !== null, 422, 'この社員にはログインアカウントがありません。');
        abort_if($actor->id === $targetUser->id, 403, '自分のパスワードはパスワード変更画面から更新してください。');
        abort_if($targetUser->hasRole('level_5') && ! $actor->hasRole('level_5'), 403, 'Level 5のパスワードをリセットできるのはLevel 5のみです。');

        $temporaryPassword = Str::upper(Str::random(4)).Str::lower(Str::random(4)).Str::random(3).'!';

        $targetUser->forceFill(['password' => Hash::make($temporaryPassword), 'must_change_password' => true])->save();
        $targetUser->tokens()->delete();
        $auditLogger->record($request, 'auth.password.reset_by_manager', 'success', $actor, $actor->employee, $targetUser->login_id, ['target_employee_id' => $employee->id]);

        return response()->json(['message' => '仮パスワードを生成しました。本人は次回ログイン時に変更が必要です。', 'temporary_password' => $temporaryPassword]);
    }
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'employee_code' => ['required', 'string', 'max:50', 'unique:employees,employee_code'],
            'full_name' => ['required', 'string', 'max:255'],
            'full_name_kana' => ['nullable', 'string', 'max:255'],
            'office_id' => ['required', 'integer', 'exists:offices,id'],
            'position_title' => ['nullable', 'string', 'max:255'],
            'work_email' => ['nullable', 'email', 'max:255', 'unique:employees,work_email'],
            'gender' => ['nullable', 'string', 'in:male,female,other'],
            'hire_date' => ['required', 'date'],
        ]);

        $employee = Employee::create([
            ...$validated,
            'employment_type' => 'full_time',
            'status' => 'active',
        ]);

        return response()->json([
            'message' => '社員を登録しました。',
            'employee' => $employee->load('office:id,office_code,name,address'),
        ], 201);
    }

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
        $canViewPrivate = $user->hasPermission('employee.update');

        $employees = Employee::query()
            ->with([
                'office:id,office_code,name,address',

                'department:id,department_code,name',

                'user.roles:id,name,display_name',

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

                    'user_id' => $employee->user?->id,

                    'roles' => $employee->user?->roles
                        ->map(fn (Role $role) => [
                            'id' => $role->id,
                            'name' => $role->name,
                            'display_name' => $role->display_name,
                        ])
                        ->values()
                        ->all() ?? [],

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

                            'outside_destination' => $attendance->outside_destination,

                            'outside_start' => $attendance->outside_start,

                            'outside_expected_end' => $attendance->outside_expected_end,

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

            'available_roles' => $user->hasPermission('employee.manage_roles')
                ? Role::query()
                    ->select(['id', 'name', 'display_name'])
                    ->orderBy('id')
                    ->get()
                : [],
        ]);
    }

    public function updateRoles(Request $request, Employee $employee): JsonResponse
    {
        $actor = $request->user();
        $targetUser = $employee->user;

        abort_unless(
            $targetUser !== null,
            422,
            'この社員にはログインアカウントがありません。'
        );

        abort_if(
            $actor->id === $targetUser->id,
            403,
            '自分自身の権限は変更できません。'
        );

        $validated = $request->validate([
            'role_ids' => ['required', 'array', 'size:1'],
            'role_ids.*' => ['integer', 'distinct', 'exists:roles,id'],
        ]);

        $roles = Role::query()
            ->whereIn('id', $validated['role_ids'])
            ->get(['id', 'name']);
        $roleNames = $roles->pluck('name');
        $isGrantingLevelFive = $roleNames->contains('level_5');
        $superAdminRole = Role::query()
            ->where('name', 'level_5')
            ->firstOrFail();

        abort_if(
            $isGrantingLevelFive && ! $actor->hasRole('level_5'),
            403,
            'Level 5を付与できるのはLevel 5のユーザーのみです。'
        );

        $isRemovingLastSuperAdmin = $targetUser->hasRole('level_5')
            && ! $isGrantingLevelFive
            && $superAdminRole->users()->count() <= 1;

        abort_if(
            $isRemovingLastSuperAdmin,
            422,
            '最後のLevel 5は変更できません。'
        );

        $targetUser->roles()->sync($roles->pluck('id')->all());

        // Legacy column stays in place until old clients no longer depend on it.
        $targetUser->update([
            'role' => match (true) {
                $roleNames->contains('level_5') => 'admin',
                $roleNames->contains('level_4') => 'manager',
                $roleNames->contains('level_3') => 'lawyer',
                $roleNames->contains('level_1') => 'part_time',
                default => 'employee',
            },
        ]);

        EmployeeNotification::create([
            'user_id' => $targetUser->id,
            'kind' => 'info',
            'title' => '権限が更新されました',
            'message' => 'アカウントの役割が管理者によって更新されました。',
            'data' => [
                'role_names' => $roleNames->values()->all(),
            ],
        ]);

        $targetUser->load('roles:id,name,display_name');

        return response()->json([
            'message' => '権限を更新しました。',
            'employee_id' => $employee->id,
            'roles' => $targetUser->roles,
        ]);
    }

    public function updateEmployment(Request $request, Employee $employee): JsonResponse
    {
        $validated = $request->validate([
            'employment_type' => ['required', 'string', 'in:full_time,part_time,contract,intern'],
        ]);

        $employmentType = $validated['employment_type'];
        $employmentLabel = match ($employmentType) {
            'full_time' => '正社員',
            'part_time' => 'アルバイト',
            'contract' => '契約社員',
            'intern' => 'インターン',
        };
        $updates = ['employment_type' => $employmentType];

        // Keep legacy generic titles in sync without overwriting professional titles.
        if ($employee->position_title === null || in_array($employee->position_title, [
            '社員',
            '正社員',
            'アルバイト',
            '契約社員',
            'インターン',
        ], true)) {
            $updates['position_title'] = $employmentLabel;
        }

        $employee->update($updates);

        if ($employee->user) {
            EmployeeNotification::query()->create([
                'user_id' => $employee->user->id,
                'kind' => 'info',
                'title' => '雇用区分が更新されました',
                'message' => "雇用区分が「{$employmentLabel}」に更新されました。",
                'data' => [
                    'employee_id' => $employee->id,
                    'employment_type' => $employmentType,
                ],
            ]);
        }

        return response()->json([
            'message' => '雇用区分を更新しました。',
            'employee' => [
                'id' => $employee->id,
                'position_title' => $employee->position_title,
                'employment_type' => $employee->employment_type,
            ],
        ]);
    }
}
