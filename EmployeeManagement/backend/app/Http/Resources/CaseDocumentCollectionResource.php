<?php

namespace App\Http\Resources;

use App\Models\Employee;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CaseDocumentCollectionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'document_type' => $this->documentType ? [
                'id' => $this->documentType->id, 'code' => $this->documentType->code,
                'name_ja' => $this->documentType->name_ja,
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
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }

    protected static function employee(?Employee $employee): ?array
    {
        return $employee ? ['id' => $employee->id, 'display_name' => $employee->full_name] : null;
    }
}
