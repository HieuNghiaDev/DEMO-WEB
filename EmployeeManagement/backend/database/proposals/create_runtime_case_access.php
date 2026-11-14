<?php

use Illuminate\Database\Migrations\Migration;
use App\Services\RuntimeCaseAccessSchema;

// Explicit local proposal path only. Not auto-discovered and not an approved rollout/backfill.
return new class extends Migration
{
    public function up(): void
    {
        $expected = config('case_access_rollout.expected_target');
        if (! is_array($expected)) throw new LogicException('Explicit approved rollout target is required.');
        RuntimeCaseAccessSchema::create($expected);
    }

    public function down(): void
    {
        throw new LogicException('Do not discard case classifications/grants; a data-preserving rollback requires review.');
    }
};
