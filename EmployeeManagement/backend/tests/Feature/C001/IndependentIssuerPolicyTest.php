<?php

namespace Tests\Feature\C001;

use App\Models\{Permission,LegalDelegationIssuer,LegalDelegation,LawyerVerification,SecurityAuditLog};
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Tests\Support\B21\B21TestCase;

class IndependentIssuerPolicyTest extends B21TestCase
{
    use \Tests\Support\C001\BuildsC001AuthorityFixtures { setUp as private setUpAuthority; }
    use \Tests\Support\C001\BuildsC001DecisionFixtures;
    use \Tests\Support\C001\BuildsSelfContributedC001Fixtures;
    protected function setUp(): void { $this->setUpAuthority(); (require database_path('proposals/create_c001_legal_decisions.php'))->up(); }

    private function denied(callable $callback, array $statuses=[403,409,422]): void
    {
        try{$callback();$this->fail('Issuer authority must be denied.');}
        catch(HttpExceptionInterface $e){$this->assertContains($e->getStatusCode(),$statuses);}
    }

    public function test_owner_admitted_non_lawyer_manager_can_issue_without_legal_approve_permission(): void
    {
        $c = $this->context();
        $c['issuer']->roles()->sole()->permissions()->detach(Permission::where('name', 'document.approve_legal')->value('id'));
        unset($c['policy']->verifications[$c['policy']->key($c['issuer'], $c['verifier'], $c['evidence'])]);
        $this->actingAs($c['issuer']);
        $grant = $c['service']->issueDelegation($c['issuer'], $c['lawyer'], $c['generated'], $c['terms']);
        $this->assertSame($c['issuer']->id, $grant->issuer_user_id);
        $this->assertFalse($c['issuer']->fresh()->hasPermission('document.approve_legal'));
        $this->assertNull($c['service']->verification($c['issuer']));
    }

    public function test_manager_issuer_and_one_verified_lawyer_complete_self_final_approval_with_totp(): void
    {
        $this->ownVersion('creator');$c=$this->c;
        $this->assertSame(1,LawyerVerification::count());
        $this->assertFalse($c['issuer']->fresh()->hasPermission('document.approve_legal'));
        $this->assertFalse($c['issuer']->fresh()->hasPermission('employee.verify_lawyer'));
        $receipt=$this->decide($this->proof());
        $this->assertTrue($receipt->context['self_approval']);
        $this->assertSame($c['issuerAdmission']->id,$receipt->context['issuer_admission_id']);
        $this->assertSame($c['issuer']->id,$receipt->context['issuer_user_id']);
        $this->assertSame($c['verification']->id,$receipt->context['verification_id']);
        $this->assertArrayNotHasKey('issuer_verification_id',$receipt->context);
        $this->assertSame($receipt->id,$this->decide($receipt->proof_id)->id);
        $this->assertSame(1,SecurityAuditLog::where('event','legal.c001_approved')->count());
        $this->assertSame($c['issuerAdmission']->id,SecurityAuditLog::where('event','legal.c001_approved')->sole()->metadata['issuer_admission_id']);
    }

    public static function invalidIssuers(): array
    {return array_map(fn($v)=>[$v],['permission','admission','revoked','expired','inactive','employee_inactive','unlinked','scope','owner_withdrawn','owner_inactive','unauthenticated']);}

    #[DataProvider('invalidIssuers')]
    public function test_issuer_permission_owner_admission_identity_and_case_scope_are_all_required(string $state): void
    {
        $c=$this->context();$this->actingAs($c['issuer']);
        switch($state){
            case 'permission':$c['issuer']->roles()->sole()->permissions()->detach();break;
            case 'admission':$c['policy']->issuerAdmissions=[];break;
            case 'revoked':$this->authorityActor($c['admitter'],fn()=>$c['service']->revokeIssuerAdmission($c['admitter'],$c['issuerAdmission']));break;
            case 'expired':$this->travel(51)->minutes();break;
            case 'inactive':$c['issuer']->update(['is_active'=>false]);break;
            case 'employee_inactive':$c['issuer']->employee->update(['status'=>'inactive']);break;
            case 'unlinked':$c['issuer']->update(['employee_id'=>null]);break;
            case 'scope':DB::table('case_memberships')->where('user_id',$c['issuer']->id)->update(['can_write'=>false]);break;
            case 'owner_withdrawn':$c['policy']->issuerAdmissions=[];break;
            case 'owner_inactive':$c['admitter']->update(['is_active'=>false]);break;
            case 'unauthenticated':$this->actingAs($c['author']);break;
        }
        $this->denied(fn()=>$c['service']->issueDelegation($c['issuer'],$c['lawyer'],$c['generated'],$c['terms']));
        $this->assertDatabaseCount('legal_delegations',1);
        if($state!=='unauthenticated')$this->assertNull($c['service']->delegation($c['lawyer'],$c['generated']));
    }

    public function test_owner_admission_cannot_be_inferred_from_admin_title_or_self_attestation(): void
    {
        $c=$this->context();$fakeOwner=$this->fixtureUser('fake-owner',['case.view','employee.manage_roles']);
        $this->assertFalse(app(\App\Policies\RolePolicy::class)->withinGrantableCeiling(['document.delegate_legal']));
        $fakeOwner->update(['role'=>'admin']);$input=$c['issuerTerms'];unset($input['case_file_id']);
        $this->actingAs($fakeOwner);
        $this->denied(fn()=>$c['service']->admitIssuer($fakeOwner,$c['issuer'],$c['case'],$input),[409]);
        $this->actingAs($c['issuer']);
        $this->denied(fn()=>$c['service']->admitIssuer($c['issuer'],$c['issuer'],$c['case'],$input),[403]);
        $this->assertDatabaseCount('legal_delegation_issuers',1);
    }

