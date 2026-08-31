<?php

namespace Tests\Feature;

use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\CaseType;
use App\Models\CaseTypeDocumentRule;
use App\Models\Client;
use App\Models\DocumentPurpose;
use App\Models\DocumentType;
use Database\Seeders\DocumentPurposeSeeder;
use Database\Seeders\DocumentTypeMasterSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class DocumentPurposeTest extends TestCase
{
    use RefreshDatabase;

    protected function migrateDatabases()
    {
        $this->assertSame('sqlite', config('database.default'));
        $this->assertSame(':memory:', config('database.connections.sqlite.database'));
        $this->artisan('migrate', ['--force' => true])->assertExitCode(0);
    }

    public function test_official_purpose_names_and_order_match_source_headings(): void
    {
        $this->seed(DocumentPurposeSeeder::class);
        $this->assertSame([
            'COMMON' => '事件共通の資料',
            'W1' => '契約内容・労働条件の確認',
            'W2' => '事故態様・会社等の責任の検討',
            'W3' => '損害内容・労災給付の確認',
            'W4' => '第三者機関からの資料取得・審査請求に必要な書類',
            'W5' => '労基署・警察署への告訴・告発に関する書類',
            'T1' => '事故の発生・態様・責任関係の確認',
            'T2' => '人身損害の確認',
            'T3' => '物的損害の確認',
            'T4' => '保険・既払金・交渉経過の確認',
            'T5' => '資料取得に必要な書類',
        ], DocumentPurpose::orderBy('sort_order')->pluck('name_ja', 'code')->all());
        $this->assertSame(range(1, 11), DocumentPurpose::orderBy('sort_order')->pluck('sort_order')->all());
        $this->assertSame(11, DocumentPurpose::where('is_active', true)->whereNull('description')->count());
    }

    public function test_reseeding_is_idempotent_and_preserves_custom_purposes(): void
    {
        $custom = DocumentPurpose::create(['code' => 'CUSTOM', 'name_ja' => '独自目的',
            'description' => 'Keep this', 'sort_order' => 99, 'is_active' => false]);
        $this->seed(DocumentPurposeSeeder::class);
        $before = DocumentPurpose::orderBy('id')->get()->toArray();
        $this->travel(1)->hours();
        $this->seed(DocumentPurposeSeeder::class);
        $this->assertSame($before, DocumentPurpose::orderBy('id')->get()->toArray());
        $this->assertSame('Keep this', $custom->fresh()->description);
        $this->assertFalse($custom->fresh()->is_active);
        $this->assertDatabaseCount('document_purposes', 12);
        $purpose = DocumentPurpose::where('code', 'W1')->firstOrFail();
        $purpose->update(['name_ja' => 'Old name', 'is_active' => false]);
        $this->seed(DocumentPurposeSeeder::class);
        $this->assertSame('契約内容・労働条件の確認', $purpose->fresh()->name_ja);
        $this->assertTrue($purpose->fresh()->is_active);
    }

    public function test_one_rule_and_one_checklist_can_serve_multiple_independent_purposes(): void
    {
        [$rule, $document] = $this->ruleAndDocument();
        $this->seed(DocumentPurposeSeeder::class);
        $common = DocumentPurpose::where('code', 'COMMON')->firstOrFail();
        $worker = DocumentPurpose::where('code', 'W4')->firstOrFail();
        $rule->purposes()->attach([$common->id, $worker->id]);
        // Phase 1C-0 does not auto-generate or auto-copy purposes to the case item.
        $this->assertSame(0, $document->purposes()->count());
        $document->purposes()->attach([$common->id, $worker->id]);
        $this->assertSame(['COMMON', 'W4'], $rule->purposes->pluck('code')->all());
        $this->assertSame(['COMMON', 'W4'], $document->purposes->pluck('code')->all());
        $this->assertTrue($common->rules->sole()->is($rule));
        $this->assertTrue($worker->caseDocuments->sole()->is($document));
        $this->assertNotNull($rule->purposes->first()->pivot->created_at);
        $this->assertNotNull($document->purposes->first()->pivot->created_at);
        $this->assertSame(1, CaseDocument::whereHas('purposes', fn ($query) => $query->whereIn('code', ['COMMON', 'W4']))->count());
        $this->assertDatabaseCount('case_type_document_rules', 1);
        $this->assertDatabaseCount('case_documents', 1);

        $document->purposes()->detach($worker->id);
        $this->assertSame(2, $rule->purposes()->count());
        $this->assertSame(['COMMON'], $document->purposes()->pluck('code')->all());
        $rule->purposes()->detach($common->id);
        $this->assertSame(['COMMON'], $document->purposes()->pluck('code')->all());
        $this->assertDatabaseHas('document_purposes', ['id' => $common->id]);
        $this->assertDatabaseHas('document_purposes', ['id' => $worker->id]);
        $this->assertSame('legacy-purpose', $rule->fresh()->purpose_category);
        $this->assertSame('Existing condition', $rule->fresh()->applicability_condition);
    }

    public function test_both_pivots_reject_duplicate_relations(): void
    {
        [$rule, $document] = $this->ruleAndDocument();
        $purpose = DocumentPurpose::create(['code' => 'COMMON', 'name_ja' => '事件共通の資料']);
        foreach ([$rule, $document] as $parent) {
            $parent->purposes()->attach($purpose);
            try {
                $parent->purposes()->attach($purpose);
                $this->fail('Duplicate pivot relation was accepted.');
            } catch (QueryException $exception) {
                $this->assertStringContainsString('UNIQUE constraint failed', $exception->getMessage());
            }
            $this->assertSame(1, $parent->purposes()->count());
        }
    }

    public function test_purpose_code_is_unique(): void
    {
        $this->seed(DocumentPurposeSeeder::class);
        $this->expectException(QueryException::class);
        DocumentPurpose::create(['code' => 'COMMON', 'name_ja' => 'Duplicate']);
    }

    public function test_pivot_foreign_keys_reject_missing_parents(): void
    {
        [$rule, $document] = $this->ruleAndDocument();
        $purpose = DocumentPurpose::create(['code' => 'COMMON', 'name_ja' => '事件共通の資料']);
        foreach ([
            fn () => $rule->purposes()->attach(999999),
            fn () => $document->purposes()->attach(999999),
            fn () => $purpose->rules()->attach(999999),
            fn () => $purpose->caseDocuments()->attach(999999),
        ] as $write) {
            try {
                $write();
                $this->fail('Missing parent was accepted.');
            } catch (QueryException $exception) {
                $this->assertStringContainsString('FOREIGN KEY constraint failed', $exception->getMessage());
            }
        }
    }

    public function test_soft_delete_preserves_links_and_hard_delete_only_cascades_to_pivots(): void
    {
        [$rule, $document] = $this->ruleAndDocument();
        $purpose = DocumentPurpose::create(['code' => 'COMMON', 'name_ja' => '事件共通の資料']);
        $purpose->rules()->attach($rule);
        $purpose->caseDocuments()->attach($document);
        $document->delete();
        $this->assertSame(0, $purpose->caseDocuments()->count());
        $this->assertDatabaseCount('case_document_purposes', 1);
        $document->restore();
        $this->assertSame(1, $purpose->caseDocuments()->count());
        $document->forceDelete();
        $rule->delete();
        $this->assertDatabaseCount('case_document_purposes', 0);
        $this->assertDatabaseCount('case_type_document_rule_purposes', 0);
        $this->assertDatabaseCount('document_purposes', 1);
    }

    public function test_seeder_preserves_78_document_types_legacy_rows_and_does_not_seed_rules(): void
    {
        $this->seed(DocumentTypeMasterSeeder::class);
        $case = CaseFile::create(['client_id' => Client::create(['name' => 'Existing client'])->id,
            'title' => 'Existing case']);
        $case->documents()->create(['title' => 'Existing file', 'category' => 'legacy',
            'file_url' => 'https://drive.google.com/file/d/legacy', 'status' => 'confirmed', 'version' => '7']);
        $tables = ['document_types', 'document_name_catalog', 'document_templates', 'document_template_items',
            'case_documents', 'case_files', 'clients', 'case_types', 'case_type_document_rules',
            'received_documents', 'approval_requests'];
        $before = [];
        foreach ($tables as $table) {
            $before[$table] = DB::table($table)->orderBy('id')->get()->toJson();
        }
        $this->seed(DocumentPurposeSeeder::class);
        $this->seed(DocumentPurposeSeeder::class);
        foreach ($tables as $table) {
            $this->assertSame($before[$table], DB::table($table)->orderBy('id')->get()->toJson(), $table);
        }
        $this->assertDatabaseCount('document_types', 78);
        $this->assertDatabaseCount('document_purposes', 11);
        $this->assertDatabaseCount('case_type_document_rules', 0);
        $this->assertDatabaseCount('case_type_document_rule_purposes', 0);
        $this->assertDatabaseCount('case_document_purposes', 0);
    }

    private function ruleAndDocument(): array
    {
        $type = DocumentType::create(['code' => 'C-002', 'name_ja' => '委任状（民事）']);
        $caseType = CaseType::create(['name' => 'Test case type']);
        $case = CaseFile::create(['client_id' => Client::create(['name' => 'Test client'])->id,
            'case_type_id' => $caseType->id, 'title' => 'Test case']);
        $rule = CaseTypeDocumentRule::create(['case_type_id' => $caseType->id,
            'document_type_id' => $type->id, 'purpose_category' => 'legacy-purpose',
            'applicability_condition' => 'Existing condition']);
        $document = $case->documents()->create(['title' => '委任状（民事）', 'category' => 'Test',
            'document_type_id' => $type->id, 'case_type_document_rule_id' => $rule->id]);

        return [$rule, $document];
    }
}
