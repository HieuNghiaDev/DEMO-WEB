<?php

namespace App\Services;

use App\Models\CaseDocument;
use App\Models\Employee;
use App\Models\EmployeeNotification;
use App\Models\EmployeeTask;
use Illuminate\Http\Request;

class DocumentCollectionTaskService
{
    /**
     * Creates or updates the one open employee task that represents a confirmed
     * document-collection request. This intentionally does not require the
     * assignee to be clocked in: they must be able to receive the request for
     * their next shift.
     */
    public function synchronize(CaseDocument $document, Request $request): ?EmployeeTask
    {
        if (! $document->assigned_employee_id || ! $document->requested_at) {
            return null;
        }

        $employee = Employee::query()
            ->with('user')
            ->lockForUpdate()
            ->findOrFail($document->assigned_employee_id);

        abort_unless($employee->status === 'active', 422, '在籍中の社員にのみ資料収集を依頼できます。');

        $task = EmployeeTask::query()
            ->where('case_document_id', $document->id)
            ->whereIn('status', ['pending', 'accepted', 'in_progress'])
            ->lockForUpdate()
            ->first();

        if ($task && $task->employee_id !== $employee->id) {
            abort_if($task->status === 'in_progress', 422, '進行中の資料収集タスクは担当変更できません。');
            $task->update(['status' => 'cancelled']);
            $task = null;
        }

        $attributes = [
            'title' => $this->taskTitle($document),
            'description' => $this->taskDescription($document),
            'due_at' => $document->response_deadline,
        ];

        if ($task) {
            if ($task->status !== 'in_progress') {
                $task->update($attributes);
            }

            return $task->fresh();
        }

        $task = EmployeeTask::create([
            ...$attributes,
            'employee_id' => $employee->id,
            'case_document_id' => $document->id,
            'assigned_by' => $request->user()->id,
            'duration_minutes' => 60,
            'status' => 'pending',
        ]);

        if ($employee->user) {
            EmployeeNotification::create([
                'user_id' => $employee->user->id,
                'kind' => 'info',
                'title' => '資料収集の依頼が届きました',
                'message' => $task->title,
                'data' => [
                    'assigned_task_id' => $task->id,
                    'case_document_id' => $document->id,
                    'target_path' => "/quests/{$document->case_file_id}",
                ],
            ]);
        }

        return $task;
    }

    public function cancelOpenTask(CaseDocument $document): void
    {
        EmployeeTask::query()
            ->where('case_document_id', $document->id)
            ->whereIn('status', ['pending', 'accepted'])
            ->update(['status' => 'cancelled']);
    }

    private function taskTitle(CaseDocument $document): string
    {
        return "資料収集: {$document->title}";
    }

    private function taskDescription(CaseDocument $document): string
    {
        $parts = array_filter([
            $document->collection_source ? "取得先: {$document->collection_source}" : null,
            $document->collection_method ? "取得方法: {$document->collection_method}" : null,
            $document->target_person ? "対象者: {$document->target_person}" : null,
        ]);

        return implode("\n", $parts) ?: '資料収集の依頼内容を案件画面で確認してください。';
    }
}
