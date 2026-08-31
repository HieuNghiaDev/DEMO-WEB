<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class CleanupLocalV2LegacyTables extends Command
{
    protected $signature = 'themis:v2-cleanup-legacy
                            {--confirm-local : Explicitly confirm removal of empty legacy tables on an approved local database}';

    protected $description = 'LOCAL ONLY: remove empty legacy tasks/matters tables after V2 master seeding (not a B2 data reset)';

    public function handle(): int
    {
        $db = DB::connection();
        $isLoopback = $db->getDriverName() === 'mysql' && $db->getConfig('host') === '127.0.0.1'
            && empty($db->getConfig('read')) && empty($db->getConfig('write'));
        $approvedLocal = app()->environment('local') && $isLoopback
            && $db->getDatabaseName() === 'employee_management';
        $isolatedTest = app()->environment('testing') && (
            ($db->getDriverName() === 'sqlite' && $db->getDatabaseName() === ':memory:')
            || ($isLoopback && in_array($db->getDatabaseName(), [
                'employee_management_v2_test_20260831',
                'employee_management_v2_test_migration_chain',
            ], true))
        );

        // Check before schema queries: remote and production/staging are never allowed,
        // including when a database already lacks the legacy tables.
        if (! $approvedLocal && ! $isolatedTest) {
            $this->error('Refused: only the approved local development or isolated test database is allowed.');

            return self::FAILURE;
        }
        if (! $this->option('confirm-local')) {
            $this->error('Explicit --confirm-local is required. This command must never be part of deployment.');

            return self::FAILURE;
        }

        $schema = $db->getSchemaBuilder();
        $present = [];
        foreach (['tasks', 'matters'] as $table) {
            if (! $schema->hasTable($table)) {
                continue;
            }
            // Inspect BOTH tables before any DDL. Existing data requires a separate
            // reviewed backup/cleanup operation; no force flag bypasses this check.
            if ($db->table($table)->exists()) {
                $this->error("Refused: {$table} contains data. This command does not repeat B2.");

                return self::FAILURE;
            }
            $present[] = $table;
        }

        foreach ($present as $table) {
            $schema->dropIfExists($table);
        }
        $this->info($present === []
            ? 'Legacy tables already absent; no database changes.'
            : 'Removed empty legacy tasks/matters tables. Migration history and V2 data are unchanged.');

        return self::SUCCESS;
    }
}
