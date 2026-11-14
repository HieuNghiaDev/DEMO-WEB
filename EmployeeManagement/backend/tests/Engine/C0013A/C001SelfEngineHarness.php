<?php

namespace Tests\Engine\C0013A;

use App\Models\{C001LegalDecision, Permission, SecurityAuditLog};
use App\Services\{C001DecisionContext, C001FinalApprovalWriter, LegalFinalizationGate};
use App\Services\Administration\Totp;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Database\QueryException;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Tests\Support\B21\B21TestCase;

/** New owner supersession C001.3B; historical C001.1/2/3A evidence stays untouched. */
require_once __DIR__.'/EngineBase.php';
require_once __DIR__.'/EngineDecisionFixtures.php';

class C001SelfEngineHarness extends EngineBase
{
    use EngineDecisionFixtures;

    use \Tests\Support\C001\BuildsSelfContributedC001Fixtures;

    protected function setUp(): void
    {
        parent::setUp();
        // Remove only this harness's confirmed leftover fault injector after recording its metadata.
        $injected = DB::selectOne('SELECT EVENT_OBJECT_TABLE, ACTION_STATEMENT FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=? AND TRIGGER_NAME=?',
            [DB::connection()->getDatabaseName(), 'c001_test_write_failure']);
        if ($injected) {
            if (! in_array($injected->EVENT_OBJECT_TABLE, ['security_audit_logs', 'c001_legal_decisions', 'case_documents', 'authentication_challenges'], true)
                || ! str_contains($injected->ACTION_STATEMENT, 'synthetic required write failure')) throw new \LogicException('Unknown trigger; no cleanup permitted.');
            file_put_contents(dirname(getenv('C001_ENGINE_RUN_FILE')).'/c0013b-leftover-fault-injector.json', json_encode($injected, JSON_THROW_ON_ERROR));
            DB::unprepared('DROP TRIGGER c001_test_write_failure');
        }
    }

    public static function contributions(): array
    { return [['creator'], ['editor'], ['submitter'], ['past_contributor']]; }

