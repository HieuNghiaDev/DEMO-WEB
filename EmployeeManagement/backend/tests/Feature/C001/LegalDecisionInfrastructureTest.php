<?php

namespace Tests\Feature\C001;

use App\Contracts\C001AuthorityPolicy;
use App\Models\C001LegalDecision;
use App\Models\CaseGeneratedDocument;
use App\Models\Permission;
use App\Models\SecurityAuditLog;
use App\Services\C001DecisionContext;
use App\Services\C001FinalApprovalWriter;
use App\Services\LegalFinalizationGate;
use App\Services\PendingC001AuthorityPolicy;
use App\Services\GoogleDriveService;
use App\Services\Administration\Totp;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Tests\Support\B21\B21TestCase;

class LegalDecisionInfrastructureTest extends B21TestCase
{
    use \Tests\Support\C001\BuildsC001AuthorityFixtures { setUp as private setUpAuthority; }

    use \Tests\Support\C001\BuildsC001DecisionFixtures;

    protected function setUp(): void
    {
        $this->setUpAuthority();
        (require database_path('proposals/create_c001_legal_decisions.php'))->up();
    }

    private function businessState(): array
    {
        return [DB::table('case_generated_documents')->orderBy('id')->get()->toJson(),
            DB::table('case_documents')->get()->toJson(), DB::table('case_tasks')->get()->toJson(),
            DB::table('case_task_submissions')->get()->toJson(), DB::table('case_activities')->get()->toJson(),
            DB::table('c001_legal_decisions')->get()->toJson(),
            SecurityAuditLog::where('event', 'legal.c001_approved')->count(),
            DB::table('authentication_challenges')->where('purpose', 'step_up')->get()->toJson()];
    }

    private function denied(int $proof, ?int $expected = null, ?string $key = null): void
    {
        $before = $this->businessState();
        try { $this->decide($proof, $key); $this->fail('Invalid legal decision must be denied.'); }
        catch (HttpExceptionInterface $error) {
            if ($expected) $this->assertSame($expected, $error->getStatusCode());
            else $this->assertContains($error->getStatusCode(), [403, 404, 409]);
        }
        $this->assertSame($before, $this->businessState());
        Http::assertNothingSent();
    }

    public function test_complete_positive_totp_decision_and_lost_response_retry_are_exactly_once(): void
    {
        $this->prepared(); $proof = $this->proof();
        $receipt = $this->decide($proof);
        $this->assertSame('final_approve', $receipt->decision_type);
        $this->assertArrayNotHasKey('draft_data', $receipt->context);
        $this->assertStringNotContainsString('SYNTHETIC WORKBOOK', json_encode($receipt->getAttributes(), JSON_THROW_ON_ERROR));
        $this->assertSame('approved', $this->c['generated']->fresh()->workflow_status);
        $this->assertSame($this->c['lawyer']->id, $this->c['generated']->fresh()->approved_by);
        $this->assertSame('reviewed', $this->c['document']->fresh()->review_status);
        $before = $this->businessState();
        $this->travel(6)->minutes();
        $this->assertSame($receipt->id, $this->decide($proof)->id);
        $this->assertSame($before, $this->businessState());
        $this->assertDatabaseCount('c001_legal_decisions', 1);
        $this->assertSame(1, SecurityAuditLog::where('event', 'legal.c001_approved')->count());
        $this->assertNotNull(DB::table('authentication_challenges')->where('id', DB::table('c001_legal_proofs')->where('id', $proof)->value('challenge_id'))->value('used_at'));
        $this->assertTrue(LegalFinalizationGate::policyPending());
    }

    public static function invalidAuthority(): array
    {
        return array_map(fn ($case) => [$case], ['no_verifier', 'inactive_verifier', 'verifier_employee_inactive',
            'verifier_permission', 'expired_verification', 'revoked_verification', 'no_issuer', 'issuer_permission',
            'issuer_equals_approver', 'issuer_admission', 'expired_delegation', 'revoked_delegation',
            'creator', 'editor', 'submitter', 'incomplete_provenance', 'default_pending']);
    }

