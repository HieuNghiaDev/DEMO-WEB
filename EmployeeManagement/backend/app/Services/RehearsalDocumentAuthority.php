<?php

namespace App\Services;

use App\Models\CaseDocument;
use App\Models\CaseTaskSubmission;
use App\Models\ReceivedDocument;
use App\Models\RehearsalDocumentReviewGrant;
use App\Models\RehearsalLawyerVerification;
use App\Models\SecurityAuditLog;
use App\Models\User;
use App\Services\Administration\AdminCapabilities;
use Illuminate\Support\Facades\DB;
use LogicException;

/** Explicit PHPUnit RAM binding only; never a production verification authority. */
final class RehearsalDocumentAuthority
{
    public function __construct()
    {
        (new CaseAccessService)->assertSandbox();
    }

    public static function current(): ?self
    {
        if (! app()->bound(self::class)) return null;
        (new CaseAccessService)->assertSandbox();
        if (! CaseAccessService::rehearsal()) throw new LogicException('Review rehearsal requires case membership rehearsal.');
        return app(self::class);
    }

    private function actor(User $user): ?User
    {
        (new CaseAccessService)->assertSandbox();
        if ($user->getConnectionName() !== null && $user->getConnectionName() !== config('database.default')) {
            throw new LogicException('Review authority refuses cross-connection identities.');
        }
        $fresh = $user->fresh();
        return $fresh && $fresh->is_active && ! $fresh->activation_required && ! $fresh->must_change_password
            && $fresh->employee_id !== null && $fresh->employee?->status === 'active' ? $fresh : null;
    }

    /** VERIFIED_SYNTHETIC is not an owner-approved production credential. */
    public function verification(User $user, ?int $attestationId = null): ?RehearsalLawyerVerification
    {
        $actor = $this->actor($user);
        if (! $actor) return null;
        return RehearsalLawyerVerification::where('user_id', $actor->id)->where('employee_id', $actor->employee_id)
            ->when($attestationId !== null, fn ($query) => $query->whereKey($attestationId))
            ->where('evidence_source', 'synthetic-b32')->whereNull('revoked_at')->where('verified_at', '<=', now())
            ->where('expires_at', '>', now())->get()->first(function ($record) use ($actor): bool {
                $verifier = User::find($record->verifier_user_id);
                $verifier = $verifier ? $this->actor($verifier) : null;
                return $verifier && $verifier->id !== $actor->id && $verifier->employee_id === $record->verifier_employee_id
                    && AdminCapabilities::explicit($verifier, 'employee.verify_lawyer')
                    && preg_match('/^[a-f0-9]{64}$/D', $record->evidence_digest) === 1;
            });
    }

    private function grant(User $actor, int $caseId, int $documentId, string $source, int $fileId, int $version, ?int $taskId, string $kind): ?RehearsalDocumentReviewGrant
    {
        $candidates = RehearsalDocumentReviewGrant::where('user_id', $actor->id)->where('employee_id', $actor->employee_id)
            ->where('case_file_id', $caseId)->where('case_document_id', $documentId)->where('case_task_id', $taskId)
            ->where('source', $source)->where('file_id', $fileId)->where('version', $version)->where('kind', $kind)
            ->whereNull('revoked_at')->where('expires_at', '>', now())->get();
        return $candidates->first(function ($grant) use ($actor, $caseId, $kind): bool {
            $verification = RehearsalLawyerVerification::find($grant->verification_id);
            $issuer = $verification ? User::find($verification->user_id) : null;
            $live = $issuer ? $this->verification($issuer, $verification->id) : null;
            return $live && $live->id === $verification->id && $issuer->id !== $actor->id
                && $grant->expires_at->lte($live->expires_at)
                && AdminCapabilities::explicit($issuer, 'document.review_internal')
                && ($kind !== 'final' || AdminCapabilities::explicit($issuer, 'document.approve_legal'))
                && CaseAccessService::rehearsal()->allows($issuer, $caseId, 'write')
                && preg_match('/^[a-f0-9]{64}$/D', $grant->evidence_digest) === 1;
        });
    }

    /** Exact immutable file assignment, not task.review or case assignment alone. */
    public function authorizeInternal(User $user, int $caseId, int $documentId, string $source, int $fileId): RehearsalDocumentReviewGrant
    {
        $actor = $this->actor($user);
        abort_unless($actor && AdminCapabilities::explicit($actor, 'document.review_internal')
            && AdminCapabilities::explicit($actor, 'task.review')
            && CaseAccessService::rehearsal()?->allows($actor, $caseId, 'write'), 403);
        $document = CaseDocument::whereKey($documentId)->where('case_file_id', $caseId)->firstOrFail();
        $file = match ($source) {
            'received' => ReceivedDocument::whereKey($fileId)->where('case_file_id', $caseId)
                ->whereHas('caseDocuments', fn ($q) => $q->whereKey($document->id))->firstOrFail(),
            'task_submission' => CaseTaskSubmission::whereKey($fileId)->where('case_document_id', $documentId)
                ->whereHas('task', fn ($q) => $q->where('case_file_id', $caseId)->where('case_document_id', $documentId))->firstOrFail(),
            default => abort(404),
        };
        abort_if($file instanceof CaseTaskSubmission && ($file->source_type !== 'manual_upload'
            || $file->case_generated_document_id !== null), 409, 'Legal authority policy is pending.');
        abort_if($file instanceof ReceivedDocument && CaseTaskSubmission::where('received_document_id', $file->id)
            ->where(fn ($query) => $query->where('source_type', 'auto_generated')->orWhereNotNull('case_generated_document_id'))->exists(),
            409, 'A received-file alias cannot bypass legal authority.');
        $grant = $this->grant($actor, $caseId, $documentId, $source, $file->id, $file->version,
            $file instanceof CaseTaskSubmission ? $file->case_task_id : null, 'internal');
        abort_unless($grant, 403, 'An exact internal review assignment is required.');
        return $grant;
    }

