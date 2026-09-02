<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmployeeCodeSequence extends Model
{
    protected $fillable = [
        'office_id',
        'sequence_year',
        'last_sequence',
    ];

    protected function casts(): array
    {
        return [
            'office_id' => 'integer',
            'sequence_year' => 'integer',
            'last_sequence' => 'integer',
        ];
    }

    public function office(): BelongsTo
    {
        return $this->belongsTo(Office::class);
    }
}
