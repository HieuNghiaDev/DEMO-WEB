<?php

namespace Tests\Feature\C001;

use App\Contracts\C001AuthorityPolicy;
use App\Models\{C001LegalDecision, DocumentGenerationTemplate, DocumentType, Permission, SecurityAuditLog};
use App\Services\{C001DecisionContext, GoogleDriveService, LegalFinalizationGate, SecurityAuditLogger, SmallOfficeC001AuthorityPolicy};
use Illuminate\Support\Facades\{DB, Http, Schema};
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Tests\Support\B21\B21TestCase;

/** Owner policy C001.4: no registry/issuer/delegation fixture or real identity provisioning. */
class SmallOfficeAuthorityTest extends B21TestCase
{
    use \Tests\Support\B31\BuildsCaseAccessFixtures { setUp as private setUpCaseAccess; }
    use \Tests\Support\C001\BuildsC001DecisionFixtures { prepared as private enterprisePrepared; }

    protected function setUp(): void
    {
        $this->setUpCaseAccess();
        // Operational A02 classification is nullable: UNKNOWN must be denied, never coerced to NORMAL.
        Schema::table('case_files', fn (\Illuminate\Database\Schema\Blueprint $table) => $table->boolean('is_confidential')->nullable()->change());
        (require database_path('proposals/create_c001_legal_decisions.php'))->up();
    }

    protected function prepared(bool $self = false): void
    {
        $this->app->instance(C001AuthorityPolicy::class, new SmallOfficeC001AuthorityPolicy);
        $lawyer = $this->reader('small-lawyer', ['document.approve_legal']);
        $author = $self ? $lawyer : $this->reader('small-author');
        $case = $this->matter();
        $case->forceFill(['is_confidential' => true])->save();
        $this->member($lawyer, $case, ['read', 'write', 'confidential']);
        if (! $self) $this->member($author, $case, ['read', 'write', 'confidential']);
        $type = DocumentType::create(['code' => 'C-001', 'name_ja' => 'Synthetic C001', 'document_group' => 'C', 'handling_type' => 'office_generated']);
        $document = $this->document($case);
        $document->update(['document_type_id' => $type->id]);
        $template = DocumentGenerationTemplate::create(['document_type_id' => $type->id, 'version' => 1,
            'renderer_type' => 'generic_legal_document', 'format' => 'html', 'template_body' => '<article>synthetic</article>',
            'field_schema' => [], 'is_active' => true]);
        $this->actingAs($author);
        $generated = $document->generatedDocuments()->create(['document_generation_template_id' => $template->id,
            'version' => 1, 'workflow_status' => 'review', 'draft_data' => ['synthetic' => true],
            'created_by' => $author->id, 'updated_by' => $author->id]);
        foreach (['source_workbook' => 'workbook', 'pdf' => 'pdf'] as $kind => $id) {
            $generated->artifacts()->create(['artifact_type' => $kind, 'storage_provider' => 'google_drive',
                'external_file_id' => $id, 'external_url' => 'https://example.test/'.$id, 'filename' => 'synthetic.'.$id,
                'mime_type' => 'application/octet-stream', 'checksum' => hash('sha256', $this->bytes[$id]),
                'uploaded_by' => $author->id, 'uploaded_at' => now()]);
        }
        $this->c = compact('lawyer', 'author', 'case', 'document', 'generated');
        $drive = Mockery::mock(GoogleDriveService::class);
        $drive->shouldReceive('downloadFileContent')->andReturnUsing(fn ($id) => $this->bytes[$id]);
        $this->app->instance(GoogleDriveService::class, $drive);
        $this->enrollAndLogin();
    }

    public static function ownContent(): array { return [[false], [true]]; }

    #[DataProvider('ownContent')]
    public function test_explicit_lawyer_finalizes_with_totp_without_enterprise_tables(bool $self): void
    {
        $this->prepared($self);
        foreach (['lawyer_verifications', 'legal_delegation_issuers', 'legal_delegations'] as $table) {
            $this->assertFalse(Schema::hasTable($table));
        }
        $receipt = $this->decide($this->proof());
        $this->assertSame($self, $receipt->context['self_approval']);
        $this->assertSame('SMALL_OFFICE_EXPLICIT_LEGAL_PERMISSION_WITH_TOTP', $receipt->context['approval_policy']);
        foreach (['verification_id', 'issuer_admission_id', 'delegation_id'] as $field) $this->assertArrayNotHasKey($field, $receipt->context);
        $this->assertSame('approved', $this->c['generated']->fresh()->workflow_status);
        $this->assertSame('reviewed', $this->c['document']->fresh()->review_status);
        $this->assertSame($this->c['lawyer']->id, $receipt->actor_user_id);
        $this->assertSame($self, SecurityAuditLog::where('event', 'legal.c001_approved')->sole()->metadata['self_approval']);
        $this->assertTrue(LegalFinalizationGate::policyPending());
        Http::assertNothingSent();
    }

