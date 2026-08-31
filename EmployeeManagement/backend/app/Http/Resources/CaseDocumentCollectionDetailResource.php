<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;

class CaseDocumentCollectionDetailResource extends CaseDocumentCollectionResource
{
    public function toArray(Request $request): array
    {
        $item = parent::toArray($request);

        return [
            'id' => $item['id'], 'title' => $item['title'],
            'document_type' => $item['document_type'] === null ? null : $item['document_type'] + [
                'description' => $this->documentType->description,
            ],
            'purposes' => $item['purposes'],
            'rule' => [
                'version_snapshot' => $this->rule_version_snapshot,
                'source_snapshot' => $this->rule_source_snapshot,
                'applicability_condition_snapshot' => $this->applicability_condition_snapshot,
            ],
            'necessity' => [
                'status' => $this->necessity_status, 'reason' => $this->necessity_reason,
                'decided_by' => self::employee($this->necessityDecidedBy),
                'decided_at' => $this->necessity_decided_at?->toISOString(),
            ],
            'collection' => [
                'target_person' => $item['target_person'], 'source' => $item['collection_source'],
                'method' => $item['collection_method'], 'target_period_from' => $item['target_period_from'],
                'target_period_to' => $item['target_period_to'], 'target_scope' => $item['target_scope'],
                'status' => $item['collection_status'], 'result' => $item['collection_result'],
                'requested_at' => $item['requested_at'], 'response_deadline' => $item['response_deadline'],
                'priority' => $item['collection_priority'], 'preservation_priority' => $item['preservation_priority'],
                'preservation_reason' => $item['preservation_reason'],
            ],
            'fulfillment_status' => $item['fulfillment_status'], 'review_status' => $item['review_status'],
            'assigned_employee' => $item['assigned_employee'], 'is_template_generated' => $item['is_template_generated'],
            'received_document_count' => $item['received_document_count'],
            'received_documents' => $this->receivedDocuments->map(fn ($file) => [
                'id' => $file->id, 'title' => $file->title, 'original_filename' => $file->original_filename,
                'storage_type' => $file->storage_type,
                // Metadata only. No filesystem paths or storage mutations; suppress unsafe URL schemes.
                'external_url' => in_array($file->storage_type, ['google_drive', 'external_link'], true)
                    && filter_var($file->external_url, FILTER_VALIDATE_URL)
                    && in_array(strtolower((string) parse_url($file->external_url, PHP_URL_SCHEME)), ['https', 'http'], true)
                    ? $file->external_url : null,
                'version' => $file->version, 'received_at' => $file->received_at?->toISOString(),
                'original_or_copy' => $file->original_or_copy, 'return_required' => $file->return_required,
                'returned_at' => $file->returned_at?->toISOString(),
                'registered_by_employee' => self::employee($file->registeredByEmployee),
                'notes' => $file->notes, 'relationship_type' => $file->pivot->relationship_type,
            ])->values()->all(),
            'created_at' => $item['created_at'], 'updated_at' => $item['updated_at'],
        ];
    }
}
