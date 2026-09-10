<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use LogicException;

class DocumentType extends Model
{
    // Group is explicit metadata; document code prefixes do not decide behavior.
    public const DOCUMENT_GROUPS = ['C', 'D', 'W', 'T', 'A'];

    public const HANDLING_TYPES = ['office_generated', 'collected', 'official_form', 'reference_only'];

    protected $fillable = [
        'code', 'name_ja', 'name_vi', 'description', 'document_group', 'handling_type', 'version', 'is_active',
    ];

    protected function casts(): array
    {
        return ['version' => 'integer', 'is_active' => 'boolean'];
    }

    protected static function booted(): void
    {
        static::saving(function (DocumentType $documentType): void {
            if ($documentType->handling_type !== null
                && ! in_array($documentType->handling_type, self::HANDLING_TYPES, true)) {
                throw new LogicException('Document handling type is invalid.');
            }
        });
    }

    public function rules(): HasMany
    {
        return $this->hasMany(CaseTypeDocumentRule::class);
    }

    public function caseDocuments(): HasMany
    {
        return $this->hasMany(CaseDocument::class);
    }

    public function receivedDocuments(): HasMany
    {
        return $this->hasMany(ReceivedDocument::class);
    }

    public function generationTemplates(): HasMany
    {
        return $this->hasMany(DocumentGenerationTemplate::class);
    }

    public function activeGenerationTemplates(): HasMany
    {
        return $this->generationTemplates()->where('is_active', true)->orderByDesc('version');
    }

    public function sourceFiles(): HasMany
    {
        return $this->hasMany(DocumentSourceFile::class);
    }

    public function activeSourceFiles(): HasMany
    {
        return $this->sourceFiles()->where('is_active', true)->orderByDesc('source_version');
    }
}
