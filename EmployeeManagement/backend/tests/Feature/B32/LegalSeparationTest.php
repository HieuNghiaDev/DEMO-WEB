<?php

namespace Tests\Feature\B32;

use App\Models\ApprovalRequest;
use App\Models\CaseMembership;
use App\Models\CaseTask;
use App\Models\CaseTaskSubmission;
use App\Models\EmployeeNotification;
use App\Models\Permission;
use App\Models\RehearsalLawyerVerification;
use App\Models\SecurityAuditLog;
use App\Models\User;
use App\Services\CaseAccessService;
use App\Services\RehearsalDocumentAuthority;
use App\Services\Administration\VerifiedMfaSessions;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\B21\B21TestCase;

class LegalSeparationTest extends B21TestCase
{
    use \Tests\Support\B32\BuildsReviewAuthorityFixtures;

    private function legalContext(): array
    {
        $lawyer = $this->reader('legal', ['document.approve_legal', 'document.review_internal', 'task.review', 'approval.view', 'approval.approve']);
        $case = $this->matter();
        $this->member($lawyer, $case, ['read', 'write', 'confidential']);
        $document = $this->document($case);
        $generated = $this->generated($document, $this->reader('author'));
        $verification = $this->verified($lawyer);
        $grant = $this->assignReview($lawyer, $case, $document, 'generated', $generated, 'final');
        return [$lawyer, $case, $document, $generated, $verification, $grant];
    }

    public function test_all_synthetic_prerequisites_still_do_not_enable_unapproved_legal_policy(): void
    {
        [$lawyer, $case, $document, $generated] = $this->legalContext();
        $authority = app(RehearsalDocumentAuthority::class);
        $this->assertNotNull($authority->verification($lawyer));
        $this->assertSame('owner_verifier_legal_scope_and_step_up_policy_pending',
            $authority->finalBlocker($lawyer, $case->id, $document->id, $generated->id));
        $before = $generated->fresh()->getAttributes();
        $this->actingAs($lawyer, 'sanctum');
        for ($i = 0; $i < 2; $i++) {
            $this->postJson("/api/case-files/{$case->id}/document-collection/{$document->id}/creation/approve")
                ->assertStatus(409)->assertJsonPath('code', 'legal_authority_policy_pending');
        }
        $this->assertSame($before, $generated->fresh()->getAttributes());
        $this->assertSame(0, SecurityAuditLog::where('event', 'document.legal_approved')->count());
    }

    public static function blockers(): array
    {
        return [
            ['permission', 'explicit_permission_required'], ['membership', 'case_scope_required'],
            ['unverified', 'lawyer_unverified'], ['expired_verification', 'lawyer_unverified'],
            ['delegation', 'legal_delegation_required'], ['expired_delegation', 'legal_delegation_required'],
            ['wrong_version', 'legal_delegation_required'], ['self_created', 'conflict_policy_pending'],
            ['self_edited', 'conflict_policy_pending'], ['draft', 'workflow_state_invalid'],
            ['already_approved', 'workflow_state_invalid'], ['wrong_case', 'nested_identity_mismatch'],
            ['wrong_document', 'nested_identity_mismatch'],
        ];
    }

    #[DataProvider('blockers')]
    public function test_final_preconditions_recheck_fresh_authority_and_exact_version(string $state, string $expected): void
    {
        [$lawyer, $case, $document, $generated, $verification, $grant] = $this->legalContext();
        $authority = app(RehearsalDocumentAuthority::class);
        $this->assertSame('owner_verifier_legal_scope_and_step_up_policy_pending',
            $authority->finalBlocker($lawyer, $case->id, $document->id, $generated->id));
        match ($state) {
            'permission' => $lawyer->roles()->sole()->permissions()->detach(Permission::where('name', 'document.approve_legal')->value('id')),
            'membership' => CaseMembership::where('user_id', $lawyer->id)->update(['revoked_at' => now()]),
            'unverified' => $authority->revokeVerification(User::findOrFail($verification->verifier_user_id), $verification->id),
            'expired_verification' => $verification->forceFill(['expires_at' => now()->subSecond()])->save(),
            'delegation' => $authority->revokeReviewGrant(User::findOrFail(RehearsalLawyerVerification::findOrFail($grant->verification_id)->user_id), $grant->id),
            'expired_delegation' => $grant->forceFill(['expires_at' => now()->subSecond()])->save(),
            'wrong_version' => $grant->forceFill(['version' => 99])->save(),
            'self_created' => $generated->update(['created_by' => $lawyer->id]),
            'self_edited' => $generated->update(['updated_by' => $lawyer->id]),
            'draft' => $generated->update(['workflow_status' => 'draft']),
            'already_approved' => $generated->update(['workflow_status' => 'approved', 'approved_at' => now(), 'approved_data' => []]),
            'wrong_case' => [$case = $this->matter(), $this->member($lawyer, $case, ['read', 'write'])],
            'wrong_document' => $document = $this->document($case),
        };
        $this->assertSame($expected, $authority->finalBlocker($lawyer, $case->id, $document->id, $generated->id));
    }

