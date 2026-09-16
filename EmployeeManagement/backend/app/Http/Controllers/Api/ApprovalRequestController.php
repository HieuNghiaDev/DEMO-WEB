<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ApprovalRequest;
use App\Models\CaseDocument;
use App\Models\CaseGeneratedDocument;
use App\Models\User;
use App\Services\C001DocumentWorkflowService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ApprovalRequestController extends Controller
{
    public function index(): JsonResponse
    {
        $approvals = ApprovalRequest::query()
            ->with(['requestedBy', 'approvedBy', 'rejectedBy', 'executedBy'])
            ->orderByRaw("CASE WHEN status = 'pending' THEN 0 ELSE 1 END")
            ->latest()
            ->limit(100)
            ->get()
            ->map(fn (ApprovalRequest $approval): array => $this->serialize($approval));

        return response()->json([
            'approvals' => $approvals,
            'c001_documents' => $this->c001Documents(),
        ]);
    }

    public function approve(Request $request, ApprovalRequest $approval): JsonResponse
    {
        return $this->transition($approval, 'approved', $request->user());
    }

    public function reject(Request $request, ApprovalRequest $approval): JsonResponse
    {
        return $this->transition($approval, 'rejected', $request->user());
    }

    public function execute(Request $request, ApprovalRequest $approval): JsonResponse
    {
        // A stale approval must never be interpreted as a canonical case task.
        return response()->json([
            'message' => '旧タスク操作の実行はV2移行により停止しています。',
            'code' => 'legacy_execution_unavailable',
        ], 410);
    }

    private function transition(ApprovalRequest $approval, string $status, User $actor): JsonResponse
    {
        $result = DB::transaction(function () use ($approval, $status, $actor): array {
            $lockedApproval = ApprovalRequest::query()
                ->lockForUpdate()
                ->findOrFail($approval->id);

            if ($lockedApproval->status !== 'pending') {
                return [
                    'error' => true,
                    'status' => $lockedApproval->status,
                ];
            }

            $lockedApproval->update($status === 'approved'
                ? [
                    'status' => 'approved',
                    'approved_by' => $actor->id,
                    'approved_at' => now(),
                ]
                : [
                    'status' => 'rejected',
                    'rejected_by' => $actor->id,
                    'rejected_at' => now(),
                ]);

            return [
                'error' => false,
                'approval' => $lockedApproval->load(['requestedBy', 'approvedBy', 'rejectedBy', 'executedBy']),
            ];
        });

        if ($result['error']) {
            return response()->json([
                'message' => '処理済みの承認申請は変更できません。',
                'current_status' => $result['status'],
            ], 409);
        }

        return response()->json([
            'approval' => $this->serialize($result['approval']),
        ]);
    }

    /** @return array<string, mixed> */
    private function serialize(ApprovalRequest $approval): array
    {
        return [
            'id' => $approval->id,
            'action_type' => $approval->action_type,
            'tool_name' => $approval->tool_name,
            'payload' => $approval->payload,
            'requested_by' => $this->serializeUser($approval->requestedBy),
            'status' => $approval->status,
            'created_at' => $approval->created_at?->toISOString(),
            'approved_by' => $this->serializeUser($approval->approvedBy),
            'approved_at' => $approval->approved_at?->toISOString(),
            'rejected_by' => $this->serializeUser($approval->rejectedBy),
            'rejected_at' => $approval->rejected_at?->toISOString(),
            'executed_by' => $this->serializeUser($approval->executedBy),
            'executed_at' => $approval->executed_at?->toISOString(),
        ];
    }

    /** @return array{id: int, name: string}|null */
    private function serializeUser(?User $user): ?array
    {
        if ($user === null) {
            return null;
        }

        return [
            'id' => $user->id,
            'name' => (string) ($user->name ?: $user->email),
        ];
    }

    /** @return \Illuminate\Support\Collection<int, array<string, mixed>> */
    private function c001Documents()
    {
        return CaseDocument::query()
            ->whereHas('documentType', fn ($query) => $query->where('code', 'C-001'))
            ->whereHas('generatedDocuments.artifacts', fn ($query) => $query
                ->where('storage_provider', 'google_drive')
                ->whereIn('artifact_type', [C001DocumentWorkflowService::ARTIFACT_TYPE, C001DocumentWorkflowService::PDF_ARTIFACT_TYPE]))
            ->with([
                'documentType:id,code,name_ja',
                'caseFile:id,title,reference_number,client_id',
                'caseFile.client:id,name',
                'generatedDocuments' => fn ($query) => $query
                    ->with(['createdBy:id,name', 'approvedBy:id,name', 'artifacts'])
                    ->orderByDesc('version'),
            ])
            ->latest('updated_at')
            ->limit(100)
            ->get()
            ->map(function (CaseDocument $document): ?array {
                $officialVersions = $document->generatedDocuments->filter(fn (CaseGeneratedDocument $version) =>
                    $version->artifacts->contains(fn ($artifact) => $artifact->storage_provider === 'google_drive'
                        && $artifact->artifact_type === C001DocumentWorkflowService::ARTIFACT_TYPE)
                    && $version->artifacts->contains(fn ($artifact) => $artifact->storage_provider === 'google_drive'
                        && $artifact->artifact_type === C001DocumentWorkflowService::PDF_ARTIFACT_TYPE)
                );
                /** @var CaseGeneratedDocument|null $version */
                $version = $officialVersions->sortByDesc('version')->first();
                if (! $version) return null;

                $status = $version->workflow_status === 'approved'
                    ? 'complete'
                    : ($document->review_status === 'returned' ? 'rejected' : 'pending_approval');

                return [
                    'case_id' => $document->case_file_id,
                    'case_reference' => $document->caseFile?->reference_number,
                    'case_title' => $document->caseFile?->title,
                    'document_id' => $document->id,
                    'document_title' => $document->documentType?->name_ja ?? $document->title,
                    'client_name' => $document->caseFile?->client?->name,
                    'status' => $status,
                    'version' => $version->version,
                    'success_fee_percentage' => $version->success_fee_percentage,
                    'generated_at' => $version->created_at?->toISOString(),
                    'generated_by' => $version->createdBy?->name,
                    'approved_at' => $version->approved_at?->toISOString(),
                    'approved_by' => $version->approvedBy?->name,
                ];
            })
            ->filter()
            ->values();
    }
}
