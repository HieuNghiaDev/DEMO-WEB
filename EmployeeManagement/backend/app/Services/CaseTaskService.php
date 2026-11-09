<?php

namespace App\Services;

use App\Http\Requests\StoreCaseTaskBatchRequest;
use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\CaseTask;
use App\Models\Employee;
use App\Models\EmployeeNotification;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CaseTaskService
{
    public function __construct(private readonly CaseWorkspaceAuditService $auditService) {}

    /** Existing standalone task creation, shared by manual and communication next-action flows. */
    public function createStandalone(CaseFile $caseFile, Request $request, array $data): CaseTask
    {
        CaseAccessService::rehearsal()?->authorizeWrite($request->user(), $caseFile->id);
        $actor = $request->user();
        if (\App\Services\Administration\MainRoles::assigned($actor)) {
            abort_unless($actor->hasPermission('task.create'), 403);
            abort_if(! empty($data['assigned_employee_id']) && ! $actor->hasPermission('task.assign'), 403);
        } else {
            abort_unless($actor?->hasPermission('task.manage'), 403);
        }

        return DB::transaction(function () use ($caseFile, $request, $data) {
            if (! empty($data['due_at'])) {
                $data['due_at'] = Carbon::parse($data['due_at'])->setTimezone(config('app.timezone'))->format('Y-m-d H:i:s');
            }
            $task = $caseFile->caseTasks()->create([...$data, 'status' => 'unaccepted', 'created_by_employee_id' => $request->user()?->employee_id]);
            $this->auditService->record($caseFile, $request, 'タスクを追加', $task->title, ['event' => 'task.created', 'task_id' => $task->id]);
            $assignee = $task->assignedEmployee?->user;
            if ($assignee?->is_active && $task->assignedEmployee->status === 'active' && $task->isVisibleTo($assignee)) {
                EmployeeNotification::query()->create([
                    'user_id' => $assignee->id,
                    'kind' => 'info',
                    'title' => '新しいタスクが割り当てられました',
                    'message' => $task->title,
                    'data' => ['case_task_id' => $task->id, 'target_path' => "/quests/{$caseFile->id}"],
                ]);
            }

            return $task;
        });
    }

    /** @return Collection<int, CaseTask> */
    public function createBatch(CaseFile $caseFile, StoreCaseTaskBatchRequest $request): Collection
    {
        CaseAccessService::rehearsal()?->authorizeWrite($request->user(), $caseFile->id);
        $items = collect($request->validated('tasks'));

        return DB::transaction(function () use ($caseFile, $request, $items): Collection {
            CaseFile::query()->whereKey($caseFile->id)->lockForUpdate()->firstOrFail();

            $documentIds = $items->pluck('case_document_id')->map(fn ($id) => (int) $id)->all();
            $documents = CaseDocument::query()
                ->where('case_file_id', $caseFile->id)
                ->whereIn('id', $documentIds)
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            if ($documents->count() !== count($documentIds)) {
                throw ValidationException::withMessages([
                    'tasks' => ['現在の案件に属さない必要資料が含まれています。'],
                ]);
            }

            $notRequired = $documents->first(fn (CaseDocument $document) => $document->necessity_status !== 'required');
            if ($notRequired) {
                throw ValidationException::withMessages([
                    'tasks' => ["「{$notRequired->title}」は必要資料ではありません。"],
                ]);
            }

            $employeeIds = $items->pluck('assigned_employee_id')->map(fn ($id) => (int) $id)->unique()->all();
            $activeEmployeeIds = Employee::query()
                ->whereIn('id', $employeeIds)
                ->where('status', 'active')
                ->pluck('id')
                ->map(fn ($id) => (int) $id);
            if ($activeEmployeeIds->count() !== count($employeeIds)) {
                throw ValidationException::withMessages([
                    'tasks' => ['担当者として選択できない社員が含まれています。'],
                ]);
            }

            $duplicates = CaseTask::query()
                ->withTrashed()
                ->where('case_file_id', $caseFile->id)
                ->whereIn('case_document_id', $documentIds)
                ->lockForUpdate()
                ->get();
            if ($duplicates->isNotEmpty()) {
                // The case/document locks serialize normal creation even when no task existed
                // at wizard-open time. Historical records block recreation without disclosing
                // another employee's private task title or description.
                throw new HttpResponseException(response()->json([
                    'message' => 'この資料にはすでにタスクが作成されています。',
                    'code' => 'case_document_task_exists',
                ], 409));
            }

            $created = new Collection;
            foreach ($items as $item) {
                $document = $documents->get((int) $item['case_document_id']);
                $task = $caseFile->caseTasks()->create([
                    'case_document_id' => $document->id,
                    'assigned_employee_id' => (int) $item['assigned_employee_id'],
                    'created_by_employee_id' => $request->user()?->employee_id,
                    'title' => $document->title,
                    'description' => $item['note'] ?? null,
                    'status' => 'unaccepted',
                    'priority' => $item['priority'] ?? 'normal',
                    'due_at' => Carbon::createFromFormat('Y-m-d', $item['due_date'], config('app.timezone'))->endOfDay(),
                ]);
                $this->auditService->record($caseFile, $request, 'タスクを追加', $task->title, [
                    'event' => 'task.assigned',
                    'task_id' => $task->id,
                    'case_document_id' => $document->id,
                    'assigned_employee_id' => $task->assigned_employee_id,
                    'due_at' => $task->due_at?->toISOString(),
                ]);
                $employee = Employee::query()->with('user')->find($task->assigned_employee_id);
                if ($employee?->user && (! CaseAccessService::rehearsal()
                    || CaseAccessService::rehearsal()->allows($employee->user, $caseFile->id))) {
                    EmployeeNotification::query()->create([
                        'user_id' => $employee->user->id,
                        'kind' => 'info',
                        'title' => '新しいタスクが割り当てられました',
                        'message' => $task->title,
                        'data' => ['case_task_id' => $task->id, 'case_document_id' => $document->id,
                            'target_path' => "/quests/{$caseFile->id}"],
                    ]);
                }
                $created->push($task);
            }

            return $created->load(['assignedEmployee:id,full_name,avatar_path', 'caseDocument.documentType:id,code,name_ja']);
        });
    }
}
