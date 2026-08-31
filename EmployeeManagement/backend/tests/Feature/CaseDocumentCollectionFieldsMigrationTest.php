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

class CaseDocumentCollectionFieldsMigrationTest extends TestCase
{
    public function test_additive_migration_uses_only_defaults_without_backfilling_business_decisions(): void
    {
        $this->assertSame('sqlite', config('database.default'));
        $this->assertSame(':memory:', config('database.connections.sqlite.database'));
        $paths = collect(File::files(database_path('migrations')))
            ->filter(fn ($file) => $file->getFilename() < '2026_08_31_150000')
            ->map(fn ($file) => $file->getRealPath())->values()->all();
        $this->artisan('migrate', ['--path' => $paths, '--realpath' => true, '--force' => true])->assertExitCode(0);
        $this->seed([CaseTypeSeeder::class, DocumentTypeMasterSeeder::class, DocumentPurposeSeeder::class, CaseTypeDocumentRuleMasterSeeder::class]);
        $client = DB::table('clients')->insertGetId(['name' => 'Existing client']);
        $case = DB::table('case_files')->insertGetId(['client_id' => $client, 'title' => 'Existing case']);
        $rule = DB::table('case_type_document_rules')->where('preservation_priority', true)->first();
        $this->assertNotNull($rule);
        foreach (['high', 'critical'] as $priority) {
            DB::table('case_documents')->insert([
                'case_file_id' => $case, 'title' => 'Existing document', 'category' => 'Legacy',
                'case_type_document_rule_id' => $rule->id, 'status' => 'confirmed', 'version' => '7',
                'collection_status' => 'closed', 'necessity_status' => 'not_required',
                'collection_priority' => $priority, 'preservation_reason' => 'Existing explanation',
                'file_url' => 'https://drive.google.com/file/d/existing', 'note' => 'Keep existing values',
                'rule_version_snapshot' => 7, 'applicability_condition_snapshot' => 'Historical condition',
                'deleted_at' => $priority === 'critical' ? '2026-08-30 12:00:00' : null,
            ]);
        }
        $tables = ['clients', 'case_files', 'document_types', 'document_purposes', 'case_type_document_rules', 'case_type_document_rule_purposes', 'case_document_purposes'];
        $before = collect($tables)->mapWithKeys(fn ($table) => [$table => DB::table($table)->get()->toJson()])->all();
        $oldDocuments = DB::table('case_documents')->orderBy('id')->get();
        $path = 'database/migrations/2026_08_31_150000_add_collection_workflow_fields_to_case_documents.php';
        $this->artisan('migrate', ['--path' => $path, '--force' => true])->assertExitCode(0);
        foreach ($oldDocuments as $oldDocument) {
            $after = (array) DB::table('case_documents')->find($oldDocument->id);
            foreach ((array) $oldDocument as $key => $value) {
                $this->assertSame($value, $after[$key], "Existing column changed: {$key}");
            }
            $this->assertSame(['collection_result', 'collection_method', 'preservation_priority'],
                array_values(array_diff(array_keys($after), array_keys((array) $oldDocument))));
            $this->assertNull($after['collection_result']);
            $this->assertNull($after['collection_method']);
            $this->assertSame(0, $after['preservation_priority']);
        }
        foreach ($before as $table => $rows) {
            $this->assertSame($rows, DB::table($table)->get()->toJson(), "Changed table: {$table}");
        }
        $stored = DB::table('case_documents')->orderBy('id')->get()->toJson();
        $this->artisan('migrate', ['--path' => $path, '--force' => true])->assertExitCode(0);
        $this->assertSame($stored, DB::table('case_documents')->orderBy('id')->get()->toJson());

        // Down is exercised only on this disposable in-memory database.
        (require base_path($path))->down();
        foreach (['collection_result', 'collection_method', 'preservation_priority'] as $column) {
            $this->assertFalse(Schema::hasColumn('case_documents', $column));
        }
        $this->assertSame($oldDocuments->toJson(), DB::table('case_documents')->orderBy('id')->get()->toJson());
    }
}
