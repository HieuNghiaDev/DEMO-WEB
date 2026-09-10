<?php

use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Historical marker only. The legacy matter/task tables had already been
     * removed from the local MySQL schema before this repository state. The
     * PostgreSQL bootstrap intentionally never creates them, so no destructive
     * operation is required to preserve the same migration history.
     */
    public function up(): void
    {
        // Intentionally empty.
    }

    public function down(): void
    {
        // Intentionally empty: rollback must not recreate deprecated tables.
    }
};