    #[DataProvider('invalidAuthority')]
    public function test_invalid_independent_authority_cannot_issue_a_legal_proof(string $state): void
    {
        $this->prepared(); $c = $this->c;
        switch ($state) {
            case 'no_verifier': $c['policy']->verifications = []; break;
            case 'inactive_verifier': $c['verifier']->update(['is_active' => false]); break;
            case 'verifier_employee_inactive': $c['verifier']->employee->update(['status' => 'inactive']); break;
            case 'verifier_permission': $c['verifier']->roles()->sole()->permissions()->detach(); break;
            case 'expired_verification': $c['verification']->forceFill(['expires_at' => now()->subSecond()])->save(); break;
            case 'revoked_verification': $c['service']->revokeVerification($c['verifier'], $c['verification']); break;
            case 'no_issuer': $c['policy']->delegations = []; break;
            case 'issuer_permission': $c['issuer']->roles()->sole()->permissions()->detach(Permission::where('name', 'document.delegate_legal')->value('id')); break;
            case 'issuer_equals_approver': $c['grant']->forceFill(['issuer_user_id' => $c['lawyer']->id, 'issuer_employee_id' => $c['lawyer']->employee_id])->save(); break;
            case 'issuer_admission': $this->authorityActor($c['admitter'],fn()=>$c['service']->revokeIssuerAdmission($c['admitter'],$c['issuerAdmission'])); break;
            case 'expired_delegation': $c['grant']->forceFill(['expires_at' => now()->subSecond()])->save(); break;
            case 'revoked_delegation': $this->authorityActor($c['issuer'], fn()=>$c['service']->revokeDelegation($c['issuer'], $c['grant'])); break;
            case 'creator': $c['generated']->update(['created_by' => $c['lawyer']->id]); break;
            case 'editor': $c['generated']->update(['updated_by' => $c['lawyer']->id]); break;
            case 'submitter':
                $task = $c['case']->caseTasks()->create(['case_document_id' => $c['document']->id, 'title' => 'Synthetic', 'priority' => 'normal', 'status' => 'pending_review']);
                $task->submissions()->create(['case_document_id' => $c['document']->id, 'case_generated_document_id' => $c['generated']->id,
                    'version' => 2, 'source_type' => 'auto_generated', 'review_status' => 'pending_review', 'filename' => 'synthetic.pdf',
                    'external_file_id' => 'synthetic', 'mime_type' => 'application/pdf',
                    'external_url' => 'https://example.test/synthetic', 'submitted_by' => $c['lawyer']->id, 'submitted_at' => now()]); break;
            case 'incomplete_provenance': $c['generated']->update(['draft_data' => ['synthetic' => 'untrusted editor']]); break;
            case 'default_pending': $this->app->instance(C001AuthorityPolicy::class, new PendingC001AuthorityPolicy); break;
        }
        $response = $this->stepResponse();
        $this->assertContains($response->status(), [403, 409]);
        $this->assertDatabaseCount('c001_legal_proofs', 0);
        $this->assertDatabaseCount('c001_legal_decisions', 0);
    }

    public static function changedProofs(): array
    {
        return array_map(fn ($state) => [$state], ['missing', 'expired', 'consumed', 'admin_action', 'wrong_action', 'wrong_scope',
            'workbook_bytes', 'pdf_bytes', 'workbook_hash', 'pdf_hash', 'snapshot', 'template', 'wrong_case', 'wrong_document',
            'wrong_generated', 'wrong_version', 'revoked_delegation', 'different_request_key']);
    }

