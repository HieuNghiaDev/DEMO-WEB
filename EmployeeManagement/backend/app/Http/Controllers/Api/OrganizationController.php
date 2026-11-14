<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\EmployeeNotification;
use App\Models\EmployeeTask;
use App\Models\Office;
use App\Models\Role;
use App\Models\User;
use App\Services\EmployeeCodeGenerator;
use App\Services\SecurityAuditLogger;
use App\Services\TaskVisibility;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use App\Services\Administration\AccountActivationService;
use App\Services\Administration\AdminCapabilities;
use App\Services\Administration\AdminContinuityGuard;
use App\Services\Administration\AdministrativeRoleService;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\Schema;

class OrganizationController extends Controller
{
    public function issueActivationInvite(Request $request, Employee $employee, AccountActivationService $activation): JsonResponse
    {
        $invitation = $activation->issueForAdmin($request->user(), $employee);

        return response()->json([
            'activation_code' => $invitation->tokenForDelivery(),
            'expires_at' => $invitation->expiresAt->toIso8601String(),
        ], 201)->header('Cache-Control', 'no-store, private');
    }

    public function resetPassword(Request $request, Employee $employee): JsonResponse
    {
        $handover = app(\App\Services\Administration\EmployeePasswordReset::class)->reset($request->user(), $employee);
        return response()->json(['message' => '仮パスワードを発行しました。15分以内に本人へ安全に引き渡し、変更してください。', ...$handover])
            ->header('Cache-Control', 'no-store, private');
    }

    public function store(Request $request, EmployeeCodeGenerator $employeeCodeGenerator): JsonResponse
    {
        Gate::authorize('create', Employee::class);
        $validated = $request->validate([
            'employee_code' => ['prohibited'],
            'full_name' => ['required', 'string', 'max:255'],
            'full_name_kana' => ['nullable', 'string', 'max:255'],
            'office_id' => ['required', 'integer', 'exists:offices,id'],
            'position_title' => ['nullable', 'string', 'max:255'],
            'work_email' => [
                'required',
                'email',
                'max:255',
                'unique:employees,work_email',
                'unique:users,email',
            ],
            'gender' => ['nullable', 'string', 'in:male,female,other'],
            'hire_date' => ['required', 'date'],
        ]);

        $employee = DB::transaction(function () use ($validated, $employeeCodeGenerator, $request): Employee {
            $office = Office::query()->findOrFail($validated['office_id']);
            $workEmail = Str::lower($validated['work_email']);

            $employee = Employee::create([
                ...$validated,
                'work_email' => $workEmail,
                'employee_code' => $employeeCodeGenerator->allocate($office),
                'employment_type' => 'full_time',
                'status' => 'active',
            ]);

            $user = $employee->user()->create([
                'login_id' => $employee->employee_code,
                'name' => $employee->full_name,
                'email' => $workEmail,
                'role' => 'employee',
                'is_active' => true,
                'must_change_password' => true,
            ]);
            // No approved new-account bundle/mapping exists yet. Do not infer Level 2
            // from an empty assignment or accept role/lifecycle fields from the client.

            app(SecurityAuditLogger::class)->recordRequired(
                $request->user(), 'administration.employee_created', ['type' => 'employees', 'id' => $employee->id],
                ['target' => ['exists' => false]],
                ['target' => ['user_id' => $user->id, 'employee_id' => $employee->id, 'roles' => [],
                    'permissions' => [], 'active' => true, 'activation_required' => true]],
                ['phase' => Schema::hasTable('security_administration_state') ? 'preparation' : 'legacy_compat',
                    'revision' => Schema::hasTable('security_administration_state') ? DB::table('security_administration_state')->where('id', 1)->value('revision') : 0],
            );

            return $employee;
        });

        return response()->json([
            'message' => '社員と有効化待ちのアカウントを登録しました。承認済みの経路で招待を発行してください。',
            'employee' => $employee->load([
                'office:id,office_code,name,address',
                'user.roles:id,name,display_name',
            ]),
        ], 201);
    }

    public function destroy(Request $request, Employee $employee, SecurityAuditLogger $auditLogger): JsonResponse
    {
        return app(AdminContinuityGuard::class)->run(
            fn () => $this->destroyEmployee($request, $employee, $auditLogger),
            $employee, 'administration.employee_deleted', $request->user(), true,
        );
    }

