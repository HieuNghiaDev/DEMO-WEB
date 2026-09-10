<?php

namespace Tests\Feature;

use App\Exceptions\GeneratedDocumentDriveException;
use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\CaseGeneratedDocument;
use App\Models\Client;
use App\Models\DocumentGenerationTemplate;
use App\Models\DocumentSourceFile;
use App\Models\DocumentType;
use App\Models\Employee;
use App\Models\ExternalStorageLocation;
use App\Models\GeneratedDocumentArtifact;
use App\Models\Office;
use App\Models\User;
use App\Services\DocumentPdfRenderer;
use App\Services\GenericLegalDocumentRenderer;
use App\Services\GoogleDriveProvisioningService;
use App\Services\GoogleDriveService;
use Database\Seeders\DocumentGenerationTemplateSeeder;
use Database\Seeders\DocumentTypeMasterSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;

class CaseDocumentCreationApiTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private CaseFile $case;

    private CaseDocument $document;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        $this->seed([RolePermissionSeeder::class, DocumentTypeMasterSeeder::class, DocumentGenerationTemplateSeeder::class]);
        $office = Office::create(['office_code' => 'GEN', 'name' => 'Generation test office', 'status' => 'active']);
        $employee = Employee::create([
            'employee_code' => 'GEN001', 'full_name' => '担当 太郎', 'gender' => 'male',
            'hire_date' => '2026-01-01', 'office_id' => $office->id, 'status' => 'active',
        ]);
        $this->user = User::factory()->withRole('level_3')->create(['employee_id' => $employee->id]);
        $client = Client::create(['name' => '依頼者株式会社', 'address' => '大阪市北区']);
        $this->case = CaseFile::create(['title' => '労災案件', 'reference_number' => 'CASE-2026-001', 'client_id' => $client->id, 'assigned_employee_id' => $employee->id]);
        $this->document = $this->case->documents()->create([
            'title' => '委任契約書', 'category' => 'COMMON',
            'document_type_id' => DocumentType::where('code', 'C-001')->sole()->id,
            'assigned_employee_id' => $employee->id,
        ]);
        Sanctum::actingAs($this->user);
    }

    public function test_c001_master_is_reused_and_template_seeder_is_idempotent(): void
    {
        $masterId = DocumentType::where('code', 'C-001')->sole()->id;
        $this->seed(DocumentGenerationTemplateSeeder::class);
        $this->seed(DocumentGenerationTemplateSeeder::class);

        $this->assertSame($masterId, DocumentType::where('code', 'C-001')->sole()->id);
        $this->assertDatabaseCount('document_types', 78);
        $this->assertSame(1, DocumentGenerationTemplate::where('document_type_id', $masterId)->where('version', 1)->count());
        $this->assertSame(1, DocumentGenerationTemplate::where('document_type_id', $masterId)->where('version', 2)->count());
        $this->assertSame(
            '<article><h1>{{document_name}}</h1><section data-template-fields></section></article>',
            DocumentGenerationTemplate::where('document_type_id', $masterId)->where('version', 1)->sole()->template_body
        );
    }

    public function test_historical_approved_v1_remains_unchanged_and_pinned_after_v2_seed(): void
    {
        $v1 = DocumentGenerationTemplate::where('version', 1)->sole();
        $templateBefore = $v1->getAttributes();
        $approved = [
            'client_name' => '過去の依頼者', 'client_address' => '過去の住所',
            'contract_date' => '2026-09-01', 'case_title' => '過去の事件',
            'responsible_person' => '過去の担当者', 'notes' => '承認済み',
        ];
        $instance = $this->document->generatedDocument()->create([
            'document_generation_template_id' => $v1->id,
            'workflow_status' => 'approved', 'draft_data' => $approved, 'approved_data' => $approved,
            'approved_at' => now(), 'approved_by' => $this->user->id,
            'created_by' => $this->user->id, 'updated_by' => $this->user->id,
        ]);

        $this->seed(DocumentGenerationTemplateSeeder::class);

        $this->assertSame($templateBefore, $v1->fresh()->getAttributes());
        $this->assertSame($v1->id, $instance->fresh()->document_generation_template_id);
        $this->assertSame($approved, $instance->fresh()->approved_data);
        $this->getJson($this->url())->assertOk()
            ->assertJsonPath('template.version', 1)
            ->assertJsonPath('document.approved_data', $approved);
    }

    public function test_active_template_and_real_model_prefill_are_returned_without_creating_an_instance(): void
    {
        $this->getJson($this->url())->assertOk()
            ->assertJsonPath('supported', true)
            ->assertJsonPath('template.document_code', 'C-001')
            ->assertJsonPath('template.version', 2)
            ->assertJsonPath('template.renderer_type', 'generic_legal_document')
            ->assertJsonPath('document.workflow_status', 'not_created')
            ->assertJsonPath('document.draft_data.client_name', '依頼者株式会社')
            ->assertJsonPath('document.draft_data.client_address', '大阪市北区')
            ->assertJsonPath('document.draft_data.case_title', '労災案件')
            ->assertJsonPath('document.draft_data.case_reference', 'CASE-2026-001')
            ->assertJsonPath('document.draft_data.responsible_person', '担当 太郎')
            ->assertJsonPath('document.draft_data.client_signature_name', '依頼者株式会社')
            ->assertJsonPath('document.draft_data.lawyer_signature_name', '担当 太郎');
        $this->assertDatabaseCount('case_generated_documents', 0);
    }

    public function test_unsupported_document_has_no_creation_capability(): void
    {
        DocumentSourceFile::create([
            'document_type_id' => $this->document->document_type_id,
            'source_version' => 1, 'source_kind' => 'original',
            'original_filename' => 'c-001.docx',
            'mime_type' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'storage_provider' => 'local_reference', 'local_reference' => 'C-001/c-001.docx',
            'checksum' => hash('sha256', 'c-001-source'), 'is_active' => true,
        ]);
        $collectedType = DocumentType::where('code', 'D-003')->sole();
        $collectedType->update(['handling_type' => 'collected']);
        // Even an accidentally attached generation template must not turn a
        // collected source document into an editable office-generated document.
        DocumentGenerationTemplate::create([
            'document_type_id' => $collectedType->id, 'version' => 1,
            'renderer_type' => 'generic_legal_document', 'format' => 'html',
            'template_body' => '<article>{{value}}</article>',
            'field_schema' => [['key' => 'value', 'label' => '値', 'type' => 'text', 'required' => false]],
            'is_active' => true,
        ]);
        $unsupported = $this->case->documents()->create([
            'title' => '診断書', 'category' => 'W1',
            'document_type_id' => $collectedType->id,
        ]);
        $this->getJson($this->url($unsupported))->assertOk()->assertExactJson([
            'supported' => false, 'template' => null, 'document' => null,
        ]);
        $this->getJson("/api/case-files/{$this->case->id}/document-collection/{$unsupported->id}")
            ->assertOk()
            ->assertJsonPath('document.document_type.handling_type', 'collected')
            ->assertJsonPath('document.document_type.creation_supported', false)
            ->assertJsonPath('document.document_type.capabilities.collection_only', true)
            ->assertJsonPath('document.document_type.capabilities.generation_supported', false)
            ->assertJsonPath('document.document_type.capabilities.source_available', false);
        $this->patchJson($this->url($unsupported).'/draft', ['draft_data' => ['value' => 'blocked']])
            ->assertNotFound();
        $this->getJson("/api/case-files/{$this->case->id}/document-collection/{$this->document->id}")
            ->assertOk()
            ->assertJsonPath('document.document_type.handling_type', 'office_generated')
            ->assertJsonPath('document.document_type.creation_supported', true)
            ->assertJsonPath('document.document_type.capabilities.generation_supported', true)
            ->assertJsonPath('document.document_type.capabilities.source_available', true);
    }

    public function test_draft_review_and_approval_persist_json_actor_time_and_snapshot(): void
    {
        $draft = $this->validDraft(['client_name' => '変更後の依頼者']);
        $this->patchJson($this->url().'/draft', ['draft_data' => $draft])->assertOk()
            ->assertJsonPath('document.workflow_status', 'draft')
            ->assertJsonPath('document.draft_data.client_name', '変更後の依頼者');
        $this->getJson($this->url())->assertOk()->assertJsonPath('document.workflow_status', 'draft')
            ->assertJsonPath('document.draft_data', $draft);
        $this->postJson($this->url().'/review', ['draft_data' => $draft])->assertOk()
            ->assertJsonPath('document.workflow_status', 'review');
        $this->getJson($this->url())->assertOk()->assertJsonPath('document.workflow_status', 'review')
            ->assertJsonPath('document.draft_data', $draft);
        $this->patchJson($this->url().'/draft', ['draft_data' => $draft])->assertOk()
            ->assertJsonPath('document.draft_data', $draft);
        $this->postJson($this->url().'/review', ['draft_data' => $draft])->assertOk();
        $response = $this->postJson($this->url().'/approve')->assertOk()
            ->assertJsonPath('document.workflow_status', 'approved')
            ->assertJsonPath('document.approved_data.client_name', '変更後の依頼者')
            ->assertJsonPath('document.approved_by.id', $this->user->id);

        $instance = CaseGeneratedDocument::sole();
        $this->assertNotNull($instance->approved_at);
        $this->assertSame($this->user->id, $instance->approved_by);
        $this->assertSame($draft, $instance->approved_data);
        $this->assertNotNull($response->json('document.approved_at'));

        $this->case->client->update(['name' => '後日変更された依頼者']);
        $this->case->update(['title' => '後日の事件名']);
        $this->getJson($this->url().'/approved')->assertOk()
            ->assertJsonPath('approved_document.approved_data', $draft);
        $this->getJson($this->url())->assertOk()->assertJsonPath('document.workflow_status', 'approved')
            ->assertJsonPath('document.approved_data', $draft);
    }

    public function test_template_version_is_pinned_when_a_new_active_version_is_added(): void
    {
        $this->patchJson($this->url().'/draft', ['draft_data' => $this->validDraft()])->assertOk();
        $versionTwo = DocumentGenerationTemplate::where('version', 2)->sole();
        $this->postJson($this->url().'/review', ['draft_data' => $this->validDraft()])->assertOk();
        $this->postJson($this->url().'/approve')->assertOk();
        DocumentGenerationTemplate::create([
            'document_type_id' => $versionTwo->document_type_id, 'version' => 3,
            'renderer_type' => 'generic_legal_document', 'format' => 'html',
            'template_body' => '<article data-version="2"></article>',
            'field_schema' => $versionTwo->field_schema, 'is_active' => true,
        ]);

        $this->getJson($this->url())->assertOk()
            ->assertJsonPath('template.version', 2);
        $this->assertSame($versionTwo->id, CaseGeneratedDocument::sole()->document_generation_template_id);
        $newDocument = $this->case->documents()->create([
            'title' => 'New C-001', 'category' => 'COMMON', 'document_type_id' => $versionTwo->document_type_id,
        ]);
        $this->patchJson($this->url($newDocument).'/draft', ['draft_data' => $this->validDraft()])->assertOk()
            ->assertJsonPath('template.version', 3);
    }

    public function test_cross_case_document_cannot_be_read_or_modified(): void
    {
        $other = CaseFile::create(['title' => 'Other case', 'client_id' => Client::create(['name' => 'Other'])->id]);
        $foreign = $other->documents()->create([
            'title' => 'Foreign C-001', 'category' => 'COMMON',
            'document_type_id' => DocumentType::where('code', 'C-001')->sole()->id,
        ]);

        $this->getJson($this->url($foreign))->assertNotFound();
        $this->patchJson($this->url($foreign).'/draft', ['draft_data' => $this->validDraft()])->assertNotFound();
        $this->postJson($this->url($foreign).'/review', ['draft_data' => $this->validDraft()])->assertNotFound();
        $this->postJson($this->url($foreign).'/approve')->assertNotFound();
        $this->getJson($this->url($foreign).'/approved')->assertNotFound();
        $this->assertDatabaseCount('case_generated_documents', 0);
    }

    public function test_approval_rolls_back_when_an_error_occurs_after_model_update(): void
    {
        $draft = $this->validDraft();
        $this->postJson($this->url().'/review', ['draft_data' => $draft])->assertOk();
        $event = 'eloquent.updated: '.CaseGeneratedDocument::class;
        Event::listen($event, function (CaseGeneratedDocument $document): void {
            if ($document->workflow_status === 'approved') {
                throw new \RuntimeException('Simulated post-update failure');
            }
        });

        try {
            $this->postJson($this->url().'/approve')->assertServerError();
        } finally {
            Event::forget($event);
        }

        $instance = CaseGeneratedDocument::sole();
        $this->assertSame('review', $instance->workflow_status);
        $this->assertNull($instance->approved_data);
        $this->assertNull($instance->approved_at);
        $this->assertNull($instance->approved_by);
    }

    public function test_update_requires_case_update_permission(): void
    {
        Sanctum::actingAs(User::factory()->withRole('level_2')->create());
        $this->getJson($this->url())->assertOk();
        $this->patchJson($this->url().'/draft', ['draft_data' => $this->validDraft()])->assertForbidden();
        $this->postJson($this->url().'/review', ['draft_data' => $this->validDraft()])->assertForbidden();
        $this->postJson($this->url().'/approve')->assertForbidden();
        $this->assertDatabaseCount('case_generated_documents', 0);
    }

    public function test_approved_is_terminal_and_repeated_approval_preserves_snapshot_actor_and_time(): void
    {
        $this->postJson($this->url().'/review', ['draft_data' => $this->validDraft()])->assertOk();
        $this->postJson($this->url().'/approve')->assertOk();
        $before = CaseGeneratedDocument::sole()->getAttributes();
        $this->travel(5)->minutes();
        $this->patchJson($this->url().'/draft', ['draft_data' => $this->validDraft(['notes' => 'tamper'])])->assertUnprocessable();
        $this->postJson($this->url().'/review', ['draft_data' => $this->validDraft(['notes' => 'tamper'])])->assertUnprocessable();
        $this->postJson($this->url().'/approve')->assertUnprocessable();
        $this->assertSame($before, CaseGeneratedDocument::sole()->getAttributes());
        $this->assertDatabaseCount('case_generated_documents', 1);
    }

    public function test_revision_preserves_approved_history_and_creates_an_editable_next_version(): void
    {
        $v1 = $this->validDraft(['notes' => '承認済み v1']);
        $this->postJson($this->url().'/review', ['draft_data' => $v1])->assertOk();
        $this->postJson($this->url().'/approve')->assertOk();
        $approvedV1 = CaseGeneratedDocument::sole()->getAttributes();

        $this->postJson($this->url().'/revision')->assertOk()
            ->assertJsonPath('document.version', 2)
            ->assertJsonPath('document.workflow_status', 'draft')
            ->assertJsonPath('document.draft_data.notes', '承認済み v1')
            ->assertJsonPath('document.approved_data', null)
            ->assertJsonPath('current_version', 2)
            ->assertJsonCount(2, 'versions');

        $this->assertDatabaseCount('case_generated_documents', 2);
        $this->assertSame($approvedV1, CaseGeneratedDocument::where('version', 1)->sole()->getAttributes());
        $this->postJson($this->url().'/revision')->assertUnprocessable();

        $v2 = $this->validDraft(['notes' => '修正済み v2']);
        $this->patchJson($this->url().'/draft', ['draft_data' => $v2])->assertOk();
        $this->postJson($this->url().'/review', ['draft_data' => $v2])->assertOk();
        $this->postJson($this->url().'/approve')->assertOk();

        $this->getJson($this->url().'?version=1')->assertOk()
            ->assertJsonPath('document.version', 1)
            ->assertJsonPath('document.is_current', false)
            ->assertJsonPath('document.approved_data.notes', '承認済み v1');
        $this->getJson($this->url())->assertOk()
            ->assertJsonPath('document.version', 2)
            ->assertJsonPath('document.is_current', true)
            ->assertJsonPath('document.approved_data.notes', '修正済み v2');
        $this->assertSame($approvedV1, CaseGeneratedDocument::where('version', 1)->sole()->getAttributes());
    }

    public function test_used_template_content_is_immutable_and_seeder_preserves_existing_version(): void
    {
        $this->patchJson($this->url().'/draft', ['draft_data' => $this->validDraft()])->assertOk();
        $template = DocumentGenerationTemplate::where('version', 2)->sole();
        $template->update(['is_active' => false]);
        $before = $template->fresh()->getAttributes();
        foreach (['template_body' => 'changed', 'field_schema' => [], 'version' => 99, 'renderer_type' => 'changed', 'format' => 'pdf', 'document_type_id' => 999] as $field => $value) {
            try {
                $template->fresh()->update([$field => $value]);
                $this->fail("Template mutation should be rejected: {$field}");
            } catch (\LogicException $exception) {
                $this->assertStringContainsString('immutable', $exception->getMessage());
            }
        }
        $this->seed(DocumentGenerationTemplateSeeder::class);
        $this->assertSame($before, $template->fresh()->getAttributes());
        $this->getJson($this->url())->assertOk()->assertJsonPath('template.id', $template->id);
    }

    public function test_get_is_side_effect_free_and_repeated_save_reuses_unique_instance(): void
    {
        for ($i = 0; $i < 3; $i++) {
            $this->getJson($this->url())->assertOk();
        }
        $this->assertDatabaseCount('case_generated_documents', 0);
        $collectionBefore = $this->document->fresh()->getAttributes();
        for ($i = 0; $i < 3; $i++) {
            $this->patchJson($this->url().'/draft', ['draft_data' => $this->validDraft()])->assertOk();
            $this->getJson($this->url())->assertOk();
        }
        $this->assertDatabaseCount('case_generated_documents', 1);
        $this->assertSame($collectionBefore, $this->document->fresh()->getAttributes());
        $this->expectException(QueryException::class);
        CaseGeneratedDocument::sole()->replicate()->save();
    }

    public function test_validation_and_unsupported_writes_do_not_change_persisted_draft(): void
    {
        $draft = $this->validDraft(['contract_date' => '']);
        $this->patchJson($this->url().'/draft', ['draft_data' => $draft])->assertOk();
        $before = CaseGeneratedDocument::sole()->getAttributes();
        $this->postJson($this->url().'/review', ['draft_data' => $draft])->assertUnprocessable()
            ->assertJsonValidationErrors('draft_data.contract_date');
        $this->patchJson($this->url().'/draft', ['draft_data' => $draft + ['unknown' => 'value']])->assertUnprocessable();
        $this->postJson($this->url().'/approve')->assertUnprocessable();
        $this->assertSame($before, CaseGeneratedDocument::sole()->getAttributes());
        $unsupported = $this->case->documents()->create(['title' => 'Unsupported', 'category' => 'COMMON']);
        $this->patchJson($this->url($unsupported).'/draft', ['draft_data' => $draft])->assertNotFound();
        $this->postJson($this->url($unsupported).'/review', ['draft_data' => $draft])->assertNotFound();
        $this->postJson($this->url($unsupported).'/approve')->assertNotFound();
        $this->assertDatabaseCount('case_generated_documents', 1);
    }

    public function test_approved_pdf_download_contains_japanese_pdf_and_safe_snapshot_filename(): void
    {
        $draft = $this->validDraft(['client_name' => '../山田/太郎:確認', 'notes' => '日本語の保存内容です。']);
        $this->postJson($this->url().'/review', ['draft_data' => $draft])->assertOk();
        $this->postJson($this->url().'/approve')->assertOk();
        $before = CaseGeneratedDocument::sole()->getAttributes();
        $this->case->client->update(['name' => 'LIVE CLIENT CHANGED']);
        $this->case->update(['title' => 'LIVE CASE CHANGED']);
        $response = $this->getJson($this->url().'/pdf')->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF-', $response->getContent());
        $this->assertGreaterThan(5000, strlen($response->getContent()));
        $disposition = rawurldecode($response->headers->get('Content-Disposition'));
        $this->assertStringContainsString('attachment;', $disposition);
        $this->assertStringContainsString('委任契約書', $disposition);
        $this->assertStringContainsString('v1', $disposition);
        $this->assertStringContainsString('山田_太郎_確認', $disposition);
        $this->assertStringNotContainsString('../', $disposition);
        $html = app(GenericLegalDocumentRenderer::class)->html(CaseGeneratedDocument::with('template.documentType')->sole());
        $this->assertStringContainsString('日本語の保存内容です。', $html);
        $this->assertStringContainsString('労災案件', $html);
        $this->assertStringContainsString('参考テンプレート', $html);
        $this->assertStringContainsString('事務所承認前の参考版', $html);
        $this->assertStringContainsString('委任する法律事務の範囲', $html);
        $this->assertStringContainsString('署名・確認欄', $html);
        $this->assertStringNotContainsString('正式な契約本文は未収録', $html);
        $this->assertStringNotContainsString('LIVE CLIENT CHANGED', $html);
        $this->assertStringNotContainsString('LIVE CASE CHANGED', $html);
        $this->assertSame($before, CaseGeneratedDocument::sole()->getAttributes());
    }

    public function test_pdf_rejects_missing_draft_and_review_without_creating_records(): void
    {
        $this->getJson($this->url().'/pdf')->assertNotFound();
        $this->assertDatabaseCount('case_generated_documents', 0);
        $this->patchJson($this->url().'/draft', ['draft_data' => $this->validDraft()])->assertOk();
        $this->getJson($this->url().'/pdf')->assertUnprocessable();
        $this->postJson($this->url().'/review', ['draft_data' => $this->validDraft()])->assertOk();
        $this->getJson($this->url().'/pdf')->assertUnprocessable();
        $this->assertDatabaseCount('case_generated_documents', 1);
    }

    public function test_pdf_authentication_permission_and_case_relation_are_enforced(): void
    {
        $other = CaseFile::create(['title' => 'Other case', 'client_id' => $this->case->client_id]);
        $this->getJson("/api/case-files/{$other->id}/document-collection/{$this->document->id}/creation/pdf")->assertNotFound();
        $denied = User::factory()->create();
        $denied->roles()->detach();
        Sanctum::actingAs($denied);
        $this->getJson($this->url().'/pdf')->assertForbidden();
        $this->app['auth']->forgetGuards();
        $this->getJson($this->url().'/pdf')->assertUnauthorized();
    }

    public function test_pdf_uses_pinned_inactive_version_and_rejects_unsupported_renderer(): void
    {
        $this->postJson($this->url().'/review', ['draft_data' => $this->validDraft()])->assertOk();
        $this->postJson($this->url().'/approve')->assertOk();
        $v2 = DocumentGenerationTemplate::where('version', 2)->sole();
        $v2->update(['is_active' => false]);
        DocumentGenerationTemplate::create([
            'document_type_id' => $v2->document_type_id, 'version' => 3, 'is_active' => true,
            'renderer_type' => 'not_supported', 'format' => 'html',
            'template_body' => '<p>NEW TEMPLATE MUST NOT APPEAR</p>', 'field_schema' => $v2->field_schema,
        ]);
        $this->getJson($this->url().'/pdf')->assertOk();
        $instance = CaseGeneratedDocument::with('template.documentType')->sole();
        $html = app(GenericLegalDocumentRenderer::class)->html($instance);
        $this->assertStringNotContainsString('NEW TEMPLATE', $html);
        $this->assertSame($v2->id, $instance->document_generation_template_id);
        $instance->setRelation('template', DocumentGenerationTemplate::where('version', 3)->sole());
        $this->expectException(ValidationException::class);
        app(DocumentPdfRenderer::class)->render($instance);
    }

    public function test_pdf_template_is_inert_and_user_placeholders_are_escaped(): void
    {
        $template = new DocumentGenerationTemplate([
            'template_body' => '<h1>{{ document_name }}</h1><p>{{ client_name }}</p><p>{{ notes }}</p><script>EVIL_SCRIPT</script><img src="file:///secret"><style>@import "http://evil";</style><div style="background:url(http://evil)" onclick="evil()">Safe</div><?php echo "EXECUTED"; ?>',
            'field_schema' => [], 'version' => 1,
        ]);
        $template->setRelation('documentType', DocumentType::where('code', 'C-001')->sole());
        $instance = new CaseGeneratedDocument(['workflow_status' => 'approved', 'approved_data' => ['client_name' => '<img src="http://evil">山田', 'notes' => '{{ client_name }} & <script>alert(1)</script>']]);
        $instance->setRelation('template', $template);
        $html = app(GenericLegalDocumentRenderer::class)->html($instance);
        $this->assertStringContainsString('&lt;img', $html);
        $this->assertStringContainsString('{{ client_name }} &amp; &lt;script&gt;', $html);
        $this->assertStringNotContainsString('<script', $html);
        $this->assertStringNotContainsString('EVIL_SCRIPT', $html);
        $this->assertStringNotContainsString('file://', $html);
        $this->assertStringNotContainsString('onclick', $html);
        $this->assertStringNotContainsString('@import', $html);
        $this->assertStringNotContainsString('EXECUTED', $html);
    }

    /** @param array<string, string> $overrides @return array<string, string> */
    private function validDraft(array $overrides = []): array
    {
        return array_replace([
            'contract_date' => '2026-09-04',
            'client_name' => '依頼者株式会社', 'client_address' => '大阪市北区',
            'responsible_person' => '担当 太郎', 'case_title' => '労災案件',
            'case_reference' => 'CASE-2026-001',
            'engagement_scope' => '入力された委任範囲', 'fee_type' => '入力された報酬種類',
            'fee_amount' => '入力された金額', 'fee_calculation_method' => '入力された算定方法',
            'fee_payment_timing' => '入力された支払時期', 'expense_notes' => '',
            'termination_notes' => '入力された解除条件',
            'early_termination_settlement' => '入力された清算方法', 'notes' => '',
            'client_signature_name' => '依頼者株式会社', 'lawyer_signature_name' => '担当 太郎',
        ], $overrides);
    }

    public function test_drive_upload_reuses_pdf_snapshot_and_stores_one_artifact_across_repeated_requests(): void
    {
        $draft = $this->validDraft();
        $this->postJson($this->url().'/review', ['draft_data' => $draft])->assertOk();
        $this->postJson($this->url().'/approve')->assertOk();
        $this->case->client->update(['name' => 'Changed live name']);
        $v2 = DocumentGenerationTemplate::where('version', 2)->sole();
        DocumentGenerationTemplate::create(['document_type_id' => $v2->document_type_id, 'version' => 3, 'renderer_type' => 'unsupported', 'format' => 'html', 'template_body' => 'NEW', 'field_schema' => [], 'is_active' => true]);
        $pdf = Mockery::mock(DocumentPdfRenderer::class)->makePartial();
        $pdf->shouldReceive('render')->once()->with(Mockery::on(fn ($instance) => $instance->approved_data === $draft && $instance->document_generation_template_id === $v2->id))->andReturn('%PDF-real-pipeline-output');
        $this->app->instance(DocumentPdfRenderer::class, $pdf);
        $drive = Mockery::mock(GoogleDriveService::class);
        $drive->shouldReceive('canWriteGeneratedDocuments')->andReturn(true);
        $drive->shouldReceive('storeGeneratedPdf')->once()->with('%PDF-real-pipeline-output', Mockery::on(fn ($name) => str_contains($name, '依頼者株式会社')), 'generated_folder', Mockery::pattern('/^[a-f0-9]{64}$/'))->andReturn($this->remoteArtifact());
        $this->app->instance(GoogleDriveService::class, $drive);
        $this->mockGeneratedFolder();
        $this->postJson($this->url().'/google-drive')->assertOk()->assertJsonPath('drive.artifact.url', 'https://drive.google.com/file/d/test_pdf/view');
        $this->postJson($this->url().'/google-drive')->assertOk();
        $this->getJson($this->url())->assertOk()->assertJsonPath('drive.artifact.filename', 'approved.pdf');
        $this->assertDatabaseCount('generated_document_artifacts', 1);
        $this->assertSame($this->user->id, GeneratedDocumentArtifact::sole()->uploaded_by);
        $this->assertNotNull(GeneratedDocumentArtifact::sole()->uploaded_at);
        $this->assertSame('approved', CaseGeneratedDocument::sole()->workflow_status);
        $this->expectException(QueryException::class);
        GeneratedDocumentArtifact::sole()->replicate()->save();
    }

    public function test_each_approved_revision_is_saved_as_a_separate_drive_artifact(): void
    {
        $this->postJson($this->url().'/review', ['draft_data' => $this->validDraft(['notes' => 'v1'])])->assertOk();
        $this->postJson($this->url().'/approve')->assertOk();
        $this->postJson($this->url().'/revision')->assertOk();
        $this->postJson($this->url().'/review', ['draft_data' => $this->validDraft(['notes' => 'v2'])])->assertOk();
        $this->postJson($this->url().'/approve')->assertOk();

        $pdf = Mockery::mock(DocumentPdfRenderer::class)->makePartial();
        $pdf->shouldReceive('render')->twice()->andReturnUsing(fn (CaseGeneratedDocument $instance) => '%PDF-v'.$instance->version);
        $this->app->instance(DocumentPdfRenderer::class, $pdf);
        $drive = Mockery::mock(GoogleDriveService::class);
        $drive->shouldReceive('canWriteGeneratedDocuments')->andReturn(true);
        $drive->shouldReceive('storeGeneratedPdf')->twice()->andReturnUsing(function (string $bytes, string $filename) {
            $version = str_contains($filename, '_v1_') ? 1 : 2;

            return [
                'external_file_id' => 'test_pdf_v'.$version,
                'external_url' => 'https://drive.google.com/file/d/test_pdf_v'.$version.'/view',
                'filename' => $filename,
                'mime_type' => 'application/pdf',
                'checksum' => hash('sha256', $bytes),
                'uploaded_at' => now()->toISOString(),
            ];
        });
        $this->app->instance(GoogleDriveService::class, $drive);
        $location = new ExternalStorageLocation(['external_folder_id' => 'generated_folder']);
        $folders = Mockery::mock(GoogleDriveProvisioningService::class);
        $folders->shouldReceive('provisionGeneratedDocuments')->twice()->andReturn($location);
        $this->app->instance(GoogleDriveProvisioningService::class, $folders);

        $this->postJson($this->url().'/google-drive?version=1')->assertOk()
            ->assertJsonPath('drive.artifact.url', 'https://drive.google.com/file/d/test_pdf_v1/view');
        $this->postJson($this->url().'/google-drive?version=2')->assertOk()
            ->assertJsonPath('drive.artifact.url', 'https://drive.google.com/file/d/test_pdf_v2/view');

        $this->assertDatabaseCount('generated_document_artifacts', 2);
        $this->assertSame([1, 2], GeneratedDocumentArtifact::query()->orderBy('id')->get()->map(fn ($artifact) => $artifact->generatedDocument->version)->all());
        $this->assertTrue(GeneratedDocumentArtifact::query()->get()->every(fn ($artifact) => str_contains($artifact->filename, '_v'.$artifact->generatedDocument->version.'_')));
    }

    public function test_drive_blocks_unapproved_missing_cross_case_and_read_only_users(): void
    {
        $this->postJson($this->url().'/google-drive')->assertNotFound();
        $this->patchJson($this->url().'/draft', ['draft_data' => $this->validDraft()])->assertOk();
        $this->postJson($this->url().'/google-drive')->assertUnprocessable();
        $this->postJson($this->url().'/review', ['draft_data' => $this->validDraft()])->assertOk();
        $this->postJson($this->url().'/google-drive')->assertUnprocessable();
        $other = CaseFile::create(['title' => 'Other', 'client_id' => $this->case->client_id]);
        $this->postJson("/api/case-files/{$other->id}/document-collection/{$this->document->id}/creation/google-drive")->assertNotFound();
        Sanctum::actingAs(User::factory()->withRole('level_2')->create());
        $this->postJson($this->url().'/google-drive')->assertForbidden();
        $this->app['auth']->forgetGuards();
        $this->postJson($this->url().'/google-drive')->assertUnauthorized();
        $this->assertDatabaseCount('generated_document_artifacts', 0);
        Http::assertNothingSent();
    }

    public function test_drive_disabled_capability_and_upload_do_not_fake_success(): void
    {
        config(['services.google_drive.write_enabled' => false]);
        $this->postJson($this->url().'/review', ['draft_data' => $this->validDraft()])->assertOk();
        $this->postJson($this->url().'/approve')->assertOk();
        $this->getJson($this->url())->assertOk()->assertJsonPath('drive.available', false)->assertJsonPath('drive.artifact', null);
        $this->postJson($this->url().'/google-drive')->assertStatus(503);
        $this->assertDatabaseCount('generated_document_artifacts', 0);
        Http::assertNothingSent();
    }

    public function test_failed_drive_upload_has_no_artifact(): void
    {
        $this->postJson($this->url().'/review', ['draft_data' => $this->validDraft()])->assertOk();
        $this->postJson($this->url().'/approve')->assertOk();
        $drive = Mockery::mock(GoogleDriveService::class);
        $drive->shouldReceive('canWriteGeneratedDocuments')->andReturn(true);
        $drive->shouldReceive('storeGeneratedPdf')->once()->andThrow(new GeneratedDocumentDriveException('Upload failed'));
        $this->app->instance(GoogleDriveService::class, $drive);
        $this->mockGeneratedFolder();
        $this->postJson($this->url().'/google-drive')->assertStatus(503);
        $this->assertDatabaseCount('generated_document_artifacts', 0);
    }

    public function test_pdf_failure_does_not_call_drive_upload(): void
    {
        $this->postJson($this->url().'/review', ['draft_data' => $this->validDraft()])->assertOk();
        $this->postJson($this->url().'/approve')->assertOk();
        $drive = Mockery::mock(GoogleDriveService::class);
        $drive->shouldReceive('canWriteGeneratedDocuments')->andReturn(true);
        $drive->shouldNotReceive('storeGeneratedPdf');
        $this->app->instance(GoogleDriveService::class, $drive);
        $this->mock(DocumentPdfRenderer::class)->shouldReceive('render')->once()->andThrow(new \RuntimeException('PRIVATE ERROR'));
        $this->postJson($this->url().'/google-drive')->assertStatus(500)->assertDontSee('PRIVATE ERROR');
        $this->assertDatabaseCount('generated_document_artifacts', 0);
    }

    public function test_drive_success_followed_by_database_failure_reports_recovery_without_success(): void
    {
        $this->postJson($this->url().'/review', ['draft_data' => $this->validDraft()])->assertOk();
        $this->postJson($this->url().'/approve')->assertOk();
        $drive = Mockery::mock(GoogleDriveService::class);
        $drive->shouldReceive('canWriteGeneratedDocuments')->andReturn(true);
        $drive->shouldReceive('storeGeneratedPdf')->once()->andReturn($this->remoteArtifact());
        $this->app->instance(GoogleDriveService::class, $drive);
        $this->mockGeneratedFolder();
        $event = 'eloquent.creating: '.GeneratedDocumentArtifact::class;
        Event::listen($event, fn () => throw new \RuntimeException('DB persistence failure'));
        Log::shouldReceive('error')->once()->with('Generated document Drive upload requires DB reconciliation.', Mockery::on(fn ($data) => $data['external_file_id'] === 'test_pdf' && count($data) === 3));
        try {
            $this->postJson($this->url().'/google-drive')->assertStatus(503)->assertJsonMissingPath('drive.artifact');
        } finally {
            Event::forget($event);
        }
        $this->assertDatabaseCount('generated_document_artifacts', 0);
    }

    private function remoteArtifact(): array
    {
        return ['external_file_id' => 'test_pdf', 'external_url' => 'https://drive.google.com/file/d/test_pdf/view', 'filename' => 'approved.pdf', 'mime_type' => 'application/pdf', 'checksum' => str_repeat('a', 64), 'uploaded_at' => now()->toISOString()];
    }

    private function mockGeneratedFolder(): void
    {
        $location = new ExternalStorageLocation(['external_folder_id' => 'generated_folder']);
        $folders = Mockery::mock(GoogleDriveProvisioningService::class);
        $folders->shouldReceive('provisionGeneratedDocuments')->once()->with(Mockery::on(
            fn (CaseFile $caseFile) => $caseFile->is($this->case)
        ))->andReturn($location);
        $this->app->instance(GoogleDriveProvisioningService::class, $folders);
    }

    private function url(?CaseDocument $document = null): string
    {
        return "/api/case-files/{$this->case->id}/document-collection/".($document ?? $this->document)->id.'/creation';
    }
}
