<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class CaseParty extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'case_file_id', 'party_type', 'name', 'organization', 'relationship', 'phone', 'email', 'address', 'notes',
        'entity_type', 'relation_type', 'relation_status', 'contact_person', 'reference_number',
        'start_date', 'end_date', 'is_current', 'metadata', 'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'start_date' => 'date:Y-m-d', 'end_date' => 'date:Y-m-d',
            'is_current' => 'boolean', 'metadata' => 'array',
        ];
    }

    public function caseFile(): BelongsTo
    {
        return $this->belongsTo(CaseFile::class);
    }
}