    #[DataProvider('changedProofs')]
    public function test_changed_context_or_invalid_proof_never_partially_finalizes(string $state): void
    {
        $this->prepared(); $proof = $this->proof();
        $challengeId = DB::table('c001_legal_proofs')->where('id', $proof)->value('challenge_id');
        $challenge = DB::table('authentication_challenges')->where('id', $challengeId);
        switch ($state) {
            case 'missing': $proof = 99999; break;
            case 'expired': $this->travel(300)->seconds(); break;
            case 'consumed': $challenge->update(['used_at' => now()]); break;
            case 'admin_action': $challenge->update(['action' => 'role.assign']); break;
            case 'wrong_action': $challenge->update(['action' => 'legal.c001.reject']); break;
            case 'wrong_scope': $challenge->update(['scope_hash' => str_repeat('a', 64)]); break;
            case 'workbook_bytes': $this->bytes['workbook'] = 'CHANGED WORKBOOK'; break;
            case 'pdf_bytes': $this->bytes['pdf'] = '%PDF-CHANGED'; break;
            case 'workbook_hash': $this->c['generated']->artifacts()->where('artifact_type', 'source_workbook')->update(['checksum' => str_repeat('a', 64)]); break;
            case 'pdf_hash': $this->c['generated']->artifacts()->where('artifact_type', 'pdf')->update(['checksum' => null]); break;
            case 'snapshot': DB::table('case_generated_documents')->where('id', $this->c['generated']->id)->update(['draft_data' => '{"synthetic":"changed"}']); break;
            case 'template': DB::table('document_generation_templates')->where('id', $this->c['generated']->document_generation_template_id)->update(['template_body' => 'changed']); break;
            case 'wrong_case': $this->c['case'] = $this->matter(); break;
            case 'wrong_document': $this->c['document'] = $this->document($this->c['case']); break;
            case 'wrong_generated': $this->c['generated'] = CaseGeneratedDocument::where('version', 1)->firstOrFail(); break;
            case 'wrong_version': $this->c['generated']->update(['version' => 3]); break;
            case 'revoked_delegation': $this->authorityActor($this->c['issuer'], fn()=>$this->c['service']->revokeDelegation($this->c['issuer'], $this->c['grant'])); break;
        }
        $this->denied($proof, key: $state === 'different_request_key' ? 'different-request-0000001' : null);
    }

    public static function failingWrites(): array { return [['audit'], ['receipt'], ['workflow']]; }

    #[DataProvider('failingWrites')]
    public function test_any_required_write_failure_rolls_back_proof_receipt_and_workflow(string $failure): void
    {
        $this->prepared(); $proof = $this->proof(); $before = $this->businessState();
        $target = match ($failure) { 'audit' => 'security_audit_logs', 'receipt' => 'c001_legal_decisions', 'workflow' => 'case_documents' };
        $operation = $failure === 'workflow' ? 'UPDATE' : 'INSERT';
        $when = $failure === 'audit' ? "WHEN NEW.event = 'legal.c001_approved'" : '';
        DB::unprepared("CREATE TRIGGER c001_test_write_failure BEFORE {$operation} ON {$target} {$when} BEGIN SELECT RAISE(ABORT, 'synthetic required write failure'); END");
        try { $this->decide($proof); $this->fail('Required failure must propagate.'); }
        catch (QueryException) { $this->assertSame($before, $this->businessState()); }
        DB::unprepared('DROP TRIGGER c001_test_write_failure');
        $this->assertSame('final_approve', $this->decide($proof)->decision_type);
    }