    public static function selfDelegators(): array {return [['manager'],['lawyer']];}
    #[DataProvider('selfDelegators')]
    public function test_same_user_and_same_employee_cannot_issue_own_legal_authority(string $kind): void
    {
        $c=$this->context();$actor=$kind==='manager'?$c['issuer']:$c['lawyer'];
        $actor->roles()->sole()->permissions()->syncWithoutDetaching([Permission::where('name','document.delegate_legal')->value('id'),Permission::where('name','document.approve_legal')->value('id')]);
        $this->actingAs($actor);
        $this->denied(fn()=>$c['service']->issueDelegation($actor,$actor,$c['generated'],$c['terms']),[403]);
        $this->assertDatabaseCount('legal_delegations',1);
    }

    public function test_delegation_cannot_outlive_subject_verification_or_issuer_admission(): void
    {
        $c=$this->context();$this->authorityActor($c['admitter'],fn()=>$c['service']->revokeIssuerAdmission($c['admitter'],$c['issuerAdmission']));
        $evidence=[...$this->evidence(),'source'=>'short-owner-admission','expires_at'=>now()->addMinutes(3)->toImmutable(),
            'scope'=>LegalDelegationIssuer::SCOPE,'case_file_id'=>$c['case']->id];
        $c['policy']->issuerAdmissions[$c['policy']->key($c['issuer'],$c['admitter'],$evidence)]=true;
        $input=$evidence;unset($input['case_file_id']);
        $this->authorityActor($c['admitter'],fn()=>$c['service']->admitIssuer($c['admitter'],$c['issuer'],$c['case'],$input));
        $this->actingAs($c['issuer']);
        $terms=[...$c['terms'],'expires_at'=>now()->addMinutes(4)->toImmutable()];
        $c['policy']->delegations[$c['policy']->key($c['lawyer'],$c['issuer'],$terms,$c['generated'])]=true;
        $this->denied(fn()=>$c['service']->issueDelegation($c['issuer'],$c['lawyer'],$c['generated'],$terms),[422]);
        $this->assertDatabaseCount('legal_delegations',1);
    }

    public static function afterProofRevocations():array{return [['admission'],['delegation'],['permission']];}
    #[DataProvider('afterProofRevocations')]
    public function test_issuer_and_delegation_are_revalidated_after_lawyer_totp(string $state):void
    {
        $this->ownVersion();$proof=$this->proof();$c=$this->c;
        match($state){
            'admission'=>$this->authorityActor($c['admitter'],fn()=>$c['service']->revokeIssuerAdmission($c['admitter'],$c['issuerAdmission'])),
            'delegation'=>$this->authorityActor($c['issuer'],fn()=>$c['service']->revokeDelegation($c['issuer'],$c['grant'])),
            'permission'=>$c['issuer']->roles()->sole()->permissions()->detach(),
        };
        $this->denied(fn()=>$this->decide($proof),[403]);
        $this->assertDatabaseCount('c001_legal_decisions',0);$this->assertSame('review',$c['generated']->fresh()->workflow_status);
        $challenge=DB::table('c001_legal_proofs')->where('id',$proof)->value('challenge_id');
        $this->assertNull(DB::table('authentication_challenges')->where('id',$challenge)->value('used_at'));
    }

    public function test_non_lawyer_issuer_with_real_totp_session_still_cannot_final_approve():void
    {
        $this->prepared();$this->c['lawyer']=$this->c['issuer'];$this->enrollAndLogin();
        $this->stepResponse()->assertForbidden();$this->assertDatabaseCount('c001_legal_proofs',0);
        $this->assertDatabaseCount('c001_legal_decisions',0);
        $this->assertNull($this->c['service']->verification($this->c['issuer']));
    }

    public static function issuerAuditOperations():array{return [['admit'],['revoke_admission'],['delegate'],['revoke_delegation']];}
    #[DataProvider('issuerAuditOperations')]
    public function test_required_issuer_audit_failure_rolls_back_all_mutation(string $operation):void
    {
        $c=$this->context();$before=[LegalDelegationIssuer::count(),LegalDelegation::count(),SecurityAuditLog::count()];
        DB::unprepared("CREATE TRIGGER issuer_audit_failure BEFORE INSERT ON security_audit_logs WHEN NEW.event LIKE 'legal.%' BEGIN SELECT RAISE(ABORT,'synthetic issuer audit failure'); END");
        $input=$c['issuerTerms'];unset($input['case_file_id']);
        try{
            $this->authorityActor(in_array($operation,['admit','revoke_admission'],true)?$c['admitter']:$c['issuer'],function()use($operation,$c,$input){
                match($operation){'admit'=>$c['service']->admitIssuer($c['admitter'],$c['issuer'],$c['case'],$input),
                    'revoke_admission'=>$c['service']->revokeIssuerAdmission($c['admitter'],$c['issuerAdmission']),
                    'delegate'=>$c['service']->issueDelegation($c['issuer'],$c['lawyer'],$c['generated'],$c['terms']),
                    'revoke_delegation'=>$c['service']->revokeDelegation($c['issuer'],$c['grant'])};
            });$this->fail('Required issuer audit failure must propagate.');
        }catch(\Illuminate\Database\QueryException){$this->assertSame($before,[LegalDelegationIssuer::count(),LegalDelegation::count(),SecurityAuditLog::count()]);}
        $this->assertNull($c['issuerAdmission']->fresh()->revoked_at);$this->assertNull($c['grant']->fresh()->revoked_at);
    }
}
