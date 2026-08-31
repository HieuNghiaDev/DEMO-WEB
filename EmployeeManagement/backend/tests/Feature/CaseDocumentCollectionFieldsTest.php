<?php

namespace Tests\Feature;

use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\Client;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class CaseDocumentCollectionFieldsTest extends TestCase
{
    use RefreshDatabase;

    protected function migrateDatabases(): void
    {
        $this->assertSame('sqlite', config('database.default'));
        $this->assertSame(':memory:', config('database.connections.sqlite.database'));
        $this->artisan('migrate', ['--force' => true])->assertExitCode(0);
    }

    public function test_manual_document_has_nullable_collection_fields_and_false_boolean_default(): void
    {
        $this->assertTrue(Schema::hasColumns('case_documents', ['collection_result', 'collection_method', 'preservation_priority']));
        $document = $this->document(['necessity_status' => 'not_required'])->refresh();
        $this->assertNull($document->collection_result);
        $this->assertNull($document->collection_method);
        $this->assertFalse($document->preservation_priority);
        $this->assertNull($document->preservation_reason);
        $this->assertSame('not_required', $document->necessity_status);
        $document->update(['preservation_priority' => 1]);
        $this->assertTrue($document->refresh()->preservation_priority);
        $document->update(['preservation_priority' => 0]);
        $this->assertFalse($document->refresh()->preservation_priority);
    }

    public static function collectionResults(): array
    {
        return [
            '不存在' => ['not_exist'],
            '不開示' => ['not_disclosed'],
            '一部不開示' => ['partially_disclosed'],
            '保管先不明' => ['custodian_unknown'],
            'その他' => ['other'],
        ];
    }

    #[DataProvider('collectionResults')]
    public function test_approved_result_is_stored_independently_from_progress_and_necessity(string $result): void
    {
        $this->assertContains($result, CaseDocument::COLLECTION_RESULTS);
        $document = $this->document(['collection_result' => $result, 'collection_status' => 'closed', 'necessity_status' => 'required'])->refresh();
        $this->assertSame($result, $document->collection_result);
        $this->assertSame('closed', $document->collection_status);
        $this->assertSame('required', $document->necessity_status);
    }

    public function test_result_validation_contract_accepts_only_canonical_codes_or_null(): void
    {
        // Contract for the future API; A0 does not introduce an endpoint or model validator.
        $this->assertSame(array_column(self::collectionResults(), 0), CaseDocument::COLLECTION_RESULTS);
        $rules = ['collection_result' => ['nullable', Rule::in(CaseDocument::COLLECTION_RESULTS)]];
        foreach ([null, ...CaseDocument::COLLECTION_RESULTS] as $value) {
            $this->assertTrue(Validator::make(['collection_result' => $value], $rules)->passes());
        }
        foreach (['received', 'required', '不存在', 'unknown_result'] as $value) {
            $this->assertTrue(Validator::make(['collection_result' => $value], $rules)->fails());
        }
    }

    public function test_descriptive_method_and_preservation_are_independent_of_other_fields(): void
    {
        $method = "医療機関へ開示請求\n".str_repeat('本人同意を得て代理請求。', 40);
        $document = $this->document([
            'collection_method' => $method, 'collection_source' => 'Hospital A', 'target_scope' => '2026 records',
            'collection_priority' => 'high', 'preservation_reason' => 'Operator explanation',
        ])->refresh();
        $this->assertSame($method, $document->collection_method);
        $this->assertSame('Hospital A', $document->collection_source);
        $this->assertSame('2026 records', $document->target_scope);
        $this->assertFalse($document->preservation_priority);
        $this->assertSame('Operator explanation', $document->preservation_reason);
        $document->update(['preservation_priority' => true, 'collection_priority' => 'low']);
        $this->assertTrue($document->refresh()->preservation_priority);
        $this->assertSame('low', $document->collection_priority);
        $this->assertSame('Operator explanation', $document->preservation_reason);
    }

    public function test_preservation_priority_is_not_nullable(): void
    {
        $document = $this->document();
        $this->expectException(QueryException::class);
        $document->update(['preservation_priority' => null]);
    }

    private function document(array $attributes = []): CaseDocument
    {
        $case = CaseFile::create(['client_id' => Client::create(['name' => 'Test client'])->id, 'title' => 'Test case']);

        return $case->documents()->create($attributes + ['title' => 'Manual material', 'category' => 'Custom']);
    }
}