    #[DataProvider('contributions')]
    public function test_verified_lawyer_self_finalizes_only_with_fresh_totp_and_truthful_receipt(string $contribution): void
    {
        $this->ownVersion($contribution);
        $head = DB::table('c001_version_provenance')->where('case_generated_document_id', $this->c['generated']->id)->orderByDesc('sequence')->value('entry_hash');
        $proof = $this->proof(); $receipt = $this->decide($proof);
        $this->assertTrue($receipt->context['self_approval']);
        $this->assertTrue($receipt->context['step_up_required']);
        $this->assertSame('TOTP', $receipt->context['step_up_method']);
        $this->assertSame('SELF_FINAL_APPROVAL_WITH_STEP_UP', $receipt->context['decision_mode']);
        $this->assertSame($head, $receipt->context['provenance_head']);
        $this->assertSame($head, DB::table('c001_version_provenance')->where('case_generated_document_id', $this->c['generated']->id)->orderByDesc('sequence')->value('entry_hash'));
        $audit = SecurityAuditLog::where('event', 'legal.c001_approved')->where('metadata->case_generated_document_id',$this->c['generated']->id)->sole();
        $this->assertTrue($audit->metadata['self_approval']);
        $history = $this->c['case']->activities()->sole();
        $this->assertSame('SELF_FINAL_APPROVAL_WITH_STEP_UP', $history->metadata['decision_mode']);
        $this->assertSame($receipt->id, $this->decide($proof)->id);
        $this->assertEngineCount('c001_legal_decisions', 1);
        $this->assertSame(1, SecurityAuditLog::where('event', 'legal.c001_approved')->where('metadata->case_generated_document_id',$this->c['generated']->id)->count());
        $this->assertTrue(LegalFinalizationGate::policyPending());
        $serialized = json_encode([$receipt->getAttributes(), $audit->getAttributes()], JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString($this->secret, $serialized);
    }

    private function deniedDecision(int $proof): void
    {
        try { $this->decide($proof); $this->fail('Invalid self finalization must be denied.'); }
        catch (HttpExceptionInterface $e) { $this->assertContains($e->getStatusCode(), [403, 409]); }
        $this->assertSame('review', $this->c['generated']->fresh()->workflow_status);
        $this->assertEngineCount('c001_legal_decisions', 0);
        $this->assertSame(0, SecurityAuditLog::where('event', 'legal.c001_approved')->where('metadata->case_generated_document_id',$this->c['generated']->id)->count());
    }

    public function test_self_approval_without_totp_proof_is_denied(): void
    { $this->ownVersion(); $this->deniedDecision(999999); }

    public function test_non_self_c001_also_requires_exact_legal_totp_and_records_false_flag(): void
    {
        $this->prepared(); $this->deniedDecision(999999);
        $receipt = $this->decide($this->proof());
        $this->assertFalse($receipt->context['self_approval']);
        $this->assertTrue($receipt->context['step_up_required']);
        $this->assertSame('TOTP', $receipt->context['step_up_method']);
    }

    public static function invalidSelfProofs(): array { return [['expired'], ['consumed'], ['different_request'], ['workbook'], ['pdf'], ['snapshot'], ['template']]; }

    #[DataProvider('invalidSelfProofs')]
    public function test_self_approval_never_bypasses_proof_or_content_binding(string $state): void
    {
        $this->ownVersion();$proof=$this->proof();
        $challenge=DB::table('c001_legal_proofs')->where('id',$proof)->value('challenge_id');
        switch($state){
            case 'expired':$this->travel(300)->seconds();break;
            case 'consumed':DB::table('authentication_challenges')->where('id',$challenge)->update(['used_at'=>now()]);break;
            case 'different_request':$this->key='different-self-request-00001';break;
            case 'workbook':$this->bytes['workbook']='CHANGED SYNTHETIC WORKBOOK';break;
            case 'pdf':$this->bytes['pdf']='CHANGED SYNTHETIC PDF';break;
            case 'snapshot':DB::table('case_generated_documents')->where('id',$this->c['generated']->id)->update(['draft_data'=>'{"changed":true}']);break;
            case 'template':DB::table('document_generation_templates')->where('id',$this->c['generated']->document_generation_template_id)->update(['template_body'=>'changed']);break;
        }
        $this->deniedDecision($proof);
        if($state!=='consumed')$this->assertNull(DB::table('authentication_challenges')->where('id',$challenge)->value('used_at'));
    }

    public static function invalidOtps(): array { return [['short'], ['long'], ['letters'], ['wrong_six']]; }

    #[DataProvider('invalidOtps')]
    public function test_exact_six_digit_authenticator_validation_is_required(string $kind): void
    {
        $this->ownVersion();$this->travel(31)->seconds();
        $totp=app(Totp::class);$otp=match($kind){'short'=>'12345','long'=>'1234567','letters'=>'abcdef',default=>'000000'};
        if($kind==='wrong_six'){
            $last=(int)DB::table('account_mfa')->where('user_id',$this->c['lawyer']->id)->value('last_step');
            while($totp->matchingStep($this->secret,$otp,now()->timestamp,$last)!==null)$otp=str_pad((string)((int)$otp+1),6,'0',STR_PAD_LEFT);
        }
        $this->postJson('/api/mfa/step-up',['password'=>self::SYNTHETIC_PASSWORD,'otp'=>$otp,'action'=>C001DecisionContext::ACTION,
            'scope'=>['generated_document_id'=>$this->c['generated']->id,'request_key'=>$this->key]])->assertUnprocessable();
        $this->assertEngineCount('c001_legal_proofs',0);$this->assertEngineCount('c001_legal_decisions',0);
    }

    public static function nonAuthorities(): array
    { return array_map(fn($s)=>[$s],['unverified','expired_verification','revoked_verification','missing_legal_permission','manager','admin','level_4','level_5','staff','developer']); }

    #[DataProvider('nonAuthorities')]
    public function test_valid_totp_is_never_lawyer_authority(string $identity): void
    {
        $this->ownVersion();$c=$this->c;
        if($identity==='unverified')$c['policy']->verifications=[];
        elseif($identity==='expired_verification')$c['verification']->forceFill(['expires_at'=>now()->subSecond()])->save();
        elseif($identity==='revoked_verification')$c['service']->revokeVerification($c['verifier'],$c['verification']);
        elseif($identity==='missing_legal_permission')$c['lawyer']->roles()->sole()->permissions()->detach(Permission::where('name','document.approve_legal')->value('id'));
        else{
            $c['policy']->verifications=[];
            // Role/title fixtures never synthesize legal authority; keep the real MFA session intact.
            $role=\App\Models\Role::firstOrCreate(['name'=>'synthetic-'.$identity],['display_name'=>'Fictional '.$identity]);
            $permissions=Permission::whereIn('name',['case.view','case.update','task.review','task.manage'])->pluck('id');
            foreach($permissions as $permission)DB::table('role_permissions')->insertOrIgnore(['role_id'=>$role->id,'permission_id'=>$permission]);
            DB::table('user_roles')->where('user_id',$c['lawyer']->id)->delete();
            DB::table('user_roles')->insert(['user_id'=>$c['lawyer']->id,'role_id'=>$role->id]);
            if($identity==='admin')$c['lawyer']->update(['role'=>'admin']);
            if(in_array($identity,['level_4','level_5'],true))DB::table('user_roles')->insert(['user_id'=>$c['lawyer']->id,'role_id'=>\App\Models\Role::firstOrCreate(['name'=>$identity],['display_name'=>'Fictional legacy metadata'])->id]);
        }
        $this->stepResponse()->assertForbidden();
        $this->assertEngineCount('c001_legal_proofs',0);$this->assertEngineCount('c001_legal_decisions',0);
    }

    public function test_provenance_unavailable_and_non_c001_are_still_denied(): void
    {
        $this->ownVersion();
        $this->c['policy']->ledgers=[];$this->stepResponse()->assertForbidden();
        $this->c['policy']->ledgers[$this->c['generated']->id.':2']=[$this->c['author']->id,$this->c['lawyer']->id];
        $other = \App\Models\DocumentType::create(['code'=>'OTHER-'.bin2hex(random_bytes(5)), 'name_ja'=>'Synthetic ordinary type', 'document_group'=>'C', 'handling_type'=>'collected']);
        $this->c['document']->update(['document_type_id'=>$other->id]);
        $this->stepResponse()->assertForbidden();$this->assertEngineCount('c001_legal_proofs',0);
    }

    public function test_client_self_flag_is_rejected_and_totp_cannot_be_replayed(): void
    {
        $this->ownVersion();$this->travel(31)->seconds();
        $data=['password'=>self::SYNTHETIC_PASSWORD,'otp'=>app(Totp::class)->code($this->secret,now()->timestamp),'action'=>C001DecisionContext::ACTION,
            'scope'=>['generated_document_id'=>$this->c['generated']->id,'request_key'=>$this->key,'self_approval'=>true]];
        $this->postJson('/api/mfa/step-up',$data)->assertUnprocessable();
        unset($data['scope']['self_approval']);
        $proof=$this->postJson('/api/mfa/step-up',$data)->assertOk()->json('legal_proof_id');
        $this->postJson('/api/mfa/step-up',$data)->assertUnprocessable();
        $this->assertEngineCount('c001_legal_proofs',1);$this->decide($proof);
        $this->assertEngineCount('c001_legal_decisions',1);
    }
    public static function engineRaces(): array { return [['same_key_same_proof'],['different_keys'],['same_proof_race']]; }

    protected function raceAuthorityState(): array
    {
        return ['mode' => 'enterprise', 'issuerAdmissions' => $this->c['policy']->issuerAdmissions,
            'verifications' => $this->c['policy']->verifications, 'delegations' => $this->c['policy']->delegations,
            'ledgers' => $this->c['policy']->ledgers];
    }

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
                'policy'=>$this->raceAuthorityState()];
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

