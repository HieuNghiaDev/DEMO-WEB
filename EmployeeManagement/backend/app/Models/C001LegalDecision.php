<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use LogicException;

/** Authoritative receipt, distinct from the operational audit stream. */
class C001LegalDecision extends Model
{
    protected $table = 'c001_legal_decisions';
    public $timestamps = false;
    protected $guarded = ['*'];

    protected function casts(): array
    {
        return ['context' => 'array', 'decided_at' => 'immutable_datetime', 'version' => 'integer',
            'case_generated_document_id' => 'integer', 'actor_user_id' => 'integer', 'actor_employee_id' => 'integer'];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('A legal decision receipt is immutable.'));
        static::deleting(fn () => throw new LogicException('A legal decision receipt is retained.'));
    }
}
