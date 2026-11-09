<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Explicit content grants. No mass assignment/HTTP CRUD; existing grant writers remain RAM-only. */
class CaseMembership extends Model
{
    protected $guarded = ['*'];

    protected function casts(): array
    {
        return ['can_read' => 'boolean', 'can_write' => 'boolean', 'can_read_confidential' => 'boolean',
            'expires_at' => 'datetime', 'revoked_at' => 'datetime', 'revision' => 'integer'];
    }

    public function caseFile(): BelongsTo
    {
        return $this->belongsTo(CaseFile::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
