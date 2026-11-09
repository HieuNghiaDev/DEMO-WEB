<?php

namespace Tests\Feature\C001;

use App\Contracts\C001AuthorityPolicy;
use App\Models\Permission;
use App\Models\SecurityAuditLog;
use App\Services\C001FinalApprovalWriter;
use App\Services\PendingC001AuthorityPolicy;
use App\Services\SecurityAuditLogger;
use Illuminate\Database\QueryException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Tests\Support\B21\B21TestCase;

class FinalApprovalWriterTest extends B21TestCase
{
    use \Tests\Support\C001\BuildsC001AuthorityFixtures;

    private function writerContext(): array
    {
        $context = $this->context();
        foreach (['source_workbook', 'pdf'] as $kind) $context['generated']->artifacts()->create([
            'artifact_type' => $kind, 'storage_provider' => 'google_drive', 'external_file_id' => 'synthetic-'.$kind,
            'external_url' => 'https://example.test/synthetic', 'filename' => 'synthetic.'.$kind,
            'mime_type' => $kind === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'uploaded_by' => $context['author']->id, 'uploaded_at' => now()->addSecond(),
        ]);
        $context['generated'] = $context['generated']->fresh();
        $context['policy']->caseChecks = 0; $context['policy']->transactionLevels = [];
        return $context;
    }

    private function attempt(array $c): void
    {
        app(C001FinalApprovalWriter::class)->approve($c['case'], $c['document'], $c['lawyer'], $c['generated']);
    }

    private function state(array $c): array
    {
        return [$c['generated']->fresh()->getAttributes(), $c['document']->fresh()->getAttributes(),
            DB::table('case_tasks')->get()->toArray(), DB::table('case_task_submissions')->get()->toArray(),
            DB::table('case_activities')->get()->toArray(), SecurityAuditLog::count()];
    }

    private function expectHttpDenial(array $c, int $status): void
    {
        $before = $this->state($c); $depth = DB::transactionLevel();
        try { $this->attempt($c); $this->fail('No final ALLOW is implemented.'); }
        catch (HttpResponseException $error) { $this->assertSame($status, $error->getResponse()->getStatusCode()); }
        catch (HttpExceptionInterface $error) { $this->assertSame($status, $error->getStatusCode()); }
        catch (ModelNotFoundException) { $this->assertSame(404, $status); }
        $this->assertEquals($before, $this->state($c));
        $this->assertSame($depth, DB::transactionLevel());
    }

    public function test_hypothetical_prerequisites_are_rechecked_in_transaction_but_d4_still_blocks(): void
    {
        $c = $this->writerContext(); $depth = DB::transactionLevel();
        $this->expectHttpDenial($c, 409);
        $this->assertGreaterThanOrEqual(6, $c['policy']->caseChecks, 'Both necessary-check passes ran; neither is final authorization.');
        foreach ($c['policy']->transactionLevels as $level) $this->assertGreaterThan($depth, $level);
        $this->assertSame(0, SecurityAuditLog::where('event', 'legal.c001_approved')->count());
        $this->assertSame(0, DB::table('authentication_challenges')->whereNotNull('used_at')->count());
    }

    public function test_default_pending_adapter_does_not_accept_hypothetical_registry_rows(): void
    {
        $c = $this->writerContext();
        $this->app->instance(C001AuthorityPolicy::class, new PendingC001AuthorityPolicy);
        $this->expectHttpDenial($c, 403);
    }

    public static function rejectedInputs(): array
    {
        return array_map(fn ($state) => [$state], ['revoked', 'expired', 'inactive', 'self_without_legal_proof', 'unknown_provenance',
            'wrong_version', 'newer_version', 'stale_content', 'already_approved', 'stale_artifact', 'wrong_case', 'wrong_document']);
    }

    #[DataProvider('rejectedInputs')]
    public function test_writer_rejects_invalid_or_stale_decisions_without_partial_mutation(string $state): void
    {
        $c = $this->writerContext();
        $status = in_array($state, ['newer_version', 'stale_content', 'already_approved', 'stale_artifact', 'self_without_legal_proof'], true) ? 409 : 403;
        if (in_array($state, ['wrong_case', 'wrong_document'], true)) $status = 404;
        switch ($state) {
            case 'revoked': $this->authorityActor($c['issuer'], fn()=>$c['service']->revokeDelegation($c['issuer'], $c['grant'])); break;
            case 'expired': $c['grant']->forceFill(['expires_at' => now()->subSecond()])->save(); break;
            case 'inactive': $c['lawyer']->employee->update(['status' => 'inactive']); break;
            case 'self_without_legal_proof': $c['policy']->ledgers[$c['generated']->id.':1'][] = $c['lawyer']->id; break;
            case 'unknown_provenance': $c['policy']->ledgers = []; break;
            case 'wrong_version': $c['grant']->forceFill(['version' => 2])->save(); break;
            case 'newer_version': $c['generated']->replicate()->forceFill(['version' => 2])->save(); break;
            case 'stale_content': $c['generated']->fresh()->update(['draft_data' => ['synthetic' => 'changed']]); break;
            case 'already_approved': $c['generated']->fresh()->update(['workflow_status' => 'approved', 'approved_data' => []]); break;
            case 'stale_artifact': $c['generated']->artifacts()->where('artifact_type', 'pdf')->update(['uploaded_at' => now()->subHour()]); break;
            case 'wrong_case': $c['case'] = $this->matter(); break;
            case 'wrong_document': $c['document'] = $this->document($c['case']); break;
        }
        $this->expectHttpDenial($c, $status);
    }

