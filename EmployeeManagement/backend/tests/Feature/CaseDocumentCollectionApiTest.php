<?php

namespace Tests\Feature;

use App\Models\CaseActivity;
use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\CaseType;
use App\Models\CaseTypeDocumentRule;
use App\Models\Client;
use App\Models\DocumentPurpose;
use App\Models\DocumentType;
use App\Models\Employee;
use App\Models\EmployeeTask;
use App\Models\Office;
use App\Models\ReceivedDocument;
use App\Models\User;
use App\Services\CaseDocumentChecklistGenerator;
use App\Services\CaseWorkspaceAuditService;
use Database\Seeders\CaseTypeDocumentRuleMasterSeeder;
use Database\Seeders\CaseTypeSeeder;
use Database\Seeders\DocumentPurposeSeeder;
use Database\Seeders\DocumentTypeMasterSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

class CaseDocumentCollectionApiTest extends TestCase
{
    use RefreshDatabase;

    private CaseFile $case;

    private User $editor;

    private Employee $employee;

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
        $this->seed([RolePermissionSeeder::class, CaseTypeSeeder::class, DocumentTypeMasterSeeder::class,
            DocumentPurposeSeeder::class, CaseTypeDocumentRuleMasterSeeder::class]);
        $office = Office::create(['office_code' => 'TEST', 'name' => 'Test office', 'status' => 'active']);
        $this->employee = Employee::create(['employee_code' => 'TEST001', 'full_name' => 'Test operator',
            'gender' => 'male', 'hire_date' => '2026-01-01', 'office_id' => $office->id, 'status' => 'active',
            'work_email' => 'private@example.test', 'phone' => 'private phone']);
        $this->editor = User::factory()->withRole('level_3')->create(['employee_id' => $this->employee->id]);
        $this->case = $this->newCase();
        Sanctum::actingAs($this->editor);
        $this->mock(CaseDocumentChecklistGenerator::class)->shouldNotReceive('generateForCase');
    }

    public function test_empty_collection_is_read_only_and_does_not_initialize_candidates(): void
    {
        $before = $this->masters();
        $this->getJson($this->url())->assertOk()->assertExactJson([
            'documents' => [],
            'pagination' => ['current_page' => 1, 'per_page' => 25, 'last_page' => 1, 'total' => 0, 'from' => null, 'to' => null],
            'summary' => ['total' => 0, 'necessity' => ['undetermined' => 0, 'required' => 0, 'not_required' => 0],
                'overdue' => 0, 'preservation_priority' => 0, 'collection_result_count' => 0, 'filtered_count' => 0],
        ]);
        $this->assertDatabaseCount('case_documents', 0);
        $this->assertDatabaseCount('case_activities', 0);
        $this->assertSame($before, $this->masters());
    }

    public function test_same_document_type_and_multiple_purposes_remain_distinct_case_items(): void
    {
        $first = $this->document(['collection_source' => '大阪病院', 'target_period_from' => '2026-01-01', 'target_period_to' => '2026-03-31']);
        $second = $this->document(['collection_source' => '京都病院', 'target_period_from' => '2026-04-01', 'target_period_to' => '2026-06-30']);
        $first->purposes()->attach(DocumentPurpose::whereIn('code', ['COMMON', 'W3'])->pluck('id'));
        $second->purposes()->attach(DocumentPurpose::where('code', 'W3')->sole()->id);
        $this->document([], $this->newCase());
        $this->document()->delete();
        $response = $this->getJson($this->url().'?purpose=W3')->assertOk()->assertJsonCount(2, 'documents')
            ->assertJsonPath('summary.total', 2)->assertJsonPath('summary.filtered_count', 2)
            ->assertJsonPath('documents.0.id', $first->id)->assertJsonPath('documents.1.id', $second->id)
            ->assertJsonCount(2, 'documents.0.purposes');
        $this->assertSame(['COMMON', 'W3'], array_column($response->json('documents.0.purposes'), 'code'));
        $this->getJson($this->url($first))->assertOk()->assertJsonCount(2, 'document.purposes');
    }

    public static function filters(): array
    {
        return [
            'code search' => ['search', 'd-003'], 'Japanese search' => ['search', '診断書'],
            'purpose' => ['purpose', 'W3'], 'case source' => ['source', '大阪病院'],
            'assignee' => ['assignee_id', 'ACTOR'], 'necessity' => ['necessity_status', 'required'],
            'collection' => ['collection_status', 'difficult'], 'result' => ['collection_result', 'custodian_unknown'],
            'fulfillment' => ['fulfillment_status', 'insufficient'], 'review' => ['review_status', 'reviewing'],
            'overdue' => ['overdue', 'true'], 'preservation' => ['preservation_priority', 'true'],
            'priority' => ['priority', 'high'], 'deadline end alone' => ['deadline_to', '2026-08-30'],
        ];
    }

    #[DataProvider('filters')]
    public function test_list_filters_match_case_values_with_case_wide_summary(string $field, string $value): void
    {
        $first = $this->document(['collection_source' => '大阪病院', 'assigned_employee_id' => $this->employee->id,
            'necessity_status' => 'required', 'collection_status' => 'difficult', 'collection_result' => 'custodian_unknown',
            'fulfillment_status' => 'insufficient', 'review_status' => 'reviewing', 'preservation_priority' => true,
            'collection_priority' => 'high', 'response_deadline' => '2026-08-30 12:00:00']);
        $first->purposes()->attach(DocumentPurpose::whereIn('code', ['COMMON', 'W3'])->pluck('id'));
        $this->document(['document_type_id' => DocumentType::where('code', 'D-001')->sole()->id,
            'collection_source' => '京都病院', 'response_deadline' => '2026-09-02 12:00:00']);
        $query = http_build_query([$field => $value === 'ACTOR' ? $this->employee->id : $value]);
        $this->getJson($this->url().'?'.$query)->assertOk()->assertJsonCount(1, 'documents')
            ->assertJsonPath('documents.0.id', $first->id)->assertJsonPath('summary.total', 2)
            ->assertJsonPath('summary.filtered_count', 1)->assertJsonPath('summary.necessity.required', 1)
            ->assertJsonPath('summary.necessity.undetermined', 1)->assertJsonPath('summary.overdue', 1)
            ->assertJsonPath('summary.preservation_priority', 1)->assertJsonPath('summary.collection_result_count', 1);
    }

    public function test_source_uses_case_value_not_live_master_and_filters_combine_with_and(): void
    {
        $rule = CaseTypeDocumentRule::where('case_type_id', $this->case->case_type_id)->firstOrFail();
        $rule->update(['standard_source' => 'Master source']);
        $item = $this->document(['case_type_document_rule_id' => $rule->id, 'collection_source' => 'Case source',
            'preservation_priority' => true, 'response_deadline' => '2026-09-02 12:00:00']);
        $this->getJson($this->url().'?'.http_build_query(['source' => 'Master source']))->assertOk()->assertJsonCount(0, 'documents');
        $this->getJson($this->url().'?'.http_build_query(['source' => 'Case source', 'preservation_priority' => 'true',
            'deadline_from' => '2026-09-01', 'deadline_to' => '2026-09-03']))->assertOk()->assertJsonPath('documents.0.id', $item->id);
        $this->getJson($this->url().'?source=Case%20source&preservation_priority=false')->assertOk()->assertJsonCount(0, 'documents');
        $this->getJson($this->url().'?search=%25')->assertOk()->assertJsonCount(0, 'documents');
    }

    public function test_overdue_excludes_received_closed_null_and_exact_now_but_not_not_required(): void
    {
        foreach (['received', 'closed'] as $status) {
            $this->document(['collection_status' => $status, 'response_deadline' => now()->subSecond()]);
        }
        $this->document();
        $this->document(['response_deadline' => now()]);
        $overdue = $this->document(['necessity_status' => 'not_required', 'response_deadline' => now()->subSecond()]);
        $this->getJson($this->url().'?overdue=1')->assertOk()->assertJsonCount(1, 'documents')
            ->assertJsonPath('documents.0.id', $overdue->id)->assertJsonPath('summary.overdue', 1);
        $this->getJson($this->url().'?overdue=false')->assertOk()->assertJsonCount(4, 'documents')->assertJsonPath('summary.overdue', 1);
    }

    public static function sorts(): array
    {
        return array_map(fn ($sort) => [$sort], ['document_code', 'document_name', 'deadline', 'assignee', 'priority', 'updated_at']);
    }

    #[DataProvider('sorts')]
    public function test_controlled_sort_is_bidirectional_and_pagination_is_stable(string $sort): void
    {
        $secondEmployee = $this->employee->replicate();
        $secondEmployee->employee_code = 'TEST002';
        $secondEmployee->full_name = 'ZZZ operator';
        $secondEmployee->work_email = 'second@example.test';
        $secondEmployee->save();
        $alpha = DocumentType::create(['code' => 'X-001', 'name_ja' => 'Alpha', 'document_group' => 'D']);
        $zulu = DocumentType::create(['code' => 'X-002', 'name_ja' => 'Zulu', 'document_group' => 'D']);
        $a = $this->document(['document_type_id' => $alpha->id, 'assigned_employee_id' => $this->employee->id,
            'response_deadline' => '2026-09-01', 'collection_priority' => 'low']);
        $this->travel(1)->minute();
        $b = $this->document(['document_type_id' => $zulu->id, 'assigned_employee_id' => $secondEmployee->id,
            'response_deadline' => '2026-09-02', 'collection_priority' => 'critical']);
        $this->getJson($this->url()."?sort={$sort}&direction=asc&per_page=1")->assertOk()->assertJsonPath('documents.0.id', $a->id)
            ->assertJsonPath('pagination.total', 2)->assertJsonPath('pagination.last_page', 2)->assertJsonPath('pagination.per_page', 1);
        $this->getJson($this->url()."?sort={$sort}&direction=asc&per_page=1&page=2")->assertOk()->assertJsonPath('documents.0.id', $b->id);
        $this->getJson($this->url()."?sort={$sort}&direction=desc")->assertOk()->assertJsonPath('documents.0.id', $b->id);
    }

    public function test_sort_ties_use_id_and_null_deadlines_are_always_last(): void
    {
        $null = $this->document();
        $a = $this->document(['response_deadline' => '2026-09-01']);
        $b = $this->document(['response_deadline' => '2026-09-01']);
        foreach (['asc', 'desc'] as $direction) {
            $response = $this->getJson($this->url().'?sort=deadline&direction='.$direction)->assertOk();
            $this->assertSame([$a->id, $b->id, $null->id], array_column($response->json('documents'), 'id'));
        }
    }

    public function test_detail_has_snapshots_and_safe_read_only_many_to_many_file_metadata(): void
    {
        $item = $this->document(['target_person' => '本人', 'collection_source' => '病院', 'collection_method' => '本人同意後に開示請求',
            'target_period_from' => '2026-01-01', 'target_period_to' => '2026-03-31', 'target_scope' => '診療記録',
            'necessity_status' => 'required', 'necessity_reason' => '必要', 'necessity_decided_by_employee_id' => $this->employee->id,
            'necessity_decided_at' => now(), 'collection_status' => 'closed', 'collection_result' => 'not_exist',
            'fulfillment_status' => 'insufficient', 'review_status' => 'unreviewed', 'assigned_employee_id' => $this->employee->id,
            'requested_at' => now(), 'response_deadline' => now()->addDay(), 'collection_priority' => 'normal',
            'preservation_priority' => true, 'preservation_reason' => '消去リスク', 'rule_version_snapshot' => 7,
            'rule_source_snapshot' => 'historical-source', 'applicability_condition_snapshot' => 'Historical guidance']);
        $item->purposes()->attach(DocumentPurpose::whereIn('code', ['COMMON', 'W3'])->pluck('id'));
        $secondItem = $this->document();
        $file = ReceivedDocument::create(['case_file_id' => $this->case->id, 'title' => 'Medical evidence',
            'original_filename' => 'evidence.pdf', 'storage_type' => 'google_drive', 'external_url' => 'https://drive.google.com/file/d/test',
            'storage_path' => '/private/medical.pdf', 'version' => 2, 'received_at' => now(), 'original_or_copy' => 'original',
            'return_required' => true, 'registered_by_employee_id' => $this->employee->id, 'notes' => 'Internal file note']);
        $item->receivedDocuments()->attach($file->id, ['relationship_type' => 'primary']);
        $secondItem->receivedDocuments()->attach($file->id, ['relationship_type' => 'alternative']);
        $unsafe = ReceivedDocument::create(['case_file_id' => $this->case->id, 'title' => 'Unsafe URL',
            'storage_type' => 'external_link', 'external_url' => 'javascript:alert(1)']);
        $item->receivedDocuments()->attach($unsafe->id);
        $foreign = ReceivedDocument::create(['case_file_id' => $this->newCase()->id, 'title' => 'Secret other case', 'storage_type' => 'upload']);
        $item->receivedDocuments()->attach($foreign->id);
        $deleted = ReceivedDocument::create(['case_file_id' => $this->case->id, 'title' => 'Deleted file', 'storage_type' => 'upload']);
        $item->receivedDocuments()->attach($deleted->id);
        $deleted->delete();
        $before = $this->masters();
        $response = $this->getJson($this->url($item))->assertOk()
            ->assertJsonPath('document.document_type.code', 'D-003')->assertJsonCount(2, 'document.purposes')
            ->assertJsonPath('document.rule.version_snapshot', 7)->assertJsonPath('document.rule.source_snapshot', 'historical-source')
            ->assertJsonPath('document.rule.applicability_condition_snapshot', 'Historical guidance')
            ->assertJsonPath('document.necessity.decided_by.id', $this->employee->id)->assertJsonPath('document.necessity.reason', '必要')
            ->assertJsonPath('document.collection.target_person', '本人')->assertJsonPath('document.collection.source', '病院')
            ->assertJsonPath('document.collection.method', '本人同意後に開示請求')->assertJsonPath('document.collection.target_scope', '診療記録')
            ->assertJsonPath('document.collection.target_period_from', '2026-01-01')->assertJsonPath('document.collection.target_period_to', '2026-03-31')
            ->assertJsonPath('document.collection.status', 'closed')->assertJsonPath('document.collection.result', 'not_exist')
            ->assertJsonPath('document.collection.priority', 'normal')->assertJsonPath('document.collection.preservation_priority', true)
            ->assertJsonPath('document.collection.preservation_reason', '消去リスク')
            ->assertJsonPath('document.assigned_employee.display_name', 'Test operator')
            ->assertJsonPath('document.fulfillment_status', 'insufficient')->assertJsonPath('document.review_status', 'unreviewed')
            ->assertJsonCount(2, 'document.received_documents')->assertJsonPath('document.received_document_count', 2)
            ->assertJsonPath('document.received_documents.0.external_url', 'https://drive.google.com/file/d/test')
            ->assertJsonPath('document.received_documents.0.relationship_type', 'primary')
            ->assertJsonPath('document.received_documents.0.registered_by_employee.id', $this->employee->id)
            ->assertJsonPath('document.received_documents.0.version', 2)->assertJsonPath('document.received_documents.0.return_required', true)
            ->assertJsonPath('document.received_documents.1.external_url', null);
        $this->assertStringNotContainsString('storage_path', $response->getContent());
        $this->assertStringNotContainsString('/private/', $response->getContent());
        $this->assertStringNotContainsString('Secret other case', $response->getContent());
        $this->assertStringNotContainsString('private@example.test', $response->getContent());
        $this->getJson($this->url($secondItem))->assertOk()->assertJsonCount(1, 'document.received_documents')
            ->assertJsonPath('document.received_documents.0.id', $file->id);
        $this->getJson($this->url())->assertOk()->assertJsonPath('documents.0.received_document_count', 2);
        $this->assertSame($before, $this->masters());
    }

    public function test_editor_can_register_an_external_received_document_without_completing_collection(): void
    {
        $item = $this->document(['review_status' => 'reviewed']);

        $this->post($this->receivedUrl($item), [
            'storage_type' => 'external_link', 'title' => '病院からの回答書',
            'external_url' => 'https://example.test/records/123', 'received_at' => '2026-09-01 10:30:00',
            'notes' => '受付で受領',
        ])->assertCreated()
            ->assertJsonPath('document.received_document_count', 1)
            ->assertJsonPath('document.received_documents.0.title', '病院からの回答書')
            ->assertJsonPath('document.received_documents.0.external_url', 'https://example.test/records/123')
            ->assertJsonPath('document.review_status', 'unreviewed');

        $received = ReceivedDocument::sole();
        $this->assertSame($this->case->id, $received->case_file_id);
        $this->assertSame($item->document_type_id, $received->document_type_id);
        $this->assertSame($this->employee->id, $received->registered_by_employee_id);
        $this->assertSame('not_started', $item->refresh()->collection_status);
        $this->assertDatabaseHas('case_document_received_documents', ['case_document_id' => $item->id, 'received_document_id' => $received->id, 'relationship_type' => 'received']);
        $this->assertDatabaseHas('case_activities', ['case_file_id' => $this->case->id, 'title' => '受領文書を登録']);
    }

    public function test_editor_can_upload_and_download_a_received_document_without_exposing_its_path(): void
    {
        Storage::fake('local');
        $item = $this->document();

        $this->post($this->receivedUrl($item), [
            'storage_type' => 'upload', 'title' => '診療記録PDF',
            'file' => UploadedFile::fake()->create('medical-record.pdf', 64, 'application/pdf'),
        ])->assertCreated()->assertJsonPath('document.received_documents.0.external_url', null);

        $received = ReceivedDocument::sole();
        Storage::disk('local')->assertExists($received->storage_path);
        $detail = $this->getJson($this->url($item))->assertOk();
        $this->assertStringNotContainsString($received->storage_path, $detail->getContent());
        $this->get($this->receivedDownloadUrl($item, $received))->assertOk()->assertDownload('medical-record.pdf');

        $foreign = ReceivedDocument::create(['case_file_id' => $this->newCase()->id, 'title' => 'Other case file', 'storage_type' => 'upload', 'storage_path' => 'other.pdf']);
        $this->get($this->receivedDownloadUrl($item, $foreign))->assertNotFound();
    }

    public function test_received_document_requires_a_real_http_link_or_uploaded_file(): void
    {
        $item = $this->document();
        $this->post($this->receivedUrl($item), ['storage_type' => 'external_link', 'title' => 'Unsafe', 'external_url' => 'javascript:alert(1)'])
            ->assertUnprocessable()->assertJsonValidationErrors('external_url');
        $this->post($this->receivedUrl($item), ['storage_type' => 'upload', 'title' => 'Missing file'])
            ->assertUnprocessable()->assertJsonValidationErrors('file');
        $this->assertDatabaseCount('received_documents', 0);
        $this->assertDatabaseCount('case_activities', 0);
    }

    public function test_partial_patch_edits_context_and_does_not_modify_master_legacy_or_snapshot_fields(): void
    {
        $item = $this->document(['status' => 'confirmed', 'file_url' => 'https://example.test/legacy', 'version' => '7',
            'rule_version_snapshot' => 1, 'rule_source_snapshot' => 'old', 'applicability_condition_snapshot' => 'Guidance']);
        $before = $this->masters();
        $data = ['target_person' => '本人', 'collection_source' => '病院', 'collection_method' => "同意を確認\n開示請求",
            'target_period_from' => '2026-01-01', 'target_period_to' => '2026-03-31', 'target_scope' => 'All records',
            'assigned_employee_id' => $this->employee->id, 'requested_at' => '2026-08-31 09:00:00',
            'response_deadline' => '2026-09-15 17:00:00', 'preservation_priority' => true, 'preservation_reason' => '保全が必要'];
        $this->patchJson($this->url($item), $data)->assertOk();
        $item->refresh();
        foreach (['target_person', 'collection_source', 'collection_method', 'target_scope', 'preservation_reason'] as $key) {
            $this->assertSame($data[$key], $item->$key);
        }
        $this->assertTrue($item->preservation_priority);
        $this->assertSame('normal', $item->collection_priority);
        $this->assertSame('confirmed', $item->status);
        $this->assertSame('https://example.test/legacy', $item->file_url);
        $this->assertSame('7', $item->version);
        $this->assertSame(1, $item->rule_version_snapshot);
        $this->assertSame('old', $item->rule_source_snapshot);
        $this->assertSame('Guidance', $item->applicability_condition_snapshot);
        $activity = CaseActivity::sole();
        $this->assertSame($this->employee->id, $activity->created_by_employee_id);
        foreach (['assigned_employee_id', 'response_deadline', 'preservation_priority'] as $field) {
            $this->assertArrayHasKey($field, $activity->metadata['changes']);
        }
        $this->assertSame($before, $this->masters());
    }

    public function test_necessity_decisions_stamp_actor_and_time_and_reset_clears_current_reason_only(): void
    {
        $item = $this->document();
        $this->patchJson($this->url($item), ['necessity_status' => 'not_required'])->assertUnprocessable()->assertJsonValidationErrors('necessity_reason');
        $this->patchJson($this->url($item), ['necessity_status' => 'not_required', 'necessity_reason' => '　 '])->assertUnprocessable();
        $this->patchJson($this->url($item), ['necessity_status' => 'not_required', 'necessity_reason' => '対象期間外'])->assertOk()
            ->assertJsonPath('document.collection.status', 'not_started')->assertJsonPath('document.collection.result', null)
            ->assertJsonPath('document.fulfillment_status', 'undetermined')->assertJsonPath('document.review_status', 'unreviewed');
        $item->refresh();
        $this->assertSame($this->employee->id, $item->necessity_decided_by_employee_id);
        $this->assertTrue($item->necessity_decided_at->equalTo(now()));
        $decidedAt = $item->necessity_decided_at;
        $this->travel(1)->minute();
        $this->patchJson($this->url($item), ['necessity_status' => 'not_required'])->assertOk();
        $this->assertTrue($item->refresh()->necessity_decided_at->equalTo($decidedAt));
        $this->assertDatabaseCount('case_activities', 1);
        $this->patchJson($this->url($item), ['necessity_status' => 'required', 'necessity_reason' => null])->assertOk();
        $this->assertTrue($item->refresh()->necessity_decided_at->equalTo(now()));
        $this->patchJson($this->url($item), ['necessity_status' => 'undetermined', 'necessity_reason' => 'Discard this current reason'])->assertOk()
            ->assertJsonPath('document.necessity.reason', null)->assertJsonPath('document.necessity.decided_by', null)
            ->assertJsonPath('document.necessity.decided_at', null);
        $history = CaseActivity::orderBy('id')->get();
        $this->assertCount(3, $history);
        $this->assertSame('対象期間外', $history[0]->metadata['changes']['necessity_reason']['after']);
        $this->assertSame($this->employee->id, $history[2]->metadata['changes']['necessity_decided_by_employee_id']['before']);
    }

    public static function independentChanges(): array
    {
        return [
            ['collection_status', 'received'], ['collection_status', 'difficult'], ['collection_status', 'requested'],
            ['collection_result', 'not_exist'], ['collection_result', 'not_disclosed'], ['collection_result', 'partially_disclosed'],
            ['collection_result', 'custodian_unknown'], ['collection_result', 'other'],
            ['fulfillment_status', 'satisfied'], ['fulfillment_status', 'insufficient'],
            ['collection_priority', 'high'], ['preservation_priority', true],
        ];
    }

    #[DataProvider('independentChanges')]
    public function test_each_business_axis_updates_without_cascading_and_is_audited(string $field, mixed $value): void
    {
        $item = $this->document(['necessity_status' => 'required']);
        $before = $item->refresh()->getRawOriginal();
        $this->patchJson($this->url($item), [$field => $value])->assertOk();
        $after = $item->refresh()->getRawOriginal();
        foreach ($before as $key => $old) {
            if (! in_array($key, [$field, 'updated_at'], true)) {
                $this->assertSame($old, $after[$key], "Unexpected cascade: {$key}");
            }
        }
        $this->assertSame($value, $item->$field);
        $changes = CaseActivity::sole()->metadata['changes'];
        $this->assertSame([$field], array_keys($changes));
        $this->assertSame($before[$field], $changes[$field]['before']);
    }

    public function test_received_insufficient_and_satisfied_unreviewed_are_valid_combinations(): void
    {
        $item = $this->document();
        $this->patchJson($this->url($item), ['collection_status' => 'received', 'fulfillment_status' => 'insufficient'])
            ->assertOk()->assertJsonPath('document.collection.status', 'received')
            ->assertJsonPath('document.fulfillment_status', 'insufficient')->assertJsonPath('document.review_status', 'unreviewed');
        $this->patchJson($this->url($item), ['fulfillment_status' => 'satisfied'])
            ->assertOk()->assertJsonPath('document.fulfillment_status', 'satisfied')->assertJsonPath('document.review_status', 'unreviewed');
    }

    public function test_review_status_can_only_be_updated_by_level_four_or_five(): void
    {
        $item = $this->document(['necessity_status' => 'required']);

        $this->patchJson($this->url($item), ['review_status' => 'reviewing'])->assertForbidden();
        $this->assertSame('unreviewed', $item->refresh()->review_status);
        $this->assertDatabaseCount('case_activities', 0);

        Sanctum::actingAs(User::factory()->withRole('level_4')->create());
        $this->patchJson($this->url($item), ['review_status' => 'reviewing'])->assertOk()
            ->assertJsonPath('document.review_status', 'reviewing');

        Sanctum::actingAs(User::factory()->withRole('level_5')->create());
        $this->patchJson($this->url($item), ['review_status' => 'reviewed'])->assertOk()
            ->assertJsonPath('document.review_status', 'reviewed');
        $this->assertDatabaseCount('case_activities', 2);
    }

    public function test_confirming_preparation_creates_a_linked_employee_task_and_notification(): void
    {
        $assignee = Employee::create([
            'employee_code' => 'ASSIGN001', 'full_name' => 'Document assignee', 'gender' => 'female',
            'hire_date' => '2026-01-01', 'office_id' => $this->employee->office_id, 'status' => 'active',
            'work_email' => 'assignee@example.test', 'phone' => '090-0000-0000',
        ]);
        $assigneeUser = User::factory()->withRole('level_3')->create(['employee_id' => $assignee->id]);
        $item = $this->document(['collection_source' => '大阪病院']);

        $this->patchJson($this->url($item), [
            'assigned_employee_id' => $assignee->id,
            'requested_at' => '2026-08-31 12:00:00',
            'response_deadline' => '2026-09-05 12:00:00',
        ])->assertOk();

        $task = EmployeeTask::sole();
        $this->assertSame($assignee->id, $task->employee_id);
        $this->assertSame($item->id, $task->case_document_id);
        $this->assertSame('pending', $task->status);
        $this->assertSame('2026-09-05 12:00:00', $task->due_at?->format('Y-m-d H:i:s'));
        $this->assertDatabaseHas('employee_notifications', [
            'user_id' => $assigneeUser->id,
            'title' => '資料収集の依頼が届きました',
        ]);
    }

    public function test_nullable_fields_can_be_explicitly_cleared_and_noop_patch_does_not_create_history(): void
    {
        $item = $this->document(['collection_result' => 'other', 'collection_method' => 'Request', 'assigned_employee_id' => $this->employee->id,
            'response_deadline' => now(), 'preservation_priority' => true, 'preservation_reason' => 'Reason']);
        $this->patchJson($this->url($item), ['collection_result' => null, 'collection_method' => null, 'assigned_employee_id' => null,
            'response_deadline' => null, 'preservation_priority' => false, 'preservation_reason' => null])->assertOk();
        $item->refresh();
        $this->assertNull($item->collection_result);
        $this->assertNull($item->collection_method);
        $this->assertNull($item->assigned_employee_id);
        $this->assertNull($item->response_deadline);
        $this->assertFalse($item->preservation_priority);
        $this->assertNull($item->preservation_reason);
        $before = $item->getRawOriginal();
        $this->travel(1)->minute();
        $this->patchJson($this->url($item), [])->assertOk();
        $this->patchJson($this->url($item), ['collection_result' => null, 'preservation_priority' => false])->assertOk();
        $this->assertSame($before, $item->refresh()->getRawOriginal());
        $this->assertDatabaseCount('case_activities', 1);
    }

    public static function invalidPatches(): array
    {
        return [
            ['necessity_status', 'maybe'], ['collection_status', 'not_exist'], ['collection_result', 'received'],
            ['fulfillment_status', 'received'], ['review_status', 'confirmed'], ['collection_priority', 'urgent'],
            ['preservation_priority', null], ['preservation_priority', 'yes'], ['assigned_employee_id', 999999],
            ['target_period_from', '2026-02-30'], ['requested_at', 'bad'], ['response_deadline', 'bad'],
            ['target_person', str_repeat('a', 256)], ['collection_source', str_repeat('a', 256)],
            ['collection_method', str_repeat('a', 10001)], ['target_scope', str_repeat('a', 10001)],
            ['necessity_reason', str_repeat('a', 5001)], ['preservation_reason', str_repeat('a', 5001)],
            ['collection_status', null], ['collection_priority', null],
        ];
    }

    #[DataProvider('invalidPatches')]
    public function test_invalid_patch_is_rejected_atomically(string $field, mixed $value): void
    {
        $item = $this->document();
        $before = $item->refresh()->getRawOriginal();
        $this->patchJson($this->url($item), [$field => $value, 'collection_method' => $field === 'collection_method' ? $value : 'Must not persist'])
            ->assertUnprocessable()->assertJsonValidationErrors($field);
        $this->assertSame($before, $item->refresh()->getRawOriginal());
        $this->assertDatabaseCount('case_activities', 0);
    }

    public static function protectedFields(): array
    {
        return array_map(fn ($field) => [$field], ['case_file_id', 'document_type_id', 'case_type_document_rule_id',
            'rule_version_snapshot', 'applicability_condition_snapshot', 'rule_source_snapshot', 'is_template_generated',
            'created_by_employee_id', 'created_by_ai_name', 'necessity_decided_by_employee_id', 'necessity_decided_at',
            'purposes', 'received_documents', 'status', 'file_url', 'version', 'deleted_at']);
    }

    #[DataProvider('protectedFields')]
    public function test_protected_and_unknown_fields_are_rejected_even_when_null(string $field): void
    {
        $item = $this->document();
        $before = $item->refresh()->getRawOriginal();
        foreach ([null, '999'] as $value) {
            $this->patchJson($this->url($item), [$field => $value, 'collection_status' => 'received'])->assertUnprocessable()->assertJsonValidationErrors($field);
        }
        $this->assertSame($before, $item->refresh()->getRawOriginal());
        $this->assertDatabaseCount('case_activities', 0);
    }

    public function test_partial_period_validation_uses_stored_other_bound_and_deleted_assignee_is_rejected(): void
    {
        $item = $this->document(['target_period_from' => '2026-01-01', 'target_period_to' => '2026-03-31']);
        $this->patchJson($this->url($item), ['target_period_from' => '2026-04-01'])->assertUnprocessable()->assertJsonValidationErrors('target_period_to');
        $this->patchJson($this->url($item), ['target_period_to' => '2025-12-31'])->assertUnprocessable();
        $this->patchJson($this->url($item), ['target_period_from' => null, 'target_period_to' => '2025-12-31'])->assertOk();
        $this->patchJson($this->url($item), ['target_period_from' => '2026-01-01', 'target_period_to' => '2026-01-01'])->assertOk();
        $this->employee->delete();
        $this->patchJson($this->url($item), ['assigned_employee_id' => $this->employee->id])->assertUnprocessable();
    }

    public function test_activity_failure_rolls_back_document_and_decision_metadata(): void
    {
        $item = $this->document();
        $before = $item->refresh()->getRawOriginal();
        $this->mock(CaseWorkspaceAuditService::class)->shouldReceive('record')->once()->andReturnUsing(function () {
            CaseActivity::create(['case_file_id' => $this->case->id, 'activity_type' => 'note', 'title' => 'Partial history', 'occurred_at' => now()]);
            throw new RuntimeException('Injected audit failure');
        });
        $this->patchJson($this->url($item), ['necessity_status' => 'not_required', 'necessity_reason' => 'Valid reason'])->assertStatus(500);
        $this->assertSame($before, $item->refresh()->getRawOriginal());
        $this->assertDatabaseCount('case_activities', 0);
    }

    public function test_authentication_view_and_edit_permissions_are_not_bypassed(): void
    {
        $item = $this->document();
        $this->app['auth']->forgetGuards();
        $this->getJson($this->url())->assertUnauthorized();
        $this->getJson($this->url($item))->assertUnauthorized();
        $this->patchJson($this->url($item), ['collection_status' => 'received'])->assertUnauthorized();
        Sanctum::actingAs(User::factory()->create());
        $this->getJson($this->url())->assertForbidden();
        $this->getJson($this->url($item))->assertForbidden();
        $this->patchJson($this->url($item), ['collection_status' => 'received'])->assertForbidden();
        foreach (['level_1', 'level_2'] as $role) {
            Sanctum::actingAs(User::factory()->withRole($role)->create());
            $this->getJson($this->url())->assertOk();
            $this->getJson($this->url($item))->assertOk();
            $this->patchJson($this->url($item), ['collection_status' => 'received'])->assertForbidden();
        }
        Sanctum::actingAs($this->editor);
        $this->assertFalse($this->editor->hasRole('level_5'));
        $this->patchJson($this->url($item), ['collection_status' => 'received'])->assertOk();
    }

    public function test_cross_case_and_soft_deleted_resources_return_404_without_sensitive_data(): void
    {
        $foreign = $this->document(['title' => 'Secret medical details'], $this->newCase());
        $before = $foreign->refresh()->getRawOriginal();
        $this->getJson($this->url($foreign))->assertNotFound()->assertDontSee('Secret medical details');
        $this->patchJson($this->url($foreign), ['collection_status' => 'received'])->assertNotFound()->assertDontSee('Secret medical details');
        $this->assertSame($before, $foreign->refresh()->getRawOriginal());
        $item = $this->document();
        $item->delete();
        $this->getJson($this->url($item))->assertNotFound();
        $this->patchJson($this->url($item), [])->assertNotFound();
        $this->case->delete();
        $this->getJson($this->url())->assertNotFound();
        $this->assertDatabaseCount('case_activities', 0);
    }

    public function test_decision_requires_real_employee_and_temporary_password_restriction_still_applies(): void
    {
        $item = $this->document();
        Sanctum::actingAs(User::factory()->withRole('level_3')->create());
        $this->patchJson($this->url($item), ['necessity_status' => 'required'])->assertForbidden();
        $this->assertNull($item->refresh()->necessity_decided_at);
        Sanctum::actingAs(User::factory()->withRole('level_3')->create(['must_change_password' => true]));
        $this->getJson($this->url())->assertForbidden()->assertJsonPath('code', 'password_change_required');
        $this->patchJson($this->url($item), ['collection_status' => 'received'])->assertForbidden();
    }

    public static function invalidQueries(): array
    {
        return [['sort', 'id desc; DROP TABLE clients'], ['direction', 'sideways'], ['per_page', '101'], ['page', '0'],
            ['overdue', 'perhaps'], ['preservation_priority', 'yes'], ['collection_result', '不存在'],
            ['collection_status', 'not_exist'], ['assignee_id', 'bad'], ['deadline_from', '2026-02-30']];
    }

    #[DataProvider('invalidQueries')]
    public function test_invalid_query_parameters_return_422(string $field, string $value): void
    {
        $this->getJson($this->url().'?'.http_build_query([$field => $value]))->assertUnprocessable()->assertJsonValidationErrors($field);
    }

    public function test_list_query_count_does_not_grow_per_row(): void
    {
        $this->document(['assigned_employee_id' => $this->employee->id]);
        DB::enableQueryLog();
        DB::flushQueryLog();
        $this->getJson($this->url())->assertOk();
        $one = count(DB::getQueryLog());
        for ($i = 0; $i < 15; $i++) {
            $this->document(['assigned_employee_id' => $this->employee->id]);
        }
        DB::flushQueryLog();
        $this->getJson($this->url())->assertOk()->assertJsonCount(16, 'documents');
        $many = count(DB::getQueryLog());
        DB::disableQueryLog();
        $this->assertLessThanOrEqual($one, $many);
    }

    private function newCase(): CaseFile
    {
        return CaseFile::create(['client_id' => Client::create(['name' => 'Test client'])->id,
            'case_type_id' => CaseType::where('name', '労災')->sole()->id, 'title' => 'Test case']);
    }

    private function document(array $attributes = [], ?CaseFile $case = null): CaseDocument
    {
        return ($case ?? $this->case)->documents()->create($attributes + [
            'title' => 'Case material', 'category' => 'Checklist',
            'document_type_id' => DocumentType::where('code', 'D-003')->sole()->id,
        ]);
    }

    private function url(?CaseDocument $document = null): string
    {
        return "/api/case-files/{$this->case->id}/document-collection".($document ? "/{$document->id}" : '');
    }

    private function receivedUrl(CaseDocument $document): string
    {
        return $this->url($document).'/received-documents';
    }

    private function receivedDownloadUrl(CaseDocument $document, ReceivedDocument $received): string
    {
        return $this->receivedUrl($document)."/{$received->id}/download";
    }

    private function masters(): array
    {
        return collect(['document_types', 'document_purposes', 'case_type_document_rules', 'case_type_document_rule_purposes'])
            ->mapWithKeys(fn ($table) => [$table => DB::table($table)->orderBy('id')->get()->toJson()])->all();
    }
}