    public static function failingWrites(): array { return [['audit'], ['receipt'], ['workflow'], ['proof']]; }

    #[DataProvider('failingWrites')]
    public function test_any_required_write_failure_rolls_back_proof_receipt_and_workflow(string $failure): void
    {
        $this->ownVersion('submitter'); $proof = $this->proof(); $before = $this->businessState();
        $target = match ($failure) { 'audit' => 'security_audit_logs', 'receipt' => 'c001_legal_decisions', 'workflow' => 'case_documents', 'proof' => 'authentication_challenges' };
        $operation = in_array($failure,['workflow','proof'],true) ? 'UPDATE' : 'INSERT';
        $when = $failure === 'audit' ? "IF NEW.event = 'legal.c001_approved' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic required write failure'; END IF;" : "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic required write failure';";
        DB::unprepared("CREATE TRIGGER c001_test_write_failure BEFORE {$operation} ON {$target} FOR EACH ROW BEGIN {$when} END");
        try {
            try { $this->decide($proof); $this->fail('Required failure must propagate.'); }
            catch (QueryException $e) {
                $this->assertSame('45000', $e->errorInfo[0]);
                $this->assertSame($before, $this->businessState());
            }
        } finally { DB::unprepared('DROP TRIGGER c001_test_write_failure'); }
        $receipt=$this->decide($proof);$this->assertSame('final_approve',$receipt->decision_type);$this->assertTrue($receipt->context['self_approval']);
    }

