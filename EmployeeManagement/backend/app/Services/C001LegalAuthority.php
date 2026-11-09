<?php

namespace App\Services;

use App\Contracts\C001AuthorityPolicy;
use App\Models\CaseDocument;
use App\Models\CaseFile;
use App\Models\CaseGeneratedDocument;
use App\Models\LawyerVerification;
use App\Models\LegalDelegation;
use App\Models\User;
use App\Services\Administration\AdminCapabilities;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use LogicException;

/** Registry/admission predicates; default policy remains empty. Final decisions require the separate proof-bound writer. */
final class C001LegalAuthority
{
    // Owner supersession C001.3B: eligibility only; every commit still requires the exact legal TOTP proof.
    public const ALLOW_VERIFIED_LAWYER_C001_SELF_FINAL_APPROVAL = true;
    public const FINAL_APPROVAL_POLICY = 'VERIFIED_LAWYER_SELF_FINAL_APPROVAL_WITH_TOTP';

    public function __construct(private C001AuthorityPolicy $policy, private SecurityAuditLogger $audit) {}

    public function usesSmallOfficeAuthority(): bool
    {
        return $this->policy instanceof SmallOfficeC001AuthorityPolicy;
    }

    private function primary(Model $model): void
    {
        if ($model->getConnectionName() !== null && $model->getConnectionName() !== config('database.default')) {
            throw new LogicException('Legal authority requires the primary connection.');
        }
    }

    private function active(User $user): ?User
    {
        $this->primary($user);
        $fresh = User::whereKey($user->id)->when(DB::transactionLevel() > 0, fn ($q) => $q->lockForUpdate())->first();
        if (! $fresh || ! $fresh->is_active || $fresh->activation_required || $fresh->must_change_password || $fresh->employee_id === null) return null;
        if (DB::transactionLevel() > 0) {
            $roles = DB::table('user_roles')->where('user_id', $fresh->id)->orderBy('role_id')->lockForUpdate()->pluck('role_id');
            DB::table('roles')->whereIn('id', $roles)->orderBy('id')->lockForUpdate()->get();
            DB::table('role_permissions')->whereIn('role_id', $roles)->orderBy('role_id')->orderBy('permission_id')->lockForUpdate()->get();
        }
        $employee = \App\Models\Employee::whereKey($fresh->employee_id)
            ->when(DB::transactionLevel() > 0, fn ($q) => $q->lockForUpdate())->first();
        return $employee?->status === 'active' ? $fresh : null;
    }

    private function evidence(array $input, bool $verification): array
    {
        $keys = ['evidence_reference', 'evidence_digest', 'issued_at', 'expires_at', ...($verification ? ['source'] : ['scope'])];
        abort_unless(count($input) === count($keys) && array_diff(array_keys($input), $keys) === [], 422);
        abort_unless(is_string($input['evidence_reference']) && preg_match('/^[a-zA-Z0-9:._-]{1,160}$/D', $input['evidence_reference']) === 1
            && is_string($input['evidence_digest']) && preg_match('/^[a-f0-9]{64}$/D', $input['evidence_digest']) === 1
            && ($input['issued_at'] instanceof \DateTimeInterface) && ($input['expires_at'] instanceof \DateTimeInterface), 422);
        if ($verification) {
            abort_unless(is_string($input['source']) && preg_match('/^[a-zA-Z0-9:._-]{1,80}$/D', $input['source']) === 1
                && $input['source'] !== 'synthetic-b32', 422);
        } else abort_unless($input['scope'] === 'final', 422);
        $input['issued_at'] = CarbonImmutable::instance($input['issued_at']);
        $input['expires_at'] = CarbonImmutable::instance($input['expires_at']);
        // No invented TTL. The independent admission policy must approve these exact dates.
        abort_unless($input['issued_at']->lte(now()) && $input['expires_at']->gt(now())
            && $input['expires_at']->gt($input['issued_at']), 422);
        return $input;
    }

    private function storedEvidence(Model $record, bool $verification): array
    {
        return ['evidence_reference' => $record->evidence_reference, 'evidence_digest' => $record->evidence_digest,
            'issued_at' => $record->issued_at, 'expires_at' => $record->expires_at,
            ...($verification ? ['source' => $record->source] : ['scope' => $record->scope])];
    }