    public static function invalidIdentities(): array
    {
        return array_map(fn ($v) => [$v], ['missing_permission', 'manager', 'admin', 'level_4', 'level_5', 'staff',
            'inactive_user', 'inactive_employee', 'deleted_employee', 'unlinked', 'password_change', 'activation_pending',
            'no_membership', 'read_only', 'no_confidential', 'expired_membership', 'revoked_membership', 'unknown_classification']);
    }

    #[DataProvider('invalidIdentities')]
    public function test_role_title_otp_and_case_visibility_do_not_create_legal_authority(string $state): void
    {
        $this->prepared(true);
        $lawyer = $this->c['lawyer'];
        if (in_array($state, ['missing_permission', 'manager', 'admin', 'level_4', 'level_5', 'staff'], true)) {
            $lawyer->roles()->sole()->permissions()->detach(Permission::where('name', 'document.approve_legal')->value('id'));
            if ($state === 'admin') $lawyer->update(['role' => 'admin']);
            if (in_array($state, ['level_4', 'level_5'], true)) $lawyer->roles()->attach(\App\Models\Role::where('name', $state)->value('id'));
            $lawyer->employee->update(['position_title' => 'Lawyer / Manager']);
        } else {
            $member = DB::table('case_memberships')->where('user_id', $lawyer->id);
            match ($state) {
                'inactive_user' => $lawyer->update(['is_active' => false]),
                'inactive_employee' => $lawyer->employee->update(['status' => 'inactive']),
                'deleted_employee' => $lawyer->employee->delete(),
                'unlinked' => $lawyer->update(['employee_id' => null]),
                'password_change' => $lawyer->update(['must_change_password' => true]),
                'activation_pending' => $lawyer->forceFill(['activation_required' => true])->save(),
                'no_membership' => $member->delete(),
                'read_only' => $member->update(['can_write' => false]),
                'no_confidential' => $member->update(['can_read_confidential' => false]),
                'expired_membership' => $member->update(['expires_at' => now()->subSecond()]),
                'revoked_membership' => $member->update(['revoked_at' => now()]),
                'unknown_classification' => $this->c['case']->forceFill(['is_confidential' => null])->save(),
            };
        }
        $this->assertContains($this->stepResponse()->status(), [401, 403, 404, 422]);
        $this->assertDatabaseCount('c001_legal_proofs', 0);
        $this->assertDatabaseCount('c001_legal_decisions', 0);
    }

    public static function changedDecisions(): array
    {
        return array_map(fn ($v) => [$v], ['missing_proof', 'expired_proof', 'consumed_proof', 'revoked_permission',
            'revoked_membership', 'workbook_bytes', 'pdf_bytes', 'snapshot', 'template', 'stale_version', 'wrong_case', 'wrong_document', 'wrong_request']);
    }

    #[DataProvider('changedDecisions')]
    public function test_changed_context_never_finalizes_or_consumes_a_valid_proof(string $state): void
    {
        $this->prepared(true); $proof = $this->proof();
        $challenge = DB::table('c001_legal_proofs')->where('id', $proof)->value('challenge_id');
        switch ($state) {
            case 'missing_proof': $proof = 999999; break;
            case 'expired_proof': $this->travel(300)->seconds(); break;
            case 'consumed_proof': DB::table('authentication_challenges')->where('id', $challenge)->update(['used_at' => now()]); break;
            case 'revoked_permission': $this->c['lawyer']->roles()->sole()->permissions()->detach(Permission::where('name', 'document.approve_legal')->value('id')); break;
            case 'revoked_membership': DB::table('case_memberships')->where('user_id', $this->c['lawyer']->id)->update(['revoked_at' => now()]); break;
            case 'workbook_bytes': $this->bytes['workbook'] = 'changed'; break;
            case 'pdf_bytes': $this->bytes['pdf'] = 'changed'; break;
            case 'snapshot': DB::table('case_generated_documents')->where('id', $this->c['generated']->id)->update(['draft_data' => '{"changed":true}']); break;
            case 'template': DB::table('document_generation_templates')->where('id', $this->c['generated']->document_generation_template_id)->update(['template_body' => 'changed']); break;
            case 'stale_version': $this->c['generated']->update(['version' => 2]); break;
            case 'wrong_case': $this->c['case'] = $this->matter(); break;
            case 'wrong_document': $this->c['document'] = $this->document($this->c['case']); break;
            case 'wrong_request': $this->key = 'different-small-office-request'; break;
        }
        try { $this->decide($proof); $this->fail('Invalid legal decision must fail closed.'); }
        catch (HttpExceptionInterface $e) { $this->assertContains($e->getStatusCode(), [403, 404, 409]); }
        catch (\Illuminate\Database\Eloquent\ModelNotFoundException) { $this->assertSame('revoked_membership', $state); }
        $this->assertDatabaseCount('c001_legal_decisions', 0);
        $this->assertSame('review', $this->c['generated']->fresh()->workflow_status);
        $this->assertSame(0, SecurityAuditLog::where('event', 'legal.c001_approved')->count());
        if ($state !== 'consumed_proof') $this->assertNull(DB::table('authentication_challenges')->where('id', $challenge)->value('used_at'));
    }

