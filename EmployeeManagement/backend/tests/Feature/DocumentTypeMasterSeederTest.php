<?php

namespace Tests\Feature;

use App\Models\CaseFile;
use App\Models\CaseType;
use App\Models\Client;
use App\Models\DocumentTemplate;
use App\Models\DocumentTemplateItem;
use App\Models\DocumentType;
use Database\Seeders\DocumentTypeMasterSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class DocumentTypeMasterSeederTest extends TestCase
{
    use RefreshDatabase;

    protected function migrateDatabases()
    {
        $this->assertSame('sqlite', config('database.default'));
        $this->assertSame(':memory:', config('database.connections.sqlite.database'));
        $this->artisan('migrate', ['--force' => true])->assertExitCode(0);
    }

    public function test_seeder_contains_exactly_the_distinct_codes_defined_by_the_official_source(): void
    {
        $this->seed(DocumentTypeMasterSeeder::class);
        // Explicit source ranges: D-015 is absent and must not be inferred.
        $expected = [
            ...$this->codes('C', 1, 4),
            ...$this->codes('D', 1, 14), 'D-016', 'D-017',
            ...$this->codes('W', 101, 106), ...$this->codes('W', 201, 217),
            ...$this->codes('W', 301, 304), 'W-401', ...$this->codes('W', 501, 503),
            ...$this->codes('T', 101, 107), ...$this->codes('T', 201, 204),
            ...$this->codes('T', 301, 305), ...$this->codes('T', 401, 404),
            ...$this->codes('A', 1, 7),
        ];
        sort($expected);
        $this->assertSame($expected, DocumentType::orderBy('code')->pluck('code')->all());
        $this->assertDatabaseCount('document_types', 78);
        foreach (['C' => 4, 'D' => 16, 'W' => 31, 'T' => 20, 'A' => 7] as $group => $count) {
            $this->assertSame($count, DocumentType::where('document_group', $group)->count());
        }
        $this->assertSame(78, DocumentType::whereNull('name_vi')->where('version', 1)->where('is_active', true)->count());
        foreach ([
            'C-002' => '委任状（民事）',
            'D-002' => '源泉徴収票・賞与明細等の年収資料',
            'W-202' => '災害調査復命書・添付資料',
            'W-302' => '労災給付認定に関する調査復命書・添付資料',
            'W-401' => '委任状（労災給付処分への審査請求）',
            'W-503' => '告訴状・告発状、事実経過表、証拠一覧、提出用証拠写し',
            'T-404' => '第三者行為災害関係資料',
            'A-002' => '委任状（不開示決定等への審査請求）',
            'A-003' => '同意書・委任状（医療機関宛て）',
        ] as $code => $name) {
            $this->assertDatabaseHas('document_types', ['code' => $code, 'name_ja' => $name]);
        }
    }

    public function test_reseeding_preserves_ids_timestamps_translations_and_custom_types(): void
    {
        $custom = DocumentType::create(['code' => 'CUSTOM-001', 'name_ja' => '独自資料',
            'name_vi' => 'Tài liệu riêng', 'description' => 'Employee-created', 'version' => 3, 'is_active' => false]);
        $customBefore = $custom->fresh()->getRawOriginal();
        $this->seed(DocumentTypeMasterSeeder::class);
        $before = DocumentType::orderBy('id')->get()->toArray();
        $this->travel(1)->hours();
        $this->seed(DocumentTypeMasterSeeder::class);
        $this->assertSame($before, DocumentType::orderBy('id')->get()->toArray());
        $this->assertSame($customBefore, $custom->fresh()->getRawOriginal());
        $this->assertDatabaseCount('document_types', 79);

        $type = DocumentType::where('code', 'C-001')->firstOrFail();
        $id = $type->id;
        $type->update(['name_ja' => 'Old title', 'name_vi' => 'Hợp đồng ủy quyền đã được duyệt', 'is_active' => false]);
        $this->seed(DocumentTypeMasterSeeder::class);
        $this->assertDatabaseHas('document_types', ['id' => $id, 'code' => 'C-001',
            'name_ja' => '委任契約書', 'name_vi' => 'Hợp đồng ủy quyền đã được duyệt', 'is_active' => true]);
    }

    public function test_repeated_source_codes_have_one_row_and_retain_context_from_both_case_types(): void
    {
        $this->seed(DocumentTypeMasterSeeder::class);
        $this->seed(DocumentTypeMasterSeeder::class);
        foreach (['C-002', ...$this->codes('D', 1, 14), 'D-016', 'D-017', 'A-003'] as $code) {
            $this->assertSame(1, DocumentType::where('code', $code)->count(), $code);
        }
        $salary = DocumentType::where('code', 'D-001')->firstOrFail();
        $this->assertStringContainsString('W3. 損害内容・労災給付の確認', $salary->description);
        $this->assertStringContainsString('労災の初動では少なくとも事故前3か月分を収集。', $salary->description);
        $this->assertStringContainsString('T2. 人身損害の確認', $salary->description);
        $this->assertStringContainsString('対象期間は弁護士が指定する。', $salary->description);
        $authorization = DocumentType::where('code', 'C-002')->firstOrFail();
        $this->assertStringContainsString('2. 事件共通の資料', $authorization->description);
        $this->assertStringContainsString('W4.', $authorization->description);
        $this->assertStringContainsString('T5.', $authorization->description);
    }

    public function test_unique_code_constraint_still_rejects_duplicate_rows(): void
    {
        $this->seed(DocumentTypeMasterSeeder::class);
        $this->expectException(QueryException::class);
        DocumentType::create(['code' => 'C-001', 'name_ja' => 'Duplicate']);
    }

    public function test_seeding_does_not_change_legacy_templates_catalog_or_case_documents(): void
    {
        $caseType = CaseType::create(['name' => 'Existing type']);
        $template = DocumentTemplate::create(['case_type_id' => $caseType->id, 'name' => 'Existing template']);
        $item = DocumentTemplateItem::create(['document_template_id' => $template->id,
            'code' => 'legacy', 'title' => 'Existing template item']);
        $case = CaseFile::create(['client_id' => Client::create(['name' => 'Existing client'])->id,
            'case_type_id' => $caseType->id, 'title' => 'Existing case']);
        $case->documents()->create(['title' => 'Existing file', 'category' => 'legacy',
            'template_item_id' => $item->id, 'file_url' => 'https://drive.google.com/file/d/existing',
            'status' => 'confirmed', 'version' => '7']);
        $tables = ['document_name_catalog', 'document_templates', 'document_template_items',
            'case_documents', 'case_files', 'case_types', 'clients', 'case_type_document_rules',
            'received_documents', 'approval_requests'];
        $before = [];
        foreach ($tables as $table) {
            $before[$table] = DB::table($table)->orderBy('id')->get()->toJson();
        }
        $this->seed(DocumentTypeMasterSeeder::class);
        $this->seed(DocumentTypeMasterSeeder::class);
        foreach ($tables as $table) {
            $this->assertSame($before[$table], DB::table($table)->orderBy('id')->get()->toJson(), $table);
        }
    }

    private function codes(string $group, int $from, int $to): array
    {
        return array_map(fn ($number) => sprintf('%s-%03d', $group, $number), range($from, $to));
    }
}
