<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LegalDelegation extends Model
{
    // Proposed protected capability; deliberately absent from seeders/default role grants.
    public const ISSUE_PERMISSION = 'document.delegate_legal';
    protected $guarded = ['*'];
    protected $hidden = ['evidence_reference', 'evidence_digest'];

    protected function casts(): array
    {
        return ['user_id' => 'integer', 'employee_id' => 'integer', 'issuer_user_id' => 'integer',
            'issuer_employee_id' => 'integer', 'verification_id' => 'integer', 'issuer_verification_id' => 'integer', 'issuer_admission_id' => 'integer',
            'case_file_id' => 'integer', 'case_document_id' => 'integer', 'case_generated_document_id' => 'integer',
            'version' => 'integer', 'issued_at' => 'immutable_datetime', 'expires_at' => 'immutable_datetime', 'revoked_at' => 'immutable_datetime'];
    }
}
