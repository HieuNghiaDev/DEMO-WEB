<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\GeneratedDocumentDriveException;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCaseTaskBatchRequest;
use App\Models\CaseDeadline;
use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\CaseParty;
use App\Models\CaseTask;
use App\Models\CaseTaskSubmission;
use App\Models\Employee;
use App\Services\CaseTaskService;
use App\Services\CaseTaskWorkflowService;
use App\Services\CaseWorkspaceAuditService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

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
        DB::transaction(function () use ($request, $caseFile, $deadline) {
            $before = $deadline->only(['title', 'due_at', 'status', 'priority', 'notes']);
            $deadline->update($this->deadlineData($request, true));
            $this->auditService->record($caseFile, $request, '期限を更新', $deadline->title, [
                'event' => 'deadline.updated', 'deadline_id' => $deadline->id, 'status' => $deadline->status,
                'before' => $before, 'after' => $deadline->only(['title', 'due_at', 'status', 'priority', 'notes']),
            ]);
        });

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
        $data = $this->taskData($request);
        $task = app(CaseTaskService::class)->createStandalone($caseFile, $request, $data);

        return response()->json(['task' => $task->isVisibleTo($request->user()) ? $task->load('assignedEmployee') : null], 201);
    }

    public function indexTasks(Request $request, CaseFile $caseFile): JsonResponse
    {
        $filters = $request->validate([
            'status' => ['sometimes', Rule::in(CaseTask::STATUSES)],
            'assignee_id' => ['sometimes', 'integer', 'min:1'],
            'search' => ['sometimes', 'string', 'max:255'],
            'overdue' => ['sometimes', 'boolean'],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'between:1,100'],
        ]);
        $query = $caseFile->caseTasks()->visibleTo($request->user());
        if (isset($filters['status'])) {
            $query->where('status', $filters['status']);
        }
        if (isset($filters['assignee_id'])) {
            $query->where('assigned_employee_id', $filters['assignee_id']);
        }
        if (isset($filters['search'])) {
            $term = '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $filters['search']).'%';
            $query->where(fn ($q) => $q->whereRaw("title LIKE ? ESCAPE '!'", [$term])
                ->orWhereRaw("description LIKE ? ESCAPE '!'", [$term]));
        }
        if (! empty($filters['overdue'])) {
            $query->whereIn('status', CaseTask::ACTIVE_STATUSES)->where('due_at', '<', now());
        }
        $query->with($this->taskRelations());
        if ($request->hasAny(['page', 'per_page'])) {
            $page = $query->paginate($filters['per_page'] ?? 25);

            return response()->json(['tasks' => $page->items(), 'pagination' => [
                'current_page' => $page->currentPage(), 'per_page' => $page->perPage(),
                'last_page' => $page->lastPage(), 'total' => $page->total(),
                'from' => $page->firstItem(), 'to' => $page->lastItem(),
            ]]);
        }
        $tasks = $query->get();

        return response()->json(['tasks' => $tasks]);
    }

    public function showTask(Request $request, CaseFile $caseFile, CaseTask $task): JsonResponse
    {
        $this->ensureBelongsToCase($caseFile, $task);
        abort_unless($task->isVisibleTo($request->user()), 403, 'このタスクを閲覧する権限がありません。');

        return response()->json(['task' => $task->load($this->taskRelations())]);
    }

    public function taskOptions(Request $request, CaseFile $caseFile): JsonResponse
    {
        $documents = CaseDocument::query()
            ->where('case_file_id', $caseFile->id)
            ->where('necessity_status', 'required')
            ->with(['documentType:id,code,name_ja'])
            ->withExists(['caseTasks as has_existing_task' => fn ($query) => $query
                ->withTrashed()->where('case_file_id', $caseFile->id)])
            ->with(['caseTasks' => fn ($query) => $query
                ->withTrashed()
                ->where('case_file_id', $caseFile->id)
                ->visibleTo($request->user())
                ->with('assignedEmployee:id,full_name')
                ->orderByDesc('id')])
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        $employees = Employee::query()
            ->where('status', 'active')
            ->orderBy('full_name')
            ->get(['id', 'full_name', 'avatar_path', 'office_id']);

        return response()->json([
            'required_documents' => $documents,
            'employees' => $employees,
        ]);
    }

    public function storeTaskBatch(
        StoreCaseTaskBatchRequest $request,
        CaseFile $caseFile,
        CaseTaskService $service,
    ): JsonResponse {
        $tasks = $service->createBatch($caseFile, $request);

        return response()->json([
            'message' => 'タスクを作成しました。',
            'tasks' => $tasks->filter(fn (CaseTask $task) => $task->isVisibleTo($request->user()))->values(),
        ], 201);
    }

    public function updateTask(Request $request, CaseFile $caseFile, CaseTask $task, CaseTaskWorkflowService $workflow): JsonResponse
    {
        $this->ensureBelongsToCase($caseFile, $task);
        if ($request->has('status')) {
            throw ValidationException::withMessages([
                'status' => '状態は専用の操作から変更してください。',
            ]);
        }
        $data = $request->validate([
            'assigned_employee_id' => ['sometimes', 'integer', 'exists:employees,id'],
            'due_at' => ['sometimes', 'nullable', 'date'],
            'priority' => ['sometimes', Rule::in(CaseTask::PRIORITIES)],
            'description' => ['sometimes', 'nullable', 'string', 'max:5000'],
        ]);
        $task = $workflow->manage($caseFile, $task, $request, $data);

        return response()->json(['task' => $task->isVisibleTo($request->user()) ? $task : null]);
    }

    public function destroyTask(Request $request, CaseFile $caseFile, CaseTask $task, CaseTaskWorkflowService $workflow): JsonResponse
    {
        $this->ensureBelongsToCase($caseFile, $task);
        $workflow->cancel($caseFile, $task, $request);

        return response()->json(['message' => 'タスクをキャンセルしました。']);
    }

    public function acceptTask(Request $request, CaseFile $caseFile, CaseTask $task, CaseTaskWorkflowService $workflow): JsonResponse
    {
        $this->ensureBelongsToCase($caseFile, $task);

        return response()->json(['task' => $workflow->accept($caseFile, $task, $request)]);
    }

    public function submitTask(Request $request, CaseFile $caseFile, CaseTask $task, CaseTaskWorkflowService $workflow): JsonResponse
    {
        $this->ensureBelongsToCase($caseFile, $task);
        $workflow->assertSubmitAllowed($task, $request->user());
        $data = $request->validate(['file' => ['required', 'file', 'max:20480', new \App\Rules\AllowedEvidenceFile]]);
        try {
            $submission = $workflow->submitUpload($caseFile, $task, $data['file'], $request);
        } catch (GeneratedDocumentDriveException $error) {
            return $error->safeResponse();
        }

        return response()->json([
            'submission' => $submission,
            'task' => $task->fresh()->load($this->taskRelations()),
        ], 201);
    }

    public function approveTaskSubmission(
        Request $request,
        CaseFile $caseFile,
        CaseTask $task,
        CaseTaskSubmission $submission,
        CaseTaskWorkflowService $workflow,
    ): JsonResponse {
        $this->ensureBelongsToCase($caseFile, $task);

        $task = $workflow->approve($caseFile, $task, $submission, $request);

        return response()->json(['task' => $task->isVisibleTo($request->user()) ? $task : null]);
    }

    public function rejectTaskSubmission(
        Request $request,
        CaseFile $caseFile,
        CaseTask $task,
        CaseTaskSubmission $submission,
        CaseTaskWorkflowService $workflow,
    ): JsonResponse {
        $this->ensureBelongsToCase($caseFile, $task);
        $data = $request->validate(['reason' => ['required', 'string', 'max:5000']]);

        $task = $workflow->reject($caseFile, $task, $submission, $request, $data['reason']);

        return response()->json(['task' => $task->isVisibleTo($request->user()) ? $task : null]);
    }

    public function storeActivity(Request $request, CaseFile $caseFile): JsonResponse
    {
        $data = $request->validate([
            'activity_type' => ['required', Rule::in(['communication'])],
            'metadata' => ['prohibited'],
            'channel' => ['nullable', Rule::in(['meeting', 'phone', 'email', 'line', 'internal', 'other'])],
            'title' => ['required', 'string', 'max:255'],
            'content' => ['nullable', 'string', 'max:10000'],
            'occurred_at' => ['required', 'date'],
        ]);
        $data['created_by_employee_id'] = $request->user()?->employee_id;
        $activity = DB::transaction(function () use ($request, $caseFile, $data) {
            $activity = $caseFile->activities()->create($data);
            $this->auditService->record($caseFile, $request, '連絡・面談履歴を追加', $activity->title, ['event' => 'communication.created', 'communication_id' => $activity->id]);

            return $activity;
        });

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
            'priority' => ['nullable', Rule::in(CaseTask::PRIORITIES)],
            'due_at' => ['nullable', 'date'],
        ]);
    }

    private function ensureBelongsToCase(CaseFile $caseFile, Model $model): void
    {
        abort_unless((int) $model->getAttribute('case_file_id') === $caseFile->id, 404);
    }

    private function taskRelations(): array
    {
        return [
            'assignedEmployee:id,full_name,avatar_path',
            'caseDocument.documentType:id,code,name_ja,handling_type',
            'latestSubmission.submittedBy:id,name',
            'latestSubmission.reviewedBy:id,name',
            'submissions.submittedBy:id,name',
            'submissions.reviewedBy:id,name',
        ];
    }
}
