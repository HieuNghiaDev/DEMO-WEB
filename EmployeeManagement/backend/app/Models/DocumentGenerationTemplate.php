<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use LogicException;

class DocumentGenerationTemplate extends Model
{
    protected static function booted(): void
    {
        // A version is published on insert. Never race a new instance by editing it in place.
        static::updating(function (self $template): void {
            if ($template->isDirty(['document_type_id', 'version', 'renderer_type', 'format', 'template_body', 'field_schema'])) {
                throw new LogicException('Published generation templates are immutable; create a new version.');
            }
        });
    }

    protected $fillable = [
        'document_type_id', 'version', 'renderer_type', 'format', 'template_body',
        'field_schema', 'is_active', 'created_by',
    ];

    protected function casts(): array
    {
        return ['version' => 'integer', 'field_schema' => 'array', 'is_active' => 'boolean'];
    }

    public function documentType(): BelongsTo
    {
        return $this->belongsTo(DocumentType::class);
    }

    public function generatedDocuments(): HasMany
    {
        return $this->hasMany(CaseGeneratedDocument::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