    /** Diagnostic blocker, NOT an authorization decision and never returns ALLOW. */
    public function finalBlocker(User $user, int $caseId, int $documentId, int $generatedId): string
    {
        $actor = $this->actor($user);
        if (! $actor || ! AdminCapabilities::explicit($actor, 'document.approve_legal')) return 'explicit_permission_required';
        if (! CaseAccessService::rehearsal()?->allows($actor, $caseId, 'write')) return 'case_scope_required';
        $document = CaseDocument::whereKey($documentId)->where('case_file_id', $caseId)->first();
        $generated = $document?->generatedDocuments()->whereKey($generatedId)->first();
        if (! $generated) return 'nested_identity_mismatch';
        if (! $this->verification($actor)) return 'lawyer_unverified';
        if (! $this->grant($actor, $caseId, $documentId, 'generated', $generated->id, $generated->version, null, 'final')) return 'legal_delegation_required';
        if ($generated->created_by === $actor->id || $generated->updated_by === $actor->id
            || $generated->taskSubmissions()->where('submitted_by', $actor->id)->exists()) return 'conflict_policy_pending';
        if ($generated->workflow_status !== 'review' || $generated->approved_at !== null || $generated->approved_data !== null
            || $document->generatedDocuments()->max('version') !== $generated->version) return 'workflow_state_invalid';
        // Legal actions are intentionally absent from the production step-up action catalog.
        // Do not mint, accept or consume another action's proof until owner approves this contract.
        return 'owner_verifier_legal_scope_and_step_up_policy_pending';
    }

    public function blockFinalApproval(): never
    {
        (new CaseAccessService)->assertSandbox();
        abort(409, 'Independent verification, legal delegation and final-approval policy require owner approval.');
    }

    public function admitVerification(): never
    {
        (new CaseAccessService)->assertSandbox();
        abort(409, 'Owner-approved verification source and independent admission authority are required.');
    }

    public function revokeReviewGrant(User $actor, int $id): void
    {
        $actor = $this->actor($actor);
        abort_unless($actor && AdminCapabilities::explicit($actor, 'document.review_internal'), 403);
        DB::transaction(function () use ($actor, $id): void {
            $grant = RehearsalDocumentReviewGrant::whereKey($id)->lockForUpdate()->firstOrFail();
            $verification = RehearsalLawyerVerification::findOrFail($grant->verification_id);
            abort_unless($verification->user_id === $actor->id && $verification->employee_id === $actor->employee_id
                && $grant->user_id !== $actor->id && CaseAccessService::rehearsal()?->allows($actor, $grant->case_file_id, 'write'), 403);
            if ($grant->revoked_at) return;
            $grant->forceFill(['revoked_at' => now()])->save();
            $this->audit($actor, 'document.review_grant_revoked', ['grant_id' => $grant->id, 'case_file_id' => $grant->case_file_id]);
        });
    }

    /** Revocation only; no admission/grant/self-verification writer is exposed. */
    public function revokeVerification(User $actor, int $id): void
    {
        $actor = $this->actor($actor);
        abort_unless($actor && AdminCapabilities::explicit($actor, 'employee.verify_lawyer'), 403);
        DB::transaction(function () use ($actor, $id): void {
            $record = RehearsalLawyerVerification::whereKey($id)->lockForUpdate()->firstOrFail();
            abort_unless($record->verifier_user_id === $actor->id && $record->verifier_employee_id === $actor->employee_id
                && $record->user_id !== $actor->id, 403);
            if ($record->revoked_at) return;
            $record->forceFill(['revoked_at' => now()])->save();
            $this->audit($actor, 'lawyer.verification_revoked', ['verification_id' => $record->id]);
        });
    }

    public function recordInternal(User $actor, RehearsalDocumentReviewGrant $grant, bool $confirmed): void
    {
        $this->authorizeInternal($actor, $grant->case_file_id, $grant->case_document_id, $grant->source, $grant->file_id);
        $this->audit($actor, $confirmed ? 'document.internal_confirmed' : 'document.internal_returned',
            ['grant_id' => $grant->id, 'case_file_id' => $grant->case_file_id, 'document_id' => $grant->case_document_id,
                'file_id' => $grant->file_id, 'version' => $grant->version]);
    }

    public function canInternal(User $actor, int $caseId, int $documentId, string $source, int $fileId): bool
    {
        try {
            $this->authorizeInternal($actor, $caseId, $documentId, $source, $fileId);
            return true;
        } catch (\Symfony\Component\HttpKernel\Exception\HttpExceptionInterface|\Illuminate\Database\Eloquent\ModelNotFoundException) {
            return false;
        }
    }

    private function audit(User $actor, string $event, array $ids): void
    {
        (new CaseAccessService)->assertSandbox();
        if (DB::transactionLevel() < 1) throw new LogicException('Review audit requires the mutation transaction.');
        SecurityAuditLog::create(['event' => $event, 'outcome' => 'success', 'user_id' => $actor->id,
            'employee_id' => $actor->employee_id, 'request_method' => 'CLI', 'request_path' => 'document-authority-rehearsal',
            'metadata' => ['actor_user_id' => $actor->id, ...$ids]]);
    }
}
