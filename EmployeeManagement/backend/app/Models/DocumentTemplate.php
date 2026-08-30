<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DocumentTemplate extends Model
{
    protected $fillable = ['case_type_id', 'name', 'version', 'effective_from', 'effective_to', 'source_reference', 'is_active'];

    protected function casts(): array
    {
        return ['effective_from' => 'date', 'effective_to' => 'date', 'is_active' => 'boolean'];
    }

    public function caseType(): BelongsTo
    {
        return $this->belongsTo(CaseType::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(DocumentTemplateItem::class)->orderBy('sort_order');
    }
}