    private function destroyEmployee(Request $request, Employee $employee, SecurityAuditLogger $auditLogger): JsonResponse
    {
        $actor = $request->user();
        $isAdmin = AdminCapabilities::isCanonicalAdmin($actor);
        abort_unless($isAdmin || $actor->hasAnyRole(['level_4', 'level_5']), 403);
        $targetUser = $employee->user;
        if ($isAdmin) {
            \Illuminate\Support\Facades\Gate::forUser($actor)->authorize('disable', $employee);
            abort_if($targetUser && AdminCapabilities::isProtectedLegalSubject($targetUser), 403);
        }

        if ($targetUser !== null) {
            abort_if($actor->id === $targetUser->id, 403, '自分自身のアカウントは削除できません。');
            abort_if(
                $targetUser->hasRole('level_5') && ! $actor->hasRole('level_5'),
                403,
                'Level 5のアカウントを削除できるのはLevel 5のみです。'
            );

            if ($targetUser->hasRole('level_5')) {
                $levelFiveRole = Role::query()->where('name', 'level_5')->firstOrFail();
                abort_if($levelFiveRole->users()->count() <= 1, 422, '最後のLevel 5は削除できません。');
            }
        }

        $targetUserId = $targetUser?->id;
        $targetLoginId = $targetUser?->login_id ?? $employee->employee_code;
        $targetEmployeeId = $employee->id;

        DB::transaction(function () use ($employee, $targetUser, $targetUserId): void {
            if ($targetUser !== null) {
                $targetUser->tokens()->delete();
                DB::table('sessions')->where('user_id', $targetUserId)->delete();
                $targetUser->delete();
            }

            $employee->update([
                'status' => 'resigned',
                'termination_date' => $employee->termination_date ?? today(),
            ]);
            $employee->delete();
        });

        $auditLogger->record(
            $request,
            'auth.account.deleted_by_manager',
            'success',
            $actor,
            $actor->employee,
            $targetLoginId,
            ['target_employee_id' => $targetEmployeeId]
        );

        return response()->json(['message' => '社員を削除しました。']);
    }

