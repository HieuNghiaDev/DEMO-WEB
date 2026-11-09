<?php

namespace Tests\Feature\C001;

use App\Contracts\C001AuthorityPolicy;
use App\Models\LawyerVerification;
use App\Models\LegalDelegation;
use App\Models\Permission;
use App\Models\SecurityAuditLog;
use App\Services\C001LegalAuthority;
use App\Services\LegalFinalizationGate;
use App\Services\PendingC001AuthorityPolicy;
use Illuminate\Database\QueryException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Tests\Support\B21\B21TestCase;

class LegalAuthorityPreparationTest extends B21TestCase
{
    use \Tests\Support\C001\BuildsC001AuthorityFixtures;

    private function denied(callable $operation, int $status): void
    {
        try { $operation(); $this->fail('Expected denial, not success.'); }
        catch (HttpExceptionInterface $error) { $this->assertSame($status, $error->getStatusCode()); }
    }

    public function test_default_policy_refuses_real_admission_and_does_not_read_synthetic_attestations(): void
    {
        $this->assertInstanceOf(PendingC001AuthorityPolicy::class, app(C001AuthorityPolicy::class));
        $verifier = $this->fixtureUser('default-verifier', ['employee.verify_lawyer']);
        $lawyer = $this->reader('default-lawyer', ['document.approve_legal']);
        $service = app(C001LegalAuthority::class);
        $this->denied(fn () => $service->issueVerification($verifier, $lawyer, $this->evidence()), 409);
        $evidence = $this->evidence(); $evidence['source'] = 'synthetic-b32';
        $this->denied(fn () => $service->issueVerification($verifier, $lawyer, $evidence), 422);
        $forged = $this->evidence(); $forged['verified'] = true;
        $this->denied(fn () => $service->issueVerification($verifier, $lawyer, $forged), 422);
        $this->assertDatabaseCount('lawyer_verifications', 0);
        $this->assertSame(0, SecurityAuditLog::where('event', 'like', 'lawyer.%')->count());
        $this->assertNull($service->verification($lawyer));
    }

    public function test_hypothetical_admission_and_exact_grant_are_not_final_approval_or_step_up_proof(): void
    {
        extract($this->context());
        $before = $generated->fresh()->getAttributes();
        $this->assertSame('legal_step_up_and_final_writer_policy_pending', $service->finalBlocker($lawyer, $case, $document, $generated));
        $this->assertSame($grant->id, $service->delegation($lawyer, $generated)?->id);
        try { LegalFinalizationGate::enforce($lawyer); $this->fail('Default finalization must remain locked.'); }
        catch (HttpResponseException $error) { $this->assertSame(409, $error->getResponse()->getStatusCode()); }
        $this->assertSame($before, $generated->fresh()->getAttributes());
        $this->assertDatabaseCount('case_activities', 0);
        $this->assertTrue(LegalFinalizationGate::policyPending());
        $this->assertSame(['role.assign', 'role.create', 'role.clone', 'role.rename', 'role.permissions', 'role.delete',
            'mfa.device_change', 'mfa.recovery_codes', 'bootstrap.finish', 'account.password', 'employee.reset_password', 'legal.c001.final_approve'], \App\Services\Administration\VerifiedMfaSessions::ACTIONS);
        $this->assertArrayNotHasKey('evidence_reference', $verification->toArray());
        $this->assertArrayNotHasKey('evidence_digest', $grant->toArray());
    }

    public static function invalidStates(): array
    {
        return array_map(fn ($state) => [$state], ['unverified', 'missing_permission', 'wrong_case', 'wrong_document', 'wrong_version',
            'expired_delegation', 'revoked_delegation', 'expired_verification', 'revoked_verification', 'inactive_user', 'inactive_employee',
            'relinked_identity', 'inactive_verifier', 'verifier_permission_revoked', 'unapproved_verifier', 'issuer_permission_revoked',
            'unapproved_issuer', 'issuer_admission_revoked', 'no_confidential_scope', 'unknown_provenance', 'past_editor',
            'creator', 'editor', 'submitter', 'incomplete_ledger', 'already_approved', 'newer_version']);
    }

