<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class CaseDeadline extends Model
{
    use SoftDeletes;

    protected $fillable = ['case_file_id', 'deadline_type', 'title', 'due_at', 'status', 'priority', 'notes'];

    protected function casts(): array
    {
        return ['due_at' => 'datetime'];
    }

    public function caseFile(): BelongsTo
    {
        return $this->belongsTo(CaseFile::class);
    }
}
