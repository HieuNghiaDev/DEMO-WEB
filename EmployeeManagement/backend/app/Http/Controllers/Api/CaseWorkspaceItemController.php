<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CaseActivity;
use App\Models\CaseDeadline;
use App\Models\CaseFile;
use App\Models\CaseParty;
use App\Models\CaseTask;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use App\Services\CaseWorkspaceAuditService;

class CaseWorkspaceItemController extends Controller
{
    public function __construct(private readonly CaseWorkspaceAuditService $auditService)
    {
    }

    public function storeParty(Request $request, CaseFile $caseFile): JsonResponse
    {
        $party = $caseFile->parties()->create($this->partyData($request));
        $this->auditService->record($caseFile, $request, '関係者を追加', $party->name, ['party_id' => $party->id]);

        return response()->json(['party' => $party], 201);
    }

    public function updateParty(Request $request, CaseFile $caseFile, CaseParty $party): JsonResponse
    {
        $this->ensureBelongsToCase($caseFile, $party);
        $party->update($this->partyData($request, true));
        $this->auditService->record($caseFile, $request, '関係者を更新', $party->name, ['party_id' => $party->id]);

        return response()->json(['party' => $party->fresh()]);
    }

    public function destroyParty(Request $request, CaseFile $caseFile, CaseParty $party): JsonResponse
    {
        $this->ensureBelongsToCase($caseFile, $party);
        $party->delete();
        $this->auditService->record($caseFile, $request, '関係者を削除', $party->name, ['party_id' => $party->id]);

        return response()->json(['message' => '関係者を削除しました。']);
    }

    public function storeDeadline(Request $request, CaseFile $caseFile): JsonResponse
    {
        $deadline = $caseFile->deadlines()->create($this->deadlineData($request));
        $this->auditService->record($caseFile, $request, '期限を追加', $deadline->title, ['deadline_id' => $deadline->id]);

        return response()->json(['deadline' => $deadline], 201);
    }

    public function updateDeadline(Request $request, CaseFile $caseFile, CaseDeadline $deadline): JsonResponse
    {
        $this->ensureBelongsToCase($caseFile, $deadline);
        $deadline->update($this->deadlineData($request, true));
        $this->auditService->record($caseFile, $request, '期限を更新', $deadline->title, ['deadline_id' => $deadline->id, 'status' => $deadline->status]);

        return response()->json(['deadline' => $deadline->fresh()]);
    }

    public function destroyDeadline(Request $request, CaseFile $caseFile, CaseDeadline $deadline): JsonResponse
    {
        $this->ensureBelongsToCase($caseFile, $deadline);
        $deadline->delete();
        $this->auditService->record($caseFile, $request, '期限を削除', $deadline->title, ['deadline_id' => $deadline->id]);

        return response()->json(['message' => '期限を削除しました。']);
    }

    public function storeTask(Request $request, CaseFile $caseFile): JsonResponse
    {
        $task = $caseFile->caseTasks()->create($this->taskData($request));
        $this->auditService->record($caseFile, $request, 'タスクを追加', $task->title, ['task_id' => $task->id]);

        return response()->json(['task' => $task->load('assignedEmployee')], 201);
    }

    public function updateTask(Request $request, CaseFile $caseFile, CaseTask $task): JsonResponse
    {
        $this->ensureBelongsToCase($caseFile, $task);
        $data = $this->taskData($request, true);
        if (($data['status'] ?? null) === 'completed' && ! $task->completed_at) {
            $data['completed_at'] = now();
        } elseif (isset($data['status']) && $data['status'] !== 'completed') {
            $data['completed_at'] = null;
        }
        $task->update($data);
        $this->auditService->record($caseFile, $request, 'タスクを更新', $task->title, ['task_id' => $task->id, 'status' => $task->status]);

        return response()->json(['task' => $task->fresh()->load('assignedEmployee')]);
    }

    public function destroyTask(Request $request, CaseFile $caseFile, CaseTask $task): JsonResponse
    {
        $this->ensureBelongsToCase($caseFile, $task);
        $task->delete();
        $this->auditService->record($caseFile, $request, 'タスクを削除', $task->title, ['task_id' => $task->id]);

        return response()->json(['message' => 'タスクを削除しました。']);
    }

    public function storeActivity(Request $request, CaseFile $caseFile): JsonResponse
    {
        $data = $request->validate([
            'activity_type' => ['required', Rule::in(['communication', 'event', 'note', 'submission', 'medical', 'incident'])],
            'channel' => ['nullable', Rule::in(['meeting', 'phone', 'email', 'line', 'internal', 'other'])],
            'title' => ['required', 'string', 'max:255'],
            'content' => ['nullable', 'string', 'max:10000'],
            'occurred_at' => ['required', 'date'],
        ]);
        $data['created_by_employee_id'] = $request->user()?->employee_id;
        $activity = $caseFile->activities()->create($data);

        return response()->json(['activity' => $activity->load('createdByEmployee')], 201);
    }

    private function partyData(Request $request, bool $partial = false): array
    {
        return $request->validate([
            'party_type' => [$partial ? 'sometimes' : 'required', Rule::in(['client', 'family', 'employer', 'opponent', 'insurer', 'medical', 'supporter', 'other'])],
            'name' => [$partial ? 'sometimes' : 'required', 'string', 'max:255'],
            'organization' => ['nullable', 'string', 'max:255'],
            'relationship' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'email' => ['nullable', 'email', 'max:255'],
            'address' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);
    }

    private function deadlineData(Request $request, bool $partial = false): array
    {
        return $request->validate([
            'deadline_type' => [$partial ? 'sometimes' : 'required', Rule::in(['residence', 'submission', 'additional', 'limitation', 'document', 'internal', 'other'])],
            'title' => [$partial ? 'sometimes' : 'required', 'string', 'max:255'],
            'due_at' => [$partial ? 'sometimes' : 'required', 'date'],
            'status' => ['nullable', Rule::in(['open', 'completed', 'cancelled'])],
            'priority' => ['nullable', Rule::in(['low', 'normal', 'high', 'critical'])],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);
    }

    private function taskData(Request $request, bool $partial = false): array
    {
        return $request->validate([
            'assigned_employee_id' => ['nullable', 'exists:employees,id'],
            'title' => [$partial ? 'sometimes' : 'required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'status' => ['nullable', Rule::in(['pending', 'in_progress', 'completed', 'cancelled'])],
            'priority' => ['nullable', Rule::in(['low', 'normal', 'high', 'critical'])],
            'due_at' => ['nullable', 'date'],
        ]);
    }

    private function ensureBelongsToCase(CaseFile $caseFile, Model $model): void
    {
        abort_unless((int) $model->getAttribute('case_file_id') === $caseFile->id, 404);
    }
}