    #[DataProvider('invalidStates')]
    public function test_fresh_exact_authority_preconditions_deny_invalid_states(string $state): void
    {
        extract($this->context());
        $lawyer->load('roles.permissions');
        switch ($state) {
            case 'unverified': $verification->forceFill(['source' => 'unapproved-source'])->save(); break;
            case 'missing_permission': $lawyer->roles()->sole()->permissions()->detach(Permission::where('name', 'document.approve_legal')->sole()->id); break;
            case 'wrong_case': $case = $this->matter(); $grant->forceFill(['case_file_id' => $case->id])->save(); break;
            case 'wrong_document': $document = $this->document($case); $grant->forceFill(['case_document_id' => $document->id])->save(); break;
            case 'wrong_version': $grant->forceFill(['version' => 2])->save(); break;
            case 'expired_delegation': $grant->forceFill(['expires_at' => now()->subSecond()])->save(); break;
            case 'revoked_delegation': $service->revokeDelegation($issuer, $grant); break;
            case 'expired_verification': $verification->forceFill(['expires_at' => now()->subSecond()])->save(); break;
            case 'revoked_verification': $service->revokeVerification($verifier, $verification); break;
            case 'inactive_user': $lawyer->update(['is_active' => false]); break;
            case 'inactive_employee': $lawyer->employee->update(['status' => 'inactive']); break;
            case 'relinked_identity': $replacement = $this->fixtureEmployee('relinked'); $employeeId = $replacement->employee_id; $replacement->update(['employee_id' => null]); $lawyer->update(['employee_id' => $employeeId]); break;
            case 'inactive_verifier': $verifier->update(['is_active' => false]); break;
            case 'verifier_permission_revoked': $verifier->roles()->sole()->permissions()->detach(); break;
            case 'unapproved_verifier': $policy->verifications = []; break;
            case 'issuer_permission_revoked': $issuer->roles()->sole()->permissions()->detach(Permission::where('name', 'document.delegate_legal')->sole()->id); break;
            case 'unapproved_issuer': $policy->delegations = []; break;
            case 'issuer_admission_revoked': $this->authorityActor($admitter,fn()=>$service->revokeIssuerAdmission($admitter,$issuerAdmission)); break;
            case 'no_confidential_scope': DB::table('case_memberships')->where('user_id', $lawyer->id)->update(['can_read_confidential' => false]); break;
            case 'unknown_provenance': $policy->ledgers = []; break;
            case 'past_editor': $policy->ledgers[$generated->id.':1'][] = $lawyer->id; break;
            case 'creator': $generated->update(['created_by' => $lawyer->id]); break;
            case 'editor': $generated->update(['updated_by' => $lawyer->id]); break;
            case 'submitter':
                $task = $case->caseTasks()->create(['case_document_id' => $document->id, 'title' => 'synthetic', 'status' => 'pending_review', 'priority' => 'normal']);
                $task->submissions()->create(['case_document_id' => $document->id, 'case_generated_document_id' => $generated->id, 'version' => 1,
                    'source_type' => 'auto_generated', 'filename' => 'synthetic.pdf', 'mime_type' => 'application/pdf', 'review_status' => 'pending_review',
                    'external_file_id' => 'synthetic-only', 'external_url' => 'https://example.test/synthetic',
                    'submitted_by' => $lawyer->id, 'submitted_at' => now()]); break;
            case 'incomplete_ledger': $policy->ledgers[$generated->id.':1'] = [$issuer->id]; break;
            case 'already_approved': $generated->update(['workflow_status' => 'approved', 'approved_data' => [], 'approved_at' => now()]); break;
            case 'newer_version': $generated->replicate()->forceFill(['version' => 2])->save(); break;
        }
        if ($state === 'past_editor') {
            // New owner rule changes only contributor eligibility; no proof or finalization was performed.
            $this->assertSame('legal_step_up_and_final_writer_policy_pending', $service->finalBlocker($lawyer, $case, $document, $generated));
            $this->assertNotNull($service->delegation($lawyer, $generated));
            $this->assertSame('review', $generated->fresh()->workflow_status);
            $this->assertNull($generated->fresh()->approved_at);
            return;
        }
        $this->assertNotSame('legal_step_up_and_final_writer_policy_pending', $service->finalBlocker($lawyer, $case, $document, $generated), $state);
        $this->assertNull($service->delegation($lawyer, $generated), $state);
    }