    public function issueVerification(User $verifier, User $lawyer, array $input): LawyerVerification
    {
        return DB::transaction(fn () => $this->writeVerification($verifier, $lawyer, $input));
    }

    private function writeVerification(User $verifier, User $lawyer, array $input, ?int $supersedes = null): LawyerVerification
    {
        $verifier = $this->active($verifier); $lawyer = $this->active($lawyer);
        abort_unless($verifier && $lawyer && $verifier->id !== $lawyer->id && $verifier->employee_id !== $lawyer->employee_id
            && AdminCapabilities::explicit($verifier, 'employee.verify_lawyer'), 403);
        $evidence = $this->evidence($input, true);
        abort_unless($this->policy->verificationApproved($lawyer, $verifier, $evidence), 409, 'Verification admission policy is pending.');
        $record = LawyerVerification::forceCreate(['user_id' => $lawyer->id, 'employee_id' => $lawyer->employee_id,
            'verifier_user_id' => $verifier->id, 'verifier_employee_id' => $verifier->employee_id,
            'supersedes_id' => $supersedes, ...$evidence]);
        $this->audit->recordLegalAuthority($verifier, $supersedes ? 'lawyer.verification_renewed' : 'lawyer.verification_issued',
            ['verification_id' => $record->id, 'subject_user_id' => $lawyer->id, 'subject_employee_id' => $lawyer->employee_id,
                ...($supersedes ? ['previous_verification_id' => $supersedes] : [])]);
        return $record;
    }

    public function verification(User $lawyer, ?int $id = null): ?LawyerVerification
    {
        $lawyer = $this->active($lawyer);
        if (! $lawyer || ! Schema::hasTable('lawyer_verifications')) return null;
        return LawyerVerification::where('user_id', $lawyer->id)->where('employee_id', $lawyer->employee_id)
            ->when($id !== null, fn ($q) => $q->whereKey($id))->whereNull('revoked_at')->where('issued_at', '<=', now())
            ->where('expires_at', '>', now())->when(DB::transactionLevel() > 0, fn ($q) => $q->lockForUpdate())->get()->first(function ($record) use ($lawyer) {
                $verifier = User::find($record->verifier_user_id);
                $verifier = $verifier ? $this->active($verifier) : null;
                if (! $verifier || $verifier->id === $lawyer->id || $verifier->employee_id === $lawyer->employee_id
                    || $verifier->employee_id !== $record->verifier_employee_id
                    || ! AdminCapabilities::explicit($verifier, 'employee.verify_lawyer')) return false;
                try { $evidence = $this->evidence($this->storedEvidence($record, true), true); }
                catch (\Symfony\Component\HttpKernel\Exception\HttpExceptionInterface) { return false; }
                return $this->policy->verificationApproved($lawyer, $verifier, $evidence);
            });
    }

    public function renewVerification(User $verifier, LawyerVerification $previous, array $input): LawyerVerification
    {
        $this->primary($previous);
        return DB::transaction(function () use ($verifier, $previous, $input) {
            $old = LawyerVerification::whereKey($previous->id)->lockForUpdate()->firstOrFail();
            abort_if($old->revoked_at !== null, 409);
            // Renewal is new independent admission, not a timestamp edit; old exact grants cease to be usable.
            $new = $this->writeVerification($verifier, User::findOrFail($old->user_id), $input, $old->id);
            abort_unless($new->employee_id === $old->employee_id, 403);
            $old->forceFill(['revoked_at' => now()])->save();
            return $new;
        });
    }