    public function test_admin_level_title_and_role_names_cannot_verify_a_lawyer(): void
    {
        $authority = app(RehearsalDocumentAuthority::class);
        foreach ([$this->fixtureAdmin('not-lawyer'), $this->fixtureLegacy('five', 'level_5', 'admin'),
            $this->fixtureUser('named-lawyer', ['case.view'], 'verified_lawyer')] as $actor) {
            $actor->employee->update(['position_title' => '弁護士']);
            $this->assertNull($authority->verification($actor));
            $case = $this->matter();
            $this->member($actor, $case, ['read', 'write']);
            $document = $this->document($case);
            $generated = $this->generated($document, $actor);
            $this->assertSame('explicit_permission_required', $authority->finalBlocker($actor, $case->id, $document->id, $generated->id));
        }
        try {
            $authority->admitVerification();
            $this->fail('No owner-approved verifier exists.');
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $error) {
            $this->assertSame(409, $error->getStatusCode());
            $this->assertDatabaseCount('rehearsal_lawyer_verifications', 0);
        }
    }

    public function test_generated_fk_cannot_masquerade_as_manual_submission_even_direct_service(): void
    {
        [$lawyer, $case, $document, $generated] = $this->legalContext();
        $task = CaseTask::create(['case_file_id' => $case->id, 'case_document_id' => $document->id,
            'title' => 'Synthetic legal task', 'status' => 'pending_review']);
        $submission = CaseTaskSubmission::create(['case_task_id' => $task->id, 'case_document_id' => $document->id,
            'case_generated_document_id' => $generated->id, 'version' => 1, 'source_type' => 'manual_upload',
            'review_status' => 'pending_review', 'filename' => 'synthetic.pdf', 'mime_type' => 'application/pdf',
            'storage_provider' => 'local', 'external_file_id' => 'synthetic', 'external_url' => '',
            'submitted_by' => $lawyer->id, 'submitted_at' => now()]);
        $this->assignReview($lawyer, $case, $document, 'task_submission', $submission);
        try {
            app(RehearsalDocumentAuthority::class)->authorizeInternal($lawyer, $case->id, $document->id, 'task_submission', $submission->id);
            $this->fail('Generated links must not pass ordinary review.');
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $error) {
            $this->assertSame(409, $error->getStatusCode());
        }
        $this->actingAs($lawyer, 'sanctum')->postJson("/api/case-files/{$case->id}/case-tasks/{$task->id}/submissions/{$submission->id}/approve")
            ->assertStatus(409);
        $this->assertSame('review', $generated->fresh()->workflow_status);
    }

    public function test_confidential_queue_notifications_and_generic_approval_do_not_bypass_legal_guards(): void
    {
        [$lawyer, $case, $document, $generated] = $this->legalContext();
        $hidden = $this->matter();
        $hidden->forceFill(['is_confidential' => true])->save();
        $approval = ApprovalRequest::create(['action_type' => 'legal_approve', 'tool_name' => 'synthetic', 'requested_by' => $lawyer->id,
            'payload' => ['case_file_id' => $hidden->id, 'synthetic_confidential_marker' => 'HIDDEN-B32'], 'status' => 'pending']);
        EmployeeNotification::create(['user_id' => $lawyer->id, 'kind' => 'info', 'title' => 'HIDDEN-B32',
            'message' => 'HIDDEN-B32', 'data' => ['case_file_id' => $hidden->id]]);
        $this->actingAs($lawyer, 'sanctum')->getJson('/api/approvals')->assertOk()->assertDontSee('HIDDEN-B32');
        $this->getJson('/api/notifications')->assertOk()->assertDontSee('HIDDEN-B32');
        $this->patchJson('/api/approvals/'.$approval->id.'/approve')->assertForbidden();
        $approval->update(['payload' => ['case_file_id' => $case->id, 'case_document_id' => $document->id]]);
        $this->patchJson('/api/approvals/'.$approval->id.'/approve')->assertStatus(409);
        $this->assertSame('pending', $approval->fresh()->status);
        $this->assertSame('review', $generated->fresh()->workflow_status);
    }

