<?php

namespace App\Http\Resources;

use App\Models\Employee;
use App\Services\C001DocumentWorkflowService;
use App\Services\RequiredDocumentAccess;
use App\Services\RequiredDocumentFileReview;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CaseDocumentCollectionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        // Snapshot RBAC once per response, not once per row. Mutations still reauthorize.
        $grants = $request->attributes->get('required_document_permissions');
        if ($grants === null) {
            $grants = [];
            foreach (['case.view', 'case.update', 'task.update', 'task.manage', 'task.review', 'document.create', 'document.update'] as $permission) {
                $grants[$permission] = $request->user()?->hasPermission($permission) ?? false;
            }
            $grants['main_role'] = \App\Services\Administration\MainRoles::assigned($request->user());
            $request->attributes->set('required_document_permissions', $grants);
        }
        $task = $this->activeCaseTask
            ?? ($this->latestCaseTask && ! $this->latestCaseTask->trashed() && $this->latestCaseTask->status === 'completed' ? $this->latestCaseTask : null);
        $visibleTask = $task; // Document progress is case-visible; task descriptions/lists stay private.
        $submission = $this->latestTaskSubmission;
        $fileReview = app(RequiredDocumentFileReview::class)->current($this->resource);
        $capabilities = app(RequiredDocumentAccess::class)->capabilities($this->resource, $request->user(), $grants);
        $caseWrite = \App\Services\CaseAccessService::rehearsal()?->presentationAllows($request->user(), $this->case_file_id) ?? true;
        $capabilities['can_review'] = $capabilities['can_return'] = $grants['case.view'] && $grants['task.review']
            && $caseWrite && ($fileReview['reviewable'] ?? false);
        if ($authority = \App\Services\RehearsalDocumentAuthority::current()) {
            $capabilities['can_review'] = $capabilities['can_return'] = $capabilities['can_review']
                && $authority->canInternal($request->user(), $this->case_file_id, $this->id, $fileReview['source'], $fileReview['id']);
        }
        $handlingType = $this->documentType?->handling_type;
        $capabilities['legal_approval_pending'] = \App\Services\LegalFinalizationGate::policyPending()
            && ($handlingType === 'office_generated' || $submission?->source_type === 'auto_generated'
            || ($submission !== null && $submission->case_generated_document_id !== null));
        $generationSupported = $handlingType === 'office_generated'
            && ($this->generatedDocument !== null
                || $this->documentType->activeGenerationTemplates->isNotEmpty());

        $c001Versions = $this->documentType?->code === 'C-001'
            ? $this->generatedDocuments->sortByDesc('version')->values()
            : collect();
        $latestC001 = $c001Versions->first();
        $latestFinalizedC001 = $c001Versions->first(fn ($version) => $version->artifacts->contains(
            fn ($artifact) => $artifact->artifact_type === C001DocumentWorkflowService::ARTIFACT_TYPE
                && $artifact->storage_provider === 'google_drive'
        ) && $version->artifacts->contains(
            fn ($artifact) => $artifact->artifact_type === C001DocumentWorkflowService::PDF_ARTIFACT_TYPE
                && $artifact->storage_provider === 'google_drive'
        ));
        $c001WorkbookArtifact = $latestFinalizedC001?->artifacts->first(
            fn ($artifact) => $artifact->artifact_type === C001DocumentWorkflowService::ARTIFACT_TYPE
                && $artifact->storage_provider === 'google_drive'
        );
        $c001PdfArtifact = $latestFinalizedC001?->artifacts->first(
            fn ($artifact) => $artifact->artifact_type === C001DocumentWorkflowService::PDF_ARTIFACT_TYPE
                && $artifact->storage_provider === 'google_drive'
        );
        $workingC001 = $c001Versions->first(fn ($version) => in_array($version->workflow_status, ['draft', 'review'], true)
            && ! ($version->artifacts->contains(fn ($artifact) => $artifact->artifact_type === C001DocumentWorkflowService::ARTIFACT_TYPE
                && $artifact->storage_provider === 'google_drive')
                && $version->artifacts->contains(fn ($artifact) => $artifact->artifact_type === C001DocumentWorkflowService::PDF_ARTIFACT_TYPE
                    && $artifact->storage_provider === 'google_drive')));

        $generatedVersions = $this->generatedDocuments
            ->sortByDesc('version')
            ->map(fn ($version) => [
                'id' => $version->id,
                'version' => $version->version,
                'workflow_status' => $version->workflow_status,
                'created_at' => $version->created_at?->toISOString(),
                'updated_at' => $version->updated_at?->toISOString(),
                'created_by' => $version->createdBy ? [
                    'id' => $version->createdBy->id,
                    'name' => $version->createdBy->name,
                ] : null,
                'approved_by' => $version->approvedBy ? [
                    'id' => $version->approvedBy->id,
                    'name' => $version->approvedBy->name,
                ] : null,
                'artifacts' => $version->artifacts->map(fn ($artifact) => [
                    'id' => $artifact->id,
                    'artifact_type' => $artifact->artifact_type,
                    'filename' => $artifact->filename,
                    'mime_type' => $artifact->mime_type,
                    'url' => self::safeExternalUrl($artifact->external_url),
                    'uploaded_at' => $artifact->uploaded_at?->toISOString() ?? $artifact->created_at?->toISOString(),
                    'uploaded_by' => $artifact->uploadedBy ? [
                        'id' => $artifact->uploadedBy->id,
                        'name' => $artifact->uploadedBy->name,
                    ] : null,
                ])->values()->all(),
            ])->values()->all();

        return [
            'id' => $this->id,
            'title' => $this->title,
            'document_type' => $this->documentType ? [
                'id' => $this->documentType->id, 'code' => $this->documentType->code,
                'name_ja' => $this->documentType->name_ja,
                'handling_type' => $handlingType,
                // Compatibility field retained for the existing frontend.
                'creation_supported' => $generationSupported,
                'capabilities' => [
                    'generation_supported' => $generationSupported,
                    'collection_only' => $handlingType === 'collected',
                    'official_form' => $handlingType === 'official_form',
                    'reference_only' => $handlingType === 'reference_only',
                    'source_available' => $this->documentType->activeSourceFiles->isNotEmpty(),
                ],
            ] : null,
            'purposes' => $this->purposes->map(fn ($purpose) => [
                'id' => $purpose->id, 'code' => $purpose->code, 'name_ja' => $purpose->name_ja,
            ])->values()->all(),
            'target_person' => $this->target_person,
            'collection_source' => $this->collection_source,
            'collection_method' => $this->collection_method,
            'target_period_from' => $this->target_period_from?->toDateString(),
            'target_period_to' => $this->target_period_to?->toDateString(),
            'target_scope' => $this->target_scope,
            'necessity_status' => $this->necessity_status,
            'collection_status' => $this->collection_status,
            'collection_result' => $this->collection_result,
            'fulfillment_status' => $this->fulfillment_status,
            'review_status' => $this->review_status,
            'assigned_employee' => self::employee($task?->assignedEmployee ?? $this->assignedEmployee),
            'capabilities' => $capabilities,
            'file_review' => $fileReview,
            'active_task' => $visibleTask ? [
                'id' => $visibleTask->id,
                'status' => $visibleTask->status,
                'status_label' => $visibleTask->status_label,
                'priority' => $visibleTask->priority,
                'due_at' => $visibleTask->due_at?->toISOString(),
                'is_overdue' => $visibleTask->is_overdue,
                'allowed_actions' => $visibleTask->allowedActionsFor($request->user(), $grants),
                'assigned_employee' => self::employee($visibleTask->assignedEmployee),
            ] : null,
            'workflow_state' => $this->workflowState($visibleTask, $fileReview),
            'latest_task_submission' => $submission ? self::submission($submission) : null,
            'requested_at' => $this->requested_at?->toISOString(),
            'response_deadline' => $this->response_deadline?->toISOString(),
            'collection_priority' => $this->collection_priority,
            'preservation_priority' => $this->preservation_priority,
            'preservation_reason' => $this->preservation_reason,
            'applicability_condition_snapshot' => $this->applicability_condition_snapshot,
            'is_template_generated' => $this->is_template_generated,
            'received_document_count' => (int) $this->received_documents_count,
            'generated_versions' => $generatedVersions,
            'c001' => $this->documentType?->code === 'C-001' ? [
                'status' => $latestC001?->workflow_status === 'approved' && $latestC001->is($latestFinalizedC001)
                    ? 'complete'
                    : ($this->review_status === 'returned' && $latestC001?->workflow_status === 'draft'
                        ? 'rejected'
                        : ($workingC001
                            ? 'draft'
                            : ($c001PdfArtifact && $c001WorkbookArtifact ? 'pending_approval' : 'missing'))),
                'success_fee_percentage' => $latestC001?->success_fee_percentage !== null
                    ? rtrim(rtrim(number_format((float) $latestC001->success_fee_percentage, 2, '.', ''), '0'), '.')
                    : '20',
                'client_name' => $this->caseFile?->client?->name,
                'client_address' => $this->caseFile?->client?->address,
                'latest_version' => $latestFinalizedC001?->version,
                'next_version' => $workingC001?->version ?? (($latestFinalizedC001?->version ?? 0) + 1),
                'working_version' => $workingC001?->version,
                'artifact' => $c001PdfArtifact ? [
                    'external_file_id' => $c001PdfArtifact->external_file_id,
                    'url' => $c001PdfArtifact->external_url,
                    'filename' => $c001PdfArtifact->filename,
                    'generated_at' => $c001PdfArtifact->created_at?->toISOString(),
                    'last_synced_at' => $c001PdfArtifact->updated_at?->toISOString(),
                    'generated_by' => $c001PdfArtifact->uploadedBy?->name,
                ] : null,
                'pdf_artifact' => $c001PdfArtifact ? [
                    'external_file_id' => $c001PdfArtifact->external_file_id,
                    'url' => $c001PdfArtifact->external_url,
                    'filename' => $c001PdfArtifact->filename,
                ] : null,
                'workbook_artifact' => $c001WorkbookArtifact ? [
                    'external_file_id' => $c001WorkbookArtifact->external_file_id,
                    'url' => $c001WorkbookArtifact->external_url,
                    'filename' => $c001WorkbookArtifact->filename,
                ] : null,
                'approved_at' => $latestFinalizedC001?->approved_at?->toISOString(),
                'approved_by' => $latestFinalizedC001?->approvedBy?->name,
                'can_approve' => ! \App\Services\LegalFinalizationGate::policyPending() && ! \App\Services\CaseAccessService::rehearsal() && $grants['task.review'],
                'draft_updated_at' => $workingC001?->updated_at?->toISOString(),
                'draft_updated_by' => $workingC001?->updatedBy ? [
                    'id' => $workingC001->updatedBy->id,
                    'name' => $workingC001->updatedBy->name,
                ] : null,
            ] : null,
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }

    protected static function employee(?Employee $employee): ?array
    {
        return $employee ? ['id' => $employee->id, 'display_name' => $employee->full_name] : null;
    }

    protected static function submission($submission): array
    {
        return [
            'id' => $submission->id,
            'version' => $submission->version,
            'source_type' => $submission->source_type,
            'review_status' => $submission->review_status,
            'filename' => $submission->filename,
            'mime_type' => $submission->mime_type,
            'url' => self::safeExternalUrl($submission->external_url),
            'submitted_at' => $submission->submitted_at?->toISOString(),
            'submitted_by' => $submission->submittedBy ? ['id' => $submission->submittedBy->id, 'name' => $submission->submittedBy->name] : null,
            'reviewed_at' => $submission->reviewed_at?->toISOString(),
            'reviewed_by' => $submission->reviewedBy ? ['id' => $submission->reviewedBy->id, 'name' => $submission->reviewedBy->name] : null,
            'review_note' => $submission->review_note,
            'review_reason' => $submission->review_reason,
            'review_detail' => $submission->review_detail,
            'received_document_id' => $submission->received_document_id,
            'storage_provider' => $submission->storage_provider,
        ];
    }

    private function workflowState($task, ?array $fileReview): array
    {
        $status = $task?->status;
        if ($fileReview && $fileReview['status'] !== null && (! $task || $fileReview['task_id'] === $task->id || $fileReview['reviewable'])) {
            $status = match ($fileReview['status']) {
                'pending_review' => 'pending_review', 'approved' => 'completed', 'rejected' => 'changes_requested', default => $status,
            };
        }
        return match ($status) {
            'unaccepted' => ['code' => 'unaccepted', 'label' => '未受領'],
            'in_progress' => ['code' => 'in_progress', 'label' => '対応中'],
            'pending_review' => ['code' => 'pending_review', 'label' => '確認待ち'],
            'changes_requested' => ['code' => 'changes_requested', 'label' => '差戻し'],
            'completed' => ['code' => 'completed', 'label' => '完了'],
            default => ['code' => 'selected', 'label' => '選定済み'],
        };
    }

    protected static function safeExternalUrl(?string $url): ?string
    {
        if (! is_string($url) || ! filter_var($url, FILTER_VALIDATE_URL)) {
            return null;
        }

        return in_array(strtolower((string) parse_url($url, PHP_URL_SCHEME)), ['https', 'http'], true)
            ? $url
            : null;
    }
}
