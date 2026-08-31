<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class CaseDocument extends Model
{
    use SoftDeletes;

    // Separate axes for future collection workflows; legacy status is not synchronized.
    public const NECESSITY_STATUSES = ['undetermined', 'required', 'not_required'];

    public const COLLECTION_STATUSES = ['not_started', 'preparing', 'requested', 'partially_received', 'received', 'difficult', 'closed'];

    public const FULFILLMENT_STATUSES = ['undetermined', 'insufficient', 'satisfied', 'satisfied_by_alternative'];

    public const REVIEW_STATUSES = ['unreviewed', 'reviewing', 'reviewed', 'returned'];

    public const COLLECTION_PRIORITIES = ['low', 'normal', 'high', 'critical'];

    protected $fillable = [
        'case_file_id', 'template_item_id', 'category', 'requirement_level', 'title', 'file_url',
        'version', 'status', 'due_at', 'received_at', 'expires_at', 'sort_order',
        'is_template_generated', 'created_by_employee_id', 'created_by_ai_name',
        'confirmed_by_employee_id', 'confirmed_at', 'note',
        'document_type_id', 'case_type_document_rule_id', 'target_person', 'collection_source',
        'rule_version_snapshot', 'applicability_condition_snapshot', 'rule_source_snapshot',
        'target_period_from', 'target_period_to', 'target_scope', 'necessity_status', 'necessity_reason',
        'necessity_decided_by_employee_id', 'necessity_decided_at', 'collection_status',
        'fulfillment_status', 'review_status', 'assigned_employee_id', 'requested_at',
        'response_deadline', 'collection_priority', 'preservation_reason',
    ];

    protected function casts(): array
    {
        return [
            'confirmed_at' => 'datetime', 'due_at' => 'date', 'received_at' => 'date',
            'expires_at' => 'date', 'is_template_generated' => 'boolean',
            'target_period_from' => 'date', 'target_period_to' => 'date',
            'necessity_decided_at' => 'datetime', 'requested_at' => 'datetime',
            'response_deadline' => 'datetime',
            'rule_version_snapshot' => 'integer',
        ];
    }

    public function caseFile(): BelongsTo
    {
        return $this->belongsTo(CaseFile::class);
    }

    public function createdByEmployee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'created_by_employee_id');
    }

    public function confirmedByEmployee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'confirmed_by_employee_id');
    }

    public function templateItem(): BelongsTo
    {
        return $this->belongsTo(DocumentTemplateItem::class, 'template_item_id');
    }

    public function documentType(): BelongsTo
    {
        return $this->belongsTo(DocumentType::class);
    }

    public function collectionRule(): BelongsTo
    {
        return $this->belongsTo(CaseTypeDocumentRule::class, 'case_type_document_rule_id');
    }

    public function receivedDocuments(): BelongsToMany
    {
        // file_url remains the legacy link; no automatic conversion or dual write.
        return $this->belongsToMany(ReceivedDocument::class, 'case_document_received_documents')
            ->withPivot('relationship_type')->withTimestamps();
    }

    public function assignedEmployee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'assigned_employee_id');
    }

    public function necessityDecidedBy(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'necessity_decided_by_employee_id');
    }

    public function purposes(): BelongsToMany
    {
        // Case purposes are independent of rule purposes, not a live inherited list.
        return $this->belongsToMany(DocumentPurpose::class, 'case_document_purposes')
            ->withTimestamps()->orderBy('document_purposes.sort_order');
    }
}