    public function revokeVerification(User $verifier, LawyerVerification $record): void
    {
        $this->primary($record);
        DB::transaction(function () use ($verifier, $record) {
            $record = LawyerVerification::whereKey($record->id)->lockForUpdate()->firstOrFail();
            $actor = $this->active($verifier); $subject = User::find($record->user_id);
            abort_unless($actor && $subject && $actor->id === $record->verifier_user_id
                && $actor->employee_id === $record->verifier_employee_id && $actor->id !== $subject->id
                && AdminCapabilities::explicit($actor, 'employee.verify_lawyer')
                && $this->policy->verificationApproved($subject, $actor, $this->storedEvidence($record, true)), 403);
            if ($record->revoked_at !== null) return;
            $record->forceFill(['revoked_at' => now()])->save();
            $this->audit->recordLegalAuthority($actor, 'lawyer.verification_revoked', ['verification_id' => $record->id]);
        });
    }

    private function context(CaseGeneratedDocument $generated): ?CaseGeneratedDocument
    {
        $this->primary($generated);
        $fresh = CaseGeneratedDocument::with('caseDocument.caseFile', 'caseDocument.documentType')
            ->when(DB::transactionLevel() > 0, fn ($q) => $q->lockForUpdate())->find($generated->id);
        return $fresh?->caseDocument?->caseFile && $fresh->caseDocument->documentType?->code === 'C-001' ? $fresh : null;
    }

    private function conflict(User $lawyer, CaseGeneratedDocument $generated): ?string
    {
        $known = [$generated->created_by, $generated->updated_by, ...$generated->taskSubmissions()->pluck('submitted_by')->all()];
        $complete = $this->policy->contributors($generated);
        if (! $generated->created_by || ! $generated->updated_by || $complete === null || $complete === []
            || array_filter($complete, fn ($id) => ! is_int($id) || $id < 1) !== []) return 'provenance_unavailable';
        // Missing a known contributor means the adapter did not supply a complete ledger.
        if (array_diff(array_map('intval', $known), $complete) !== []) return 'provenance_unavailable';
        $self = in_array($lawyer->id, array_map('intval', $known), true) || in_array($lawyer->id, $complete, true);
        if ($self && ! (self::ALLOW_VERIFIED_LAWYER_C001_SELF_FINAL_APPROVAL
            && $generated->caseDocument?->documentType?->code === 'C-001'
            && ($this->usesSmallOfficeAuthority() || $this->verification($lawyer)))) {
            return 'contributor_conflict';
        }
        return null;
    }

    private function inReview(CaseGeneratedDocument $generated): bool
    {
        return $generated->workflow_status === 'review' && $generated->approved_at === null && $generated->approved_data === null
            && (int) $generated->caseDocument->generatedDocuments()->max('version') === $generated->version;
    }


    private function authenticatedActor(User $actor): void
    {
        $session = auth()->user();
        abort_unless($session instanceof User && $session->id === $actor->id && $session->employee_id === $actor->employee_id, 403);
    }

    private function issuerEvidence(\App\Models\LegalDelegationIssuer $record): array
    {
        return ['source'=>$record->source, 'evidence_reference'=>$record->evidence_reference,'evidence_digest'=>$record->evidence_digest,
            'issued_at'=>$record->issued_at,'expires_at'=>$record->expires_at,'scope'=>$record->scope,'case_file_id'=>$record->case_file_id];
    }

    public function admitIssuer(User $admittedBy, User $issuer, CaseFile $case, array $input): \App\Models\LegalDelegationIssuer
    {
        $this->authenticatedActor($admittedBy); $this->primary($case);
        return DB::transaction(function() use($admittedBy,$issuer,$case,$input){
            $owner=$this->active($admittedBy);$issuer=$this->active($issuer);
            abort_unless($owner && $issuer && $owner->id!==$issuer->id && $owner->employee_id!==$issuer->employee_id
                && AdminCapabilities::explicit($issuer,LegalDelegation::ISSUE_PERMISSION)
                && $this->policy->caseWriteAllowed($issuer,$case),403);
            abort_unless(($input['scope']??null)===\App\Models\LegalDelegationIssuer::SCOPE,422);
            unset($input['scope']);$evidence=[...$this->evidence($input,true),'scope'=>\App\Models\LegalDelegationIssuer::SCOPE,'case_file_id'=>$case->id];
            abort_unless($this->policy->issuerAdmissionApproved($issuer,$owner,$evidence),409,'Issuer owner admission policy is pending.');
            $record=\App\Models\LegalDelegationIssuer::forceCreate(['user_id'=>$issuer->id,'employee_id'=>$issuer->employee_id,
                'admitted_by_user_id'=>$owner->id,'admitted_by_employee_id'=>$owner->employee_id,...$evidence]);
            $this->audit->recordLegalAuthority($owner,'legal.issuer_admitted',['issuer_admission_id'=>$record->id,
                'subject_user_id'=>$issuer->id,'subject_employee_id'=>$issuer->employee_id,'case_file_id'=>$case->id]);
            return $record;
        });
    }

