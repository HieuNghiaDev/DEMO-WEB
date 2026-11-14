<?php

namespace Tests\Engine\C0013A;

use App\Contracts\C001AuthorityPolicy;
use App\Models\{DocumentGenerationTemplate, DocumentType, Permission, SecurityAuditLog};
use App\Services\{GoogleDriveService, SmallOfficeC001AuthorityPolicy};
use Illuminate\Support\Facades\{DB, Http, Schema};
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

require_once __DIR__.'/C001SelfEngineHarness.php';

/** Same writer/barriers/processes, no copied business data or enterprise admission fixtures. */
class C001SmallOfficeEngineHarness extends C001SelfEngineHarness
{
    protected function raceAuthorityState(): array { return ['mode' => 'small_office']; }

    protected function ownVersion(string $contribution = 'creator'): void { $this->prepared(); }

    protected function prepared(): void
    {
        $this->key = 'engine-small-'.bin2hex(random_bytes(12));
        $policy = new SmallOfficeC001AuthorityPolicy; $this->app->instance(C001AuthorityPolicy::class, $policy);
        $lawyer = $this->reader('small-approver', ['document.approve_legal']);
        $case = $this->matter(); $this->member($lawyer, $case);
        $type = DocumentType::firstOrCreate(['code' => 'C-001'], ['name_ja' => 'Synthetic C001', 'document_group' => 'C', 'handling_type' => 'office_generated']);
        $document = $this->document($case); $document->update(['document_type_id' => $type->id]);
        $template = DocumentGenerationTemplate::create(['document_type_id' => $type->id,
            'version' => (int) DocumentGenerationTemplate::where('document_type_id', $type->id)->max('version') + 1,
            'renderer_type' => 'generic_legal_document', 'format' => 'html', 'template_body' => '<article>Synthetic '.$this->fixtureLabel.'</article>',
            'field_schema' => [], 'is_active' => true]);
        $this->actingAs($lawyer);
        $generated = $document->generatedDocuments()->create(['document_generation_template_id' => $template->id,
            'version' => 1, 'workflow_status' => 'review', 'draft_data' => ['synthetic' => $this->fixtureLabel], 'created_by' => $lawyer->id, 'updated_by' => $lawyer->id]);
        foreach (['source_workbook' => 'workbook', 'pdf' => 'pdf'] as $kind => $id) {
            $generated->artifacts()->create(['artifact_type' => $kind, 'storage_provider' => 'google_drive',
                'external_file_id' => $id, 'external_url' => 'https://example.test/'.$id, 'filename' => 'synthetic.'.$id,
                'mime_type' => 'application/octet-stream', 'checksum' => hash('sha256', $this->bytes[$id]), 'uploaded_by' => $lawyer->id, 'uploaded_at' => now()]);
        }
        $this->c = compact('policy', 'lawyer', 'case', 'document', 'generated');
        $drive = Mockery::mock(GoogleDriveService::class);
        $drive->shouldReceive('downloadFileContent')->andReturnUsing(fn ($id) => $this->bytes[$id]);
        $this->app->instance(GoogleDriveService::class, $drive); $this->enrollAndLogin();
    }

    public function test_small_office_positive_receipt_without_any_enterprise_table(): void
    {
        $this->prepared();
        foreach (['lawyer_verifications','legal_delegations','legal_delegation_issuers'] as $table) $this->assertFalse(Schema::hasTable($table));
        $receipt = $this->decide($this->proof());
        $this->assertSame(SmallOfficeC001AuthorityPolicy::APPROVAL_POLICY, $receipt->context['approval_policy']);
        $this->assertTrue($receipt->context['self_approval']);
        $this->assertEngineCount('c001_legal_decisions', 1); Http::assertNothingSent();
    }

    public static function lateChanges(): array { return [['permission'], ['hash'], ['version']]; }

    #[DataProvider('lateChanges')]
    public function test_small_office_changes_after_proof_are_denied_without_consumption(string $change): void
    {
        $this->prepared(); $proof = $this->proof();
        match ($change) {
            'permission' => DB::table('role_permissions')->where('role_id', $this->c['lawyer']->roles()->sole()->id)
                ->where('permission_id', Permission::where('name', 'document.approve_legal')->value('id'))->delete(),
            'hash' => $this->bytes['pdf'] = 'CHANGED SYNTHETIC PDF',
            'version' => $this->c['generated']->update(['version' => 2]),
        };
        try { $this->decide($proof); $this->fail('Changed authority/content must fail closed.'); }
        catch (HttpExceptionInterface $e) { $this->assertContains($e->getStatusCode(), [403,409]); }
        $this->assertEngineCount('c001_legal_decisions', 0);
        $this->assertSame('review', $this->c['generated']->fresh()->workflow_status);
        $this->assertSame(0, SecurityAuditLog::where('event','legal.c001_approved')->where('metadata->case_generated_document_id',$this->c['generated']->id)->count());
        $challenge = DB::table('c001_legal_proofs')->where('id',$proof)->value('challenge_id');
        $this->assertNull(DB::table('authentication_challenges')->where('id',$challenge)->value('used_at'));
    }
}
