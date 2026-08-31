<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tasks') && ! Schema::hasTable('matters')) {
            return;
        }

        $db = DB::connection();
        $isolatedTest = app()->environment('testing') && (
            ($db->getDriverName() === 'sqlite' && $db->getDatabaseName() === ':memory:')
            || ($db->getDriverName() === 'mysql' && $db->getConfig('host') === '127.0.0.1'
                && $db->getDatabaseName() === 'employee_management_v2_test_20260831')
        );
        $approvedLocal = app()->environment('local') && $db->getDriverName() === 'mysql'
            && $db->getConfig('host') === '127.0.0.1' && $db->getDatabaseName() === 'employee_management'
            && env('THEMIS_V2_CLEANUP_APPROVED') === '1';

        if (! $isolatedTest && ! $approvedLocal) {
            throw new RuntimeException('V2 cleanup requires the approved local database, backup and explicit operator opt-in. Remote cleanup is not authorized.');
        }

        Schema::dropIfExists('tasks');
        Schema::dropIfExists('matters');
    }

    public function down(): void
    {
        throw new RuntimeException('Legacy demo removal is irreversible. Restore the verified backup only if recovery is required.');
    }
};
