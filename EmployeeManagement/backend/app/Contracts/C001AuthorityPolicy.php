<?php

namespace App\Contracts;

use App\Models\CaseFile;
use App\Models\CaseGeneratedDocument;
use App\Models\User;

/** Trusted server-side admission, NOT request fields, role names or rehearsal attestations. */
interface C001AuthorityPolicy
{
    public function verificationApproved(User $lawyer, User $verifier, array $evidence): bool;

    /** Exact independent owner admission; never inferred from administrative roles or issuer permission. */
    public function issuerAdmissionApproved(User $issuer, User $admittedBy, array $evidence): bool;

    public function delegationApproved(User $lawyer, User $issuer, CaseGeneratedDocument $document, array $terms): bool;

    /** Honor the current Case write/confidential policy, including exact membership where required; no Level/Admin override. */
    public function caseWriteAllowed(User $actor, CaseFile $case): bool;

    /** Complete, trustworthy creator/editor/submitter User IDs for THIS current version, or null if unknown. */
    public function contributors(CaseGeneratedDocument $document): ?array;
}