    public function issuerAdmission(User $issuer, CaseFile $case, ?int $id=null): ?\App\Models\LegalDelegationIssuer
    {
        $this->primary($case);
        $issuer=$this->active($issuer);
        if(!$issuer || !Schema::hasTable('legal_delegation_issuers') || !AdminCapabilities::explicit($issuer,LegalDelegation::ISSUE_PERMISSION)
            || !$this->policy->caseWriteAllowed($issuer,$case))return null;
        return \App\Models\LegalDelegationIssuer::where('user_id',$issuer->id)->where('employee_id',$issuer->employee_id)
            ->where('case_file_id',$case->id)->where('scope',\App\Models\LegalDelegationIssuer::SCOPE)
            ->when($id!==null,fn($q)=>$q->whereKey($id))->whereNull('revoked_at')->where('issued_at','<=',now())->where('expires_at','>',now())
            ->when(DB::transactionLevel()>0,fn($q)=>$q->lockForUpdate())->get()->first(function($record)use($issuer){
                $owner=User::find($record->admitted_by_user_id);$owner=$owner?$this->active($owner):null;
                return $owner && $owner->employee_id===$record->admitted_by_employee_id && $owner->id!==$issuer->id
                    && $owner->employee_id!==$issuer->employee_id && $this->policy->issuerAdmissionApproved($issuer,$owner,$this->issuerEvidence($record));
            });
    }

    public function revokeIssuerAdmission(User $admittedBy, \App\Models\LegalDelegationIssuer $record): void
    {
        $this->authenticatedActor($admittedBy);$this->primary($record);
        DB::transaction(function()use($admittedBy,$record){
            $record=\App\Models\LegalDelegationIssuer::whereKey($record->id)->lockForUpdate()->firstOrFail();
            $owner=$this->active($admittedBy);$issuer=User::find($record->user_id);
            abort_unless($owner && $issuer && $owner->id===$record->admitted_by_user_id && $owner->employee_id===$record->admitted_by_employee_id
                && $issuer->employee_id===$record->employee_id && $owner->id!==$issuer->id && $owner->employee_id!==$issuer->employee_id
                && $this->policy->issuerAdmissionApproved($issuer,$owner,$this->issuerEvidence($record)),403);
            if($record->revoked_at!==null)return;
            $record->forceFill(['revoked_at'=>now()])->save();
            $this->audit->recordLegalAuthority($owner,'legal.issuer_revoked',['issuer_admission_id'=>$record->id,'case_file_id'=>$record->case_file_id]);
        });
    }