    public function test_snapshot_change_during_checks_is_detected_and_transaction_rolls_back(): void
    {
        $c = $this->writerContext();
        $c['policy']->onCaseCheck = function ($count) use ($c) {
            if ($count === 1) $c['generated']->fresh()->update(['draft_data' => ['synthetic' => 'interleaved']]);
        };
        try { $this->attempt($c); $this->fail('Stale snapshot must not reach the commit.'); }
        catch (HttpExceptionInterface $error) { $this->assertSame(409, $error->getStatusCode()); $this->assertStringContainsString('snapshot is stale', $error->getMessage()); }
        $this->assertSame([], $c['generated']->fresh()->draft_data);
        $this->assertDatabaseCount('case_activities', 0);
    }

    public function test_permission_revoked_during_checks_is_read_again_not_cached(): void
    {
        $c = $this->writerContext(); $c['lawyer']->load('roles.permissions');
        $before = $this->state($c);
        $c['policy']->onCaseCheck = function ($count) use ($c) {
            if ($count === 4) $c['lawyer']->roles()->sole()->permissions()->detach(Permission::where('name', 'document.approve_legal')->sole()->id);
        };
        $this->expectHttpDenial($c, 403);
        $this->assertEquals($before, $this->state($c));
    }

    public function test_double_submit_and_replay_of_blocked_decision_do_not_create_business_history(): void
    {
        $c = $this->writerContext();
        $this->expectHttpDenial($c, 409); $this->expectHttpDenial($c, 409);
        $this->assertDatabaseCount('case_activities', 0);
        $this->assertSame(0, SecurityAuditLog::where('event', 'legal.c001_approved')->count());
        // This is DENY replay only, not a successful-proof consumption/idempotency claim.
    }

    public function test_exact_linked_submission_cannot_finalize_while_d4_pending(): void
    {
        $c = $this->writerContext();
        $task = $c['case']->caseTasks()->create(['case_document_id' => $c['document']->id, 'title' => 'Synthetic task', 'status' => 'pending_review', 'priority' => 'normal']);
        $task->submissions()->create(['case_document_id' => $c['document']->id, 'case_generated_document_id' => $c['generated']->id,
            'version' => 1, 'source_type' => 'auto_generated', 'review_status' => 'pending_review', 'filename' => 'synthetic.pdf',
            'mime_type' => 'application/pdf', 'external_file_id' => 'synthetic', 'external_url' => 'https://example.test/synthetic',
            'submitted_by' => $c['author']->id, 'submitted_at' => now()]);
        $this->expectHttpDenial($c, 409);
        $this->assertSame('pending_review', $task->fresh()->status);
    }

    public function test_required_final_audit_primitive_rolls_back_staging_not_a_successful_writer_test(): void
    {
        $c = $this->writerContext(); $before = $this->state($c);
        DB::unprepared("CREATE TRIGGER fail_final_audit BEFORE INSERT ON security_audit_logs WHEN NEW.event = 'legal.c001_approved' BEGIN SELECT RAISE(ABORT, 'synthetic audit failure'); END");
        try {
            DB::transaction(function () use ($c) {
                // Non-legal staging mutation proves the shared transaction primitive, not an ALLOW.
                $c['document']->update(['title' => 'Synthetic staging']);
                app(SecurityAuditLogger::class)->recordLegalAuthority($c['lawyer'], 'legal.c001_approved',
                    ['case_file_id' => $c['case']->id, 'case_document_id' => $c['document']->id,
                        'case_generated_document_id' => $c['generated']->id, 'version' => 1]);
            });
            $this->fail('Required audit failure must propagate.');
        } catch (QueryException) { $this->assertEquals($before, $this->state($c)); }
        $this->expectHttpDenial($c, 409);
        $this->assertSame(0, SecurityAuditLog::where('event', 'legal.c001_approved')->count());
    }
}
