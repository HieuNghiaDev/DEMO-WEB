<?php

namespace Tests\Feature;

use App\Models\CaseFile;
use App\Models\CaseType;
use App\Models\CaseTypeDocumentRule;
use App\Models\Client;
use App\Models\DocumentPurpose;
use App\Models\DocumentType;
use Database\Seeders\CaseTypeDocumentRuleMasterSeeder;
use Database\Seeders\CaseTypeSeeder;
use Database\Seeders\DocumentPurposeSeeder;
use Database\Seeders\DocumentTypeMasterSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Tests\TestCase;

class CaseTypeDocumentRuleMasterSeederTest extends TestCase
{
    use RefreshDatabase;

    protected function migrateDatabases(): void
    {
        $this->assertSame('sqlite', config('database.default'));
        $this->assertSame(':memory:', config('database.connections.sqlite.database'));
        $this->artisan('migrate', ['--force' => true])->assertExitCode(0);
    }

    protected function setUp(): void
    {
        parent::setUp();
        // Unrelated IDs deliberately precede the canonical roots.
        CaseType::create(['name' => 'Custom root']);
        $this->seed([CaseTypeSeeder::class, DocumentTypeMasterSeeder::class, DocumentPurposeSeeder::class]);
    }

    public function test_official_candidates_have_exact_domain_and_purpose_counts_without_generating_cases(): void
    {
        $this->seed(CaseTypeDocumentRuleMasterSeeder::class);
        foreach ([
            '労災' => [55, ['COMMON' => 4, 'W1' => 7, 'W2' => 17, 'W3' => 21, 'W4' => 6, 'W5' => 3]],
            '交通事故' => [48, ['COMMON' => 4, 'T1' => 7, 'T2' => 18, 'T3' => 5, 'T4' => 10, 'T5' => 5]],
        ] as $domain => [$total, $counts]) {
            $rules = CaseType::whereNull('parent_id')->where('name', $domain)->sole()->documentRules;
            $this->assertCount($total, $rules);
            foreach ($counts as $purpose => $count) {
                $this->assertCount($count, $rules->filter(fn ($r) => $r->purposes->contains('code', $purpose)));
            }
        }
        $this->assertDatabaseCount('document_types', 78);
        $this->assertDatabaseCount('document_purposes', 11);
        $this->assertDatabaseCount('case_type_document_rules', 103);
        $this->assertDatabaseCount('case_type_document_rule_purposes', 107);
        $this->assertSame(103, CaseTypeDocumentRule::where('requirement_level', 'conditional')->count());
        $this->assertSame(0, CaseTypeDocumentRule::whereHas('caseType', fn ($q) => $q->whereNotNull('parent_id')->orWhere('name', '労災事故'))->count());
        foreach (['clients', 'case_files', 'case_documents', 'received_documents', 'case_document_purposes'] as $table) {
            $this->assertDatabaseCount($table, 0);
        }
    }

    public function test_reseed_preserves_ids_timestamps_masters_and_custom_purpose_links(): void
    {
        $this->seed(CaseTypeDocumentRuleMasterSeeder::class);
        $custom = DocumentPurpose::create(['code' => 'CUSTOM', 'name_ja' => '独自', 'sort_order' => 99]);
        $rule = $this->rule('労災', 'C-002');
        $rule->purposes()->attach($custom);
        // Even an extra link to an official purpose is not provably master-owned.
        $rule->purposes()->attach(DocumentPurpose::where('code', 'T1')->sole());
        $before = $this->snapshot(['case_type_document_rules', 'case_type_document_rule_purposes', 'document_types', 'document_purposes']);
        $this->travel(2)->hours();
        $this->seed(CaseTypeDocumentRuleMasterSeeder::class);
        $this->assertSame($before, $this->snapshot(array_keys($before)));
        $this->assertSame(['COMMON', 'W4', 'T1', 'CUSTOM'], $rule->fresh()->purposes->pluck('code')->all());
    }