    /**
     * Danh sách toàn bộ nhân viên + phòng ban + trạng thái làm việc hiện tại.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        // Work permissions never grant private read. Resolve fresh explicit eligibility
        // once, then apply the shared subject boundary to every row (default: self only).
        $privateGate = Gate::forUser($user);
        $canViewPrivate = $privateGate->allows('viewPrivateDirectory', Employee::class);
        $canIssueActivationInvites = AdminCapabilities::isCanonicalAdmin($user);
        $onlineUserIds = \App\Services\EmployeeOnlinePresence::userIds();

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
                        ->with('activeWorkSession.employeeTask:id,work_session_id');
                },

                'tasks' => function ($query) use ($user) {
                    $query
                        ->visibleTo($user)
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
            ->get();

        // Reuse the assignment/case scopes unchanged, in bounded batch queries.
        // These ID sets live only in this projection; no cross-request permission cache.
        $attendanceOwners = $employees->filter(fn (Employee $employee) => $employee->attendances->isNotEmpty());
        $visibleAssignees = $attendanceOwners->isEmpty() ? collect() : TaskVisibility::scopeAssignment(Employee::query(), $user, 'id')
            ->whereKey($attendanceOwners->modelKeys())->pluck('id')->flip();
        $sessionTaskIds = $employees->map(fn (Employee $employee) => $employee->attendances->first()
            ?->activeWorkSession?->employeeTask?->id)->filter()->unique()->values();
        $visibleSessionTasks = $sessionTaskIds->isEmpty() ? collect() : EmployeeTask::query()
            ->visibleTo($user)->whereKey($sessionTaskIds)->pluck('id')->flip();

        $employees = $employees->map(function (Employee $employee) use ($canViewPrivate, $canIssueActivationInvites, $privateGate, $onlineUserIds, $visibleAssignees, $visibleSessionTasks) {
                $canViewEmployeePrivate = $canViewPrivate && $privateGate->allows('viewPrivateSubject', $employee);
                $attendance = $employee->attendances->first();
                $quest = $employee->tasks->first();
                $sessionTask = $attendance?->activeWorkSession?->employeeTask;
                if ($attendance?->activeWorkSession && (! $visibleAssignees->has($employee->id)
                    || ($sessionTask !== null && ! $visibleSessionTasks->has($sessionTask->id)))) {
                    $attendance->setRelation('activeWorkSession', null);
                }
                $isOnline = $employee->user !== null && isset($onlineUserIds[$employee->user->id]);
                $workStatus = $isOnline
                    ? ($attendance?->status ?? 'online')
                    : 'offline';

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
                    'can_issue_activation_invite' => $canIssueActivationInvites && $employee->user?->activation_required
                        && $privateGate->allows('issueInviteAsAdmin', $employee),

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
                    'phone' => $canViewEmployeePrivate
                        ? $employee->phone
                        : null,

                    'date_of_birth' => $canViewEmployeePrivate
                        ? $employee->date_of_birth?->toDateString()
                        : null,

                    'nationality_code' => $canViewEmployeePrivate
                        ? $employee->nationality_code
                        : null,

                    'presence_status' => $isOnline ? 'online' : 'offline',

                    // Attendance remains the source for working/break/outside;
                    // browser presence decides whether the employee is offline.
                    'work_status' => $workStatus,

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

                            'current_task' => ! $visibleAssignees->has($employee->id) ? null : ($attendance->activeWorkSession
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
                                    : null)),
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

                'online' => $employees
                    ->where('presence_status', 'online')
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

            'main_roles_enabled' => ($mainRoles = \App\Services\Administration\MainRoles::installed()),
            'available_roles' => $mainRoles
                ? $this->mainRoleOptions($user)
                : ($user->hasPermission('employee.manage_roles')
                ? Role::query()
                    ->select(['id', 'name', 'display_name'])
                    ->when(! $user->hasRole('level_5'), fn ($query) => $query->where('name', '!=', 'developer'))
                    ->orderBy('id')
                    ->get()
                : []),
        ]);
    }

    private function mainRoleOptions(User $user): array
    {
        $assignable = $user->hasPermission('employee.manage_roles')
            ? \App\Services\Administration\MainRoles::assignableNames($user) : [];
        $roles = Role::whereIn('name', \App\Services\Administration\MainRoles::NAMES)->get(['id', 'name', 'display_name'])->keyBy('name');

        return array_map(fn ($name) => [
            ...$roles->get($name)->only(['id', 'name', 'display_name']),
            'assignable' => in_array($name, $assignable, true),
        ], \App\Services\Administration\MainRoles::NAMES);
    }

    public function updateRoles(Request $request, Employee $employee): JsonResponse
    {
        $actor = $request->user();
        if (\App\Services\Administration\MainRoles::installed() && \App\Services\Administration\MainRoles::assigned($actor)) {
            $validated = $request->validate(['role_ids' => ['required', 'array', 'size:1'], 'role_ids.*' => ['integer', 'exists:roles,id']]);
            abort_unless($employee->user, 422);
            app(AdministrativeRoleService::class)->assignMainRole($actor, $employee->user, Role::findOrFail($validated['role_ids'][0]));
            return response()->json(['message' => '権限を更新しました。', 'employee_id' => $employee->id,
                'roles' => $employee->user->roles()->get(['roles.id', 'name', 'display_name'])]);
        }
        if (AdminCapabilities::isCanonicalAdmin($actor)) {
            $validated = $request->validate(['role_ids' => ['required', 'array', 'size:1'], 'role_ids.*' => ['integer', 'distinct', 'exists:roles,id']]);
            abort_unless($employee->user, 422);
            app(AdministrativeRoleService::class)->assign($actor, $employee->user, Role::findOrFail($validated['role_ids'][0]));
            return response()->json(['message' => '権限を更新しました。', 'employee_id' => $employee->id, 'roles' => $employee->user->roles()->get()]);
        }
        return app(AdminContinuityGuard::class)->run(
            fn () => $this->updateLegacyRoles($request, $employee),
            $employee->user ?? $employee, 'administration.roles_assigned', $actor, true,
        );
    }

    private function updateLegacyRoles(Request $request, Employee $employee): JsonResponse
    {
        $actor = $request->user();
        $targetUser = $employee->user;
        abort_if($targetUser && AdminCapabilities::isProtectedLegalSubject($targetUser), 403,
            '法的承認権限の変更には、独立した所有者承認の手続きが必要です。');

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
        abort_if(\App\Services\Administration\MainRoles::installed()
            && ($roleNames->intersect(\App\Services\Administration\MainRoles::NAMES)->isNotEmpty()
                || \App\Services\Administration\MainRoles::assigned($targetUser)), 403);
        abort_if($roleNames->intersect(['admin', 'verified_lawyer'])->isNotEmpty(), 403, 'Protected roles require an independent approved workflow.');
        $grantNames = Role::whereIn('id', $roles->pluck('id'))->with('permissions')->get()
            ->flatMap(fn (Role $role) => $role->permissions->pluck('name'));
        abort_if($grantNames->intersect([
            'employee.view_private', 'employee.verify_lawyer', 'document.approve_legal', 'document.review_internal',
            'employee.activation.manage', 'employee.reset_password', 'audit.view', 'settings.manage', 'case.manage_access',
        ])->isNotEmpty(), 403, 'Protected grants cannot be assigned through a legacy role alias.');
        abort_if($grantNames->intersect(['developer.view', 'developer.release.manage'])->isNotEmpty() && ! $actor->hasRole('level_5'), 403);
        // Continuity validation is kept distinct from legacy Level rules and returns the contract 422.
        if (AdminCapabilities::isCanonicalAdmin($targetUser)) {
            throw ValidationException::withMessages(['admin' => 'A verified replacement administrator is required.']);
        }
        $isGrantingLevelFive = $roleNames->contains('level_5');
        $isGrantingDeveloper = $roleNames->contains('developer');
        $superAdminRole = Role::query()
            ->where('name', 'level_5')
            ->firstOrFail();

        abort_if(
            ($isGrantingLevelFive || $isGrantingDeveloper) && ! $actor->hasRole('level_5'),
            403,
            'Level 5または開発者権限を付与できるのはLevel 5のユーザーのみです。'
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
        Gate::authorize('updateWorkData', $employee);
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
