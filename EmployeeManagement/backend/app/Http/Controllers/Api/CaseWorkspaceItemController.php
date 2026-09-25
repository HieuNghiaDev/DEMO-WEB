<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CaseDeadline;
use App\Models\CaseFile;
use App\Models\CaseParty;
use App\Models\CaseTask;
use App\Services\CaseWorkspaceAuditService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class CaseWorkspaceItemController extends Controller
{
    public function __construct(private readonly CaseWorkspaceAuditService $auditService) {}

    public function storeParty(Request $request, CaseFile $caseFile): JsonResponse
    {
        $data = $this->partyData($request);
        $party = DB::transaction(function () use ($request, $caseFile, $data): CaseParty {
            $party = $caseFile->parties()->create($data);
            $this->auditService->record($caseFile, $request, '関係者を追加', $party->name, ['party_id' => $party->id]);

            return $party;
        });

        return response()->json(['party' => $party], 201);
    }

    public function updateParty(Request $request, CaseFile $caseFile, CaseParty $party): JsonResponse
    {
        $this->ensureBelongsToCase($caseFile, $party);
        $data = $this->partyData($request, true, $party);
        DB::transaction(function () use ($request, $caseFile, $party, $data): void {
            $party->update($data);
            $this->auditService->record($caseFile, $request, '関係者を更新', $party->name, ['party_id' => $party->id]);
        });

        return response()->json(['party' => $party->fresh()]);
    }

    public function destroyParty(Request $request, CaseFile $caseFile, CaseParty $party): JsonResponse
    {
        $this->ensureBelongsToCase($caseFile, $party);
        DB::transaction(function () use ($request, $caseFile, $party): void {
            $party->delete();
            $this->auditService->record($caseFile, $request, '関係者を削除', $party->name, ['party_id' => $party->id]);
        });

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

    private function partyData(Request $request, bool $partial = false, ?CaseParty $party = null): array
    {
        $data = $request->validate([
            'party_type' => [$partial ? 'sometimes' : 'required', Rule::in(['client', 'family', 'employer', 'opponent', 'insurer', 'medical', 'supporter', 'other'])],
            'name' => [$partial ? 'sometimes' : 'required', 'string', 'max:255'],
            'organization' => ['nullable', 'string', 'max:255'],
            'relationship' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'email' => ['nullable', 'email', 'max:255'],
            'address' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:5000'],
            'entity_type' => ['nullable', Rule::in(['company', 'organization', 'person', 'insurer', 'insurance_company', 'police', 'other'])],
            'relation_type' => ['nullable', Rule::in([
                'current_employer', 'former_employer', 'dispatch_company', 'dispatch_destination',
                'training_company', 'supervising_organization', 'sending_organization',
                'support_organization', 'accident_opponent', 'opponent_company', 'own_insurer', 'opponent_insurer',
                'police', 'family', 'medical', 'supporter', 'other',
            ])],
            'relation_status' => ['nullable', Rule::in(['current', 'past', 'active', 'inactive', 'unknown'])],
            'contact_person' => ['nullable', 'string', 'max:255'],
            'reference_number' => ['nullable', 'string', 'max:255'],
            'start_date' => ['nullable', 'date_format:Y-m-d'],
            'end_date' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:start_date'],
            'is_current' => ['nullable', 'boolean'],
            'metadata' => ['nullable', 'array', 'max:20'],
            'metadata.insurance_side' => ['nullable', Rule::in(['own', 'opponent', 'other'])],
            'metadata.policy_number' => ['nullable', 'string', 'max:255'],
            'metadata.claim_number' => ['nullable', 'string', 'max:255'],
            'metadata.department' => ['nullable', 'string', 'max:255'],
            'metadata.driver_name' => ['nullable', 'string', 'max:255'],
            'metadata.vehicle_info' => ['nullable', 'string', 'max:255'],
            'metadata.vehicle_number' => ['nullable', 'string', 'max:255'],
            'metadata.accident_relationship' => ['nullable', 'string', 'max:1000'],
            'sort_order' => ['nullable', 'integer', 'between:0,65535'],
        ]);

        $relationType = $data['relation_type'] ?? $party?->relation_type;
        $entityType = $data['entity_type'] ?? $party?->entity_type;
        $isEmployment = in_array($relationType, [
            'current_employer', 'former_employer', 'dispatch_company', 'dispatch_destination',
        ], true);

        if (! $isEmployment) {
            // Non-employment relations must never retain hidden workplace state.
            $data['relation_status'] = null;
            $data['start_date'] = null;
            $data['end_date'] = null;
            $data['is_current'] = null;
        } elseif ($data['is_current'] ?? false) {
            $data['end_date'] = null;
        }

        if (array_key_exists('metadata', $data) || $request->hasAny(['relation_type', 'entity_type'])) {
            $metadata = is_array($data['metadata'] ?? null) ? $data['metadata'] : [];

            if ($entityType === 'insurer' || $entityType === 'insurance_company') {
                $data['metadata'] = array_intersect_key($metadata, array_flip([
                    'insurance_side', 'policy_number', 'claim_number',
                ]));
            } elseif ($entityType === 'police' || $relationType === 'police') {
                $data['metadata'] = array_intersect_key($metadata, ['department' => true]);
            } elseif ($relationType === 'opponent_company' && $entityType === 'company') {
                $data['metadata'] = array_intersect_key($metadata, array_flip([
                    'driver_name', 'vehicle_info', 'vehicle_number', 'accident_relationship',
                ]));
            } elseif (! $isEmployment) {
                $data['metadata'] = null;
            }
        }

        return $data;
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
