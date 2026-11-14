<?php

namespace Tests\Engine\C0013A;

use App\Models\{Permission,LegalDelegationIssuer,LegalDelegation,LawyerVerification,SecurityAuditLog};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use App\Services\Administration\Totp;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Tests\Support\B21\B21TestCase;

require_once __DIR__.'/EngineBase.php';
require_once __DIR__.'/EngineDecisionFixtures.php';

class C001IssuerEngineHarness extends EngineBase
{
    use EngineDecisionFixtures { denied as protected deniedProof; }
    use \Tests\Support\C001\BuildsSelfContributedC001Fixtures;

    private function deniedOperation(callable $callback, array $statuses=[403,409,422]): void
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
        $this->assertSame(1,LawyerVerification::whereIn('user_id',[$c['lawyer']->id,$c['issuer']->id])->count());
        $this->assertFalse($c['issuer']->fresh()->hasPermission('document.approve_legal'));
        $this->assertFalse($c['issuer']->fresh()->hasPermission('employee.verify_lawyer'));
        $receipt=$this->decide($this->proof());
        $this->assertTrue($receipt->context['self_approval']);
        $this->assertSame($c['issuerAdmission']->id,$receipt->context['issuer_admission_id']);
        $this->assertSame($c['issuer']->id,$receipt->context['issuer_user_id']);
        $this->assertSame($c['verification']->id,$receipt->context['verification_id']);
        $this->assertArrayNotHasKey('issuer_verification_id',$receipt->context);
        $this->assertSame($receipt->id,$this->decide($receipt->proof_id)->id);
        $this->assertSame(1,SecurityAuditLog::where('event','legal.c001_approved')->where('metadata->case_generated_document_id',$this->c['generated']->id)->count());
        $this->assertSame($c['issuerAdmission']->id,SecurityAuditLog::where('event','legal.c001_approved')->where('metadata->case_generated_document_id',$this->c['generated']->id)->sole()->metadata['issuer_admission_id']);
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
        $this->deniedOperation(fn()=>$c['service']->issueDelegation($c['issuer'],$c['lawyer'],$c['generated'],$c['terms']));
        $this->assertEngineCount('legal_delegations',1);
        if($state!=='unauthenticated')$this->assertNull($c['service']->delegation($c['lawyer'],$c['generated']));
    }

    public function test_owner_admission_cannot_be_inferred_from_admin_title_or_self_attestation(): void
    {
        $c=$this->context();$fakeOwner=$this->fixtureUser('fake-owner',['case.view','employee.manage_roles']);
        $fakeOwner->update(['role'=>'admin']);$input=$c['issuerTerms'];unset($input['case_file_id']);
        $this->actingAs($fakeOwner);
        $this->deniedOperation(fn()=>$c['service']->admitIssuer($fakeOwner,$c['issuer'],$c['case'],$input),[409]);
        $this->actingAs($c['issuer']);
        $this->deniedOperation(fn()=>$c['service']->admitIssuer($c['issuer'],$c['issuer'],$c['case'],$input),[403]);
        $this->assertEngineCount('legal_delegation_issuers',1);
    }

    public static function selfDelegators(): array {return [['manager'],['lawyer']];}
    #[DataProvider('selfDelegators')]
    public function test_same_user_and_same_employee_cannot_issue_own_legal_authority(string $kind): void
    {
        $c=$this->context();$actor=$kind==='manager'?$c['issuer']:$c['lawyer'];
        $actor->roles()->sole()->permissions()->syncWithoutDetaching([Permission::where('name','document.delegate_legal')->value('id'),Permission::where('name','document.approve_legal')->value('id')]);
        $this->actingAs($actor);
        $this->deniedOperation(fn()=>$c['service']->issueDelegation($actor,$actor,$c['generated'],$c['terms']),[403]);
        $this->assertEngineCount('legal_delegations',1);
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
        $this->deniedOperation(fn()=>$c['service']->issueDelegation($c['issuer'],$c['lawyer'],$c['generated'],$terms),[422]);
        $this->assertEngineCount('legal_delegations',1);
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
        $this->deniedOperation(fn()=>$this->decide($proof),[403]);
        $this->assertEngineCount('c001_legal_decisions',0);$this->assertSame('review',$c['generated']->fresh()->workflow_status);
        $challenge=DB::table('c001_legal_proofs')->where('id',$proof)->value('challenge_id');
        $this->assertNull(DB::table('authentication_challenges')->where('id',$challenge)->value('used_at'));
    }

    public function test_non_lawyer_issuer_with_real_totp_session_still_cannot_final_approve():void
    {
        $this->prepared();$this->c['lawyer']=$this->c['issuer'];$this->enrollAndLogin();
        $this->stepResponse()->assertForbidden();$this->assertEngineCount('c001_legal_proofs',0);
        $this->assertEngineCount('c001_legal_decisions',0);
        $this->assertNull($this->c['service']->verification($this->c['issuer']));
    }

    public static function issuerAuditOperations():array{return [['admit'],['revoke_admission'],['delegate'],['revoke_delegation']];}
    #[DataProvider('issuerAuditOperations')]
    public function test_required_issuer_audit_failure_rolls_back_all_mutation(string $operation):void
    {
        $c=$this->context();$before=[LegalDelegationIssuer::count(),LegalDelegation::count(),SecurityAuditLog::count()];
        DB::unprepared("CREATE TRIGGER issuer_audit_failure BEFORE INSERT ON security_audit_logs FOR EACH ROW BEGIN IF NEW.event LIKE 'legal.%' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic issuer audit failure'; END IF; END");
        $input=$c['issuerTerms'];unset($input['case_file_id']);
        try{
            $this->authorityActor(in_array($operation,['admit','revoke_admission'],true)?$c['admitter']:$c['issuer'],function()use($operation,$c,$input){
                match($operation){'admit'=>$c['service']->admitIssuer($c['admitter'],$c['issuer'],$c['case'],$input),
                    'revoke_admission'=>$c['service']->revokeIssuerAdmission($c['admitter'],$c['issuerAdmission']),
                    'delegate'=>$c['service']->issueDelegation($c['issuer'],$c['lawyer'],$c['generated'],$c['terms']),
                    'revoke_delegation'=>$c['service']->revokeDelegation($c['issuer'],$c['grant'])};
            });$this->fail('Required issuer audit failure must propagate.');
        }catch(\Illuminate\Database\QueryException $e){$this->assertSame('45000',$e->errorInfo[0]);$this->assertSame($before,[LegalDelegationIssuer::count(),LegalDelegation::count(),SecurityAuditLog::count()]);}finally{DB::unprepared('DROP TRIGGER issuer_audit_failure');}
        $this->assertNull($c['issuerAdmission']->fresh()->revoked_at);$this->assertNull($c['grant']->fresh()->revoked_at);
    }
    public static function engineRaces(): array { return [['same_key_same_proof'],['different_keys'],['same_proof_race']]; }

    #[DataProvider('engineRaces')]
    public function test_true_independent_process_concurrency(string $scenario): void
    {
        $this->ownVersion(); $firstProof=$this->proof(); $firstKey=$this->key; $firstToken=$this->token;
        $secondProof=$firstProof; $secondKey=$firstKey; $secondToken=$firstToken;
        if($scenario==='different_keys'){
            // Second real B24 login, never forge a verified bearer or copy a real secret.
            $this->flushHeaders();$this->app['auth']->forgetGuards();
            $challenge=$this->postJson('/api/login',['email'=>$this->c['lawyer']->email,'password'=>self::SYNTHETIC_PASSWORD])->assertStatus(202)->json('challenge');
            $this->travel(31)->seconds();
            $secondToken=$this->postJson('/api/mfa/login',['challenge'=>$challenge,'otp'=>app(Totp::class)->code($this->secret,now()->timestamp)])->assertOk()->json('token');
            $this->token=$secondToken;$this->key='engine-'.bin2hex(random_bytes(12));
            $secondKey=$this->key;$secondProof=$this->proof();
        }
        $root=dirname(getenv('C001_ENGINE_RUN_FILE'));$files=[];$processes=[];
        foreach(['A'=>[$firstKey,$firstProof,$firstToken],'B'=>[$secondKey,$secondProof,$secondToken]] as $role=>[$key,$proof,$token]){
            $file=$root.'/race-'.$this->fixtureLabel.'-'.$role.'.enc';
            // Shared barrier base, distinct encrypted synthetic sessions. Nothing secret in process arguments/output.
            $state=['now'=>now()->toDateTimeString(),'actor'=>$this->c['lawyer']->id,'token'=>$token,
                'case'=>$this->c['case']->id,'document'=>$this->c['document']->id,'generated'=>$this->c['generated']->id,
                'key'=>$key,'proof'=>$proof,'bytes'=>$this->bytes,
                'policy'=>['issuerAdmissions'=>$this->c['policy']->issuerAdmissions,'verifications'=>$this->c['policy']->verifications,'delegations'=>$this->c['policy']->delegations,'ledgers'=>$this->c['policy']->ledgers]];
            $state['barrier']=$root.'/race-'.$this->fixtureLabel;
            file_put_contents($file,\Illuminate\Support\Facades\Crypt::encryptString(json_encode($state,JSON_THROW_ON_ERROR)));$files[$role]=$file;
        }
        foreach($files as $role=>$file){
            $process=proc_open([PHP_BINARY,__DIR__.'/concurrent-worker.php',$file,$role],
                [0=>['pipe','r'],1=>['file',$file.'.result.json','w'],2=>['file',$file.'.stderr','w']],$pipes,base_path(),null,['bypass_shell'=>true,'create_new_console'=>false]);
            $this->assertIsResource($process);fclose($pipes[0]);$processes[$role]=$process;
        }
        $results=[];
        foreach($processes as $role=>$process){
            $until=microtime(true)+40;
            do{$status=proc_get_status($process);if(!$status['running'])break;usleep(20000);}while(microtime(true)<$until);
            if($status['running']){proc_terminate($process);$this->fail('Own synthetic worker exceeded bounded wait.');}
            proc_close($process);
            $results[$role]=json_decode(file_get_contents($files[$role].'.result.json'),true,flags:JSON_THROW_ON_ERROR);
        }
        file_put_contents($root.'/race-'.$this->fixtureLabel.'-evidence.json',json_encode(['scenario'=>$scenario,'results'=>$results],JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR));
        $this->assertNotSame($results['A']['connection_id'],$results['B']['connection_id']);
        $this->assertSame('receipt',$results['A']['category']);
        $this->assertSame($scenario==='different_keys'?'http_409':'receipt',$results['B']['category']);
        $this->assertLessThan($results['A']['finished_at'],$results['B']['parent_lock_requested_at']);
        $this->assertGreaterThanOrEqual($results['A']['parent_lock_acquired_at'],$results['B']['parent_lock_requested_at']);
        $this->assertGreaterThan(200,collect($results['B']['lock_trace'])->firstWhere('table','case_files')['duration_ms']);
        if($scenario!=='different_keys')$this->assertSame($results['A']['receipt_id'],$results['B']['receipt_id']);
        $this->assertSame(1,DB::table('c001_legal_decisions')->where('case_generated_document_id',$this->c['generated']->id)->count());
        $this->assertSame(1,SecurityAuditLog::where('event','legal.c001_approved')->where('metadata->case_generated_document_id',$this->c['generated']->id)->count());
        $challengeIds=DB::table('c001_legal_proofs')->whereIn('id',array_unique([$firstProof,$secondProof]))->pluck('challenge_id');
        $this->assertSame(1,DB::table('authentication_challenges')->whereIn('id',$challengeIds)->whereNotNull('used_at')->count());
        $this->assertSame('approved',$this->c['generated']->fresh()->workflow_status);
        Http::assertNothingSent();
    }


    public function test_mariadb_issuer_schema_foreign_keys_indexes_and_immutable_facts():void
    {
        $c=$this->context();$db=DB::connection()->getDatabaseName();
        $columns=DB::select('SELECT COLUMN_NAME,IS_NULLABLE,DATA_TYPE,COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=?',[$db,'legal_delegations']);
        $this->assertSame('YES',collect($columns)->firstWhere('COLUMN_NAME','issuer_verification_id')->IS_NULLABLE);
        $this->assertSame('YES',collect($columns)->firstWhere('COLUMN_NAME','issuer_admission_id')->IS_NULLABLE);
        $fks=DB::select('SELECT COLUMN_NAME,REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND REFERENCED_TABLE_NAME IS NOT NULL',[$db,'legal_delegations']);
        $this->assertSame('legal_delegation_issuers',collect($fks)->firstWhere('COLUMN_NAME','issuer_admission_id')->REFERENCED_TABLE_NAME);
        $indexes=DB::select('SELECT COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND INDEX_NAME=? ORDER BY SEQ_IN_INDEX',[$db,'legal_delegation_issuers','c001_issuer_scope_validity']);
        $this->assertSame(['user_id','employee_id','case_file_id','scope','revoked_at','expires_at'],array_column($indexes,'COLUMN_NAME'));
        $triggers=DB::select('SELECT TRIGGER_NAME,ACTION_STATEMENT FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=? AND TRIGGER_NAME IN (?,?,?)',[$db,'c001_issuer_facts_immutable','c001_issuer_retained','c001_delegation_requires_admission']);
        $this->assertCount(3,$triggers);
        foreach(['update','delete'] as $operation){
            try{if($operation==='update')DB::table('legal_delegation_issuers')->where('id',$c['issuerAdmission']->id)->update(['evidence_digest'=>str_repeat('a',64)]);
                else DB::table('legal_delegation_issuers')->where('id',$c['issuerAdmission']->id)->delete();$this->fail('Immutable admission facts must remain protected.');}
            catch(\Illuminate\Database\QueryException $e){$this->assertSame('45000',$e->errorInfo[0]);}
        }
        $row=$c['grant']->getAttributes();unset($row['id']);$row['issuer_admission_id']=null;
        try{DB::table('legal_delegations')->insert($row);$this->fail('New delegation cannot use a legacy-only issuer reference.');}
        catch(\Illuminate\Database\QueryException $e){$this->assertSame('45000',$e->errorInfo[0]);}
        $row['issuer_admission_id']=DB::table('legal_delegation_issuers')->max('id')+10000;
        try{DB::table('legal_delegations')->insert($row);$this->fail('New issuer FK must be enforced.');}
        catch(\Illuminate\Database\QueryException $e){$this->assertSame(1452,$e->errorInfo[1]);}
        $this->authorityActor($c['admitter'],fn()=>$c['service']->revokeIssuerAdmission($c['admitter'],$c['issuerAdmission']));
        try{DB::table('legal_delegation_issuers')->where('id',$c['issuerAdmission']->id)->update(['revoked_at'=>null]);$this->fail('Revocation cannot be undone.');}
        catch(\Illuminate\Database\QueryException $e){$this->assertSame('45000',$e->errorInfo[0]);}
        file_put_contents(dirname(getenv('C001_ENGINE_RUN_FILE')).'/c0013c-schema-metadata.json',json_encode(compact('columns','fks','indexes','triggers'),JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR));
    }
}
