<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CasePrecedent extends Model
{
    protected $fillable = ['case_file_id', 'title', 'citation', 'summary', 'relevance', 'source_url', 'created_by_employee_id', 'created_by_ai_name'];

    public function caseFile(): BelongsTo
    {
        return $this->belongsTo(CaseFile::class);
    }

    public function createdByEmployee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'created_by_employee_id');
    }
}
