<?php

namespace App\Http\Resources;

use App\Models\Employee;
use App\Services\C001DocumentWorkflowService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CaseDocumentCollectionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $handlingType = $this->documentType?->handling_type;
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
            'assigned_employee' => self::employee($this->assignedEmployee),
            'requested_at' => $this->requested_at?->toISOString(),
            'response_deadline' => $this->response_deadline?->toISOString(),
            'collection_priority' => $this->collection_priority,
            'preservation_priority' => $this->preservation_priority,
            'preservation_reason' => $this->preservation_reason,
            'applicability_condition_snapshot' => $this->applicability_condition_snapshot,
            'is_template_generated' => $this->is_template_generated,
            'received_document_count' => (int) $this->received_documents_count,
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
                'can_approve' => $request->user()?->hasAnyRole(['level_3', 'level_5']) ?? false,
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
}
