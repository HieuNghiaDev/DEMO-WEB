<?php

namespace App\Services;

use App\Contracts\C001AuthorityPolicy;
use App\Models\CaseGeneratedDocument;
use App\Models\User;
use App\Services\Administration\VerifiedMfaSessions;
use Illuminate\Support\Facades\DB;

/** Server-resolved, non-PII decision commitments. No client-provided authority/hash is accepted. */
final class C001DecisionContext
{
    public const ACTION = 'legal.c001.final_approve';
    public const TTL_SECONDS = 300;

    public function __construct(private C001LegalAuthority $authority, private VerifiedMfaSessions $sessions) {}

    public function session(User $actor): \Laravel\Sanctum\PersonalAccessToken
    {
        $sessionActor = request()->user();
        $token = $sessionActor instanceof User && $sessionActor->id === $actor->id
            ? $this->sessions->token($actor, $sessionActor->currentAccessToken()) : null;
        abort_unless($token && $actor->fresh()?->employee?->status === 'active', 403, 'A verified MFA session is required.');
        return $token;
    }

    public function prepare(User $actor, int $generatedId, string $requestKey): array
    {
        $context = $this->resolve($actor, $generatedId, $requestKey, bin2hex(random_bytes(32)));
        // Only here, before the MFA/decision transaction. Never download during the legal commit.
        $this->verifyArtifactBytes($context);
        return $context;
    }

    public function resolve(User $actor, int $generatedId, string $requestKey, string $nonce): array
    {
        abort_unless(preg_match('/^[a-zA-Z0-9_-]{16,80}$/D', $requestKey) === 1
            && preg_match('/^[a-f0-9]{64}$/D', $nonce) === 1, 422);
        $actor = $actor->fresh();
        abort_unless($actor && \App\Services\Administration\AdminCapabilities::explicit($actor, 'document.approve_legal'), 403);
        $token = $this->session($actor);
        $generated = CaseGeneratedDocument::with('caseDocument.caseFile', 'template')
            ->whereHas('caseDocument.caseFile', fn ($query) => CaseAccessService::contentScope($query, $actor))
            ->findOrFail($generatedId);
        $document = $generated->caseDocument; $case = $document->caseFile;
        abort_unless($this->authority->finalBlocker($actor, $case, $document, $generated)
            === 'legal_step_up_and_final_writer_policy_pending', 403, 'C001 authority is unavailable.');
        $ledger = C001VersionProvenance::ledger($generated);
        $attributed = [$generated->created_by, $generated->updated_by, ...$generated->taskSubmissions()->pluck('submitted_by')->all()];
        $self = in_array($actor->id, $ledger['actors'], true) || in_array($actor->employee_id, $ledger['employees'], true)
            || in_array($actor->id, array_map('intval', $attributed), true);
        abort_unless($document->documentType?->code === 'C-001'
            && (! $self || C001LegalAuthority::ALLOW_VERIFIED_LAWYER_C001_SELF_FINAL_APPROVAL), 403);
        $authorityContext = $this->authority->decisionAuthority($actor, $generated);
        return ['action' => self::ACTION, 'actor_user_id' => $actor->id, 'actor_employee_id' => $actor->employee_id,
            'token_id' => $token->id, 'identity_hash' => VerifiedMfaSessions::identityHash($actor), 'mfa_version' => $token->mfa_version,
            'case_file_id' => $case->id, 'case_document_id' => $document->id, 'case_generated_document_id' => $generated->id,
            'version' => $generated->version, ...$this->contentCommitments($generated), 'provenance_head' => $ledger['head'],
            // Server provenance determines this classification; it is bound to the one-use proof and receipt.
            ...$authorityContext, 'self_approval' => $self,
            'step_up_required' => true, 'step_up_method' => 'TOTP',
            'decision_mode' => $self ? 'SELF_FINAL_APPROVAL_WITH_STEP_UP' : 'FINAL_APPROVAL_WITH_STEP_UP',
            'request_key' => $requestKey, 'nonce' => $nonce,
            'state_before' => ['workflow_status' => $generated->workflow_status, 'collection_status' => $document->collection_status,
                'review_status' => $document->review_status, 'fulfillment_status' => $document->fulfillment_status]];
    }

    public function contentCommitments(CaseGeneratedDocument $generated): array
    {
        $generated->loadMissing('template');
        $artifacts = [];
        foreach (['source_workbook', 'pdf'] as $kind) {
            $files = $generated->artifacts()->where('artifact_type', $kind)->where('storage_provider', 'google_drive')->get();
            abort_unless($files->count() === 1, 409, 'Exact prepared artifacts are required.');
            $file = $files->sole();
            abort_unless(is_string($file->checksum) && preg_match('/^[a-f0-9]{64}$/D', $file->checksum)
                && is_string($file->external_file_id) && trim($file->external_file_id) !== '', 409, 'Prepared artifact checksum is required.');
            $artifacts[$kind] = ['id' => $file->id, 'external_file_id' => $file->external_file_id, 'sha256' => $file->checksum];
        }
        return ['snapshot_hash' => C001VersionProvenance::digest(['draft' => $generated->draft_data,
            'fee' => $generated->success_fee_percentage, 'creator' => $generated->created_by, 'editor' => $generated->updated_by]),
            'template_hash' => C001VersionProvenance::digest($generated->template->only([
                'id', 'document_type_id', 'version', 'renderer_type', 'format', 'template_body', 'field_schema'])),
            'artifacts' => $artifacts];
    }

    public function verifyArtifactBytes(array $context): void
    {
        foreach ($context['artifacts'] as $artifact) {
            $bytes = app(GoogleDriveService::class)->downloadFileContent($artifact['external_file_id']);
            abort_unless(hash_equals($artifact['sha256'], hash('sha256', $bytes)), 409, 'Prepared artifact content changed.');
        }
    }

    public function persistProof(User $actor, string $rawChallenge, array $context): int
    {
        abort_unless(DB::transactionLevel() > 0, 409);
        $current = $this->resolve($actor, $context['case_generated_document_id'], $context['request_key'], $context['nonce']);
        $hash = C001VersionProvenance::digest($context);
        abort_unless(hash_equals($hash, C001VersionProvenance::digest($current)), 409, 'Decision context changed during step-up.');
        $challenge = DB::table('authentication_challenges')->where('secret_hash', hash('sha256', $rawChallenge))->firstOrFail();
        return DB::table('c001_legal_proofs')->insertGetId(['challenge_id' => $challenge->id,
            'request_key' => $context['request_key'], 'context_hash' => $hash, 'context' => json_encode($context, JSON_THROW_ON_ERROR),
            'issued_at' => $challenge->created_at, 'expires_at' => $challenge->expires_at]);
    }

    public function receiptReadAllowed(User $actor, array $context, CaseGeneratedDocument $generated): void
    {
        $fresh = $actor->fresh(); $token = $this->session($actor);
        abort_unless($fresh && $fresh->id === $context['actor_user_id'] && $fresh->employee_id === $context['actor_employee_id']
            && $token->id === $context['token_id'] && $token->mfa_version === $context['mfa_version']
            && hash_equals(VerifiedMfaSessions::identityHash($fresh), $context['identity_hash'])
            && \App\Services\Administration\AdminCapabilities::explicit($fresh, 'document.approve_legal')
            && app(C001AuthorityPolicy::class)->caseWriteAllowed($fresh, $generated->caseDocument->caseFile), 403);
        foreach ($this->contentCommitments($generated) as $key => $value) {
            abort_unless(C001VersionProvenance::digest($value) === C001VersionProvenance::digest($context[$key]), 409, 'Approved content changed.');
        }
    }
}
