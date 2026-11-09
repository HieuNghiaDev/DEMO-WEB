<?php

namespace Tests\Support\C001;

use App\Contracts\C001AuthorityPolicy;
use App\Models\DocumentGenerationTemplate;
use App\Models\DocumentType;
use App\Services\C001LegalAuthority;

/** Reuses existing RAM fixtures; hypothetical admission never enables the final gate. */
trait BuildsC001AuthorityFixtures
{
    use \Tests\Support\B31\BuildsCaseAccessFixtures { setUp as private setUpCaseAccess; }

    protected function setUp(): void
    {
        $this->setUpCaseAccess();
        (require database_path('proposals/create_c001_authority.php'))->up();
    }

    protected function evidence(bool $verification = true): array
    {
        return ['evidence_reference' => 'test-only:independent-approval', 'evidence_digest' => hash('sha256', 'HYPOTHETICAL NOT REAL EVIDENCE'),
            'issued_at' => now()->toImmutable(), 'expires_at' => now()->addMinutes($verification ? 50 : 20)->toImmutable(),
            ...($verification ? ['source' => 'test-only-hypothetical'] : ['scope' => 'final'])];
    }

    protected function context(): array
    {
        $policy = new HypotheticalAuthorityPolicy;
        $this->app->instance(C001AuthorityPolicy::class, $policy);
        $service = app(C001LegalAuthority::class);
        $verifier = $this->fixtureUser('c001-verifier', ['employee.verify_lawyer']);
        $lawyer = $this->reader('c001-lawyer', ['document.approve_legal']);
        $issuer = $this->reader('c001-issuer', [\App\Models\LegalDelegation::ISSUE_PERMISSION]);
        $admitter = $this->fixtureUser('c001-owner-admitter', []);
        $author = $this->reader('c001-author');
        $case = $this->matter(); $case->forceFill(['is_confidential' => true])->save();
        $this->member($lawyer, $case, ['read', 'write', 'confidential']);
        $this->member($issuer, $case, ['read', 'write', 'confidential']);
        $type = DocumentType::create(['code' => 'C-001', 'name_ja' => 'Synthetic C001', 'document_group' => 'C', 'handling_type' => 'office_generated']);
        $document = $this->document($case); $document->update(['document_type_id' => $type->id]);
        $template = DocumentGenerationTemplate::create(['document_type_id' => $type->id, 'version' => 1,
            'renderer_type' => 'generic_legal_document', 'format' => 'html', 'template_body' => '<article>synthetic</article>',
            'field_schema' => [], 'is_active' => true]);
        $generated = $document->generatedDocuments()->create(['document_generation_template_id' => $template->id, 'version' => 1,
            'workflow_status' => 'review', 'draft_data' => [], 'created_by' => $author->id, 'updated_by' => $author->id]);
        $evidence = $this->evidence();
        $policy->verifications[$policy->key($lawyer, $verifier, $evidence)] = true;
        $verification = $service->issueVerification($verifier, $lawyer, $evidence);
        $issuerTerms = [...$this->evidence(), 'source'=>'test-only-owner', 'scope'=>\App\Models\LegalDelegationIssuer::SCOPE, 'case_file_id'=>$case->id];
        $policy->issuerAdmissions[$policy->key($issuer,$admitter,$issuerTerms)] = true;
        $input=$issuerTerms;unset($input['case_file_id']);
        $this->actingAs($admitter);
        $issuerAdmission=$service->admitIssuer($admitter,$issuer,$case,$input);
        $policy->ledgers[$generated->id.':1'] = [$author->id];
        $terms = $this->evidence(false);
        $policy->delegations[$policy->key($lawyer, $issuer, $terms, $generated)] = true;
        $this->actingAs($issuer);
        $grant = $service->issueDelegation($issuer, $lawyer, $generated, $terms);
        return compact('policy', 'service', 'verifier', 'lawyer', 'issuer', 'author', 'case', 'document', 'generated',
            'verification', 'issuerAdmission', 'admitter', 'issuerTerms', 'grant', 'terms', 'evidence');
    }

    protected function authorityActor(\App\Models\User $actor, callable $callback): mixed
    {
        $guard=auth()->guard();$prior=$guard->user();$resolver=request()->getUserResolver();
        $guard->setUser($actor);request()->setUserResolver(fn()=>$actor);
        try{return $callback();}finally{if($prior)$guard->setUser($prior);else $guard->forgetUser();request()->setUserResolver($resolver);}
    }
}