    public function test_rehearsal_cannot_be_activated_by_schema_header_or_on_mysql(): void
    {
        $this->app->forgetInstance(RehearsalDocumentAuthority::class);
        $this->assertNull(RehearsalDocumentAuthority::current());
        $before = config('database.default');
        config(['database.default' => 'mysql']);
        try {
            $migration = require database_path('migrations/2026_10_23_000000_create_rehearsal_review_authorities.php');
            foreach ([fn () => new RehearsalDocumentAuthority, fn () => $migration->up(), fn () => $migration->down()] as $operation) {
                try {
                    $operation();
                    $this->fail('Must refuse before resolving MySQL.');
                } catch (\LogicException) {
                    $this->assertArrayNotHasKey('mysql', app('db')->getConnections());
                }
            }
        } finally {
            config(['database.default' => $before]);
        }
    }

    #[DataProvider('proofStates')]
    public function test_client_proof_claims_cannot_enable_blocked_legal_action(string $state): void
    {
        [$lawyer, $case, $document, $generated] = $this->legalContext();
        // No fake proof adapter: the real production verifier rejects unknown legal actions.
        $this->assertNotContains('document.approve_legal', VerifiedMfaSessions::ACTIONS);
        $this->actingAs($lawyer, 'sanctum')->withHeader('X-Step-Up', $state)
            ->postJson("/api/case-files/{$case->id}/document-collection/{$document->id}/creation/approve",
                ['step_up_verified' => true, 'step_up_state' => $state])->assertStatus(409);
        $this->assertSame('review', $generated->fresh()->workflow_status);
        $this->assertNull($generated->fresh()->approved_by);
    }

    public static function proofStates(): array
    {
        return [['expired'], ['replayed'], ['role.assign'], ['client_asserted']];
    }

    public static function realProofStates(): array
    {
        return [['fresh_other_action'], ['expired'], ['used']];
    }

    #[DataProvider('realProofStates')]
    public function test_real_mfa_step_up_is_not_transferable_to_legal_approval(string $state): void
    {
        $admin = $this->fixtureAdmin('step-up-admin');
        $this->actingAs($admin, 'sanctum'); // Real password, enrollment and TOTP login fixture.
        $secret = \Illuminate\Support\Facades\Crypt::decryptString(DB::table('account_mfa')->where('user_id', $admin->id)->value('secret_ciphertext'));
        $this->travel(31)->seconds();
        $this->postJson('/api/mfa/step-up', ['password' => self::SYNTHETIC_PASSWORD,
            'otp' => app(\App\Services\Administration\Totp::class)->code($secret, now()->timestamp),
            'action' => 'mfa.recovery_codes', 'scope' => []])->assertOk();
        $authentication = app(\App\Contracts\AdministrativeAuthentication::class);
        $this->assertTrue($authentication->permitsMutation($admin, 'mfa.recovery_codes'));
        $proof = DB::table('authentication_challenges')->where('user_id', $admin->id)->where('purpose', 'step_up')->sole();
        if ($state === 'expired') $this->travel(6)->minutes();
        if ($state === 'used') DB::transaction(fn () => $authentication->consumeMutation($admin, 'mfa.recovery_codes'));
        $this->assertSame($state === 'fresh_other_action', $authentication->permitsMutation($admin, 'mfa.recovery_codes'));
        $this->assertFalse($authentication->permitsMutation($admin, 'document.approve_legal',
            ['case_file_id' => 1, 'document_id' => 1, 'version' => 1]));
        $this->postJson('/api/mfa/step-up', ['password' => self::SYNTHETIC_PASSWORD, 'otp' => '000000',
            'action' => 'document.approve_legal', 'scope' => []])->assertForbidden();
        $this->assertSame($state === 'used', DB::table('authentication_challenges')->where('id', $proof->id)->value('used_at') !== null);
    }
}
