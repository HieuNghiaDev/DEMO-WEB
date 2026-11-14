<?php

namespace Tests\Engine\C0013A;

use App\Models\{User, CaseFile, CaseGeneratedDocument};
use App\Services\{CaseAccessService, C001EngineValidationScope};

/** Finite fictional admissions, loaded only by the guarded engine harness. Never registered in runtime. */
final class EnginePolicy implements \App\Contracts\C001AuthorityPolicy
{
    public array $verifications = [];
    public array $issuerAdmissions = [];
    public array $delegations = [];
    public array $ledgers = [];
    public function key(User $subject, User $issuer, array $evidence, ?CaseGeneratedDocument $document = null): string
    {
        app(C001EngineValidationScope::class)->assertAllowed();
        $evidence['issued_at'] = $evidence['issued_at']->getTimestamp();
        $evidence['expires_at'] = $evidence['expires_at']->getTimestamp(); ksort($evidence);
        return hash('sha256', json_encode([$subject->id, $subject->employee_id, $issuer->id, $issuer->employee_id,
            $document?->id, $document?->version, $evidence], JSON_THROW_ON_ERROR));
    }
    public function verificationApproved(User $lawyer, User $verifier, array $evidence): bool
    { return isset($this->verifications[$this->key($lawyer, $verifier, $evidence)]); }
    public function issuerAdmissionApproved(User $issuer, User $admittedBy, array $evidence): bool
    { return isset($this->issuerAdmissions[$this->key($issuer, $admittedBy, $evidence)]); }

    public function delegationApproved(User $lawyer, User $issuer, CaseGeneratedDocument $document, array $terms): bool
    { return isset($this->delegations[$this->key($lawyer, $issuer, $terms, $document)]); }
    public function caseWriteAllowed(User $actor, CaseFile $case): bool
    { app(C001EngineValidationScope::class)->assertAllowed(); return CaseAccessService::contentAllows($actor, $case->id, 'write'); }
    public function contributors(CaseGeneratedDocument $document): ?array
    { app(C001EngineValidationScope::class)->assertAllowed(); return $this->ledgers[$document->id.':'.$document->version] ?? null; }
}
