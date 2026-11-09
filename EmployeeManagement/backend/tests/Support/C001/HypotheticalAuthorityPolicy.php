<?php

namespace Tests\Support\C001;

use App\Contracts\C001AuthorityPolicy;
use App\Models\CaseFile;
use App\Models\CaseGeneratedDocument;
use App\Models\User;
use App\Services\CaseAccessService;

/** Hypothetical owner admission for service tests ONLY; never professional evidence or final ALLOW. */
final class HypotheticalAuthorityPolicy implements C001AuthorityPolicy
{
    public array $verifications = [];
    public array $issuerAdmissions = [];
    public array $delegations = [];
    public array $ledgers = [];
    public array $transactionLevels = [];
    public int $caseChecks = 0;
    public ?\Closure $onCaseCheck = null;

    public function key(User $subject, User $issuer, array $evidence, ?CaseGeneratedDocument $document = null): string
    {
        (new CaseAccessService)->assertSandbox();
        $evidence['issued_at'] = $evidence['issued_at']->getTimestamp();
        $evidence['expires_at'] = $evidence['expires_at']->getTimestamp();
        ksort($evidence);
        return hash('sha256', json_encode([$subject->id, $subject->employee_id, $issuer->id, $issuer->employee_id,
            $document?->id, $document?->version, $evidence], JSON_THROW_ON_ERROR));
    }

    public function verificationApproved(User $lawyer, User $verifier, array $evidence): bool
    {
        return isset($this->verifications[$this->key($lawyer, $verifier, $evidence)]);
    }

    public function issuerAdmissionApproved(User $issuer, User $admittedBy, array $evidence): bool
    { return isset($this->issuerAdmissions[$this->key($issuer, $admittedBy, $evidence)]); }

    public function delegationApproved(User $lawyer, User $issuer, CaseGeneratedDocument $document, array $terms): bool
    {
        return isset($this->delegations[$this->key($lawyer, $issuer, $terms, $document)]);
    }

    public function caseWriteAllowed(User $actor, CaseFile $case): bool
    {
        (new CaseAccessService)->assertSandbox();
        $this->transactionLevels[] = \Illuminate\Support\Facades\DB::transactionLevel();
        ++$this->caseChecks;
        if ($this->onCaseCheck) ($this->onCaseCheck)($this->caseChecks);
        return CaseAccessService::rehearsal()?->allows($actor, $case->id, 'write') ?? false;
    }

    public function contributors(CaseGeneratedDocument $document): ?array
    {
        (new CaseAccessService)->assertSandbox();
        return $this->ledgers[$document->id.':'.$document->version] ?? null;
    }
}