    public function test_storage_uniqueness_enforces_each_receipt_identity_independently(): void
    {
        $this->ownVersion();$receipt=$this->decide($this->proof());
        $otherGenerated=$this->c['document']->generatedDocuments()->where('version',1)->value('id');
        // Independent synthetic storage rows, not forged professional evidence or an approval path.
        $proofRow=DB::table('c001_legal_proofs')->where('id',$receipt->proof_id)->first();$copy=(array)$proofRow;unset($copy['id']);
        $copy['challenge_id']=DB::table('authentication_challenges')->max('id')+10000;
        $otherProof=DB::table('c001_legal_proofs')->insertGetId($copy);
        foreach(['request','generated','proof'] as $unique){
            $attrs=$receipt->getAttributes();unset($attrs['id']);
            $attrs['request_key']=$unique==='request'?$receipt->request_key:'synthetic-unique-'.bin2hex(random_bytes(10));
            $attrs['case_generated_document_id']=$unique==='generated'?$receipt->case_generated_document_id:$otherGenerated;
            $attrs['proof_id']=$unique==='proof'?$receipt->proof_id:$otherProof;
            try{DB::table('c001_legal_decisions')->insert($attrs);$this->fail('Each receipt uniqueness constraint must reject a duplicate: '.$unique);}
            catch(QueryException $e){$this->assertSame('23000',$e->errorInfo[0]);$this->assertSame(1062,$e->errorInfo[1]);}
        }
        $this->assertSame(1,DB::table('c001_legal_decisions')->where('case_document_id',$this->c['document']->id)->count());
        // An actual MariaDB FK rejects orphan provenance, without disabling foreign_key_checks.
        $row=(array)DB::table('c001_version_provenance')->where('case_generated_document_id',$this->c['generated']->id)->first();unset($row['id']);
        $row['case_generated_document_id']=DB::table('case_generated_documents')->max('id')+10000;
        try{DB::table('c001_version_provenance')->insert($row);$this->fail('Orphan provenance must fail.');}
        catch(QueryException $e){$this->assertSame('23000',$e->errorInfo[0]);$this->assertSame(1452,$e->errorInfo[1]);}
    }

}
