<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AppRelease extends Model
{
    protected $fillable = [
        'version',
        'major',
        'minor',
        'patch',
        'codename',
        'release_type',
        'title',
        'release_notes',
        'released_at',
        'released_by',
        'environment',
        'build_sha',
        'build_number',
        'build_date',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'release_notes' => 'array',
            'released_at' => 'datetime',
            'build_date' => 'date',
        ];
    }

    public function releaser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'released_by');
    }
}