    public function test_renewal_is_audited_new_admission_and_invalidates_old_exact_delegation(): void
    {
        extract($this->context());
        $next = $this->evidence(); $next['evidence_reference'] = 'test-only:renewal';
        $this->denied(fn () => $service->renewVerification($verifier, $verification, $next), 409);
        $policy->verifications[$policy->key($lawyer, $verifier, $next)] = true;
        $renewed = $service->renewVerification($verifier, $verification, $next);
        $this->assertSame($verification->id, $renewed->supersedes_id);
        $this->assertNull($service->verification($lawyer, $verification->id));
        $this->assertSame($renewed->id, $service->verification($lawyer)?->id);
        $this->assertNull($service->delegation($lawyer, $generated));
        $this->assertSame(1, SecurityAuditLog::where('event', 'lawyer.verification_renewed')->count());
        $this->denied(fn () => $service->renewVerification($verifier, $verification, $next), 409);
    }

    public function test_self_verification_self_delegation_and_unapproved_admission_cannot_write(): void
    {
        extract($this->context());
        // Even hypothetical admission + verifier permission cannot make self-verification valid.
        $policy->verifications[$policy->key($verifier, $verifier, $evidence)] = true;
        $this->denied(fn () => $service->issueVerification($verifier, $verifier, $evidence), 403);
        $policy->delegations[$policy->key($lawyer, $lawyer, $terms, $generated)] = true;
        $this->denied(fn () => $service->issueDelegation($lawyer, $lawyer, $generated, $terms), 403);
        $policy->delegations = [];
        $this->denied(fn () => $service->issueDelegation($issuer, $lawyer, $generated, $terms), 409);
        $this->assertDatabaseCount('legal_delegations', 1);
        $this->app->instance(C001AuthorityPolicy::class, new PendingC001AuthorityPolicy);
        $this->assertNull(app(C001LegalAuthority::class)->verification($lawyer));
        $this->assertNull(app(C001LegalAuthority::class)->delegation($lawyer, $generated));
    }

    public static function auditOperations(): array
    {
        return array_map(fn ($operation) => [$operation], ['issue', 'renew', 'verification_revoke', 'delegate', 'delegation_revoke']);
    }

    #[DataProvider('auditOperations')]
    public function test_required_audit_failure_rolls_back_registry_mutation(string $operation): void
    {
        extract($this->context());
        $before = [LawyerVerification::count(), LegalDelegation::count(), SecurityAuditLog::count()];
        $next = $this->evidence(); $next['evidence_reference'] = 'test-only:next';
        $policy->verifications[$policy->key($lawyer, $verifier, $next)] = true;
        DB::unprepared("CREATE TRIGGER fail_c001_audit BEFORE INSERT ON security_audit_logs WHEN NEW.event LIKE 'lawyer.%' OR NEW.event LIKE 'legal.%' BEGIN SELECT RAISE(ABORT, 'synthetic audit failure'); END");
        try {
            match ($operation) {
                'issue' => $service->issueVerification($verifier, $lawyer, $next),
                'renew' => $service->renewVerification($verifier, $verification, $next),
                'verification_revoke' => $service->revokeVerification($verifier, $verification),
                'delegate' => $service->issueDelegation($issuer, $lawyer, $generated, $terms),
                'delegation_revoke' => $service->revokeDelegation($issuer, $grant),
            };
            $this->fail('Audit persistence failure must not be swallowed.');
        } catch (QueryException) {
            $this->assertSame($before, [LawyerVerification::count(), LegalDelegation::count(), SecurityAuditLog::count()]);
            $this->assertNull($verification->fresh()->revoked_at);
            $this->assertNull($grant->fresh()->revoked_at);
            $this->assertSame('review', $generated->fresh()->workflow_status);
        }
    }
}
