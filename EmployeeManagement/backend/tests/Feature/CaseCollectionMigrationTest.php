<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

class CaseCollectionMigrationTest extends TestCase
{
    public function test_additive_upgrade_preserves_existing_document_data_without_url_conversion(): void
    {
        $this->assertSame('sqlite', config('database.default'));
        $this->assertSame(':memory:', config('database.connections.sqlite.database'));
        $migrations = collect(File::files(database_path('migrations')));
        $baseline = $migrations->filter(fn ($file) => $file->getFilename() < '2026_08_31_100000')
            ->map(fn ($file) => $file->getRealPath())->values()->all();
        $phase = $migrations->filter(fn ($file) => str_starts_with($file->getFilename(), '2026_08_31_100'))
            ->map(fn ($file) => $file->getRealPath())->values()->all();
        $this->assertCount(5, $phase);
        $this->artisan('migrate', ['--path' => $baseline, '--realpath' => true, '--force' => true])->assertExitCode(0);
        $clientId = DB::table('clients')->insertGetId(['name' => 'Existing client']);
        $caseId = DB::table('case_files')->insertGetId(['client_id' => $clientId, 'title' => 'Existing case']);
        $id = DB::table('case_documents')->insertGetId([
            'case_file_id' => $caseId, 'title' => 'Existing document', 'category' => 'Original',
            'status' => 'confirmed', 'requirement_level' => 'required', 'version' => '7',
            'file_url' => 'https://drive.google.com/file/d/existing', 'note' => 'Preserve me',
        ]);
        $before = (array) DB::table('case_documents')->find($id);
        $this->artisan('migrate', ['--path' => $phase, '--realpath' => true, '--force' => true])->assertExitCode(0);
        $after = (array) DB::table('case_documents')->find($id);
        foreach ($before as $column => $value) {
            $this->assertSame($value, $after[$column], "Legacy column changed: {$column}");
        }
        $this->assertSame('undetermined', $after['necessity_status']);
        $this->assertSame('not_started', $after['collection_status']);
        $this->assertSame('undetermined', $after['fulfillment_status']);
        $this->assertSame('unreviewed', $after['review_status']);
        $this->assertNull($after['document_type_id']);
        $this->assertNull($after['case_type_document_rule_id']);
        foreach (['document_types', 'case_type_document_rules', 'received_documents', 'case_document_received_documents'] as $table) {
            $this->assertDatabaseCount($table, 0);
        }
        $this->artisan('migrate', ['--path' => $phase, '--realpath' => true, '--force' => true])->assertExitCode(0);
        $this->assertSame($after, (array) DB::table('case_documents')->find($id));
    }
}
