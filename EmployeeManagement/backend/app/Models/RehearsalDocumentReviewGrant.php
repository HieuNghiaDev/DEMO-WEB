<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RehearsalDocumentReviewGrant extends Model
{
    protected $guarded = ['*'];
    protected $hidden = ['evidence_digest'];

    protected function casts(): array
    {
        return ['expires_at' => 'datetime', 'revoked_at' => 'datetime', 'version' => 'integer'];
    }
}
