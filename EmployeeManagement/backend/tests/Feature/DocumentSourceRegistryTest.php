<?php

namespace Tests\Feature;

use App\Models\CaseFile;
use App\Models\CaseGeneratedDocument;
use App\Models\Client;
use App\Models\DocumentGenerationTemplate;
use App\Models\DocumentSourceFile;
use App\Models\DocumentType;
use App\Services\DocumentSourceImportPlanner;
use Database\Seeders\DocumentGenerationTemplateSeeder;
use Database\Seeders\DocumentTypeMasterSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use LogicException;
use Tests\TestCase;

class DocumentSourceRegistryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([DocumentTypeMasterSeeder::class, DocumentGenerationTemplateSeeder::class]);
    }

    public function test_source_maps_to_stable_document_type_and_preserves_mime_type(): void
    {
        $type = DocumentType::where('code', 'C-001')->sole();
        $source = $this->source($type, 1, [
            'mime_type' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'original_filename' => '委任契約書.docx',
        ]);

        $this->assertTrue($source->documentType->is($type));
        $this->assertSame('C-001', $source->documentType->code);
        $this->assertSame(
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            $source->fresh()->mime_type
        );
    }

    public function test_duplicate_source_identity_is_prevented_but_new_source_version_is_allowed(): void
    {
        $type = DocumentType::where('code', 'C-001')->sole();
        $this->source($type, 1);
        $this->source($type, 2);

        $this->assertDatabaseCount('document_source_files', 2);
        $this->expectException(QueryException::class);
        $this->source($type, 1, ['original_filename' => 'duplicate.docx']);
    }

    public function test_published_source_identity_and_physical_metadata_are_immutable(): void
    {
        $source = $this->source(DocumentType::where('code', 'C-001')->sole(), 1);
        $source->update(['notes' => 'Operator note', 'is_active' => false]);
        $this->assertSame('Operator note', $source->fresh()->notes);
        $this->assertFalse($source->fresh()->is_active);

        $this->expectException(LogicException::class);
        $source->fresh()->update(['original_filename' => 'replaced.docx']);
    }

    public function test_all_supported_source_mime_types_are_preserved(): void
    {
        $type = DocumentType::where('code', 'C-001')->sole();
        foreach (DocumentSourceFile::SUPPORTED_MIME_TYPES as $index => $mimeType) {
            $source = $this->source($type, $index + 1, [
                'mime_type' => $mimeType,
                'original_filename' => 'source-'.($index + 1),
            ]);
            $this->assertSame($mimeType, $source->fresh()->mime_type);
        }
    }

    public function test_source_version_and_case_revision_are_independent(): void
    {
        $type = DocumentType::where('code', 'C-001')->sole();
        $source = $this->source($type, 2);
        $client = Client::create(['name' => 'Revision client']);
        $case = CaseFile::create(['title' => 'Revision case', 'client_id' => $client->id]);
        $caseDocument = $case->documents()->create([
            'title' => '委任契約書', 'category' => 'COMMON', 'document_type_id' => $type->id,
        ]);
        $revision = $caseDocument->generatedDocuments()->create([
            'document_generation_template_id' => DocumentGenerationTemplate::where('document_type_id', $type->id)->where('version', 1)->sole()->id,
            'version' => 7, 'workflow_status' => 'draft', 'draft_data' => [],
        ]);

        $this->assertSame(2, $source->source_version);
        $this->assertSame(7, $revision->version);
        $this->assertSame(1, DocumentSourceFile::where('source_version', 2)->count());
        $this->assertSame(1, CaseGeneratedDocument::where('version', 7)->count());
    }

    public function test_import_planner_requires_exact_mapping_and_computes_checksum_without_registering(): void
    {
        $folder = storage_path('framework/testing/document-source-plan-'.uniqid());
        File::ensureDirectoryExists($folder.'/C-001');
        File::put($folder.'/C-001/master.docx', 'master source bytes');

        try {
            $planner = app(DocumentSourceImportPlanner::class);
            $proposal = $planner->proposeMappings($folder)[0];
            $this->assertSame('C-001', $proposal['document_code_proposal']);
            $this->assertTrue($proposal['requires_confirmation']);
            $this->assertFalse($planner->plan($folder, [])['ready']);

            $plan = $planner->plan($folder, [[
                'relative_path' => 'C-001/master.docx', 'document_code' => 'C-001',
                'source_version' => 3, 'source_kind' => 'original',
            ]]);

            $this->assertTrue($plan['ready']);
            $this->assertSame('C-001', $plan['candidates'][0]['document_code']);
            $this->assertSame(hash('sha256', 'master source bytes'), $plan['candidates'][0]['checksum']);
            $this->assertSame('application/vnd.openxmlformats-officedocument.wordprocessingml.document', $plan['candidates'][0]['mime_type']);
            $this->assertDatabaseCount('document_source_files', 0);
        } finally {
            File::deleteDirectory($folder);
        }
    }

    public function test_import_planner_rejects_ambiguous_and_unmapped_sources(): void
    {
        $folder = storage_path('framework/testing/document-source-plan-'.uniqid());
        File::ensureDirectoryExists($folder);
        File::put($folder.'/mapped.pdf', 'pdf bytes');
        File::put($folder.'/unmapped.txt', 'unmapped bytes');

        try {
            $plan = app(DocumentSourceImportPlanner::class)->plan($folder, [
                ['relative_path' => 'mapped.pdf', 'document_code' => 'C-001', 'source_version' => 1],
                ['relative_path' => 'mapped.pdf', 'document_code' => 'D-003', 'source_version' => 1],
            ]);

            $this->assertFalse($plan['ready']);
            $this->assertContains('unmapped.txt', $plan['unmapped']);
            $this->assertContains('ambiguous_mapping', array_column($plan['errors'], 'code'));
            $this->assertDatabaseCount('document_source_files', 0);
        } finally {
            File::deleteDirectory($folder);
        }
    }

    public function test_c001_is_the_only_seeded_office_generated_type_without_fake_source_rows(): void
    {
        $this->assertSame('office_generated', DocumentType::where('code', 'C-001')->sole()->handling_type);
        $this->assertSame(1, DocumentType::where('handling_type', 'office_generated')->count());
        $this->assertSame(77, DocumentType::whereNull('handling_type')->count());
        $this->assertDatabaseCount('document_source_files', 0);
        $this->assertSame(2, DocumentGenerationTemplate::whereHas('documentType', fn ($query) => $query->where('code', 'C-001'))->count());
    }

    /** @param array<string, mixed> $overrides */
    private function source(DocumentType $type, int $version, array $overrides = []): DocumentSourceFile
    {
        return DocumentSourceFile::create(array_merge([
            'document_type_id' => $type->id,
            'source_version' => $version,
            'source_kind' => 'original',
            'original_filename' => "source-{$version}.docx",
            'mime_type' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'storage_provider' => 'local_reference',
            'local_reference' => "C-001/source-{$version}.docx",
            'checksum' => hash('sha256', "source-{$version}"),
            'is_active' => true,
        ], $overrides));
    }
}
