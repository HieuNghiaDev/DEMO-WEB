<?php

namespace Tests\Feature\B32;

use App\Models\CaseTask;
use App\Models\CaseTaskSubmission;
use App\Models\Permission;
use App\Models\ReceivedDocument;
use App\Models\RehearsalLawyerVerification;
use App\Models\SecurityAuditLog;
use App\Models\User;
use App\Services\RehearsalDocumentAuthority;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\B21\B21TestCase;

class ReviewAuthorityTest extends B21TestCase
{
    use \Tests\Support\B32\BuildsReviewAuthorityFixtures;

    private function pendingFile(): array
    {
        $reviewer = $this->reader('reviewer', ['task.review', 'document.review_internal']);
        $case = $this->matter();
        $this->member($reviewer, $case, ['read', 'write']);
        $document = $this->document($case);
        $document->update(['review_status' => 'reviewing']);
        $file = ReceivedDocument::create(['case_file_id' => $case->id, 'title' => 'Synthetic.pdf', 'version' => 1,
            'storage_type' => 'link', 'external_url' => 'https://example.test/synthetic.pdf', 'review_status' => 'pending_review']);
        $document->receivedDocuments()->attach($file);
        return [$reviewer, $case, $document, $file];
    }

    private function reviewUrl($case, $document): string
    {
        return "/api/case-files/{$case->id}/document-collection/{$document->id}/file-review";
    }

    public function test_case_membership_and_task_review_are_not_an_internal_assignment(): void
    {
        [$reviewer, $case, $document, $file] = $this->pendingFile();
        $this->actingAs($reviewer, 'sanctum')->postJson($this->reviewUrl($case, $document),
            ['source' => 'received', 'file_id' => $file->id, 'action' => 'confirm'])->assertForbidden();
        $this->assertSame('pending_review', $file->fresh()->review_status);
        $this->assertDatabaseCount('case_activities', 0);
    }

    public function test_exact_assigned_internal_review_confirms_once_without_legal_approval(): void
    {
        [$reviewer, $case, $document, $file] = $this->pendingFile();
        $this->assignReview($reviewer, $case, $document, 'received', $file);
        $generated = $this->generated($document, $this->reader('separate-legal-author'));
        $beforeLegal = $generated->fresh()->getAttributes();
        $this->assertNull(app(RehearsalDocumentAuthority::class)->verification($reviewer));
        $this->actingAs($reviewer, 'sanctum')->postJson($this->reviewUrl($case, $document),
            ['source' => 'received', 'file_id' => $file->id, 'action' => 'confirm'])->assertOk();
        $this->assertSame('approved', $file->fresh()->review_status);
        $this->assertSame($beforeLegal, $generated->fresh()->getAttributes());
        $this->assertSame('explicit_permission_required', app(RehearsalDocumentAuthority::class)
            ->finalBlocker($reviewer, $case->id, $document->id, $generated->id));
        $this->assertSame(1, SecurityAuditLog::where('event', 'document.internal_confirmed')->count());
        $this->postJson($this->reviewUrl($case, $document),
            ['source' => 'received', 'file_id' => $file->id, 'action' => 'confirm'])->assertUnprocessable();
        $this->assertSame(1, SecurityAuditLog::where('event', 'document.internal_confirmed')->count());
    }

    public static function invalidAssignment(): array
    {
        return array_map(fn ($state) => [$state], ['revoked', 'expired', 'wrong_version', 'wrong_kind', 'permission_revoked',
            'issuer_unverified', 'issuer_scope_revoked', 'verifier_permission_revoked', 'inactive_employee']);
    }

