<?php

namespace App\Services;

use App\Contracts\C001AuthorityPolicy;
use App\Models\{CaseFile, CaseGeneratedDocument, User};
use App\Services\Administration\AdminCapabilities;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

/** C001.4 owner policy. G3 selects it only for an owner-installed loopback-local instance; never from client flags. */
final class SmallOfficeC001AuthorityPolicy implements C001AuthorityPolicy
{
    public const APPROVAL_POLICY = 'SMALL_OFFICE_EXPLICIT_LEGAL_PERMISSION_WITH_TOTP';

    // Historical enterprise admission writers remain dormant, never auto-admitted by this policy.
    public function verificationApproved(User $lawyer, User $verifier, array $evidence): bool { return false; }
    public function issuerAdmissionApproved(User $issuer, User $admittedBy, array $evidence): bool { return false; }
    public function delegationApproved(User $lawyer, User $issuer, CaseGeneratedDocument $document, array $terms): bool { return false; }

    public function caseWriteAllowed(User $actor, CaseFile $case): bool
    {
        // Pre-classification compatibility must not authorize legal content of unknown sensitivity.
        return AdminCapabilities::active($actor) && ! $actor->fresh()->must_change_password
            && $actor->employee_id !== null && Schema::hasColumn('case_files', 'is_confidential')
            && CaseAccessService::contentAllows($actor, $case->id, 'write');
    }

    public function contributors(CaseGeneratedDocument $document): ?array
    {
        try {
            return C001VersionProvenance::ledger($document)['actors'];
        } catch (HttpExceptionInterface) {
            return null;
        }
    }
}