    public function issueDelegation(User $issuer, User $lawyer, CaseGeneratedDocument $generated, array $input): LegalDelegation
    {
        $this->authenticatedActor($issuer);
        return DB::transaction(function () use ($issuer, $lawyer, $generated, $input) {
            $issuer = $this->active($issuer); $lawyer = $this->active($lawyer); $generated = $this->context($generated);
            abort_unless($issuer && $lawyer && $generated && $issuer->id !== $lawyer->id && $issuer->employee_id !== $lawyer->employee_id
                && AdminCapabilities::explicit($issuer, LegalDelegation::ISSUE_PERMISSION)
                && AdminCapabilities::explicit($lawyer, 'document.approve_legal'), 403);
            $case = $generated->caseDocument->caseFile;
            abort_unless($this->policy->caseWriteAllowed($issuer, $case) && $this->policy->caseWriteAllowed($lawyer, $case), 403);
            $subjectProof = $this->verification($lawyer); $issuerAdmission = $this->issuerAdmission($issuer, $case);
            abort_unless($subjectProof && $issuerAdmission && $this->conflict($lawyer, $generated) === null && $this->inReview($generated), 403);
            $terms = $this->evidence($input, false);
            abort_unless($terms['expires_at']->lte($subjectProof->expires_at) && $terms['expires_at']->lte($issuerAdmission->expires_at), 422);
            abort_unless($this->policy->delegationApproved($lawyer, $issuer, $generated, $terms), 409, 'Legal issuer admission policy is pending.');
            $grant = LegalDelegation::forceCreate(['user_id' => $lawyer->id, 'employee_id' => $lawyer->employee_id,
                'issuer_user_id' => $issuer->id, 'issuer_employee_id' => $issuer->employee_id,
                'verification_id' => $subjectProof->id, 'issuer_admission_id' => $issuerAdmission->id,
                'case_file_id' => $case->id, 'case_document_id' => $generated->case_document_id,
                'case_generated_document_id' => $generated->id, 'version' => $generated->version, ...$terms]);
            $this->audit->recordLegalAuthority($issuer, 'legal.delegation_issued', ['delegation_id' => $grant->id,
                'case_file_id' => $case->id, 'case_document_id' => $generated->case_document_id,
                'case_generated_document_id' => $generated->id, 'version' => $generated->version]);
            return $grant;
        });
    }

    public function delegation(User $lawyer, CaseGeneratedDocument $generated): ?LegalDelegation
    {
        $lawyer = $this->active($lawyer); $generated = $this->context($generated);
        if (! $lawyer || ! $generated || ! Schema::hasColumn('legal_delegations', 'issuer_admission_id')
            || ! AdminCapabilities::explicit($lawyer, 'document.approve_legal') || ! $this->inReview($generated)
            || ! $this->policy->caseWriteAllowed($lawyer, $generated->caseDocument->caseFile)
            || $this->conflict($lawyer, $generated) !== null) return null;
        return LegalDelegation::where('user_id', $lawyer->id)->where('employee_id', $lawyer->employee_id)
            ->where('case_file_id', $generated->caseDocument->case_file_id)->where('case_document_id', $generated->case_document_id)
            ->where('case_generated_document_id', $generated->id)->where('version', $generated->version)
            ->where('scope', 'final')->whereNull('revoked_at')->where('issued_at', '<=', now())->where('expires_at', '>', now())
            ->when(DB::transactionLevel() > 0, fn ($q) => $q->lockForUpdate())->get()->first(function ($grant) use ($lawyer, $generated) {
                $issuer = User::find($grant->issuer_user_id); $issuer = $issuer ? $this->active($issuer) : null;
                if (! $issuer || $issuer->employee_id !== $grant->issuer_employee_id || $issuer->id === $lawyer->id
                    || $issuer->employee_id === $lawyer->employee_id || ! $grant->issuer_admission_id
                    || ! AdminCapabilities::explicit($issuer, LegalDelegation::ISSUE_PERMISSION)
                    || ! $this->policy->caseWriteAllowed($issuer, $generated->caseDocument->caseFile)) return false;
                $subjectProof = $this->verification($lawyer, $grant->verification_id);
                $issuerAdmission = $this->issuerAdmission($issuer, $generated->caseDocument->caseFile, $grant->issuer_admission_id);
                if (! $subjectProof || ! $issuerAdmission || $grant->expires_at->gt($subjectProof->expires_at)
                    || $grant->expires_at->gt($issuerAdmission->expires_at)) return false;
                try { $terms = $this->evidence($this->storedEvidence($grant, false), false); }
                catch (\Symfony\Component\HttpKernel\Exception\HttpExceptionInterface) { return false; }
                return $this->policy->delegationApproved($lawyer, $issuer, $generated, $terms);
            });
    }

