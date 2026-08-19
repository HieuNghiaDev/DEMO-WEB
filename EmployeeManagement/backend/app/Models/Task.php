<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Task extends Model
{
    protected $fillable = [
        'matter_id', 'title', 'horizon', 'due_date', 'status', 'source', 'assigned_to',
    ];

    protected function casts(): array
    {
        return ['due_date' => 'datetime'];
    }

    public function matter(): BelongsTo
    {
        return $this->belongsTo(Matter::class);
    }
}
