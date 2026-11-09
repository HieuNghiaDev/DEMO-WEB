<?php

namespace App\Services;

use App\Models\CaseDocument;
use App\Models\CaseTask;
use App\Models\EmployeeTask;
use App\Models\User;
use Illuminate\Support\Facades\DB;

final class NotificationTaskSummary
{
    public function forUser(User $user, ?int $page): array
    {
        if (! $user->employee_id) {
            return ['items' => [], 'has_more' => false];
        }

        $employee = EmployeeTask::query()->visibleTo($user)->where('employee_id', $user->employee_id)
            ->when(! $user->hasPermission('task.view_own'), fn ($query) => $query->whereRaw('1 = 0'))
            ->when($page === null, fn ($query) => $query->whereIn('status', ['pending', 'accepted', 'in_progress']))
            ->selectRaw("'employee' AS domain, id, title, description, status, due_at, created_at, case_document_id")
            ->addSelect(['case_id' => CaseDocument::query()->withTrashed()->select('case_file_id')
                ->whereColumn('case_documents.id', 'employee_tasks.case_document_id')->limit(1)])
            ->selectRaw('NULL AS priority');
        $case = CaseTask::query()->visibleTo($user)->where('assigned_employee_id', $user->employee_id)
            ->when($page === null, fn ($query) => $query->whereIn('status', CaseTask::ACTIVE_STATUSES))
            ->selectRaw("'case' AS domain, id, title, description, status, due_at, created_at, case_document_id, case_file_id AS case_id, priority");
        $now = now();
        $limit = $page === null ? 5 : 20;
        $tasks = DB::query()->fromSub($employee->toBase()->unionAll($case->toBase()), 'my_tasks')
            ->selectRaw("my_tasks.*, CASE WHEN status IN ('completed', 'cancelled') THEN 4 WHEN due_at < ? THEN 0 WHEN due_at <= ? THEN 1 WHEN status IN ('pending', 'unaccepted') THEN 2 ELSE 3 END AS attention",
                [$now, $now->copy()->addDay()])
            ->orderBy('attention')
            ->orderByRaw('CASE WHEN due_at IS NULL THEN 1 ELSE 0 END')
            ->orderBy('due_at')->latest('created_at')->orderBy('domain')->orderByDesc('id')
            ->offset($page === null ? 0 : ($page - 1) * $limit)->limit($limit + 1)->get();

        return [
            'items' => $tasks->take($limit)->map(function ($task) {
                $task->due_at = $task->due_at === null ? null : \Illuminate\Support\Carbon::parse($task->due_at)->toISOString();

                return $task;
            })->values()->all(),
            'has_more' => $tasks->count() > $limit,
        ];
    }
}