    public function test_common_and_salary_documents_have_multiple_purposes_but_one_rule_identity(): void
    {
        $this->seed(CaseTypeDocumentRuleMasterSeeder::class);
        foreach ([['労災', 'C-002', ['COMMON', 'W4']], ['交通事故', 'C-002', ['COMMON', 'T5']],
            ['労災', 'D-001', ['W1', 'W3']], ['労災', 'W-103', ['W1', 'W3']]] as [$domain, $code, $purposes]) {
            $this->assertSame($purposes, $this->rule($domain, $code)->purposes->pluck('code')->all());
        }
        $this->assertCount(4, CaseTypeDocumentRule::has('purposes', '>', 1)->get());
        $this->assertSame(0, DB::table('case_type_document_rules')->select('case_type_id', 'document_type_id', 'version')
            ->groupBy('case_type_id', 'document_type_id', 'version')->havingRaw('COUNT(*) > 1')->get()->count());
    }

    public function test_shared_document_definition_has_distinct_domain_context_and_periods(): void
    {
        $this->seed(CaseTypeDocumentRuleMasterSeeder::class);
        $worker = $this->rule('労災', 'D-003');
        $traffic = $this->rule('交通事故', 'D-003');
        $this->assertNotSame($worker->id, $traffic->id);
        $this->assertSame($worker->document_type_id, $traffic->document_type_id);
        $this->assertSame(['W3'], $worker->purposes->pluck('code')->all());
        $this->assertSame(['T2'], $traffic->purposes->pluck('code')->all());
        $this->assertStringContainsString('人身事故の場合', $traffic->applicability_condition);
        $this->assertStringContainsString('事故前3か月', $this->rule('労災', 'D-001')->standard_period_rule);
        $this->assertStringNotContainsString('3か月', $this->rule('交通事故', 'D-001')->standard_period_rule);
        $this->assertNull($this->rule('労災', 'W-102')->standard_period_rule);
        $this->assertSame('本人・会社・監理団体', $this->rule('労災', 'W-105')->standard_source);
        $this->assertSame('自営業者等', $this->rule('交通事故', 'T-202')->standard_target_person);
    }

    public function test_source_conditions_and_cross_domain_boundaries_are_preserved(): void
    {
        $this->seed(CaseTypeDocumentRuleMasterSeeder::class);
        foreach ([['労災', 'W-105', '技能実習事件の場合'], ['労災', 'W-206', '技能実習事件の場合'],
            ['労災', 'D-009', '後遺障害が問題となる場合'], ['労災', 'D-011', '死亡事件の場合'],
            ['労災', 'W-503', '弁護士の方針決定後'], ['交通事故', 'D-001', '給与所得者の場合'],
            ['交通事故', 'T-202', '自営業者等の場合'], ['交通事故', 'T-203', '家事従事者'],
            ['交通事故', 'T-301', '物損がある場合'], ['交通事故', 'T-204', '認定済みの場合']] as [$domain, $code, $condition]) {
            $this->assertStringContainsString($condition, $this->rule($domain, $code)->applicability_condition);
        }
        $cross = CaseTypeDocumentRule::whereHas('caseType', fn ($q) => $q->where('name', '交通事故'))
            ->whereHas('documentType', fn ($q) => $q->where('code', 'like', 'W-%'))->get();
        $this->assertSame(['W-301', 'W-302', 'W-303', 'W-304'], $cross->pluck('documentType.code')->sort()->values()->all());
        foreach ($cross as $rule) {
            $this->assertStringContainsString('業務中・通勤中等で労災が関係する場合', $rule->applicability_condition);
            $this->assertSame(['T4'], $rule->purposes->pluck('code')->all());
            $this->assertSame('conditional', $rule->requirement_level);
        }
    }

    public function test_preservation_flags_are_limited_to_source_supported_disappearing_evidence(): void
    {
        $this->seed(CaseTypeDocumentRuleMasterSeeder::class);
        $this->assertSame(['T-103', 'T-104', 'W-210'], CaseTypeDocumentRule::where('preservation_priority', true)
            ->get()->pluck('documentType.code')->sort()->values()->all());
        $this->assertSame(3, CaseTypeDocumentRule::where('priority_default', 'high')->count());
        $this->assertSame(100, CaseTypeDocumentRule::where('priority_default', 'normal')->count());
        $this->assertSame(0, CaseTypeDocumentRule::whereNotNull('prerequisite_document_type_id')->count());
        foreach (['C-002', 'A-001', 'A-002', 'A-003', 'A-004', 'A-005', 'A-006', 'A-007', 'W-401', 'W-501', 'W-502'] as $code) {
            $this->assertSame(1, DocumentType::where('code', $code)->count());
        }
    }