    public function test_immutable_receipt_provenance_and_approved_content_are_protected_against_raw_writes(): void
    {
        $this->prepared(); $receipt = $this->decide($this->proof());
        foreach (['c001_legal_decisions', 'c001_legal_proofs', 'c001_version_provenance', 'case_generated_documents', 'generated_document_artifacts'] as $table) {
            try { DB::table($table)->where('id', $table === 'case_generated_documents' ? $this->c['generated']->id : 1)->delete(); $this->fail('Immutable evidence deletion must fail: '.$table); }
            catch (QueryException) { $this->assertDatabaseHas('c001_legal_decisions', ['id' => $receipt->id]); }
        }
        foreach (['c001_legal_decisions' => ['request_key' => 'tampered-receipt-key'],
            'c001_legal_proofs' => ['context_hash' => str_repeat('0', 64)],
            'c001_version_provenance' => ['trusted' => false],
            'case_generated_documents' => ['workflow_status' => 'draft'],
            'generated_document_artifacts' => ['checksum' => str_repeat('0', 64)]] as $table => $change) {
            try { DB::table($table)->where('id', $table === 'case_generated_documents' ? $this->c['generated']->id : 1)->update($change); $this->fail('Immutable evidence update must fail: '.$table); }
            catch (QueryException) { $this->assertDatabaseHas('c001_legal_decisions', ['id' => $receipt->id, 'request_key' => $this->key]); }
        }
    }

    public function test_same_key_different_context_and_second_key_cannot_create_a_second_receipt(): void
    {
        $this->prepared(); $proof = $this->proof(); $first = $this->decide($proof);
        $this->denied($proof, 409, 'different-request-0000001');
        try { C001LegalDecision::forceCreate([...$first->getAttributes(), 'id' => null, 'request_key' => 'second-request-00000001']); $this->fail('Unique version/proof constraint must reject a second winner.'); }
        catch (QueryException) { $this->assertDatabaseCount('c001_legal_decisions', 1); }
    }

    public function test_expired_rolled_back_proof_requires_new_totp_without_extending_the_old_expiry(): void
    {
        $this->prepared(); $proof = $this->proof();
        $oldExpiry = DB::table('c001_legal_proofs')->where('id', $proof)->value('expires_at');
        $this->travel(300)->seconds(); $this->denied($proof, 403);
        $next = $this->proof();
        $this->assertNotSame($proof, $next);
        $this->assertSame($oldExpiry, DB::table('c001_legal_proofs')->where('id', $proof)->value('expires_at'));
        $this->assertSame('final_approve', $this->decide($next)->decision_type);
    }

    public function test_linked_task_submission_completes_in_the_same_atomic_decision(): void
    {
        $this->prepared(); $c = $this->c;
        $this->flushHeaders(); $this->actingAs($c['author']);
        $task = $c['case']->caseTasks()->create(['case_document_id' => $c['document']->id,
            'title' => 'Synthetic linked task', 'status' => 'pending_review', 'priority' => 'normal']);
        $submission = $task->submissions()->create(['case_document_id' => $c['document']->id,
            'case_generated_document_id' => $c['generated']->id, 'version' => 2, 'source_type' => 'auto_generated',
            'review_status' => 'pending_review', 'filename' => 'synthetic.pdf', 'mime_type' => 'application/pdf',
            'external_file_id' => 'pdf', 'external_url' => 'https://example.test/pdf',
            'checksum' => hash('sha256', $this->bytes['pdf']), 'submitted_by' => $c['author']->id, 'submitted_at' => now()]);
        $this->decide($this->proof());
        $this->assertSame('completed', $task->fresh()->status);
        $this->assertSame('approved', $submission->fresh()->review_status);
        $this->assertSame($c['lawyer']->id, $submission->fresh()->reviewed_by);
        $this->assertDatabaseCount('case_activities', 1);
    }

    public function test_totp_cannot_be_replayed_to_mint_another_legal_proof(): void
    {
        $this->prepared(); $this->proof();
        $this->postJson('/api/mfa/step-up', ['password' => self::SYNTHETIC_PASSWORD,
            'otp' => app(Totp::class)->code($this->secret, now()->timestamp), 'action' => C001DecisionContext::ACTION,
            'scope' => ['generated_document_id' => $this->c['generated']->id, 'request_key' => $this->key]])->assertUnprocessable();
        $this->assertDatabaseCount('c001_legal_proofs', 1);
    }