    public function test_same_request_retry_returns_same_immutable_receipt_and_different_key_is_denied(): void
    {
        $this->prepared(true); $proof = $this->proof(); $receipt = $this->decide($proof);
        $this->travel(6)->minutes();
        $this->assertSame($receipt->id, $this->decide($proof)->id);
        try { $this->decide($proof, 'different-small-office-key'); $this->fail('Replay across keys must fail.'); }
        catch (HttpExceptionInterface $e) { $this->assertSame(409, $e->getStatusCode()); }
        $this->assertDatabaseCount('c001_legal_decisions', 1);
        $this->assertSame(1, SecurityAuditLog::where('event', 'legal.c001_approved')->count());
    }

    public function test_required_audit_failure_rolls_back_state_receipt_history_and_proof(): void
    {
        $this->prepared(true); $proof = $this->proof();
        $logger = Mockery::mock(SecurityAuditLogger::class)->makePartial();
        $logger->shouldReceive('recordLegalAuthority')->withArgs(fn ($actor, $event) => $event === 'legal.c001_approved')->andThrow(new \RuntimeException('Synthetic audit failure'));
        $this->app->instance(SecurityAuditLogger::class, $logger);
        try { $this->decide($proof); $this->fail('Required audit failure must rollback.'); }
        catch (\RuntimeException $e) { $this->assertSame('Synthetic audit failure', $e->getMessage()); }
        $this->assertSame('review', $this->c['generated']->fresh()->workflow_status);
        $this->assertDatabaseCount('c001_legal_decisions', 0);
        $this->assertSame(0, $this->c['case']->activities()->count());
        $challenge = DB::table('c001_legal_proofs')->where('id', $proof)->value('challenge_id');
        $this->assertNull(DB::table('authentication_challenges')->where('id', $challenge)->value('used_at'));
    }

    public function test_overlapping_reentrant_attempt_cannot_create_second_decision(): void
    {
        $this->prepared(true); $proof = $this->proof(); $attempted = false;
        C001LegalDecision::creating(function () use (&$attempted, $proof): void {
            if ($attempted) return;
            $attempted = true;
            try { $this->decide($proof); $this->fail('Overlapping finalization must not duplicate.'); }
            catch (HttpExceptionInterface $e) { $this->assertSame(409, $e->getStatusCode()); }
        });
        $receipt = $this->decide($proof);
        $this->assertTrue($attempted);
        $this->assertSame($receipt->id, $this->decide($proof)->id);
        $this->assertDatabaseCount('c001_legal_decisions', 1);
    }

    public function test_runtime_normal_case_uses_existing_case_access_without_enterprise_admissions(): void
    {
        $this->prepared(true);
        unset($this->app[\App\Services\CaseAccessService::class]);
        $this->c['case']->forceFill(['is_confidential' => false])->save();
        DB::table('case_memberships')->delete();
        $this->assertSame('final_approve', $this->decide($this->proof())->decision_type);
        $this->assertDatabaseCount('case_memberships', 0);
    }

    public function test_small_office_policy_does_not_admit_enterprise_authorities_or_open_public_finalization(): void
    {
        $this->prepared(true); $c = $this->c; $policy = app(C001AuthorityPolicy::class);
        $this->assertFalse($policy->verificationApproved($c['lawyer'], $c['author'], []));
        $this->assertFalse($policy->issuerAdmissionApproved($c['author'], $c['lawyer'], []));
        $this->assertFalse($policy->delegationApproved($c['lawyer'], $c['author'], $c['generated'], []));
        $c['lawyer']->roles()->sole()->permissions()->attach(Permission::where('name', 'task.review')->value('id'));
        $proof = $this->proof();
        $base = '/api/case-files/'.$c['case']->id.'/document-collection/'.$c['document']->id.'/creation';
        foreach (['/approve', '/c001/reject'] as $suffix) {
            $this->postJson($base.$suffix, ['legal_proof_id' => $proof, 'reason' => 'Synthetic'])
                ->assertStatus(409)->assertJsonPath('code', 'legal_authority_policy_pending');
        }
        $this->assertDatabaseCount('c001_legal_decisions', 0);
    }

    public function test_client_authority_claims_and_reused_otp_cannot_issue_another_legal_proof(): void
    {
        $this->prepared(true); $this->travel(31)->seconds();
        $data = ['password' => self::SYNTHETIC_PASSWORD,
            'otp' => app(\App\Services\Administration\Totp::class)->code($this->secret, now()->timestamp),
            'action' => C001DecisionContext::ACTION,
            'scope' => ['generated_document_id' => $this->c['generated']->id, 'request_key' => $this->key, 'self_approval' => true]];
        $this->postJson('/api/mfa/step-up', $data)->assertUnprocessable();
        unset($data['scope']['self_approval']);
        $proof = $this->postJson('/api/mfa/step-up', $data)->assertOk()->json('legal_proof_id');
        $this->postJson('/api/mfa/step-up', $data)->assertUnprocessable();
        $this->assertDatabaseCount('c001_legal_proofs', 1);
        $this->decide($proof);
        $this->assertDatabaseCount('c001_legal_decisions', 1);
    }
}