    #[DataProvider('invalidAssignment')]
    public function test_internal_assignment_is_fresh_exact_and_never_implicit(string $state): void
    {
        [$reviewer, $case, $document, $file] = $this->pendingFile();
        $grant = $this->assignReview($reviewer, $case, $document, 'received', $file);
        $verification = RehearsalLawyerVerification::findOrFail($grant->verification_id);
        $authority = app(RehearsalDocumentAuthority::class);
        $this->assertSame($grant->id, $authority->authorizeInternal($reviewer, $case->id, $document->id, 'received', $file->id)->id);
        match ($state) {
            'revoked' => $grant->forceFill(['revoked_at' => now()])->save(),
            'expired' => $grant->forceFill(['expires_at' => now()->subSecond()])->save(),
            'wrong_version' => $grant->forceFill(['version' => 2])->save(),
            'wrong_kind' => $grant->forceFill(['kind' => 'final'])->save(),
            'permission_revoked' => $reviewer->roles()->sole()->permissions()->detach(Permission::where('name', 'document.review_internal')->value('id')),
            'issuer_unverified' => $verification->forceFill(['revoked_at' => now()])->save(),
            'issuer_scope_revoked' => DB::table('case_memberships')->where('user_id', $verification->user_id)->update(['revoked_at' => now()]),
            'verifier_permission_revoked' => User::findOrFail($verification->verifier_user_id)->roles()->sole()->permissions()->detach(),
            'inactive_employee' => DB::table('employees')->where('id', $reviewer->employee_id)->update(['status' => 'resigned']),
        };
        $this->actingAs($reviewer, 'sanctum')->postJson($this->reviewUrl($case, $document),
            ['source' => 'received', 'file_id' => $file->id, 'action' => 'confirm'])->assertStatus($state === 'inactive_employee' ? 401 : 403);
        $this->assertSame('pending_review', $file->fresh()->review_status);
    }

    public function test_audit_insert_failure_rolls_back_internal_review_and_verification_revocation(): void
    {
        [$reviewer, $case, $document, $file] = $this->pendingFile();
        $grant = $this->assignReview($reviewer, $case, $document, 'received', $file);
        DB::unprepared("CREATE TRIGGER b32_audit_failure BEFORE INSERT ON security_audit_logs BEGIN SELECT RAISE(ABORT, 'synthetic audit failure'); END");
        $this->actingAs($reviewer, 'sanctum')->postJson($this->reviewUrl($case, $document),
            ['source' => 'received', 'file_id' => $file->id, 'action' => 'confirm'])->assertServerError();
        $this->assertSame('pending_review', $file->fresh()->review_status);
        $this->assertSame('reviewing', $document->fresh()->review_status);
        $this->assertDatabaseCount('case_activities', 0);
        $verification = RehearsalLawyerVerification::findOrFail($grant->verification_id);
        try {
            app(RehearsalDocumentAuthority::class)->revokeVerification(User::findOrFail($verification->verifier_user_id), $verification->id);
            $this->fail('Required audit failure must roll back.');
        } catch (\Illuminate\Database\QueryException) {
            $this->assertNull($verification->fresh()->revoked_at);
        }
    }

    public function test_revocation_invalidates_delegated_review_on_the_next_request(): void
    {
        [$reviewer, $case, $document, $file] = $this->pendingFile();
        $grant = $this->assignReview($reviewer, $case, $document, 'received', $file);
        $verification = RehearsalLawyerVerification::findOrFail($grant->verification_id);
        $authority = app(RehearsalDocumentAuthority::class);
        $this->assertNotNull($authority->authorizeInternal($reviewer, $case->id, $document->id, 'received', $file->id));
        $verifier = User::findOrFail($verification->verifier_user_id);
        $authority->revokeVerification($verifier, $verification->id);
        $authority->revokeVerification($verifier, $verification->id);
        $this->assertSame(1, SecurityAuditLog::where('event', 'lawyer.verification_revoked')->count());
        $this->actingAs($reviewer, 'sanctum')->postJson($this->reviewUrl($case, $document),
            ['source' => 'received', 'file_id' => $file->id, 'action' => 'return', 'reason' => '最新版が必要'])->assertForbidden();
    }