    public function test_custom_rules_other_versions_and_existing_cases_are_untouched(): void
    {
        $this->seed(CaseTypeDocumentRuleMasterSeeder::class);
        $official = $this->rule('労災', 'C-001');
        $custom = CaseTypeDocumentRule::create(['case_type_id' => $official->case_type_id,
            'document_type_id' => $official->document_type_id, 'version' => 2, 'applicability_condition' => 'Keep custom', 'is_active' => false]);
        $custom->purposes()->attach(DocumentPurpose::where('code', 'W2')->sole());
        $client = Client::create(['name' => 'Existing customer']);
        $case = CaseFile::create(['client_id' => $client->id, 'case_type_id' => $official->case_type_id, 'title' => 'Keep case']);
        $document = $case->documents()->create(['title' => 'Keep checklist', 'category' => 'Custom',
            'case_type_document_rule_id' => $official->id, 'document_type_id' => $official->document_type_id,
            'status' => 'confirmed', 'necessity_status' => 'not_required', 'version' => '7', 'file_url' => 'https://drive.google.com/file/d/existing']);
        $document->purposes()->attach(DocumentPurpose::where('code', 'W3')->sole());
        $case->delete();
        $before = $this->snapshot(['clients', 'case_files', 'case_documents', 'case_document_purposes', 'case_type_document_rules', 'case_type_document_rule_purposes']);
        $this->travel(1)->hours();
        $this->seed(CaseTypeDocumentRuleMasterSeeder::class);
        $this->assertSame($before, $this->snapshot(array_keys($before)));
    }

    public function test_unowned_identity_collision_aborts_atomically_without_adopting_custom_rule(): void
    {
        $custom = CaseTypeDocumentRule::create(['case_type_id' => CaseType::where('name', '交通事故')->sole()->id,
            'document_type_id' => DocumentType::where('code', 'T-404')->sole()->id, 'version' => 1, 'applicability_condition' => 'Custom rule']);
        $before = $custom->fresh()->getAttributes();
        try {
            $this->seed(CaseTypeDocumentRuleMasterSeeder::class);
            $this->fail('Unowned identity must not be adopted.');
        } catch (RuntimeException $exception) {
            $this->assertStringContainsString('Unowned rule identity', $exception->getMessage());
        }
        $this->assertDatabaseCount('case_type_document_rules', 1);
        $this->assertDatabaseCount('case_type_document_rule_purposes', 0);
        $this->assertSame($before, $custom->fresh()->getAttributes());
    }

    public function test_missing_master_code_rolls_back_instead_of_silently_skipping_rules(): void
    {
        DocumentType::where('code', 'T-404')->delete();
        try {
            $this->seed(CaseTypeDocumentRuleMasterSeeder::class);
            $this->fail('Unmatched code must fail.');
        } catch (RuntimeException $exception) {
            $this->assertStringContainsString('unresolved official rule', $exception->getMessage());
        }
        $this->assertDatabaseCount('case_type_document_rules', 0);
        $this->assertDatabaseCount('case_type_document_rule_purposes', 0);
    }

    public function test_missing_canonical_root_does_not_fall_back_to_legacy_name(): void
    {
        CaseType::where('name', '労災')->update(['name' => '労災事故']);
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('canonical root case type: 労災');
        $this->seed(CaseTypeDocumentRuleMasterSeeder::class);
    }

    public function test_database_rejects_duplicate_case_type_document_version_identity(): void
    {
        $this->seed(CaseTypeDocumentRuleMasterSeeder::class);
        $rule = $this->rule('労災', 'C-002');
        $this->expectException(QueryException::class);
        CaseTypeDocumentRule::create($rule->only(['case_type_id', 'document_type_id', 'version']));
    }

    private function rule(string $domain, string $code): CaseTypeDocumentRule
    {
        return CaseTypeDocumentRule::whereHas('caseType', fn ($q) => $q->whereNull('parent_id')->where('name', $domain))
            ->whereHas('documentType', fn ($q) => $q->where('code', $code))->sole();
    }

    private function snapshot(array $tables): array
    {
        return collect($tables)->mapWithKeys(fn ($table) => [$table => DB::table($table)->orderBy('id')->get()->toJson()])->all();
    }
}
