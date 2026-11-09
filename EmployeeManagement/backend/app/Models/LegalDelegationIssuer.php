<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Owner-admitted C001 issuer, independent of professional LawyerVerification. */
class LegalDelegationIssuer extends Model
{
    public const SCOPE = 'c001.final_approve';
    protected $guarded = ['*'];
    protected $hidden = ['source', 'evidence_reference', 'evidence_digest'];

    protected function casts(): array
    {
        return ['user_id'=>'integer', 'employee_id'=>'integer', 'admitted_by_user_id'=>'integer', 'admitted_by_employee_id'=>'integer',
            'case_file_id'=>'integer', 'issued_at'=>'immutable_datetime', 'expires_at'=>'immutable_datetime', 'revoked_at'=>'immutable_datetime'];
    }

    protected static function booted(): void
    {
        static::updating(function (self $row): void {
            if (array_diff(array_keys($row->getDirty()), ['revoked_at','updated_at']) !== []
                || ($row->getRawOriginal('revoked_at') !== null && $row->isDirty('revoked_at'))) throw new \LogicException('Issuer facts are immutable.');
        });
        static::deleting(fn () => throw new \LogicException('Issuer evidence is retained.'));
    }
}
