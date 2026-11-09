<?php

namespace Tests\Feature\C001;

use App\Models\{C001LegalDecision, Permission, SecurityAuditLog};
use App\Services\{C001DecisionContext, C001FinalApprovalWriter, LegalFinalizationGate};
use App\Services\Administration\Totp;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Tests\Support\B21\B21TestCase;

/** New owner supersession C001.3B; historical C001.1/2/3A evidence stays untouched. */
class LawyerSelfApprovalPolicyTest extends B21TestCase
{
    use \Tests\Support\C001\BuildsC001AuthorityFixtures { setUp as private setUpAuthority; }
    use \Tests\Support\C001\BuildsC001DecisionFixtures;

    protected function setUp(): void
    {
        $this->setUpAuthority();
        (require database_path('proposals/create_c001_legal_decisions.php'))->up();
    }

    use \Tests\Support\C001\BuildsSelfContributedC001Fixtures;

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
        $audit = SecurityAuditLog::where('event', 'legal.c001_approved')->sole();
        $this->assertTrue($audit->metadata['self_approval']);
        $history = $this->c['case']->activities()->sole();
        $this->assertSame('SELF_FINAL_APPROVAL_WITH_STEP_UP', $history->metadata['decision_mode']);
        $this->assertSame($receipt->id, $this->decide($proof)->id);
        $this->assertDatabaseCount('c001_legal_decisions', 1);
        $this->assertSame(1, SecurityAuditLog::where('event', 'legal.c001_approved')->count());
        $this->assertTrue(LegalFinalizationGate::policyPending());
        $serialized = json_encode([$receipt->getAttributes(), $audit->getAttributes()], JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString($this->secret, $serialized);
    }

    private function deniedDecision(int $proof): void
    {
        try { $this->decide($proof); $this->fail('Invalid self finalization must be denied.'); }
        catch (HttpExceptionInterface $e) { $this->assertContains($e->getStatusCode(), [403, 409]); }
        $this->assertSame('review', $this->c['generated']->fresh()->workflow_status);
        $this->assertDatabaseCount('c001_legal_decisions', 0);
        $this->assertSame(0, SecurityAuditLog::where('event', 'legal.c001_approved')->count());
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
        $this->assertDatabaseCount('c001_legal_proofs',0);$this->assertDatabaseCount('c001_legal_decisions',0);
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
            if(in_array($identity,['level_4','level_5'],true))DB::table('user_roles')->insert(['user_id'=>$c['lawyer']->id,'role_id'=>\App\Models\Role::where('name',$identity)->value('id')]);
        }
        $this->stepResponse()->assertForbidden();
        $this->assertDatabaseCount('c001_legal_proofs',0);$this->assertDatabaseCount('c001_legal_decisions',0);
    }

    public function test_provenance_unavailable_and_non_c001_are_still_denied(): void
    {
        $this->ownVersion();
        $this->c['policy']->ledgers=[];$this->stepResponse()->assertForbidden();
        $this->c['policy']->ledgers[$this->c['generated']->id.':2']=[$this->c['author']->id,$this->c['lawyer']->id];
        $other = \App\Models\DocumentType::create(['code'=>'OTHER-'.bin2hex(random_bytes(5)), 'name_ja'=>'Synthetic ordinary type', 'document_group'=>'C', 'handling_type'=>'collected']);
        $this->c['document']->update(['document_type_id'=>$other->id]);
        $this->stepResponse()->assertForbidden();$this->assertDatabaseCount('c001_legal_proofs',0);
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
        $this->assertDatabaseCount('c001_legal_proofs',1);$this->decide($proof);
        $this->assertDatabaseCount('c001_legal_decisions',1);
    }

    public function test_final_approve_proof_cannot_open_legal_reject_or_the_default_public_approve_route(): void
    {
        $this->ownVersion();
        $this->c['lawyer']->roles()->sole()->permissions()->attach(Permission::where('name', 'task.review')->value('id'));
        $proof = $this->proof();
        $base = '/api/case-files/'.$this->c['case']->id.'/document-collection/'.$this->c['document']->id.'/creation';
        foreach (['/approve', '/c001/reject'] as $route) {
            $this->postJson($base.$route, ['reason' => 'Synthetic reason', 'legal_proof_id' => $proof])
                ->assertStatus(409)->assertJsonPath('code', 'legal_authority_policy_pending');
        }
        $this->assertDatabaseCount('c001_legal_decisions', 0);
        $challenge = DB::table('c001_legal_proofs')->where('id', $proof)->value('challenge_id');
        $this->assertNull(DB::table('authentication_challenges')->where('id', $challenge)->value('used_at'));
        $this->assertSame('review', $this->c['generated']->fresh()->workflow_status);
    }

    public function test_current_creator_attribution_cannot_be_hidden_behind_a_different_authenticated_editor(): void
    {
        $this->prepared(); $c = $this->c;
        $this->flushHeaders(); $this->actingAs($c['author']);
        $c['generated']->update(['created_by' => $c['lawyer']->id, 'updated_by' => $c['author']->id]);
        $c['policy']->ledgers[$c['generated']->id.':2'][] = $c['lawyer']->id;
        $receipt = $this->decide($this->proof());
        $this->assertTrue($receipt->context['self_approval']);
        $this->assertSame('SELF_FINAL_APPROVAL_WITH_STEP_UP', $receipt->context['decision_mode']);
    }
}
