<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CaseTypeDocumentRule extends Model
{
    public const REQUIREMENT_LEVELS = ['required', 'conditional', 'optional'];

    public const PRIORITIES = ['low', 'normal', 'high', 'critical'];

    protected $fillable = [
        'case_type_id', 'document_type_id', 'purpose_category', 'requirement_level',
        'applicability_condition', 'standard_source', 'standard_target_person',
        'standard_period_rule', 'prerequisite_document_type_id', 'priority_default',
        'preservation_priority', 'sort_order', 'version', 'effective_from', 'effective_to', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'preservation_priority' => 'boolean', 'sort_order' => 'integer', 'version' => 'integer',
            'effective_from' => 'date', 'effective_to' => 'date', 'is_active' => 'boolean',
        ];
    }

    public function caseType(): BelongsTo
    {
        return $this->belongsTo(CaseType::class);
    }

    public function documentType(): BelongsTo
    {
        return $this->belongsTo(DocumentType::class);
    }

    public function prerequisiteDocumentType(): BelongsTo
    {
        return $this->belongsTo(DocumentType::class, 'prerequisite_document_type_id');
    }

    public function caseDocuments(): HasMany
    {
        return $this->hasMany(CaseDocument::class, 'case_type_document_rule_id');
    }

    public function purposes(): BelongsToMany
    {
        // New workflows use this relation; purpose_category remains legacy metadata.
        return $this->belongsToMany(DocumentPurpose::class, 'case_type_document_rule_purposes')
            ->withTimestamps()->orderBy('document_purposes.sort_order');
    }
}
