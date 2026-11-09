<?php

namespace App\Services;

use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\CaseGeneratedDocument;
use App\Models\CaseTask;
use App\Models\CaseTaskSubmission;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use LogicException;

/** Historical proof-bound workflow retained for isolated verification of its audit records. */
final class C001FinalApprovalWriter
{
    public function __construct(private C001LegalAuthority $authority, private SecurityAuditLogger $audit) {}

    /**
     * PHPUnit/CLI RAM or the marked disposable engine capability is mandatory.
     */
    public function approveDecision(CaseFile $case, CaseDocument $document, User $actor, CaseGeneratedDocument $observed,
        string $requestKey, int $proofId): \App\Models\C001LegalDecision
    {
        if (app()->bound(C001EngineValidationScope::class)) {
            app(C001EngineValidationScope::class)->assertAllowed();
        } else {
            \App\Services\Administration\LocalAdministrationSandbox::requireMemoryDatabase();
        }
        if (! defined('PHPUNIT_COMPOSER_INSTALL') || PHP_SAPI !== 'cli') throw new LogicException('C001 positive execution is synthetic-only.');
        foreach ([$case, $document, $actor, $observed] as $model) $this->primary($model);
        $contexts = app(C001DecisionContext::class);
        $proof = DB::table('c001_legal_proofs')->where('id', $proofId)->first();
        abort_unless($proof, 403, 'Exact legal proof is required.');
        $context = json_decode($proof->context, true, flags: JSON_THROW_ON_ERROR);
        abort_unless($requestKey === $proof->request_key && $case->id === $context['case_file_id']
            && $document->id === $context['case_document_id'] && $observed->id === $context['case_generated_document_id']
            && $observed->version === $context['version'], 409, 'Decision request context mismatch.');
        $contexts->session($actor);
        $existing = \App\Models\C001LegalDecision::where('request_key', $requestKey)->first();
        if ($existing) return $this->existingDecision($existing, $actor, $observed, $proof->context_hash, $contexts);
        abort_if($observed->fresh()->workflow_status === 'approved', 409, 'This version is already finalized.');
        // Independent provider checks are outside the legal transaction; commit rechecks stored commitments.
        $freshContext = $contexts->resolve($actor, $observed->id, $requestKey, $context['nonce']);
        abort_unless(hash_equals($proof->context_hash, C001VersionProvenance::digest($freshContext)), 409, 'Decision context changed.');
        $contexts->verifyArtifactBytes($freshContext);

        return DB::transaction(function () use ($case, $document, $actor, $observed, $requestKey, $proofId, $contexts) {
            $case = CaseFile::whereKey($case->id)->lockForUpdate()->firstOrFail();
            $document = $case->documents()->whereKey($document->id)->lockForUpdate()->firstOrFail();
            $generated = $document->generatedDocuments()->whereKey($observed->id)->lockForUpdate()->firstOrFail();
            $generated->artifacts()->orderBy('id')->lockForUpdate()->get();
            $generated->taskSubmissions()->orderBy('id')->lockForUpdate()->get();
            $proof = DB::table('c001_legal_proofs')->where('id', $proofId)->firstOrFail();
            $context = json_decode($proof->context, true, flags: JSON_THROW_ON_ERROR);
            $existing = \App\Models\C001LegalDecision::where('request_key', $requestKey)->first();
            if ($existing) return $this->existingDecision($existing, $actor, $generated, $proof->context_hash, $contexts);
            abort_if($generated->workflow_status === 'approved', 409, 'This version is already finalized.');
            $current = $contexts->resolve($actor, $generated->id, $requestKey, $context['nonce']);
            abort_unless(hash_equals($proof->context_hash, C001VersionProvenance::digest($current)), 409, 'Decision context changed.');
            [$task, $submission] = $this->linkedContext($case, $document, $generated);
            if ($submission) {
                abort_unless($submission->external_file_id === $current['artifacts']['pdf']['external_file_id']
                    && is_string($submission->checksum) && hash_equals($current['artifacts']['pdf']['sha256'], $submission->checksum),
                    409, 'Submission must reference the exact prepared PDF.');
            }
            $actor = User::whereKey($actor->id)->lockForUpdate()->firstOrFail();
            $token = $contexts->session($actor);
            $scope = ['decision_context_hash' => $proof->context_hash];
            $challenge = app(\App\Services\Administration\VerifiedMfaSessions::class)->proof($actor, $token, C001DecisionContext::ACTION, $scope);
            abort_unless($challenge && (int) $challenge->id === (int) $proof->challenge_id
                && $challenge->created_at === $proof->issued_at && $challenge->expires_at === $proof->expires_at
                && \Carbon\CarbonImmutable::parse($proof->issued_at)->lte(now())
                && \Carbon\CarbonImmutable::parse($proof->expires_at)->lte(\Carbon\CarbonImmutable::parse($proof->issued_at)->addSeconds(300)), 403,
                'A fresh one-use legal action proof is required.');
            app(\App\Contracts\AdministrativeAuthentication::class)->consumeMutation($actor, C001DecisionContext::ACTION, $scope);
            $at = now();
            $changed = CaseGeneratedDocument::whereKey($generated->id)->where('version', $context['version'])
                ->where('workflow_status', 'review')->whereNull('approved_at')->whereNull('approved_data')
                ->update(['workflow_status' => 'approved', 'updated_at' => $at]);
            abort_unless($changed === 1, 409, 'Decision is stale or already finalized.');
            // Do not replace the last contributor with the legal approver.
            $generated->update(['workflow_status' => 'approved', 'approved_data' => $generated->draft_data,
                'approved_by' => $actor->id, 'approved_at' => $at]);
            $document->update(['collection_status' => 'received', 'fulfillment_status' => 'satisfied', 'review_status' => 'reviewed']);
            if ($submission) {
                $submission->update(['review_status' => 'approved', 'reviewed_by' => $actor->id, 'reviewed_at' => $at]);
                $task->update(['status' => 'completed', 'completed_at' => $at]);
            }
            $receipt = \App\Models\C001LegalDecision::forceCreate(['request_key' => $requestKey, 'decision_type' => 'final_approve',
                'actor_user_id' => $actor->id, 'actor_employee_id' => $actor->employee_id, 'case_file_id' => $case->id,
                'case_document_id' => $document->id, 'case_generated_document_id' => $generated->id, 'version' => $generated->version,
                'proof_id' => $proof->id, 'context_hash' => $proof->context_hash, 'context' => $context, 'decided_at' => $at]);
            $ids = ['case_file_id' => $case->id, 'case_document_id' => $document->id,
                'case_generated_document_id' => $generated->id, 'version' => $generated->version,
                ...array_intersect_key($context, array_flip(['issuer_admission_id', 'issuer_user_id', 'issuer_employee_id',
                    'verification_id', 'delegation_id'])), 'decision_id' => $receipt->id];
            $decisionMetadata = array_intersect_key($context, array_flip([
                'approval_policy', 'self_approval', 'step_up_required', 'step_up_method', 'decision_mode']));
            $this->audit->recordLegalAuthority($actor, 'legal.c001_approved', $ids, $decisionMetadata);
            $case->activities()->create(['created_by_employee_id' => $actor->employee_id, 'activity_type' => 'note',
                'channel' => 'internal', 'title' => 'C-001を承認して完了', 'occurred_at' => $at,
                'metadata' => [...$ids, ...$decisionMetadata, 'event' => 'c001.approved', 'history_kind' => 'system', 'actor_user_id' => $actor->id]]);
            return $receipt;
        });
    }

