<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DocumentType extends Model
{
    // Group is explicit metadata; document code prefixes do not decide behavior.
    public const DOCUMENT_GROUPS = ['C', 'D', 'W', 'T', 'A'];

    protected $fillable = [
        'code', 'name_ja', 'name_vi', 'description', 'document_group', 'version', 'is_active',
    ];

    protected function casts(): array
    {
        return ['version' => 'integer', 'is_active' => 'boolean'];
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
}