    public function test_assigned_return_and_task_review_do_not_finalize_a_generated_document(): void
    {
        [$reviewer, $case, $document, $file] = $this->pendingFile();
        $task = CaseTask::create(['case_file_id' => $case->id, 'case_document_id' => $document->id,
            'title' => 'Synthetic task', 'status' => 'pending_review']);
        $submission = CaseTaskSubmission::create(['case_task_id' => $task->id, 'case_document_id' => $document->id,
            'received_document_id' => $file->id, 'version' => 1, 'source_type' => 'manual_upload', 'review_status' => 'pending_review',
            'filename' => 'synthetic.pdf', 'storage_provider' => 'local', 'external_file_id' => 'synthetic', 'external_url' => '',
            'mime_type' => 'application/pdf',
            'submitted_by' => $this->reader('author')->id, 'submitted_at' => now()]);
        $this->assignReview($reviewer, $case, $document, 'task_submission', $submission);
        $this->actingAs($reviewer, 'sanctum')->postJson($this->reviewUrl($case, $document),
            ['source' => 'task_submission', 'file_id' => $submission->id, 'action' => 'return', 'reason' => '最新版が必要'])->assertOk();
        $this->assertSame('changes_requested', $task->fresh()->status);
        $this->assertSame('rejected', $submission->fresh()->review_status);
        $this->assertSame(1, SecurityAuditLog::where('event', 'document.internal_returned')->count());
        $this->assertDatabaseCount('case_generated_documents', 0);
    }

    public function test_received_alias_of_generated_submission_and_foreign_task_are_denied(): void
    {
        [$reviewer, $case, $document, $file] = $this->pendingFile();
        $this->assignReview($reviewer, $case, $document, 'received', $file);
        $generated = $this->generated($document, $this->reader('author'));
        $task = CaseTask::create(['case_file_id' => $case->id, 'case_document_id' => $document->id,
            'title' => 'Synthetic mixed-source task', 'status' => 'pending_review']);
        $submission = CaseTaskSubmission::create(['case_task_id' => $task->id, 'case_document_id' => $document->id,
            'received_document_id' => $file->id, 'case_generated_document_id' => $generated->id,
            'version' => 1, 'source_type' => 'manual_upload', 'review_status' => 'pending_review',
            'filename' => 'synthetic.pdf', 'mime_type' => 'application/pdf', 'storage_provider' => 'local',
            'external_file_id' => 'synthetic', 'external_url' => '', 'submitted_by' => $reviewer->id, 'submitted_at' => now()]);
        $authority = app(RehearsalDocumentAuthority::class);
        $this->assertFalse($authority->canInternal($reviewer, $case->id, $document->id, 'received', $file->id));
        $other = $this->matter();
        $otherDocument = $this->document($other);
        $this->member($reviewer, $other, ['read', 'write']);
        $this->actingAs($reviewer, 'sanctum')->postJson($this->reviewUrl($other, $document),
            ['source' => 'received', 'file_id' => $file->id, 'action' => 'confirm'])->assertNotFound();
        $otherTask = CaseTask::create(['case_file_id' => $other->id, 'case_document_id' => $otherDocument->id,
            'title' => 'Synthetic foreign task', 'status' => 'pending_review']);
        $this->postJson("/api/case-files/{$case->id}/case-tasks/{$otherTask->id}/submissions/{$submission->id}/approve")->assertNotFound();
        $this->assertSame('review', $generated->fresh()->workflow_status);
    }

    public static function invalidVerification(): array
    {
        return array_map(fn ($state) => [$state], ['self', 'bad_digest', 'unknown_source', 'future', 'expired', 'inactive_verifier', 'inactive_subject', 'relinked_subject']);
    }

