<?php

namespace Tests\Feature;

use Database\Seeders\CaseTypeDocumentRuleMasterSeeder;
use Database\Seeders\CaseTypeSeeder;
use Database\Seeders\DocumentPurposeSeeder;
use Database\Seeders\DocumentTypeMasterSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class CaseDocumentRuleSnapshotMigrationTest extends TestCase
{
    public function test_additive_migration_preserves_legacy_documents_and_all_phase_1c_master_data(): void
    {
        $this->assertSame('sqlite', config('database.default'));
        $this->assertSame(':memory:', config('database.connections.sqlite.database'));
        $paths = collect(File::files(database_path('migrations')))
            ->filter(fn ($file) => $file->getFilename() < '2026_08_31_140000')
            ->map(fn ($file) => $file->getRealPath())->values()->all();
        $this->artisan('migrate', ['--path' => $paths, '--realpath' => true, '--force' => true])->assertExitCode(0);
        $this->seed([CaseTypeSeeder::class, DocumentTypeMasterSeeder::class, DocumentPurposeSeeder::class, CaseTypeDocumentRuleMasterSeeder::class]);
        $client = DB::table('clients')->insertGetId(['name' => 'Existing client']);
        $case = DB::table('case_files')->insertGetId(['client_id' => $client, 'title' => 'Existing case']);
        $rule = DB::table('case_type_document_rules')->whereNotNull('applicability_condition')->first();
        $document = DB::table('case_documents')->insertGetId([
            'case_file_id' => $case, 'title' => 'Existing document', 'category' => 'Legacy',
            'case_type_document_rule_id' => $rule->id, 'status' => 'confirmed', 'version' => '7',
            'necessity_status' => 'not_required', 'file_url' => 'https://drive.google.com/file/d/existing',
            'note' => 'Keep existing values', 'deleted_at' => '2026-08-30 12:00:00',
        ]);
        $tables = ['clients', 'case_files', 'document_types', 'document_purposes', 'case_type_document_rules', 'case_type_document_rule_purposes', 'case_document_purposes'];
        $before = collect($tables)->mapWithKeys(fn ($table) => [$table => DB::table($table)->get()->toJson()])->all();
        $oldDocument = (array) DB::table('case_documents')->find($document);
        $path = 'database/migrations/2026_08_31_140000_add_rule_snapshots_to_case_documents.php';
        $this->artisan('migrate', ['--path' => $path, '--force' => true])->assertExitCode(0);
        $after = (array) DB::table('case_documents')->find($document);
        foreach ($oldDocument as $key => $value) {
            $this->assertSame($value, $after[$key], "Existing column changed: {$key}");
        }
        $columns = ['rule_version_snapshot', 'applicability_condition_snapshot', 'rule_source_snapshot'];
        $this->assertSame($columns, array_values(array_diff(array_keys($after), array_keys($oldDocument))));
        foreach ($columns as $column) {
            $this->assertNull($after[$column]);
        }
        foreach ($before as $table => $rows) {
            $this->assertSame($rows, DB::table($table)->get()->toJson(), "Changed table: {$table}");
        }
        $this->assertDatabaseCount('case_documents', 1);
        $this->artisan('migrate', ['--path' => $path, '--force' => true])->assertExitCode(0);
        $this->assertSame($after, (array) DB::table('case_documents')->find($document));

        // Rollback is tested only in this disposable SQLite fixture, never on working data.
        $migration = require base_path($path);
        $migration->down();
        $this->assertFalse(Schema::hasColumn('case_documents', 'rule_version_snapshot'));
        $this->assertSame($oldDocument, (array) DB::table('case_documents')->find($document));
    }
}
