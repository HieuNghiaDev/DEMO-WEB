<?php

namespace Tests\Feature;

use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\CaseType;
use App\Models\CaseTypeDocumentRule;
use App\Models\Client;
use App\Models\DocumentPurpose;
use App\Models\DocumentType;
use App\Services\CaseDocumentChecklistGenerator;
use Database\Seeders\CaseTypeDocumentRuleMasterSeeder;
use Database\Seeders\CaseTypeSeeder;
use Database\Seeders\DocumentPurposeSeeder;
use Database\Seeders\DocumentTypeMasterSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

class CaseDocumentChecklistGeneratorTest extends TestCase
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
        $this->travelTo(now()->setDate(2026, 8, 31)->setTime(12, 0));
        $this->seed([CaseTypeSeeder::class, DocumentTypeMasterSeeder::class, DocumentPurposeSeeder::class, CaseTypeDocumentRuleMasterSeeder::class]);
    }

    public static function officialCases(): array
    {
        return [
            'workers parent' => ['労災', 55],
            'traffic parent' => ['交通事故', 48],
            'traffic subtype' => ['後遺障害', 48],
            'workers subtype' => ['障害（補償）給付', 55],
        ];
    }

    #[DataProvider('officialCases')]
    public function test_official_parent_and_subtype_candidates_are_complete_and_idempotent(string $name, int $expected): void
    {
        $before = $this->masterSnapshot();
        $case = $this->caseFile(CaseType::where('name', $name)->sole());
        $this->assertSame(0, $case->documents()->count()); // Service only; no model creation observer.
        $result = $this->generate($case);
        $this->assertSame($expected, $result['candidate_count']);
        $this->assertSame($expected, $result['created_count']);
        $this->assertSame(0, $result['skipped_count']);
        $this->assertCount($expected, $result['created_case_document_ids']);
        $documents = $case->documents()->get();
        $this->assertSame($expected, $documents->unique('document_type_id')->count());
        $this->assertCount($expected, $documents->where('necessity_status', 'undetermined'));
        $this->assertCount($expected, $documents->where('collection_status', 'not_started'));
        $this->assertCount($expected, $documents->where('fulfillment_status', 'undetermined'));
        $this->assertCount($expected, $documents->where('review_status', 'unreviewed'));
        $this->assertCount($expected, $documents->where('is_template_generated', true));
        $this->assertCount($expected, $documents->where('requirement_level', 'conditional'));
        $this->assertCount($expected, $documents->whereNull('target_period_from')->whereNull('target_period_to'));
        $this->assertCount($expected, $documents->whereNull('preservation_reason'));
        $stored = $this->caseSnapshot();
        $this->travel(1)->hours();
        $this->assertSame(['created_count' => 0, 'skipped_count' => $expected, 'candidate_count' => $expected,
            'created_case_document_ids' => []], $this->generate($case));
        $this->assertSame($stored, $this->caseSnapshot());
        $this->assertSame($before, $this->masterSnapshot());
        foreach (['document_types' => 78, 'document_purposes' => 11, 'case_type_document_rules' => 103, 'case_type_document_rule_purposes' => 107] as $table => $count) {
            $this->assertDatabaseCount($table, $count);
        }
    }

    public function test_conditional_snapshots_multi_purpose_source_scope_and_preservation_priority(): void
    {
        $case = $this->caseFile(CaseType::where('name', '労災')->sole());
        $this->generate($case);
        $conditional = $this->document($case, 'D-009');
        $this->assertStringContainsString('後遺障害が問題となる場合', $conditional->applicability_condition_snapshot);
        $this->assertSame('undetermined', $conditional->necessity_status);
        $this->assertSame(1, $conditional->rule_version_snapshot);
        $this->assertSame(CaseTypeDocumentRuleMasterSeeder::MASTER_SOURCE, $conditional->rule_source_snapshot);
        $common = $this->document($case, 'C-002');
        $this->assertSame(['COMMON', 'W4'], $common->purposes->pluck('code')->all());
        $this->assertSame(2, $common->purposes()->count());
        $salary = $this->document($case, 'D-001');
        $this->assertSame(['W1', 'W3'], $salary->purposes->pluck('code')->all());
        $this->assertStringContainsString('事故前3か月', $salary->target_scope);
        $this->assertNull($salary->target_period_from);
        $this->assertSame('本人・会社', $salary->collection_source);
        $this->assertSame('high', $this->document($case, 'W-210')->collection_priority);
        $traffic = $this->caseFile(CaseType::where('name', '交通事故')->sole());
        $this->generate($traffic);
        $this->assertSame('high', $this->document($traffic, 'T-103')->collection_priority);
        $this->assertSame('high', $this->document($traffic, 'T-104')->collection_priority);
        $this->assertSame('自営業者等', $this->document($traffic, 'T-202')->target_person);
        $this->assertSame('undetermined', $this->document($traffic, 'W-301')->necessity_status);
    }

    public function test_nearest_rule_wins_and_purposes_union_only_latest_effective_version_per_level(): void
    {
        $root = CaseType::create(['name' => 'Root']);
        $middle = CaseType::create(['name' => 'Middle', 'parent_id' => $root->id]);
        $child = CaseType::create(['name' => 'Leaf', 'parent_id' => $middle->id]);
        $type = DocumentType::where('code', 'D-003')->sole();
        $this->rule($root, $type, ['version' => 10], ['COMMON', 'W3']);
        $this->rule($middle, $type, ['version' => 1], ['T1']);
        $this->rule($child, $type, ['version' => 1], ['W5']);
        $primary = $this->rule($child, $type, ['version' => 2, 'standard_source' => 'Child source',
            'standard_period_rule' => 'Child scope', 'applicability_condition' => 'Child condition'], ['COMMON', 'T2']);
        $case = $this->caseFile($child);
        $this->assertSame(1, $this->generate($case)['created_count']);
        $document = $case->documents()->sole();
        $this->assertSame($primary->id, $document->case_type_document_rule_id);
        $this->assertSame(2, $document->rule_version_snapshot);
        $this->assertSame('Child source', $document->collection_source);
        $this->assertSame('Child scope', $document->target_scope);
        $this->assertSame('Child condition', $document->applicability_condition_snapshot);
        $this->assertSame(['COMMON', 'W3', 'T1', 'T2'], $document->purposes->pluck('code')->all());
    }

    public function test_effective_dates_are_inclusive_and_inactive_expired_future_rules_are_excluded(): void
    {
        $root = CaseType::create(['name' => 'Dates']);
        $child = CaseType::create(['name' => 'Dates child', 'parent_id' => $root->id]);
        $types = DocumentType::orderBy('id')->take(5)->get();
        $this->rule($root, $types[0], ['effective_from' => '2026-08-31', 'effective_to' => '2026-08-31']);
        $this->rule($root, $types[1], ['is_active' => false]);
        $this->rule($root, $types[2], ['effective_to' => '2026-08-30']);
        $this->rule($root, $types[3], ['effective_from' => '2026-09-01']);
        $this->rule($root, $types[4], ['version' => 1]);
        $this->rule($root, $types[4], ['version' => 2, 'effective_from' => '2026-09-01']);
        $this->rule($child, $types[0], ['is_active' => false, 'version' => 9]);
        $case = $this->caseFile($child);
        $result = $this->generate($case);
        $this->assertSame(2, $result['candidate_count']);
        $this->assertSame([$types[0]->id, $types[4]->id], $case->documents()->orderBy('id')->pluck('document_type_id')->all());
        $this->assertSame(1, $case->documents()->where('document_type_id', $types[4]->id)->sole()->rule_version_snapshot);
    }

    public function test_repeated_generation_preserves_all_operator_decisions_and_soft_deletion(): void
    {
        $case = $this->caseFile(CaseType::where('name', '交通事故')->sole());
        $this->generate($case);
        foreach (['D-003' => 'required', 'D-004' => 'not_required'] as $code => $necessity) {
            $this->document($case, $code)->update(['necessity_status' => $necessity, 'necessity_reason' => 'Operator decision',
                'collection_status' => 'requested', 'fulfillment_status' => 'satisfied', 'review_status' => 'reviewed',
                'collection_source' => 'Specific hospital', 'target_person' => 'Person A', 'target_scope' => 'Updated scope',
                'target_period_from' => '2026-01-01', 'note' => 'Keep note', 'collection_priority' => 'critical']);
        }
        $this->document($case, 'T-103')->delete();
        $before = $this->caseSnapshot();
        $this->assertSame(0, $this->generate($case)['created_count']);
        $this->assertSame($before, $this->caseSnapshot());
        $this->assertSame(47, $case->documents()->count());
        $this->assertSame(48, $case->documents()->withTrashed()->count());
    }

    public function test_master_updates_new_versions_and_purposes_do_not_rewrite_existing_snapshot(): void
    {
        $root = CaseType::create(['name' => 'Version test']);
        $type = DocumentType::where('code', 'D-003')->sole();
        $rule = $this->rule($root, $type, ['applicability_condition' => 'Original'], ['COMMON']);
        $case = $this->caseFile($root);
        $this->generate($case);
        $before = $this->caseSnapshot();
        $rule->update(['applicability_condition' => 'Updated', 'version' => 2]);
        $rule->master_source = 'new-source';
        $rule->save();
        $rule->purposes()->attach(DocumentPurpose::where('code', 'T2')->sole());
        $this->rule($root, $type, ['version' => 3], ['W3']);
        $this->assertSame(0, $this->generate($case)['created_count']);
        $this->assertSame($before, $this->caseSnapshot());
    }

    public function test_new_rules_are_added_but_removed_or_deactivated_rules_do_not_delete_history(): void
    {
        $root = CaseType::create(['name' => 'Additive']);
        $types = DocumentType::orderBy('id')->take(3)->get();
        $removed = $this->rule($root, $types[0]);
        $inactive = $this->rule($root, $types[1]);
        $case = $this->caseFile($root);
        $this->generate($case);
        $removed->delete(); // Existing FK nulls via schema, but history stays.
        $inactive->update(['is_active' => false]);
        $before = $case->documents()->orderBy('id')->get()->toJson();
        $this->rule($root, $types[2]);
        $result = $this->generate($case);
        $this->assertSame(1, $result['created_count']);
        $this->assertSame(3, $case->documents()->count());
        $this->assertSame($before, $case->documents()->whereNotIn('id', $result['created_case_document_ids'])->orderBy('id')->get()->toJson());
        $this->rule($root, $types[0], ['version' => 2]);
        $this->assertSame(0, $this->generate($case)['created_count']);
    }

    public function test_case_type_change_is_additive_and_uses_fresh_locked_case_state(): void
    {
        $first = CaseType::create(['name' => 'First']);
        $second = CaseType::create(['name' => 'Second']);
        $types = DocumentType::orderBy('id')->take(2)->get();
        $this->rule($first, $types[0]);
        $this->rule($second, $types[0], ['applicability_condition' => 'Other type context']);
        $this->rule($second, $types[1]);
        $case = $this->caseFile($first);
        $this->generate($case);
        $old = $case->documents()->sole()->getRawOriginal();
        CaseFile::whereKey($case->id)->update(['case_type_id' => $second->id]);
        $this->assertSame(1, $this->generate($case)['created_count']);
        $this->assertSame($old, CaseDocument::findOrFail($old['id'])->getRawOriginal());
        $this->assertSame(2, $case->documents()->count());
    }

    public function test_manual_items_with_same_document_type_remain_independent_and_exact_duplicate_is_skipped(): void
    {
        $root = CaseType::create(['name' => 'Manual']);
        $type = DocumentType::where('code', 'D-003')->sole();
        $this->rule($root, $type, ['standard_source' => 'Hospital A', 'standard_target_person' => 'Person', 'standard_period_rule' => 'Scope']);
        $case = $this->caseFile($root);
        $manual = ['title' => 'Manual', 'category' => 'Custom', 'document_type_id' => $type->id,
            'collection_source' => 'Hospital A', 'target_person' => 'Person', 'target_scope' => 'Scope'];
        $case->documents()->create($manual);
        $case->documents()->create(array_replace($manual, ['collection_source' => 'Hospital B']));
        $case->documents()->create(array_replace($manual, ['target_scope' => 'Other scope']));
        $before = $this->caseSnapshot();
        $this->assertSame(0, $this->generate($case)['created_count']);
        $this->assertSame($before, $this->caseSnapshot());
        $this->assertSame(3, $case->documents()->where('is_template_generated', false)->count());
    }

    public function test_different_manual_context_does_not_block_new_automatic_candidate(): void
    {
        $root = CaseType::create(['name' => 'Manual context']);
        $type = DocumentType::where('code', 'D-003')->sole();
        $this->rule($root, $type, ['standard_source' => 'Hospital A']);
        $case = $this->caseFile($root);
        foreach ([['collection_source' => 'Hospital B'], ['collection_source' => 'Hospital A', 'target_period_from' => '2026-01-01'],
            ['collection_source' => 'Hospital A', 'rule_version_snapshot' => 99]] as $context) {
            $case->documents()->create($context + ['title' => 'Manual', 'category' => 'Custom', 'document_type_id' => $type->id]);
        }
        $this->assertSame(1, $this->generate($case)['created_count']);
        $this->assertSame(4, $case->documents()->count());
        $this->assertSame(0, $this->generate($case)['created_count']);
    }

    public function test_missing_case_type_and_no_rules_return_empty_result(): void
    {
        foreach ([null, CaseType::create(['name' => 'No rules'])] as $type) {
            $this->assertSame(['created_count' => 0, 'skipped_count' => 0, 'candidate_count' => 0,
                'created_case_document_ids' => []], $this->generate($this->caseFile($type)));
        }
        $this->assertDatabaseCount('case_documents', 0);
    }

    public function test_cyclic_hierarchy_fails_before_writing_documents(): void
    {
        $root = CaseType::create(['name' => 'Cycle root']);
        $child = CaseType::create(['name' => 'Cycle child', 'parent_id' => $root->id]);
        $root->update(['parent_id' => $child->id]);
        $this->rule($child, DocumentType::firstOrFail());
        try {
            $this->generate($this->caseFile($child));
            $this->fail('Cycle must fail.');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('Cyclic case type hierarchy', $e->getMessage());
        }
        $this->assertDatabaseCount('case_documents', 0);
    }

    public function test_unsaved_or_deleted_case_cannot_be_initialized(): void
    {
        $case = $this->caseFile(CaseType::where('name', '労災')->sole());
        $case->delete();
        foreach ([new CaseFile, $case] as $invalid) {
            try {
                $this->generate($invalid);
                $this->fail('Invalid case must fail.');
            } catch (RuntimeException $e) {
                $this->assertStringContainsString('CaseFile', $e->getMessage());
            }
        }
        $this->assertDatabaseCount('case_documents', 0);
    }

    public function test_missing_parent_in_corrupt_hierarchy_fails_without_partial_generation(): void
    {
        $root = CaseType::create(['name' => 'Broken hierarchy']);
        $this->rule($root, DocumentType::firstOrFail());
        $case = $this->caseFile($root);
        // Defer FK checking only inside the disposable test transaction to model corrupt legacy data.
        DB::statement('PRAGMA defer_foreign_keys = ON');
        $root->update(['parent_id' => 999999]);
        try {
            $this->generate($case);
            $this->fail('Missing ancestor must fail.');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('Invalid case type hierarchy', $e->getMessage());
        }
        $this->assertDatabaseCount('case_documents', 0);
    }

    public function test_incompatible_rule_source_is_not_silently_truncated_and_rolls_back_generation(): void
    {
        $root = CaseType::create(['name' => 'Long source']);
        $types = DocumentType::orderBy('id')->take(2)->get();
        $this->rule($root, $types[0]);
        $this->rule($root, $types[1], ['standard_source' => str_repeat('源', 256)]);
        try {
            $this->generate($this->caseFile($root));
            $this->fail('Source cannot be silently truncated.');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('exceeds the case field capacity', $e->getMessage());
        }
        $this->assertDatabaseCount('case_documents', 0);
    }

    public static function failureStages(): array
    {
        return [['document'], ['purpose']];
    }

    #[DataProvider('failureStages')]
    public function test_failure_on_second_candidate_rolls_back_documents_and_pivots(string $stage): void
    {
        $root = CaseType::create(['name' => 'Atomic']);
        foreach (DocumentType::orderBy('id')->take(2)->get() as $type) {
            $this->rule($root, $type, [], ['COMMON']);
        }
        if ($stage === 'document') {
            DB::unprepared("CREATE TRIGGER fail_candidate BEFORE INSERT ON case_documents WHEN (SELECT COUNT(*) FROM case_documents) >= 1 BEGIN SELECT RAISE(ABORT, 'forced insert failure'); END");
        } else {
            DB::unprepared("CREATE TRIGGER fail_purpose BEFORE INSERT ON case_document_purposes WHEN (SELECT COUNT(*) FROM case_documents) >= 2 BEGIN SELECT RAISE(ABORT, 'forced pivot failure'); END");
        }
        try {
            $this->generate($this->caseFile($root));
            $this->fail('Expected injected storage failure.');
        } catch (QueryException $e) {
            $this->assertStringContainsString('forced', $e->getMessage());
        }
        $this->assertDatabaseCount('case_documents', 0);
        $this->assertDatabaseCount('case_document_purposes', 0);
    }

    public function test_repeated_calls_in_outer_transaction_are_idempotent_and_rollback_with_caller(): void
    {
        $case = $this->caseFile(CaseType::where('name', '労災')->sole());
        DB::beginTransaction();
        try {
            $this->assertSame(55, $this->generate($case)['created_count']);
            $this->assertSame(0, $this->generate($case)['created_count']);
            $this->assertSame(55, $case->documents()->count());
        } finally {
            DB::rollBack();
        }
        $this->assertDatabaseCount('case_documents', 0);
        $this->assertDatabaseCount('case_document_purposes', 0);
    }

    private function generate(CaseFile $case): array
    {
        return app(CaseDocumentChecklistGenerator::class)->generateForCase($case);
    }

    private function caseFile(?CaseType $type): CaseFile
    {
        return CaseFile::create(['client_id' => Client::create(['name' => 'Test client'])->id,
            'case_type_id' => $type?->id, 'title' => 'Test case']);
    }

    private function rule(CaseType $caseType, DocumentType $documentType, array $attributes = [], array $purposes = []): CaseTypeDocumentRule
    {
        $rule = CaseTypeDocumentRule::create($attributes + ['case_type_id' => $caseType->id, 'document_type_id' => $documentType->id]);
        $rule->purposes()->attach(DocumentPurpose::whereIn('code', $purposes)->pluck('id'));

        return $rule;
    }

    private function document(CaseFile $case, string $code): CaseDocument
    {
        return $case->documents()->whereHas('documentType', fn ($q) => $q->where('code', $code))->sole();
    }

    private function masterSnapshot(): array
    {
        return $this->snapshot(['document_types', 'document_purposes', 'case_type_document_rules', 'case_type_document_rule_purposes']);
    }

    private function caseSnapshot(): array
    {
        return $this->snapshot(['case_documents', 'case_document_purposes']);
    }

    private function snapshot(array $tables): array
    {
        return collect($tables)->mapWithKeys(function ($table) {
            $rows = DB::table($table)->get()->map(fn ($r) => json_encode($r))->sort()->values()->all();

            return [$table => $rows];
        })->all();
    }
}