    #[DataProvider('invalidVerification')]
    public function test_invalid_attestations_never_prove_lawyer_status(string $state): void
    {
        $lawyer = $this->reader('subject');
        $verification = $this->verified($lawyer);
        $authority = app(RehearsalDocumentAuthority::class);
        $this->assertNotNull($authority->verification($lawyer));
        match ($state) {
            'self' => $verification->forceFill(['verifier_user_id' => $lawyer->id, 'verifier_employee_id' => $lawyer->employee_id])->save(),
            'bad_digest' => $verification->forceFill(['evidence_digest' => 'invalid'])->save(),
            'unknown_source' => $verification->forceFill(['evidence_source' => 'unapproved-provider'])->save(),
            'future' => $verification->forceFill(['verified_at' => now()->addDay()])->save(),
            'expired' => $verification->forceFill(['expires_at' => now()->subSecond()])->save(),
            'inactive_verifier' => DB::table('users')->where('id', $verification->verifier_user_id)->update(['is_active' => false]),
            'inactive_subject' => DB::table('users')->where('id', $lawyer->id)->update(['is_active' => false]),
            'relinked_subject' => DB::table('users')->where('id', $lawyer->id)->update(['employee_id' => null]),
        };
        $this->assertNull($authority->verification($lawyer));
    }

    public function test_review_grant_revocation_is_required_audited_and_not_self_service(): void
    {
        [$reviewer, $case, $document, $file] = $this->pendingFile();
        $grant = $this->assignReview($reviewer, $case, $document, 'received', $file);
        $authority = app(RehearsalDocumentAuthority::class);
        try {
            $authority->revokeReviewGrant($reviewer, $grant->id);
            $this->fail('Reviewer cannot manage own assignment.');
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $error) {
            $this->assertSame(403, $error->getStatusCode());
        }
        $issuer = User::findOrFail(RehearsalLawyerVerification::findOrFail($grant->verification_id)->user_id);
        DB::unprepared("CREATE TRIGGER b32_grant_audit_failure BEFORE INSERT ON security_audit_logs BEGIN SELECT RAISE(ABORT, 'synthetic audit failure'); END");
        try {
            $authority->revokeReviewGrant($issuer, $grant->id);
            $this->fail('Audit fault must roll back grant revocation.');
        } catch (\Illuminate\Database\QueryException) {
            $this->assertNull($grant->fresh()->revoked_at);
        }
        DB::unprepared('DROP TRIGGER b32_grant_audit_failure');
        $authority->revokeReviewGrant($issuer, $grant->id);
        $this->assertFalse($authority->canInternal($reviewer, $case->id, $document->id, 'received', $file->id));
        $this->assertSame(1, SecurityAuditLog::where('event', 'document.review_grant_revoked')->count());
        $json = SecurityAuditLog::where('request_path', 'document-authority-rehearsal')->get()->toJson();
        $this->assertStringNotContainsString($reviewer->email, $json);
        $this->assertStringNotContainsString($document->title, $json);
    }

    public function test_renewed_issuer_attestation_does_not_shadow_the_exact_delegation_evidence(): void
    {
        [$reviewer, $case, $document, $file] = $this->pendingFile();
        $grant = $this->assignReview($reviewer, $case, $document, 'received', $file);
        $original = RehearsalLawyerVerification::findOrFail($grant->verification_id);
        $issuer = User::findOrFail($original->user_id);
        $renewed = $original->replicate();
        DB::transaction(function () use ($renewed, $issuer): void {
            $renewed->save();
            SecurityAuditLog::create(['event' => 'fixture.lawyer_verified', 'outcome' => 'success', 'user_id' => $issuer->id,
                'metadata' => ['verification_id' => $renewed->id, 'synthetic' => true]]);
        });
        $grant->forceFill(['verification_id' => $renewed->id])->save();
        $authority = app(RehearsalDocumentAuthority::class);
        $this->assertTrue($authority->canInternal($reviewer, $case->id, $document->id, 'received', $file->id));
        $authority->revokeVerification(User::findOrFail($renewed->verifier_user_id), $renewed->id);
        $this->assertNotNull($authority->verification($issuer)); // Another attestation cannot replace the revoked exact issuer proof.
        $this->assertFalse($authority->canInternal($reviewer, $case->id, $document->id, 'received', $file->id));
    }
}