    public function test_artifact_provider_checks_do_not_run_inside_the_legal_commit(): void
    {
        $this->prepared(); $depth = DB::transactionLevel();
        $drive = Mockery::mock(GoogleDriveService::class);
        $drive->shouldReceive('downloadFileContent')->times(4)->andReturnUsing(function ($id) use ($depth) {
            $this->assertSame($depth, DB::transactionLevel(), 'No provider I/O inside the legal transaction.');
            return $this->bytes[$id];
        });
        $this->app->instance(GoogleDriveService::class, $drive);
        $this->decide($this->proof());
    }

    public function test_logout_revokes_session_and_proof_without_deleting_legal_evidence(): void
    {
        $this->prepared(); $proof = $this->proof(); $this->decide($proof);
        $this->postJson('/api/logout')->assertOk();
        $this->assertDatabaseCount('c001_legal_decisions', 1);
        $this->assertDatabaseCount('c001_legal_proofs', 1);
        $this->denied($proof, 403);
    }

    public function test_two_overlapping_attempts_cannot_reserve_the_same_consumed_proof_twice(): void
    {
        $this->prepared(); $proof = $this->proof(); $attempted = false;
        // Deterministic overlap at the receipt boundary, not a multi-connection MySQL claim.
        C001LegalDecision::creating(function () use ($proof, &$attempted): void {
            if ($attempted) return;
            $attempted = true;
            $this->denied($proof, 409);
        });
        try { $this->decide($proof); }
        finally { \Illuminate\Support\Facades\Event::forget('eloquent.creating: '.C001LegalDecision::class); }
        $this->assertTrue($attempted);
        $this->assertDatabaseCount('c001_legal_decisions', 1);
        $this->assertSame(1, SecurityAuditLog::where('event', 'legal.c001_approved')->count());
    }

    public function test_missing_legal_permission_is_denied_before_resource_existence_can_be_probed(): void
    {
        $this->prepared();
        $this->c['lawyer']->roles()->sole()->permissions()->detach(Permission::where('name', 'document.approve_legal')->value('id'));
        $this->stepResponse()->assertForbidden();
        $this->postJson('/api/mfa/step-up', ['password' => self::SYNTHETIC_PASSWORD,
            'otp' => app(Totp::class)->code($this->secret, now()->timestamp), 'action' => C001DecisionContext::ACTION,
            'scope' => ['generated_document_id' => 999999, 'request_key' => $this->key]])->assertForbidden();
        $this->assertDatabaseCount('c001_legal_proofs', 0);
    }

    public function test_past_contributor_is_truthfully_recorded_under_c001_3b_self_approval(): void
    {
        $this->prepared(); $generated = $this->c['generated'];
        $generated->update(['draft_data' => ['synthetic' => 'lawyer edit'], 'updated_by' => $this->c['lawyer']->id]);
        $this->flushHeaders(); $this->actingAs($this->c['author']);
        $generated->update(['draft_data' => ['synthetic' => 'author revision'], 'updated_by' => $this->c['author']->id]);
        // The legacy last-editor fields and hypothetical legacy ledger omit the past editor.
        $this->assertSame($this->c['author']->id, $generated->fresh()->updated_by);
        $receipt = $this->decide($this->proof());
        $this->assertTrue($receipt->context['self_approval']);
        $this->assertSame('SELF_FINAL_APPROVAL_WITH_STEP_UP', $receipt->context['decision_mode']);
        $this->assertDatabaseCount('c001_legal_decisions', 1);
    }

    public function test_client_hash_and_verified_claims_are_not_accepted_as_legal_scope_truth(): void
    {
        $this->prepared();
        $this->postJson('/api/mfa/step-up', ['password' => self::SYNTHETIC_PASSWORD,
            'otp' => app(Totp::class)->code($this->secret, now()->timestamp), 'action' => C001DecisionContext::ACTION,
            'scope' => ['generated_document_id' => $this->c['generated']->id, 'request_key' => $this->key,
                'verified' => true, 'snapshot_hash' => str_repeat('a', 64)]])->assertUnprocessable();
        $this->assertDatabaseCount('c001_legal_proofs', 0);
    }
}
