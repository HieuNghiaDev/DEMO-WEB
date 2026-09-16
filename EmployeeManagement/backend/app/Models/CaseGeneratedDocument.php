<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CaseGeneratedDocument extends Model
{
    public const WORKFLOW_STATUSES = ['draft', 'review', 'approved'];

    public function artifacts(): HasMany
    {
        return $this->hasMany(GeneratedDocumentArtifact::class);
    }

    protected $fillable = [
        'case_document_id', 'document_generation_template_id', 'version', 'workflow_status',
        'draft_data', 'approved_data', 'success_fee_percentage', 'approved_at', 'approved_by', 'created_by', 'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'version' => 'integer',
            'draft_data' => 'array',
            'approved_data' => 'array',
            'success_fee_percentage' => 'decimal:2',
            'approved_at' => 'datetime',
        ];
    }

    public function caseDocument(): BelongsTo
    {
        return $this->belongsTo(CaseDocument::class);
    }

    public function template(): BelongsTo
    {
        return $this->belongsTo(DocumentGenerationTemplate::class, 'document_generation_template_id');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
