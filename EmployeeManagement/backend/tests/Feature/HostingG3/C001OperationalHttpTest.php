<?php

namespace Tests\Feature\HostingG3;

use App\Services\{LocalC001Installation, SecurityAuditLogger};
use Illuminate\Support\Facades\{DB, Http};
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;

/** Reuse the existing fully synthetic small-office fixtures. Focus filter test_http_ excludes inherited cases. */
class C001OperationalHttpTest extends \Tests\Feature\C001\SmallOfficeAuthorityTest
{
    private function installed(): void
    {
        $this->app->instance(LocalC001Installation::class, new class extends LocalC001Installation {
            public function enabled(): bool { return true; } // Test container only; no HTTP/env switch.
        });
    }

    private function endpoint(): string
    {
        return '/api/case-files/'.$this->c['case']->id.'/document-collection/'.$this->c['document']->id.'/creation/c001/final-decisions';
    }

    private function payload(int $proof): array { return ['generated_document_id'=>$this->c['generated']->id,'request_key'=>$this->key,'proof_id'=>$proof]; }

    public function test_http_exact_totp_decision_commits_once_and_returns_server_capability(): void
    {
        $this->prepared(true); $this->installed(); $proof=$this->proof();
        $response=$this->postJson($this->endpoint(),$this->payload($proof))->assertOk()->assertJsonPath('document.workflow_status','approved');
        $receipt=$response->json('legal_decision.id');$this->assertIsInt($receipt);
        $this->postJson($this->endpoint(),$this->payload($proof))->assertOk()->assertJsonPath('legal_decision.id',$receipt);
        $this->assertDatabaseCount('c001_legal_decisions',1);
        $this->assertSame(1,DB::table('security_audit_logs')->where('event','legal.c001_approved')->count());
        $this->assertSame(1,DB::table('case_activities')->where('metadata->event','c001.approved')->count());
        $this->assertFalse($response->json('permissions.c001_final_approval.can_request'));
        Http::assertNothingSent();
    }

    public static function invalidHttpDecisions(): array { return [['missing_proof'],['foreign_version'],['wrong_key'],['expired'],['revoked'],['client_claims'],['pending_installation']]; }

    #[DataProvider('invalidHttpDecisions')]
    public function test_http_invalid_or_uninstalled_finalization_never_changes_state(string $kind): void
    {
        $this->prepared(true);$this->installed();$proof=$this->proof();$payload=$this->payload($proof);
        $expected=match($kind){'missing_proof','expired','revoked'=>403,'foreign_version'=>404,'client_claims'=>422,default=>409};
        if($kind==='missing_proof')$payload['proof_id']=999999;
        if($kind==='foreign_version') {
            $foreign=$this->document($this->matter())->generatedDocuments()->create([
                'document_generation_template_id'=>$this->c['generated']->document_generation_template_id,
                'version'=>1,'workflow_status'=>'review','draft_data'=>[],'created_by'=>$this->c['lawyer']->id,'updated_by'=>$this->c['lawyer']->id]);
            $payload['generated_document_id']=$foreign->id;
        }
        if($kind==='wrong_key')$payload['request_key']='foreign-request-key-00001';
        if($kind==='expired')$this->travel(6)->minutes();
        if($kind==='revoked')DB::table('role_permissions')->where('role_id',$this->c['lawyer']->roles()->sole()->id)
            ->where('permission_id',\App\Models\Permission::where('name','document.approve_legal')->value('id'))->delete();
        if($kind==='client_claims')$payload['self_approval']=false;
        if($kind==='pending_installation')$this->app->instance(LocalC001Installation::class,new LocalC001Installation);
        $this->postJson($this->endpoint(),$payload)->assertStatus($expected);
        $this->assertDatabaseCount('c001_legal_decisions',0);$this->assertSame('review',$this->c['generated']->fresh()->workflow_status);
        $this->assertNull(DB::table('authentication_challenges')->where('id',DB::table('c001_legal_proofs')->where('id',$proof)->value('challenge_id'))->value('used_at'));
    }

    public function test_http_manager_has_no_finalization_capability_and_cannot_submit_even_a_lawyer_proof(): void
    {
        $this->prepared(true);$this->installed();$proof=$this->proof();
        $manager=$this->reader('manager',['case.update','task.review']);$this->member($manager,$this->c['case'],['read','write','confidential']);
        $this->flushHeaders();$this->app['auth']->forgetGuards();$this->actingAs($manager);
        $this->postJson($this->endpoint(),$this->payload($proof))->assertForbidden();
        $base=dirname($this->endpoint(),2);
        $this->getJson($base)->assertOk()->assertJsonPath('permissions.c001_final_approval',null);
        $this->assertDatabaseCount('c001_legal_decisions',0);
    }

    public function test_http_required_audit_failure_rolls_back_the_whole_decision(): void
    {
        $this->prepared(true);$this->installed();$proof=$this->proof();
        $logger=Mockery::mock(SecurityAuditLogger::class)->makePartial();$logger->shouldReceive('recordLegalAuthority')->andThrow(new \RuntimeException('Synthetic audit failure'));
        $this->app->instance(SecurityAuditLogger::class,$logger);
        $this->postJson($this->endpoint(),$this->payload($proof))->assertStatus(500);
        $this->assertDatabaseCount('c001_legal_decisions',0);$this->assertSame('review',$this->c['generated']->fresh()->workflow_status);
        $this->assertNull(DB::table('authentication_challenges')->where('id',DB::table('c001_legal_proofs')->where('id',$proof)->value('challenge_id'))->value('used_at'));
    }

    public function test_http_legal_grant_requires_user_driven_enrollment_without_fabricated_state(): void
    {
        $this->installed();$lawyer=$this->fixtureUser('new-lawyer',['document.approve_legal']);
        $this->postJson('/api/login',['email'=>$lawyer->email,'password'=>self::SYNTHETIC_PASSWORD])
            ->assertStatus(202)->assertJsonPath('purpose','login_enroll')->assertJsonMissingPath('token');
        $this->assertDatabaseCount('account_mfa',0); // Challenge only; no secret/code enrolled on the user's behalf.
        $this->assertFalse((new LocalC001Installation)->enabled()); // SQLite/testing cannot admit a real installation.
    }
}
