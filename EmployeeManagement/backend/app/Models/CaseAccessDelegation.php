<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Owner approval fixture only. Ordinary content grant writers cannot issue delegations. */
class CaseAccessDelegation extends Model
{
    protected $guarded = ['*'];

    protected function casts(): array
    {
        return ['grantable_scopes' => 'array', 'expires_at' => 'datetime', 'revoked_at' => 'datetime'];
    }
}
