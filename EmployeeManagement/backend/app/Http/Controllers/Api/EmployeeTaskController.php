<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\EmployeeTask;
use App\Models\Attendance;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class EmployeeTaskController extends Controller
{
    public function store(Request $request, Employee $employee): JsonResponse
    {
        abort_unless(
            in_array($request->user()->role, ['manager', 'admin'], true),
            403,
            '業務を依頼する権限がありません。'
        );

        abort_unless(
            $employee->status === 'active',
            422,
            '在籍中の社員にのみ業務を依頼できます。'
        );

        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'duration_minutes' => [
                'required',
                'integer',
                Rule::in([30, 60, 120]),
            ],
        ]);

        $task = EmployeeTask::create([
            'employee_id' => $employee->id,
            'assigned_by' => $request->user()->id,
            'title' => trim($validated['title']),
            'description' => isset($validated['description'])
                ? trim($validated['description'])
                : null,
            'duration_minutes' => $validated['duration_minutes'],
            'status' => 'pending',
        ]);

        return response()->json([
            'message' => '業務を依頼しました。',
            'task' => $task,
        ], 201);
    }

    public function myTasks(Request $request): JsonResponse
    {
        $employee = $request->user()->employee;

        if (!$employee) {
            return response()->json([
                'tasks' => [],
            ]);
        }

        $tasks = EmployeeTask::query()
            ->where('employee_id', $employee->id)
            ->whereIn('status', [
                'pending',
                'accepted',
                'in_progress',
            ])
            ->orderByRaw("CASE status WHEN 'in_progress' THEN 0 WHEN 'pending' THEN 1 WHEN 'accepted' THEN 2 ELSE 3 END")
            ->latest('id')
            ->get();

        return response()->json([
            'tasks' => $tasks,
        ]);
    }

    public function accept(Request $request, EmployeeTask $task): JsonResponse
    {
        $this->authorizeTaskOwner($request, $task);

        abort_unless(
            $task->status === 'pending',
            422,
            'この業務はすでに確認済みです。'
        );

        $task->update([
            'status' => 'accepted',
            'accepted_at' => now(),
        ]);

        return response()->json([
            'message' => '業務を確認しました。',
            'task' => $task,
        ]);
    }

    /** Start or complete a task that belongs to the signed-in employee. */
    public function updateStatus(
        Request $request,
        EmployeeTask $task
    ): JsonResponse {
        $employee = $this->authorizeTaskOwner($request, $task);

        $validated = $request->validate([
            'status' => [
                'required',
                Rule::in(['in_progress', 'completed']),
            ],
        ]);

        $nextStatus = $validated['status'];

        if ($nextStatus === 'in_progress') {
            $task = $this->startTaskWorkSession($task, $employee);
        }

        if ($nextStatus === 'completed') {
            $task = $this->completeTaskWorkSession($task);
        }

        return response()->json([
            'message' => $nextStatus === 'completed'
                ? '業務を完了しました。'
                : '業務を開始しました。',
            'task' => $task,
        ]);
    }

    private function startTaskWorkSession(
        EmployeeTask $task,
        Employee $employee
    ): EmployeeTask {
        return DB::transaction(function () use ($task, $employee) {
            $task = EmployeeTask::query()
                ->lockForUpdate()
                ->findOrFail($task->id);

            abort_unless(
                $task->status === 'accepted',
                422,
                '確認済みの業務のみ開始できます。'
            );

            $attendance = Attendance::query()
                ->where('employee_id', $employee->id)
                ->whereNull('clock_out')
                ->latest('id')
                ->lockForUpdate()
                ->first();

            abort_unless(
                $attendance !== null,
                422,
                '業務を開始する前に勤務を開始してください。'
            );

            $now = now();
            $attendance->workSessions()
                ->where('status', 'active')
                ->lockForUpdate()
                ->get()
                ->each(fn ($session) => $session->update([
                    'ended_at' => $now,
                    'status' => 'completed',
                ]));

            $acceptedAt = $task->accepted_at ?? $now;
            $workSession = $attendance->workSessions()->create([
                'task_description' => $task->title,
                'started_at' => $now,
                'expected_end_at' => $acceptedAt->copy()
                    ->addMinutes($task->duration_minutes),
                'status' => 'active',
            ]);

            $task->update([
                'status' => 'in_progress',
                'work_session_id' => $workSession->id,
            ]);

            return $task->fresh();
        });
    }

    private function completeTaskWorkSession(EmployeeTask $task): EmployeeTask
    {
        return DB::transaction(function () use ($task) {
            $task = EmployeeTask::query()
                ->with('workSession')
                ->lockForUpdate()
                ->findOrFail($task->id);

            abort_unless(
                $task->status === 'in_progress',
                422,
                '開始中の業務のみ完了できます。'
            );

            $now = now();

            if ($task->workSession?->status === 'active') {
                $task->workSession->update([
                    'ended_at' => $now,
                    'status' => 'completed',
                ]);
            }

            $task->update([
                'status' => 'completed',
                'completed_at' => $now,
            ]);

            return $task->fresh();
        });
    }

    private function authorizeTaskOwner(
        Request $request,
        EmployeeTask $task
    ): Employee {
        $employee = $request->user()->employee;

        abort_unless(
            $employee && $employee->status === 'active'
                && $task->employee_id === $employee->id,
            403,
            '他の社員の業務は変更できません。'
        );

        return $employee;
    }
}
