<?php

namespace Tests\Feature;

use App\Models\CaseFile;
use App\Models\CaseType;
use App\Models\CaseTypeDocumentRule;
use App\Models\Client;
use App\Models\DocumentType;
use Database\Seeders\CaseTypeDocumentRuleMasterSeeder;
use Database\Seeders\CaseTypeSeeder;
use Database\Seeders\DocumentPurposeSeeder;
use Database\Seeders\DocumentTypeMasterSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class CaseDocumentRuleSnapshotTest extends TestCase
{
    use RefreshDatabase;

    protected function migrateDatabases(): void
    {
        $this->assertSame('sqlite', config('database.default'));
        $this->assertSame(':memory:', config('database.connections.sqlite.database'));
        $this->artisan('migrate', ['--force' => true])->assertExitCode(0);
    }

    public function test_snapshot_columns_exist_and_manual_documents_default_to_null(): void
    {
        $this->assertTrue(Schema::hasColumns('case_documents', [
            'rule_version_snapshot', 'applicability_condition_snapshot', 'rule_source_snapshot',
        ]));
        $document = $this->caseFile()->documents()->create(['title' => 'Manual document', 'category' => 'Custom'])->fresh();
        $this->assertNull($document->rule_version_snapshot);
        $this->assertNull($document->applicability_condition_snapshot);
        $this->assertNull($document->rule_source_snapshot);
        $this->assertNull($document->case_type_document_rule_id);
        $this->assertSame('undetermined', $document->necessity_status);
        $this->assertSame(0, $document->purposes()->count());
    }

    public function test_snapshot_values_are_independent_of_master_and_legacy_document_version(): void
    {
        $rule = $this->customRule();
        $document = $this->caseFile()->documents()->create([
            'title' => 'Historical document', 'category' => 'Custom', 'version' => '9',
            'case_type_document_rule_id' => $rule->id, 'rule_version_snapshot' => '2',
            'applicability_condition_snapshot' => "過去の適用条件。\n個別判断が必要。", 'rule_source_snapshot' => 'earlier-master',
        ])->fresh();
        $this->assertSame(2, $document->rule_version_snapshot);
        $this->assertSame('9', (string) $document->version);
        $this->assertSame(5, $document->collectionRule->version);
        $this->assertSame("過去の適用条件。\n個別判断が必要。", $document->applicability_condition_snapshot);
        $this->assertSame('earlier-master', $document->rule_source_snapshot);
        $this->assertSame('undetermined', $document->necessity_status);
    }

    public function test_master_changes_do_not_mutate_case_snapshot_or_decide_necessity(): void
    {
        $rule = $this->customRule();
        // Explicit test fixture only. No production generator, event or automatic copy is installed.
        $document = $this->caseFile()->documents()->create([
            'title' => 'Snapshot fixture', 'category' => 'Custom', 'case_type_document_rule_id' => $rule->id,
            'rule_version_snapshot' => $rule->version,
            'applicability_condition_snapshot' => $rule->applicability_condition,
            'rule_source_snapshot' => $rule->master_source,
        ])->fresh();
        $before = $document->getRawOriginal();
        $this->travel(1)->hours();
        $rule->fill(['version' => 6, 'applicability_condition' => 'Changed condition', 'requirement_level' => 'required']);
        $rule->master_source = 'changed-source';
        $rule->save();
        $this->assertSame($before, $document->fresh()->getRawOriginal());
        $this->assertSame(6, $document->fresh()->collectionRule->version);
        $this->assertSame('undetermined', $document->fresh()->necessity_status);

        // An unrelated case edit must not refresh snapshots either.
        $document->update(['note' => 'Operator note']);
        $this->assertSame(5, $document->fresh()->rule_version_snapshot);
        $this->assertSame('技能実習事件の場合。', $document->fresh()->applicability_condition_snapshot);
        $this->assertSame('fixture-master', $document->fresh()->rule_source_snapshot);
    }

    public function test_reference_alone_does_not_backfill_or_dynamically_resolve_null_snapshots(): void
    {
        $rule = $this->customRule();
        $document = $this->caseFile()->documents()->create([
            'title' => 'Reference only', 'category' => 'Custom', 'case_type_document_rule_id' => $rule->id,
        ])->fresh();
        $this->assertNull($document->rule_version_snapshot);
        $this->assertNull($document->applicability_condition_snapshot);
        $this->assertNull($document->rule_source_snapshot);
        $rule->update(['version' => 6, 'applicability_condition' => null]);
        $this->assertNull($document->fresh()->rule_version_snapshot);
        $this->assertNull($document->fresh()->applicability_condition_snapshot);
    }

    public function test_hard_deleted_rule_loses_reference_but_retains_historical_context(): void
    {
        $rule = $this->customRule();
        $document = $this->caseFile()->documents()->create([
            'title' => 'Retained history', 'category' => 'Custom', 'case_type_document_rule_id' => $rule->id,
            'rule_version_snapshot' => 5, 'applicability_condition_snapshot' => $rule->applicability_condition,
            'rule_source_snapshot' => $rule->master_source,
        ]);
        $rule->delete();
        $document->refresh();
        $this->assertNull($document->case_type_document_rule_id);
        $this->assertSame(5, $document->rule_version_snapshot);
        $this->assertSame('技能実習事件の場合。', $document->applicability_condition_snapshot);
        $this->assertSame('fixture-master', $document->rule_source_snapshot);
    }

    public function test_case_snapshot_storage_does_not_modify_official_masters_or_copy_purposes(): void
    {
        $this->seed([CaseTypeSeeder::class, DocumentTypeMasterSeeder::class, DocumentPurposeSeeder::class, CaseTypeDocumentRuleMasterSeeder::class]);
        $tables = ['document_types', 'document_purposes', 'case_type_document_rules', 'case_type_document_rule_purposes'];
        $before = collect($tables)->mapWithKeys(fn ($table) => [$table => DB::table($table)->get()->toJson()])->all();
        $rule = CaseTypeDocumentRule::whereHas('documentType', fn ($q) => $q->where('code', 'W-105'))->sole();
        $document = $this->caseFile()->documents()->create([
            'title' => 'Fixture only', 'category' => 'Custom', 'case_type_document_rule_id' => $rule->id,
            'rule_version_snapshot' => $rule->version, 'applicability_condition_snapshot' => $rule->applicability_condition,
            'rule_source_snapshot' => $rule->master_source,
        ])->fresh();
        foreach ($before as $table => $rows) {
            $this->assertSame($rows, DB::table($table)->get()->toJson());
        }
        foreach (array_combine($tables, [78, 11, 103, 107]) as $table => $count) {
            $this->assertDatabaseCount($table, $count);
        }
        $this->assertSame(CaseTypeDocumentRuleMasterSeeder::MASTER_SOURCE, $document->rule_source_snapshot);
        $this->assertSame('undetermined', $document->necessity_status);
        $this->assertDatabaseCount('case_document_purposes', 0);
        $this->assertDatabaseCount('case_documents', 1);
    }

    private function caseFile(): CaseFile
    {
        return CaseFile::create(['client_id' => Client::create(['name' => 'Test client'])->id, 'title' => 'Test case']);
    }

    private function customRule(): CaseTypeDocumentRule
    {
        $rule = CaseTypeDocumentRule::create([
            'case_type_id' => CaseType::create(['name' => 'Test type'])->id,
            'document_type_id' => DocumentType::create(['code' => 'TEST-SNAPSHOT', 'name_ja' => 'Test document'])->id,
            'version' => 5, 'applicability_condition' => '技能実習事件の場合。',
        ]);
        $rule->master_source = 'fixture-master';
        $rule->save();

        return $rule;
    }
}
