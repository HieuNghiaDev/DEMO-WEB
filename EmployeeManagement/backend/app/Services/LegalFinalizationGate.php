<?php

namespace App\Services;

use App\Models\ApprovalRequest;
use App\Models\CaseDocument;
use App\Models\User;
use App\Services\Administration\AdminCapabilities;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\Exceptions\HttpResponseException;

/** Finalization of generated legal documents uses the same rule for every document type. */
final class LegalFinalizationGate
{
    public static function policyPending(): bool
    {
        // Owner approved fail-closed default local. No flag/container binding may restore legacy approval.
        return true;
    }

    public static function enforce(?User $actor): never
    {
        if (! $actor || ! AdminCapabilities::explicit($actor, 'document.approve_legal')) {
            throw new AuthorizationException('Internal review does not grant final legal authority.');
        }
        throw new HttpResponseException(response()->json([
            'code' => 'legal_authority_policy_pending',
            'message' => 'Independent lawyer verification and legal approval policy are required.',
        ], 409));
    }

    /** General approvals cannot masquerade as approval of generated legal content. */
    public static function enforceApproval(ApprovalRequest $approval, User $actor): void
    {
        if (self::blocksApproval($approval)) self::enforce($actor);
    }

    public static function blocksApproval(ApprovalRequest $approval, ?array $generatedDocumentIds = null): bool
    {
        // Retired action identifiers still describe legal finalization in historical records.
        $legalActions = ['approve_c001', 'approve_legal', 'final_legal_approval', 'approve_generated_document'];
        return in_array($approval->action_type, $legalActions, true) || in_array($approval->tool_name, $legalActions, true)
            || self::generatedReference($approval->payload ?? [], $generatedDocumentIds);
    }

    /** Batch target classification for presentation only; mutations always recheck fresh. */
    public static function pendingApprovalIds(iterable $approvals): array
    {
        $approvals = collect($approvals);
        $documentIds = [];
        $collectIds = function (mixed $payload) use (&$collectIds, &$documentIds): void {
            if (! is_array($payload)) return;
            foreach ($payload as $key => $value) {
                if ($key === 'case_document_id' && (is_int($value) || is_string($value))
                    && preg_match('/^[1-9][0-9]*$/D', (string) $value) === 1) $documentIds[] = (int) $value;
                elseif (is_array($value)) $collectIds($value);
            }
        };
        foreach ($approvals as $approval) $collectIds($approval->payload);
        $generatedIds = $documentIds === [] ? [] : CaseDocument::whereIn('id', array_unique($documentIds))
            ->whereHas('generatedDocuments')->pluck('id')->all();
        return $approvals->filter(fn ($approval) => self::blocksApproval($approval, $generatedIds))->pluck('id')->all();
    }

    private static function generatedReference(mixed $payload, ?array $generatedDocumentIds = null): bool
    {
        if (! is_array($payload)) return false;
        foreach ($payload as $key => $value) {
            if (in_array($key, ['generated_document_id', 'case_generated_document_id'], true)) return true;
            if ($key === 'case_document_id') {
                if ((! is_int($value) && ! is_string($value)) || preg_match('/^[1-9][0-9]*$/D', (string) $value) !== 1) return true;
                if ($generatedDocumentIds !== null ? in_array((int) $value, $generatedDocumentIds, true)
                    : CaseDocument::whereKey($value)->whereHas('generatedDocuments')->exists()) return true;
            }
            if (is_array($value) && self::generatedReference($value, $generatedDocumentIds)) return true;
        }
        return false;
    }
}
