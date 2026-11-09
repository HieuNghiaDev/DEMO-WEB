<?php

namespace Tests\Feature\C001;

use App\Models\Permission;
use App\Models\Role;
use App\Services\C001DocumentWorkflowService;
use App\Services\C001FinalApprovalWriter;
use App\Services\LegalFinalizationGate;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Tests\Support\B21\B21TestCase;

class FinalApprovalReadinessTest extends B21TestCase
{
    use \Tests\Support\C001\BuildsC001AuthorityFixtures;

    private function preparedContext(): array
    {
        $context = $this->context();
        foreach (['source_workbook', 'pdf'] as $kind) {
            $context['generated']->artifacts()->create(['artifact_type' => $kind,
                'storage_provider' => 'google_drive', 'external_file_id' => 'synthetic-readiness-'.$kind,
                'external_url' => 'https://example.test/synthetic-readiness',
                'filename' => 'synthetic-readiness.'.$kind,
                'mime_type' => $kind === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'checksum' => hash('sha256', 'synthetic-readiness-'.$kind),
                'uploaded_by' => $context['author']->id, 'uploaded_at' => now()->addSecond()]);
        }
        return $context;
    }

    private function state(): array
    {
        $state = [];
        foreach (['case_generated_documents', 'generated_document_artifacts', 'case_documents',
            'case_tasks', 'case_task_submissions', 'case_activities', 'security_audit_logs',
            'lawyer_verifications', 'legal_delegations', 'authentication_challenges', 'employee_notifications'] as $table) {
            $state[$table] = DB::table($table)->orderBy('id')->get()->toJson();
        }
        return $state;
    }

    private function deniedWithoutWrites(callable $operation, int $status): void
    {
        $before = $this->state();
        try {
            $operation();
            $this->fail('No finalization ALLOW is approved in this readiness task.');
        } catch (HttpResponseException $error) {
            $this->assertSame($status, $error->getResponse()->getStatusCode());
        } catch (HttpExceptionInterface $error) {
            $this->assertSame($status, $error->getStatusCode());
        }
        $this->assertSame($before, $this->state());
        Http::assertNothingSent();
    }

    public static function selfApprovalPaths(): array
    {
        return array_map(fn ($path) => [$path], ['creator', 'editor', 'past_editor', 'admin_alias',
            'level_5', 'approval.approve', 'document.update']);
    }

    #[DataProvider('selfApprovalPaths')]
    public function test_self_contributor_still_cannot_use_legacy_writer_without_legal_totp_contract(string $path): void
    {
        $c = $this->preparedContext();
        if ($path === 'past_editor') {
            $c['policy']->ledgers[$c['generated']->id.':1'][] = $c['lawyer']->id;
        } else {
            $c['generated']->update([$path === 'editor' ? 'updated_by' : 'created_by' => $c['lawyer']->id]);
        }
        if ($path === 'admin_alias') $c['lawyer']->update(['role' => 'admin']);
        if ($path === 'level_5') {
            DB::table('user_roles')->insert(['user_id' => $c['lawyer']->id,
                'role_id' => Role::where('name', 'level_5')->sole()->id]);
        }
        if (in_array($path, ['approval.approve', 'document.update'], true)) {
            $c['lawyer']->roles()->sole()->permissions()->syncWithoutDetaching([Permission::where('name', $path)->sole()->id]);
        }
        $c['generated'] = $c['generated']->fresh();
        // C001.3B changes eligibility, never opens the legacy HTTP/gate path.
        $c['policy']->ledgers[$c['generated']->id.':1'] = array_values(array_unique([$c['author']->id, $c['lawyer']->id]));
        $this->assertSame('legal_step_up_and_final_writer_policy_pending', $c['service']->finalBlocker($c['lawyer'], $c['case'], $c['document'], $c['generated']));
        // A cached necessary-check result, or another request, is never final authorization.
        $c['lawyer']->load('roles.permissions');
        for ($attempt = 0; $attempt < 2; $attempt++) {
            $this->deniedWithoutWrites(fn () => app(C001FinalApprovalWriter::class)
                ->approve($c['case'], $c['document'], $c['lawyer'], $c['generated']), 409);
        }
    }

    public static function missingPrerequisites(): array
    {
        return [['verification'], ['delegation']];
    }

    #[DataProvider('missingPrerequisites')]
    public function test_one_authority_prerequisite_cannot_replace_the_other(string $missing): void
    {
        $c = $this->preparedContext();
        if ($missing === 'delegation') {
            $c['grant']->delete();
            $this->assertNotNull($c['service']->verification($c['lawyer']));
        } else {
            $c['service']->revokeVerification($c['verifier'], $c['verification']);
            $this->assertDatabaseHas('legal_delegations', ['id' => $c['grant']->id, 'revoked_at' => null]);
        }
        $this->assertSame($missing === 'verification' ? 'independent_verification_required' : 'exact_legal_delegation_required',
            $c['service']->finalBlocker($c['lawyer'], $c['case'], $c['document'], $c['generated']));
        $this->deniedWithoutWrites(fn () => app(C001FinalApprovalWriter::class)
            ->approve($c['case'], $c['document'], $c['lawyer'], $c['generated']), 403);
    }

    #[DataProvider('missingPrerequisites')]
    public function test_cached_preconditions_do_not_survive_revocation(string $revoked): void
    {
        $c = $this->preparedContext();
        $c['lawyer']->load('roles.permissions');
        $this->assertSame('legal_step_up_and_final_writer_policy_pending',
            $c['service']->finalBlocker($c['lawyer'], $c['case'], $c['document'], $c['generated']));
        if ($revoked === 'verification') $c['service']->revokeVerification($c['verifier'], $c['verification']);
        else $this->authorityActor($c['issuer'], fn()=>$c['service']->revokeDelegation($c['issuer'], $c['grant']));
        $this->deniedWithoutWrites(fn () => app(C001FinalApprovalWriter::class)
            ->approve($c['case'], $c['document'], $c['lawyer'], $c['generated']), 403);
    }

    public static function unapprovedLegalActions(): array
    {
        return [['document.approve_legal'], ['legal.c001_approved'], ['approve_c001']];
    }

    #[DataProvider('unapprovedLegalActions')]
    public function test_mfa_endpoint_cannot_mint_unapproved_legal_action_proof(string $action): void
    {
        $reader = $this->fixtureEmployee('readiness-step-up');
        $before = DB::table('authentication_challenges')->count();
        $this->actingAs($reader)->postJson('/api/mfa/step-up', ['action' => $action,
            'scope' => [], 'password' => 'synthetic-not-real', 'otp' => '000000'])->assertForbidden();
        $this->assertSame($before, DB::table('authentication_challenges')->count());
        $this->assertTrue(LegalFinalizationGate::policyPending());
        Http::assertNothingSent();
    }

    public function test_workflow_service_does_not_turn_self_approval_or_retry_into_success(): void
    {
        $c = $this->preparedContext();
        $c['generated']->update(['created_by' => $c['lawyer']->id]);
        for ($attempt = 0; $attempt < 2; $attempt++) {
            $this->deniedWithoutWrites(fn () => app(C001DocumentWorkflowService::class)
                ->approve($c['case'], $c['document'], $c['lawyer'], $c['generated']->fresh()), 409);
        }
        // DENIED retries only: successful proof consumption/provider recovery are BLOCKED.
    }
}