    private function existingDecision(\App\Models\C001LegalDecision $receipt, User $actor, CaseGeneratedDocument $generated,
        string $hash, C001DecisionContext $contexts): \App\Models\C001LegalDecision
    {
        abort_unless(hash_equals($receipt->context_hash, $hash) && $receipt->case_generated_document_id === $generated->id, 409,
            'Idempotency key already belongs to a different decision context.');
        $contexts->receiptReadAllowed($actor, $receipt->context, $generated->fresh());
        return $receipt;
    }

    public function approve(CaseFile $case, CaseDocument $document, User $actor, CaseGeneratedDocument $observed): CaseGeneratedDocument
    {
        foreach ([$case, $document, $actor, $observed] as $model) $this->primary($model);
        abort_unless($observed->exists && $observed->getKey() && $observed->getRawOriginal('version'), 409);
        $expected = $this->snapshot($observed);

        // Legacy entry point has no proof-bound request contract. Never infer a final decision from latest.
        return DB::transaction(function () use ($case, $document, $actor, $observed, $expected) {
            // Match the shared parent fence used by existing task/document writers.
            $case = CaseFile::whereKey($case->id)->lockForUpdate()->firstOrFail();
            $currentActor = User::whereKey($actor->id)->lockForUpdate()->firstOrFail();
            abort_unless($currentActor->employee_id !== null && (int) $currentActor->employee_id === (int) $actor->employee_id, 403);
            $actor = $currentActor;
            $document = $case->documents()->whereKey($document->id)->lockForUpdate()->firstOrFail();
            $generated = $document->generatedDocuments()->whereKey($observed->id)->lockForUpdate()->firstOrFail();
            abort_unless($document->documentType?->code === 'C-001', 404);
            $this->assertCurrent($document, $generated, $expected);
            [$task, $submission] = $this->linkedContext($case, $document, $generated);
            $artifacts = $generated->artifacts()->whereIn('artifact_type', [C001DocumentWorkflowService::ARTIFACT_TYPE,
                C001DocumentWorkflowService::PDF_ARTIFACT_TYPE])->lockForUpdate()->get();
            foreach ([C001DocumentWorkflowService::ARTIFACT_TYPE, C001DocumentWorkflowService::PDF_ARTIFACT_TYPE] as $kind) {
                $files = $artifacts->where('artifact_type', $kind)->where('storage_provider', 'google_drive');
                abort_unless($files->count() === 1 && $files->first()->uploaded_at
                    && $files->first()->uploaded_at->gte($generated->updated_at), 409, 'The saved C001 artifacts are stale.');
            }

            // Diagnostic preconditions only, NOT an authorization token. Repeat at the write boundary.
            $this->assertPrerequisites($actor, $case, $document, $generated);
            $generated = $generated->fresh();
            $this->assertCurrent($document, $generated, $expected);
            $this->assertPrerequisites($actor, $case, $document, $generated);
            $generated = $generated->fresh();
            $this->assertCurrent($document, $generated, $expected);
            [$task, $submission] = $this->linkedContext($case, $document, $generated);

            // Real activation is still pending. C001.2 proof-bound execution is synthetic-only.
            // Never borrow an administrative proof or replace the real gate with a test adapter.
            LegalFinalizationGate::enforce($actor);

            abort(409, 'The approved proof-bound request contract is required; legacy finalization stays disabled.');
        });
    }

