<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class CaseParty extends Model
{
    use SoftDeletes;

    protected $fillable = ['case_file_id', 'party_type', 'name', 'organization', 'relationship', 'phone', 'email', 'address', 'notes'];

    public function caseFile(): BelongsTo
    {
        return $this->belongsTo(CaseFile::class);
    }
}
