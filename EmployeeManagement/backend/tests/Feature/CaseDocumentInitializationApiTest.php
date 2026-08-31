<?php

namespace Tests\Feature;

use App\Models\CaseActivity;
use App\Models\CaseFile;
use App\Models\CaseType;
use App\Models\CaseTypeDocumentRule;
use App\Models\Client;
use App\Models\DocumentPurpose;
use App\Models\DocumentTemplate;
use App\Models\DocumentType;
use App\Models\Employee;
use App\Models\Office;
use App\Models\User;
use App\Services\CaseWorkspaceAuditService;
use Database\Seeders\CaseTypeDocumentRuleMasterSeeder;
use Database\Seeders\CaseTypeSeeder;
use Database\Seeders\DocumentPurposeSeeder;
use Database\Seeders\DocumentTypeMasterSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

class CaseDocumentInitializationApiTest extends TestCase
{
    use RefreshDatabase;

    private User $editor;

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
        $office = Office::create(['office_code' => 'INIT', 'name' => 'Initialization test', 'status' => 'active']);
        $employee = Employee::create(['employee_code' => 'INIT001', 'full_name' => 'Initialization operator',
            'gender' => 'male', 'hire_date' => '2026-01-01', 'office_id' => $office->id, 'status' => 'active']);
        $this->editor = User::factory()->withRole('level_3')->create(['employee_id' => $employee->id]);
        Sanctum::actingAs($this->editor);
    }

    public static function officialTypes(): array
    {
        return [['労災', 55], ['交通事故', 48], ['後遺障害', 48], ['障害（補償）給付', 55]];
    }

    #[DataProvider('officialTypes')]
    public function test_official_preview_initialize_and_rerun_share_counts_and_preserve_history(string $type, int $count): void
    {
        $case = $this->caseFile(CaseType::where('name', $type)->sole());
        $before = $this->snapshot();
        DB::enableQueryLog();
        DB::flushQueryLog();
        $preview = $this->getJson($this->url($case, 'initialization-preview'))->assertOk()
            ->assertJsonPath('case.case_type.name', $type)->assertJsonPath('initialization.available', true)
            ->assertJsonPath('initialization.candidate_count', $count)->assertJsonPath('initialization.missing_candidate_count', $count)
            ->assertJsonPath('initialization.existing_generated_count', 0)->assertJsonPath('initialization.manual_item_count', 0)
            ->assertJsonPath('initialization.total_existing_collection_items', 0)->assertJsonPath('warnings', []);
        foreach (DB::getQueryLog() as $query) {
            $this->assertDoesNotMatchRegularExpression('/^\s*(insert|update|delete|replace|create|drop|alter)\b/i', $query['query']);
        }
        DB::disableQueryLog();
        $this->assertSame($before, $this->snapshot());
        $purposeCounts = collect($preview->json('purposes'))->pluck('candidate_count', 'code')->all();
        $this->assertArrayHasKey('COMMON', $purposeCounts);
        $this->assertGreaterThan($count, array_sum($purposeCounts));

        $first = $this->postJson($this->url($case, 'initialize'))->assertOk()
            ->assertJsonPath('initialization.candidate_count', $count)->assertJsonPath('initialization.created_count', $count)
            ->assertJsonPath('initialization.skipped_count', 0)->assertJsonPath('initialization.total_collection_items', $count);
        $this->assertCount($count, $first->json('initialization.created_case_document_ids'));
        $items = $case->documents()->get();
        $this->assertCount($count, $items->where('necessity_status', 'undetermined'));
        $this->assertCount($count, $items->where('is_template_generated', true));
        $this->assertCount($count, $items->whereNull('necessity_decided_at'));
        $activity = CaseActivity::sole();
        $this->assertSame($this->editor->employee_id, $activity->created_by_employee_id);
        $this->assertSame($this->editor->id, $activity->metadata['actor_user_id']);
        $this->assertSame('document_collection_initialized', $activity->metadata['event']);
        $this->assertSame($count, $activity->metadata['created_count']);
        $this->assertSame($count, $activity->metadata['candidate_count']);
        $this->assertTrue($activity->occurred_at->equalTo(now()));
        foreach ($purposeCounts as $code => $expected) {
            $this->assertSame($expected, $case->documents()->whereHas('purposes', fn ($q) => $q->where('code', $code))->count());
        }
        $stored = $this->snapshot();
        $this->getJson($this->url($case, 'initialization-preview'))->assertOk()
            ->assertJsonPath('initialization.existing_generated_count', $count)->assertJsonPath('initialization.missing_candidate_count', 0);
        $this->assertSame($stored, $this->snapshot());
        $this->postJson($this->url($case, 'initialize'))->assertOk()->assertJsonPath('initialization.created_count', 0)
            ->assertJsonPath('initialization.skipped_count', $count)->assertJsonPath('initialization.total_collection_items', $count);
        $this->assertSame($stored, $this->snapshot());
        foreach (['document_types', 'document_purposes', 'case_type_document_rules', 'case_type_document_rule_purposes'] as $table) {
            $this->assertSame($before[$table], $stored[$table]);
        }
        // The existing A API consumes generated data without a parallel list implementation.
        $this->getJson($this->url($case))->assertOk()->assertJsonPath('summary.total', $count);
        $this->getJson($this->url($case, (string) $items[0]->id))->assertOk()->assertJsonPath('document.necessity.status', 'undetermined');
        $this->patchJson($this->url($case, (string) $items[0]->id), ['collection_status' => 'requested'])->assertOk();
    }

    public function test_rerun_keeps_all_operator_decisions_snapshots_and_soft_deleted_items(): void
    {
        $case = $this->caseFile(CaseType::where('name', '労災')->sole());
        $this->postJson($this->url($case, 'initialize'))->assertOk();
        $items = $case->documents()->get();
        $items[0]->update(['necessity_status' => 'required', 'necessity_reason' => 'Operator decision',
            'collection_status' => 'requested', 'collection_method' => 'Contact hospital', 'collection_result' => 'partially_disclosed',
            'review_status' => 'reviewed', 'fulfillment_status' => 'insufficient', 'preservation_priority' => ! $items[0]->preservation_priority,
            'preservation_reason' => 'Case-specific', 'collection_source' => 'Hospital', 'target_scope' => 'Case period']);
        $items[1]->delete();
        $before = $this->snapshot();
        $this->getJson($this->url($case, 'initialization-preview'))->assertOk()
            ->assertJsonPath('initialization.missing_candidate_count', 0)->assertJsonPath('initialization.existing_generated_count', 54)
            ->assertJsonPath('initialization.soft_deleted_generated_count', 1)
            ->assertJsonFragment(['code' => 'deleted_generated_items_present']);
        $this->postJson($this->url($case, 'initialize'))->assertOk()->assertJsonPath('initialization.created_count', 0)
            ->assertJsonPath('initialization.skipped_count', 55)->assertJsonPath('initialization.total_collection_items', 54);
        $this->assertSame($before, $this->snapshot());
    }

    public function test_later_rule_addition_only_creates_missing_candidate_and_removal_never_deletes_history(): void
    {
        $case = $this->caseFile(CaseType::where('name', '労災')->sole());
        $this->postJson($this->url($case, 'initialize'))->assertOk();
        $old = $case->documents()->orderBy('id')->get()->toJson();
        $type = DocumentType::whereDoesntHave('rules', fn ($q) => $q->where('case_type_id', $case->case_type_id))->firstOrFail();
        $rule = $this->rule($case->case_type_id, $type->id, [], ['COMMON']);
        $this->getJson($this->url($case, 'initialization-preview'))->assertOk()->assertJsonPath('initialization.candidate_count', 56)
            ->assertJsonPath('initialization.existing_generated_count', 55)->assertJsonPath('initialization.missing_candidate_count', 1);
        $newId = $this->postJson($this->url($case, 'initialize'))->assertOk()->assertJsonPath('initialization.created_count', 1)
            ->json('initialization.created_case_document_ids.0');
        $this->assertSame($old, $case->documents()->where('id', '!=', $newId)->orderBy('id')->get()->toJson());
        $rule->update(['is_active' => false]);
        $this->getJson($this->url($case, 'initialization-preview'))->assertOk()->assertJsonPath('initialization.candidate_count', 55)
            ->assertJsonPath('initialization.existing_generated_count', 56)->assertJsonPath('initialization.missing_candidate_count', 0);
        $rule->delete();
        $stored = $this->snapshot();
        $this->postJson($this->url($case, 'initialize'))->assertOk()->assertJsonPath('initialization.created_count', 0);
        $this->assertSame($stored, $this->snapshot());
        $this->assertDatabaseCount('case_activities', 2);
    }

    public function test_shared_plan_uses_nearest_latest_effective_rule_and_union_of_purposes(): void
    {
        $root = CaseType::create(['name' => 'Planner root']);
        $child = CaseType::create(['name' => 'Planner child', 'parent_id' => $root->id]);
        $types = DocumentType::orderBy('id')->take(4)->get();
        $this->rule($root->id, $types[0]->id, ['version' => 9, 'standard_source' => 'Root'], ['COMMON', 'W3']);
        $this->rule($child->id, $types[0]->id, ['version' => 1], ['W5']);
        $primary = $this->rule($child->id, $types[0]->id, ['version' => 2, 'standard_source' => 'Child',
            'effective_from' => '2026-08-31', 'effective_to' => '2026-08-31'], ['COMMON', 'T2']);
        $this->rule($child->id, $types[0]->id, ['version' => 3, 'effective_from' => '2026-09-01'], ['W1']);
        $this->rule($root->id, $types[1]->id, ['is_active' => false]);
        $this->rule($root->id, $types[2]->id, ['effective_to' => '2026-08-30']);
        $this->rule($root->id, $types[3]->id, ['effective_from' => '2026-09-01']);
        $case = $this->caseFile($child);
        $preview = $this->getJson($this->url($case, 'initialization-preview'))->assertOk()
            ->assertJsonPath('initialization.candidate_count', 1)->assertJsonPath('initialization.missing_candidate_count', 1);
        $this->assertSame(['COMMON', 'W3', 'T2'], array_column($preview->json('purposes'), 'code'));
        $this->postJson($this->url($case, 'initialize'))->assertOk()->assertJsonPath('initialization.created_count', 1);
        $document = $case->documents()->sole();
        $this->assertSame($primary->id, $document->case_type_document_rule_id);
        $this->assertSame('Child', $document->collection_source);
        $this->assertSame(2, $document->rule_version_snapshot);
        $this->assertSame(['COMMON', 'W3', 'T2'], $document->purposes->pluck('code')->all());
    }

    public static function manualMatching(): array
    {
        return [[false, 1], [true, 0]];
    }

    #[DataProvider('manualMatching')]
    public function test_manual_contexts_coexist_and_only_exact_duplicate_blocks_candidate(bool $exact, int $missing): void
    {
        $type = CaseType::create(['name' => 'Manual contexts']);
        $documentType = DocumentType::where('code', 'D-003')->sole();
        $this->rule($type->id, $documentType->id, ['standard_source' => '大阪病院', 'standard_target_person' => '本人', 'standard_period_rule' => '診療期間']);
        $case = $this->caseFile($type);
        foreach (['大阪病院', '京都病院'] as $source) {
            $case->documents()->create(['title' => '診断書', 'category' => 'Manual', 'document_type_id' => $documentType->id,
                'collection_source' => $source, 'target_period_from' => '2026-01-01', 'target_period_to' => '2026-03-31']);
        }
        if ($exact) {
            $case->documents()->create(['title' => 'Matching context', 'category' => 'Manual', 'document_type_id' => $documentType->id,
                'collection_source' => '大阪病院', 'target_person' => '本人', 'target_scope' => '診療期間']);
        }
        $old = $case->documents()->orderBy('id')->get()->toJson();
        $manual = $exact ? 3 : 2;
        $this->getJson($this->url($case, 'initialization-preview'))->assertOk()->assertJsonPath('initialization.manual_item_count', $manual)
            ->assertJsonPath('initialization.missing_candidate_count', $missing)->assertJsonFragment(['code' => 'manual_items_present']);
        $this->postJson($this->url($case, 'initialize'))->assertOk()->assertJsonPath('initialization.created_count', $missing)
            ->assertJsonPath('initialization.total_collection_items', $manual + $missing);
        $this->assertSame($old, $case->documents()->where('is_template_generated', false)->orderBy('id')->get()->toJson());
    }

    public function test_legacy_template_items_warn_without_being_migrated_or_blocking_generation(): void
    {
        $case = $this->caseFile(CaseType::where('name', '労災')->sole());
        $template = DocumentTemplate::create(['case_type_id' => $case->case_type_id, 'name' => 'Legacy template', 'version' => 1]);
        $item = $template->items()->create(['title' => '診断書', 'code' => 'OLD', 'requirement_level' => 'required']);
        $legacy = $case->documents()->create(['title' => '診断書', 'category' => 'Legacy', 'template_item_id' => $item->id,
            'is_template_generated' => true, 'file_url' => 'https://example.test/legacy', 'status' => 'confirmed']);
        $before = $legacy->refresh()->getRawOriginal();
        $this->getJson($this->url($case, 'initialization-preview'))->assertOk()->assertJsonPath('initialization.legacy_item_count', 1)
            ->assertJsonFragment(['code' => 'legacy_document_items_present'])->assertJsonPath('initialization.missing_candidate_count', 55);
        $this->postJson($this->url($case, 'initialize'))->assertOk()->assertJsonPath('initialization.created_count', 55);
        $this->assertSame($before, $legacy->refresh()->getRawOriginal());
    }

    public function test_missing_or_invalid_selected_type_is_unavailable_and_post_returns_controlled_422(): void
    {
        $case = $this->caseFile(null);
        foreach ([null, 999999] as $id) {
            DB::statement('PRAGMA defer_foreign_keys = ON');
            $case->update(['case_type_id' => $id]);
            $before = $this->snapshot();
            $this->getJson($this->url($case, 'initialization-preview'))->assertOk()->assertJsonPath('initialization.available', false)
                ->assertJsonPath('case.case_type', null)->assertJsonFragment(['code' => 'case_type_missing']);
            $this->postJson($this->url($case, 'initialize'))->assertUnprocessable()->assertJsonPath('code', 'case_type_required');
            $this->assertSame($before, $this->snapshot());
        }
    }

    public function test_valid_type_with_no_rules_returns_noop_without_activity(): void
    {
        $case = $this->caseFile(CaseType::create(['name' => 'No rules']));
        $before = $this->snapshot();
        $this->getJson($this->url($case, 'initialization-preview'))->assertOk()->assertJsonPath('initialization.available', true)
            ->assertJsonPath('initialization.candidate_count', 0)->assertJsonPath('initialization.missing_candidate_count', 0)
            ->assertJsonFragment(['code' => 'no_rules']);
        $this->postJson($this->url($case, 'initialize'))->assertOk()->assertJsonPath('initialization.created_count', 0);
        $this->assertSame($before, $this->snapshot());
    }

    public function test_invalid_hierarchy_or_master_metadata_is_reported_without_internal_details_or_partial_writes(): void
    {
        $type = CaseType::create(['name' => 'Invalid hierarchy']);
        $case = $this->caseFile($type);
        $type->update(['parent_id' => $type->id]);
        foreach (['cycle', 'metadata'] as $condition) {
            if ($condition === 'metadata') {
                $type->update(['parent_id' => null]);
                $this->rule($type->id, DocumentType::firstOrFail()->id, ['standard_source' => str_repeat('X', 256)]);
            }
            $before = $this->snapshot();
            $this->getJson($this->url($case, 'initialization-preview'))->assertUnprocessable()
                ->assertJsonPath('code', 'checklist_planning_unavailable')->assertJsonMissingPath('exception');
            $this->postJson($this->url($case, 'initialize'))->assertUnprocessable()
                ->assertJsonPath('code', 'checklist_planning_unavailable')->assertJsonMissingPath('trace');
            $this->assertSame($before, $this->snapshot());
        }
    }

    public function test_new_rules_between_preview_and_post_are_replanned_instead_of_trusting_stale_preview(): void
    {
        $type = CaseType::create(['name' => 'Replan']);
        $case = $this->caseFile($type);
        $this->getJson($this->url($case, 'initialization-preview'))->assertOk()->assertJsonPath('initialization.candidate_count', 0);
        $this->rule($type->id, DocumentType::firstOrFail()->id);
        $this->postJson($this->url($case, 'initialize'))->assertOk()->assertJsonPath('initialization.candidate_count', 1)
            ->assertJsonPath('initialization.created_count', 1);
    }

    public function test_activity_failure_rolls_back_generator_documents_and_purpose_pivots(): void
    {
        $case = $this->caseFile(CaseType::where('name', '労災')->sole());
        $before = $this->snapshot();
        $this->mock(CaseWorkspaceAuditService::class)->shouldReceive('record')->once()->andThrow(new RuntimeException('Injected activity failure'));
        $this->postJson($this->url($case, 'initialize'))->assertStatus(500);
        $this->assertSame($before, $this->snapshot());
    }

    public function test_rbac_static_routes_and_deleted_case_binding(): void
    {
        $case = $this->caseFile(CaseType::where('name', '労災')->sole());
        foreach (['GET' => ['initialization-preview', 'preview'], 'POST' => ['initialize', 'initialize']] as $method => [$suffix, $action]) {
            $route = Route::getRoutes()->match(Request::create($this->url($case, $suffix), $method));
            $this->assertSame($action, $route->getActionMethod());
            $this->assertArrayNotHasKey('caseDocument', $route->parameters());
        }
        $this->app['auth']->forgetGuards();
        $this->getJson($this->url($case, 'initialization-preview'))->assertUnauthorized();
        $this->postJson($this->url($case, 'initialize'))->assertUnauthorized();
        Sanctum::actingAs(User::factory()->create());
        $this->getJson($this->url($case, 'initialization-preview'))->assertForbidden();
        $this->postJson($this->url($case, 'initialize'))->assertForbidden();
        Sanctum::actingAs(User::factory()->withRole('level_1')->create());
        $this->getJson($this->url($case, 'initialization-preview'))->assertOk();
        $this->postJson($this->url($case, 'initialize'))->assertForbidden();
        Sanctum::actingAs($this->editor);
        $this->assertFalse($this->editor->hasRole('level_5'));
        $this->postJson($this->url($case, 'initialize'))->assertOk();
        $case->delete();
        $this->getJson($this->url($case, 'initialization-preview'))->assertNotFound();
        $this->postJson($this->url($case, 'initialize'))->assertNotFound();
    }

    public function test_body_cannot_forge_actor_or_candidate_composition_and_temporary_password_is_blocked(): void
    {
        $case = $this->caseFile(CaseType::where('name', '労災')->sole());
        foreach (['actor_id', 'employee_id', 'created_by', 'document_ids', 'rule_ids', 'necessity_status', 'status', 'purposes'] as $field) {
            $this->postJson($this->url($case, 'initialize'), [$field => null])->assertUnprocessable();
        }
        $this->postJson($this->url($case, 'initialize').'?employee_id=1')->assertUnprocessable();
        $this->assertDatabaseCount('case_documents', 0);
        $this->assertDatabaseCount('case_activities', 0);
        $this->editor->update(['must_change_password' => true]);
        $this->postJson($this->url($case, 'initialize'))->assertForbidden()->assertJsonPath('code', 'password_change_required');
    }

    public function test_case_creation_remains_separate_from_v2_initialization(): void
    {
        $this->postJson('/api/case-files', ['case_type_id' => CaseType::where('name', '労災')->sole()->id,
            'title' => 'Explicit workflow', 'client' => ['name' => 'No automatic candidates']])->assertCreated();
        $this->assertDatabaseCount('case_documents', 0);
        $this->assertDatabaseCount('case_activities', 0);
    }

    private function caseFile(?CaseType $type): CaseFile
    {
        return CaseFile::create(['client_id' => Client::create(['name' => 'Initialization client'])->id,
            'case_type_id' => $type?->id, 'title' => 'Initialization test case']);
    }

    private function rule(int $caseType, int $documentType, array $attributes = [], array $purposes = []): CaseTypeDocumentRule
    {
        $rule = CaseTypeDocumentRule::create($attributes + ['case_type_id' => $caseType, 'document_type_id' => $documentType]);
        $rule->purposes()->attach(DocumentPurpose::whereIn('code', $purposes)->pluck('id'));

        return $rule;
    }

    private function url(CaseFile $case, string $suffix = ''): string
    {
        return "/api/case-files/{$case->id}/document-collection".($suffix === '' ? '' : '/'.$suffix);
    }

    private function snapshot(): array
    {
        return collect(['document_types', 'document_purposes', 'case_type_document_rules', 'case_type_document_rule_purposes',
            'clients', 'case_files', 'case_documents', 'case_document_purposes', 'case_activities'])
            ->mapWithKeys(fn ($table) => [$table => DB::table($table)->orderBy('id')->get()->toJson()])->all();
    }
}