    public function revokeDelegation(User $issuer, LegalDelegation $grant): void
    {
        $this->authenticatedActor($issuer);
        $this->primary($grant);
        DB::transaction(function () use ($issuer, $grant) {
            $grant = LegalDelegation::whereKey($grant->id)->lockForUpdate()->firstOrFail();
            $actor = $this->active($issuer); $subject = User::find($grant->user_id);
            $generated = CaseGeneratedDocument::find($grant->case_generated_document_id);
            $generated = $generated ? $this->context($generated) : null;
            abort_unless($actor && $subject && $generated && $actor->id === $grant->issuer_user_id
                && $actor->employee_id === $grant->issuer_employee_id && $actor->id !== $subject->id
                && $actor->employee_id !== $subject->employee_id && $grant->issuer_admission_id
                && $this->issuerAdmission($actor, $generated->caseDocument->caseFile, $grant->issuer_admission_id)
                && AdminCapabilities::explicit($actor, LegalDelegation::ISSUE_PERMISSION)
                && $this->policy->caseWriteAllowed($actor, $generated->caseDocument->caseFile)
                && $this->policy->delegationApproved($subject, $actor, $generated, $this->storedEvidence($grant, false)), 403);
            if ($grant->revoked_at !== null) return;
            $grant->forceFill(['revoked_at' => now()])->save();
            $this->audit->recordLegalAuthority($actor, 'legal.delegation_revoked', ['delegation_id' => $grant->id]);
        });
    }

    /** Internal diagnosis only. Never return this resource-sensitive reason to an unauthorized client. */
    public function finalBlocker(User $lawyer, CaseFile $case, CaseDocument $document, CaseGeneratedDocument $generated): string
    {
        $this->primary($case); $this->primary($document);
        $lawyer = $this->active($lawyer);
        if (! $lawyer) return 'inactive_identity';
        if (! AdminCapabilities::explicit($lawyer, 'document.approve_legal')) return 'explicit_legal_permission_required';
        $generated = $this->context($generated);
        if (! $generated || $generated->case_document_id !== $document->id || $generated->caseDocument->case_file_id !== $case->id) return 'nested_identity_mismatch';
        if (! $this->policy->caseWriteAllowed($lawyer, $generated->caseDocument->caseFile)) return 'case_scope_required';
        if (! $this->usesSmallOfficeAuthority() && ! $this->verification($lawyer)) return 'independent_verification_required';
        if ($conflict = $this->conflict($lawyer, $generated)) return $conflict;
        if (! $this->inReview($generated)) return 'workflow_state_invalid';
        if (! $this->usesSmallOfficeAuthority() && ! $this->delegation($lawyer, $generated)) return 'exact_legal_delegation_required';
        // Necessary authority match only. It never substitutes for a C001.2 legal proof or real admission.
        return 'legal_step_up_and_final_writer_policy_pending';
    }

    /** Evidence committed to the proof/receipt, after finalBlocker reauthorizes this exact resource. */
    public function decisionAuthority(User $actor, CaseGeneratedDocument $generated): array
    {
        if ($this->usesSmallOfficeAuthority()) {
            abort_unless(AdminCapabilities::explicit($actor, 'document.approve_legal'), 403);
            return ['approval_policy' => SmallOfficeC001AuthorityPolicy::APPROVAL_POLICY,
                'authority_permission' => 'document.approve_legal'];
        }
        $grant = $this->delegation($actor, $generated);
        abort_unless($grant, 403);
        $verification = $this->verification($actor, $grant->verification_id);
        $issuer = User::findOrFail($grant->issuer_user_id);
        $admission = $this->issuerAdmission($issuer, $generated->caseDocument->caseFile, $grant->issuer_admission_id);
        abort_unless($verification && $admission, 403);
        return ['approval_policy' => self::FINAL_APPROVAL_POLICY,
            'verification_id' => $verification->id, 'verification_revision' => C001VersionProvenance::digest($verification->getAttributes()),
            'verification_evidence_digest' => $verification->evidence_digest,
            'issuer_user_id' => $issuer->id, 'issuer_employee_id' => $issuer->employee_id,
            'issuer_admission_id' => $admission->id, 'issuer_admission_revision' => C001VersionProvenance::digest($admission->getAttributes()),
            'issuer_admission_evidence_digest' => $admission->evidence_digest,
            'delegation_id' => $grant->id, 'delegation_revision' => C001VersionProvenance::digest($grant->getAttributes()),
            'delegation_evidence_digest' => $grant->evidence_digest];
    }
}
