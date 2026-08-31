<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class LocalV2MigrationPathTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('sqlite', config('database.default'));
        $this->assertSame(':memory:', config('database.connections.sqlite.database'));
    }

    public function test_normal_production_migration_path_neither_invokes_cleanup_nor_drops_legacy_tables(): void
    {
        // Simulate the deploy command locally; never connect to a remote database.
        $environment = app()->environment();
        try {
            app()->instance('env', 'production');
            $this->artisan('migrate', ['--force' => true])->assertExitCode(0);
            $this->assertTrue(Schema::hasTable('matters'));
            $this->assertTrue(Schema::hasTable('tasks'));
            $this->assertDatabaseMissing('migrations', ['migration' => '2026_08_31_120000_remove_legacy_matter_tasks']);
            $this->artisan('themis:v2-cleanup-legacy', ['--confirm-local' => true])->assertExitCode(1);
            $this->assertTrue(Schema::hasTable('matters'));
            $this->assertTrue(Schema::hasTable('tasks'));
            $files = app('migrator')->getMigrationFiles([database_path('migrations')]);
            $this->assertArrayNotHasKey('2026_08_31_120000_remove_legacy_matter_tasks', $files);
        } finally {
            app()->instance('env', $environment);
        }
    }

    public function test_forward_migrate_preserves_an_existing_retired_history_row(): void
    {
        $this->artisan('migrate', ['--force' => true])->assertExitCode(0);
        $this->artisan('themis:v2-cleanup-legacy', ['--confirm-local' => true])->assertExitCode(0);
        // Model the already-completed B2 history in this SQLite fixture ONLY.
        // No operational/local MySQL ledger is edited by the application or command.
        DB::table('migrations')->insert([
            'migration' => '2026_08_31_120000_remove_legacy_matter_tasks', 'batch' => 2,
        ]);
        $before = DB::table('migrations')->orderBy('id')->get()->toJson();
        $this->artisan('migrate', ['--force' => true])->assertExitCode(0);
        $this->assertSame($before, DB::table('migrations')->orderBy('id')->get()->toJson());
        $this->assertFalse(Schema::hasTable('matters'));
        $this->assertFalse(Schema::hasTable('tasks'));
    }

    public function test_explicit_command_rejects_remote_and_unapproved_database_configurations_without_connecting(): void
    {
        $environment = app()->environment();
        $default = config('database.default');
        $original = config('database.connections.v2_guard_test');
        try {
            foreach ([
                ['local', 'remote.invalid', 'employee_management'],
                ['testing', 'remote.invalid', 'employee_management_v2_test_migration_chain'],
                ['local', '127.0.0.1', 'unapproved_database'],
                ['production', '127.0.0.1', 'employee_management'],
                ['staging', '127.0.0.1', 'employee_management'],
            ] as [$env, $host, $name]) {
                app()->instance('env', $env);
                config(['database.default' => 'v2_guard_test', 'database.connections.v2_guard_test' => [
                    'driver' => 'mysql', 'host' => $host, 'database' => $name,
                    'username' => 'not-used', 'password' => '',
                ]]);
                DB::purge('v2_guard_test');
                $this->artisan('themis:v2-cleanup-legacy', ['--confirm-local' => true])->assertExitCode(1);
            }
        } finally {
            DB::purge('v2_guard_test');
            app()->instance('env', $environment);
            config(['database.default' => $default, 'database.connections.v2_guard_test' => $original]);
        }
    }
}
