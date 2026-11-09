<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Internal registry; never appended to Employee/User projections or client writable. */
class LawyerVerification extends Model
{
    protected $guarded = ['*'];
    protected $hidden = ['source', 'evidence_reference', 'evidence_digest'];

    protected function casts(): array
    {
        return ['user_id' => 'integer', 'employee_id' => 'integer', 'verifier_user_id' => 'integer',
            'verifier_employee_id' => 'integer', 'supersedes_id' => 'integer',
            'issued_at' => 'immutable_datetime', 'expires_at' => 'immutable_datetime', 'revoked_at' => 'immutable_datetime'];
    }
}
