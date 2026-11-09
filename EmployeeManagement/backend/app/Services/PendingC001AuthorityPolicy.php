<?php

namespace App\Services;

use App\Contracts\C001AuthorityPolicy;
use App\Models\CaseFile;
use App\Models\CaseGeneratedDocument;
use App\Models\User;

/** No owner-selected verifier/source/issuer/provenance authority exists yet. No env/client switch. */
final class PendingC001AuthorityPolicy implements C001AuthorityPolicy
{
    public function verificationApproved(User $lawyer, User $verifier, array $evidence): bool { return false; }
    public function issuerAdmissionApproved(User $issuer, User $admittedBy, array $evidence): bool { return false; }
    public function delegationApproved(User $lawyer, User $issuer, CaseGeneratedDocument $document, array $terms): bool { return false; }
    public function caseWriteAllowed(User $actor, CaseFile $case): bool { return false; }
    public function contributors(CaseGeneratedDocument $document): ?array { return null; }
}