    private function primary(Model $model): void
    {
        if ($model->getConnectionName() !== null && $model->getConnectionName() !== config('database.default')) {
            throw new LogicException('C001 finalization requires the primary connection.');
        }
    }

    /** Optimistic storage comparison only; deliberately NOT a new MFA signature/digest contract. */
    private function snapshot(CaseGeneratedDocument $document): array
    {
        $result = [];
        foreach (['id', 'case_document_id', 'document_generation_template_id', 'version', 'workflow_status', 'draft_data',
            'approved_data', 'approved_by', 'approved_at', 'success_fee_percentage', 'created_by', 'updated_by', 'created_at', 'updated_at'] as $field) {
            $value = $document->getRawOriginal($field);
            $result[$field] = $value instanceof \DateTimeInterface ? $value->format($document->getDateFormat()) : $value;
        }
        return $result;
    }

    private function assertCurrent(CaseDocument $document, CaseGeneratedDocument $generated, array $expected): void
    {
        abort_unless($this->snapshot($generated) === $expected && $generated->workflow_status === 'review'
            && is_array($generated->draft_data) && $generated->approved_at === null && $generated->approved_data === null
            && (int) $document->generatedDocuments()->max('version') === $generated->version, 409, 'The C001 snapshot is stale.');
    }

    private function assertPrerequisites(User $actor, CaseFile $case, CaseDocument $document, CaseGeneratedDocument $generated): void
    {
        // A diagnostic match is only a necessary condition. The default gate still denies even a match.
        abort_unless($this->authority->finalBlocker($actor, $case, $document, $generated)
            === 'legal_step_up_and_final_writer_policy_pending', 403, 'C001 legal authority is unavailable.');
    }

    private function linkedContext(CaseFile $case, CaseDocument $document, CaseGeneratedDocument $generated): array
    {
        $submissions = $generated->taskSubmissions()->lockForUpdate()->get();
        if ($submissions->isEmpty()) return [null, null];
        // Ambiguous/mixed aliases must not be guessed or auto-completed.
        abort_unless($submissions->count() === 1, 409, 'An exact C001 submission is required.');
        $submission = $submissions->sole();
        $task = CaseTask::whereKey($submission->case_task_id)->where('case_file_id', $case->id)
            ->where('case_document_id', $document->id)->lockForUpdate()->firstOrFail();
        $latest = CaseTaskSubmission::where('case_task_id', $task->id)->orderByDesc('version')->lockForUpdate()->firstOrFail();
        abort_unless((int) $submission->case_document_id === $document->id && (int) $submission->version === $generated->version
            && $submission->source_type === 'auto_generated'
            && $submission->review_status === 'pending_review' && $task->status === 'pending_review'
            && $latest->id === $submission->id && $submission->received_document_id === null, 409);
        return [$task, $submission];
    }
}
