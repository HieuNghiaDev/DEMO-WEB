<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use Tests\TestCase;

class DocumentRuleIdentityMigrationTest extends TestCase
{
    private function legacyRule(bool $duplicate): array
    {
        $this->assertSame('sqlite', config('database.default'));
        $this->assertSame(':memory:', config('database.connections.sqlite.database'));
        $paths = collect(File::files(database_path('migrations')))
            ->filter(fn ($file) => $file->getFilename() < '2026_08_31_130000')
            ->map(fn ($file) => $file->getRealPath())->values()->all();
        $this->artisan('migrate', ['--path' => $paths, '--realpath' => true, '--force' => true])->assertExitCode(0);
        $type = DB::table('case_types')->insertGetId(['name' => 'Custom']);
        $document = DB::table('document_types')->insertGetId(['code' => 'CUSTOM', 'name_ja' => '独自']);
        $row = ['case_type_id' => $type, 'document_type_id' => $document, 'version' => 1, 'applicability_condition' => 'Keep condition'];
        DB::table('case_type_document_rules')->insert($row);
        if ($duplicate) {
            DB::table('case_type_document_rules')->insert($row);
        }

        return DB::table('case_type_document_rules')->orderBy('id')->get()->map(fn ($r) => (array) $r)->all();
    }

    public function test_upgrade_preserves_existing_rule_values_and_does_not_claim_ownership(): void
    {
        $before = $this->legacyRule(false);
        $migration = require database_path('migrations/2026_08_31_130000_identify_official_document_rules.php');
        $migration->up();
        $after = (array) DB::table('case_type_document_rules')->first();
        $this->assertNull($after['master_source']);
        unset($after['master_source']);
        $this->assertSame($before[0], $after);
        $migration->down();
        $this->assertSame($before[0], (array) DB::table('case_type_document_rules')->first());
    }

    public function test_upgrade_refuses_duplicates_before_any_schema_or_data_change(): void
    {
        $before = $this->legacyRule(true);
        $migration = require database_path('migrations/2026_08_31_130000_identify_official_document_rules.php');
        try {
            $migration->up();
            $this->fail('Migration must not silently merge custom rules.');
        } catch (RuntimeException $exception) {
            $this->assertStringContainsString('Duplicate document rule identities', $exception->getMessage());
        }
        $this->assertFalse(Schema::hasColumn('case_type_document_rules', 'master_source'));
        $this->assertSame($before, DB::table('case_type_document_rules')->orderBy('id')->get()->map(fn ($r) => (array) $r)->all());
    }
}
