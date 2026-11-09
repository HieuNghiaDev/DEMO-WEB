<?php

namespace App\AI\Tools;

use App\Models\CaseFile;
use App\Models\CaseTask;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class QueryCaseTasksTool implements Tool
{
    public const FORBIDDEN_SCOPE = 'このタスク情報を閲覧する権限がありません。';

    public const FORBIDDEN_EMPLOYEE = '他の社員のタスクを閲覧する権限がありません。';

    public function definition(): array
    {
        return [
            'name' => 'query_case_tasks',
            'description' => 'Read authorized case tasks for the authenticated employee, a permitted case, upcoming deadlines, or overdue work.',
            'input_schema' => [
                'type' => 'object',
                'properties' => [
                    'scope' => ['type' => 'string', 'enum' => ['my', 'case', 'upcoming', 'overdue']],
                    'case_id' => ['type' => ['integer', 'null']],
                    'case_code' => ['type' => ['string', 'null']],
                    'employee_id' => ['type' => ['integer', 'null']],
                    'days' => ['type' => ['integer', 'null'], 'minimum' => 1, 'maximum' => 31],
                    'status' => ['type' => ['string', 'null'], 'enum' => [...CaseTask::STATUSES, null]],
                    'offset' => ['type' => 'integer', 'minimum' => 0, 'maximum' => 10000],
                ],
                'required' => ['scope'],
            ],
        ];
    }

    public function execute(array $input): array
    {
        $data = Validator::validate($input, [
            'scope' => ['required', Rule::in(['my', 'case', 'upcoming', 'overdue'])],
            'case_id' => ['nullable', 'integer', 'min:1'],
            'case_code' => ['nullable', 'string', 'max:100'],
            'employee_id' => ['nullable', 'integer', 'min:1'],
            'days' => ['nullable', 'integer', 'between:1,31'],
            'status' => ['nullable', Rule::in(CaseTask::STATUSES)],
            'offset' => ['sometimes', 'integer', 'between:0,10000'],
        ]);

        $user = auth()->user();
        $employee = $user?->employee;
        if (! $user || ! $user->hasPermission('case.view') || (! $employee && ! $user->hasPermission('task.view_all'))) {
            throw ValidationException::withMessages(['scope' => [self::FORBIDDEN_SCOPE]]);
        }

        $requestedEmployeeId = isset($data['employee_id']) ? (int) $data['employee_id'] : null;
        $canViewAllTasks = $user->hasPermission('task.view_all');
        if ($requestedEmployeeId !== null && $requestedEmployeeId !== $employee?->id && ! $canViewAllTasks) {
            throw ValidationException::withMessages(['employee_id' => [self::FORBIDDEN_EMPLOYEE]]);
        }

        $query = CaseTask::query()
            ->visibleTo($user)
            ->with([
                'caseFile:id,title,reference_number,client_id',
                'caseFile.client:id,name',
                'caseDocument:id,title,document_type_id',
                'caseDocument.documentType:id,code,name_ja',
                'assignedEmployee:id,full_name',
                'latestSubmission:case_task_submissions.id,case_task_submissions.case_task_id,case_task_submissions.version,case_task_submissions.review_status,case_task_submissions.review_note,case_task_submissions.filename,case_task_submissions.submitted_at',
            ]);

        $scope = $data['scope'];
        if ($requestedEmployeeId !== null) {
            $query->where('assigned_employee_id', $requestedEmployeeId);
        } elseif ($scope === 'my' || ! $canViewAllTasks) {
            $query->where('assigned_employee_id', $employee?->id ?? -1);
        }
        if (isset($data['status'])) {
            $query->where('status', $data['status']);
        }

        if ($scope === 'case') {
            $caseId = isset($data['case_id']) ? (int) $data['case_id'] : null;
            if ($caseId === null && isset($data['case_code'])) {
                $caseId = CaseFile::visibleTo($user)->where('reference_number', $data['case_code'])->value('id');
            }
            if ($caseId === null) {
                throw ValidationException::withMessages(['case_id' => ['案件を指定してください。']]);
            }
            $query->where('case_file_id', $caseId);
        } elseif ($scope === 'upcoming') {
            $days = (int) ($data['days'] ?? 7);
            $query->whereIn('status', CaseTask::ACTIVE_STATUSES)
                ->whereBetween('due_at', [now()->startOfDay(), now()->addDays($days - 1)->endOfDay()]);
        } elseif ($scope === 'overdue') {
            $query->whereIn('status', CaseTask::ACTIVE_STATUSES)->where('due_at', '<', now());
        } elseif (! isset($data['status'])) {
            $query->whereIn('status', CaseTask::ACTIVE_STATUSES);
        }

        // Counts and pagination are computed only after the shared visibility and filters.
        $total = (clone $query)->count();
        $offset = (int) ($data['offset'] ?? 0);
        $tasks = $query
            ->orderByRaw("CASE WHEN status IN ('unaccepted', 'in_progress', 'changes_requested', 'pending_review') AND due_at < ? THEN 0 ELSE 1 END", [now()])
            ->orderByRaw("CASE WHEN status = 'changes_requested' THEN 0 ELSE 1 END")
            ->orderByRaw("CASE WHEN status IN ('unaccepted', 'in_progress', 'changes_requested', 'pending_review') THEN 0 ELSE 1 END")
            ->orderByRaw("CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END")
            ->orderByRaw('CASE WHEN due_at IS NULL THEN 1 ELSE 0 END')
            ->orderBy('due_at')
            ->orderBy('id')
            ->offset($offset)
            ->limit(100)
            ->get()
            ->map(fn (CaseTask $task) => [
                'task_id' => $task->id,
                'case_id' => $task->case_file_id,
                'case_code' => $task->caseFile?->reference_number ?: sprintf('CASE-%06d', $task->case_file_id),
                'client_name' => $task->caseFile?->client?->name,
                'required_document_id' => $task->case_document_id,
                'required_document_code' => $task->caseDocument?->documentType?->code,
                'title' => $task->title,
                'required_document_name' => $task->caseDocument?->documentType?->name_ja
                    ?? $task->caseDocument?->title
                    ?? $task->title,
                'assignee' => $task->assignedEmployee?->full_name,
                'status' => $task->status,
                'due_date' => $task->due_at?->timezone(config('app.timezone'))->toDateString(),
                'priority' => $task->priority,
                'overdue' => $task->is_overdue,
                'deadline_approaching' => ! $task->is_overdue
                    && in_array($task->status, CaseTask::ACTIVE_STATUSES, true)
                    && $task->due_at !== null && $task->due_at->between(now(), now()->addDays(3)),
                'allowed_actions' => $task->allowedActionsFor($user),
                'latest_submission_version' => $task->latestSubmission?->version,
                'review_status' => $task->latestSubmission?->review_status,
                'rejection_reason' => $task->status === 'changes_requested' ? $task->latestSubmission?->review_note : null,
            ])->values()->all();

        return [
            'scope' => $scope,
            'generated_at' => now()->toIso8601String(),
            'query' => $data,
            'total_count' => $total,
            'has_more' => $offset + count($tasks) < $total,
            'next_offset' => $offset + count($tasks) < $total ? $offset + count($tasks) : null,
            'tasks' => $tasks,
        ];
    }
}
