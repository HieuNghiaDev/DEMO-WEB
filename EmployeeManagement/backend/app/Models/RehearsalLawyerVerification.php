<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Synthetic evidence only. No Employee attribute, role or title is verification. */
class RehearsalLawyerVerification extends Model
{
    protected $guarded = ['*'];
    protected $hidden = ['evidence_source', 'evidence_digest'];

    protected function casts(): array
    {
        return ['verified_at' => 'datetime', 'expires_at' => 'datetime', 'revoked_at' => 'datetime'];
    }
}
