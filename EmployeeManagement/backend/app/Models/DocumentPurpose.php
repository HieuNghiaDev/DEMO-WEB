<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class DocumentPurpose extends Model
{
    protected $fillable = ['code', 'name_ja', 'description', 'sort_order', 'is_active'];

    protected function casts(): array
    {
        return ['sort_order' => 'integer', 'is_active' => 'boolean'];
    }

    public function rules(): BelongsToMany
    {
        return $this->belongsToMany(CaseTypeDocumentRule::class, 'case_type_document_rule_purposes')
            ->withTimestamps();
    }

    public function caseDocuments(): BelongsToMany
    {
        return $this->belongsToMany(CaseDocument::class, 'case_document_purposes')->withTimestamps();
    }
}
