<?php

namespace Tests\Engine\Interpretation;

require_once __DIR__.'/context.php';

use App\Models\{CaseFile, InterpretationRequest, Permission, User};
use App\Services\CaseWorkspaceAuditService;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\TestCase;

/** Full Laravel HTTP kernel + Sanctum + real isolated MariaDB, no source database. */
final class HttpIntegrationTest extends TestCase
{
    private $app;
    private string $root;
    private int $caseId;
    private string $token;

    protected function setUp(): void
    {
        [$this->app,$this->root]=\interpretationEngineContext();
        $this->caseId=CaseFile::where('reference_number','INT-RACE-B')->sole()->id;
        $this->token=User::where('login_id','STG_MANAGER')->sole()->createToken('synthetic-engine-regression')->plainTextToken;
    }
    protected function tearDown(): void { \Illuminate\Foundation\Bootstrap\HandleExceptions::flushState(); }
    private function url(string $suffix='',?int $case=null): string { return '/api/case-files/'.($case??$this->caseId).'/interpretation-requests'.$suffix; }
    private function http(string $method,string $url,array $body=[],?string $token=null): TestResponse
    {
        $this->app['auth']->forgetGuards();
        $request=Request::create($url,$method,[],[],[],['HTTP_ACCEPT'=>'application/json','CONTENT_TYPE'=>'application/json',
            'HTTP_AUTHORIZATION'=>'Bearer '.($token??$this->token),'REMOTE_ADDR'=>'127.0.0.1'],json_encode($body,JSON_THROW_ON_ERROR));
        $kernel=$this->app->make(Kernel::class); $response=$kernel->handle($request); $kernel->terminate($request,$response);
        return TestResponse::fromBaseResponse($response);
    }
    private function payload(array $extra=[]): array
    {
        return array_replace(['language'=>'SYNTHETIC ENGINE','work_type'=>'meeting','mode'=>'online','content'=>'Synthetic API lifecycle',
            'starts_at'=>'2026-12-21T09:00:00+09:00','ends_at'=>'2026-12-21T10:00:00+09:00','request_key'=>(string)Str::uuid()],$extra);
    }
    public function test_new_catalog_does_not_expand_existing_role_grant_ceiling(): void
    {
        foreach (['view','create','update','assign','transition','cancel','view_costs'] as $action) {
            $permission='interpretation.'.$action;
            self::assertTrue(\App\Services\Administration\AdminCapabilities::known($permission));
            self::assertFalse(app(\App\Policies\RolePolicy::class)->withinGrantableCeiling([$permission]));
        }
    }
    public function test_authentication_and_private_directory_projection(): void
    {
        $this->http('GET',$this->url(),[], 'not-a-valid-token')->assertUnauthorized();
        $passwords=json_decode(file_get_contents($this->root.'/synthetic-credential-handover.json'),true);
        $login=$this->http('POST','/api/login',['email'=>'stg_assigned_staff@example.test','password'=>$passwords['STG_ASSIGNED_STAFF']])->assertOk();
        $staffToken=$login->json('token');
        $this->http('GET','/api/me',[],$staffToken)->assertOk();
        $this->http('GET',$this->url(),[],$staffToken)->assertOk()->assertJsonPath('capabilities.can_create',false);
        $this->http('POST',$this->url(),$this->payload(),$staffToken)->assertForbidden();
        $this->http('GET',$this->url('/options'))->assertOk()->assertJsonMissingPath('employees.0.phone')->assertJsonMissingPath('employees.0.date_of_birth')->assertJsonMissingPath('employees.0.nationality');
    }
    public function test_internal_external_assignment_reschedule_states_and_persistent_history(): void
    {
        $external=$this->http('POST',$this->url('/interpreters'),['kind'=>'external','display_name'=>'SYNTHETIC HTTP external','registration_key'=>(string)Str::uuid()])->assertCreated()->json('interpreter.id');
        $employee=User::where('login_id','STG_ASSIGNED_STAFF')->sole()->employee_id;
        $internal=$this->http('POST',$this->url('/interpreters'),['kind'=>'employee','employee_id'=>$employee,'registration_key'=>(string)Str::uuid()])->assertCreated()->json('interpreter.id');
        $item=$this->http('POST',$this->url(),$this->payload(['interpreter_id'=>$external]))->assertCreated()->assertJsonPath('item.starts_at','2026-12-21T00:00:00.000000Z')->json('item');
        $id=$item['id'];
        $this->http('PATCH',$this->url('/'.$id.'/assignment'),['revision'=>1,'interpreter_id'=>$internal])->assertOk()->assertJsonPath('item.interpreter.kind','employee');
        $data=$this->payload(['starts_at'=>'2026-12-21T10:00:00+09:00','ends_at'=>'2026-12-21T11:00:00+09:00','revision'=>2]);unset($data['request_key']);
        $this->http('PATCH',$this->url('/'.$id),$data)->assertOk()->assertJsonPath('item.revision',3);
        $this->http('PATCH',$this->url('/'.$id.'/assignment'),['revision'=>2,'interpreter_id'=>$external])->assertConflict();
        foreach (['arranging'=>3,'confirmed'=>4,'completed'=>5] as $status=>$revision) $this->http('POST',$this->url('/'.$id.'/status'),compact('status','revision'))->assertOk()->assertJsonPath('item.status',$status);
        $this->http('GET',$this->url('/'.$id))->assertOk()->assertJsonPath('item.status','completed')->assertJsonPath('item.revision',6);
        $this->http('GET',$this->url('/'.$id.'/history'))->assertOk()->assertJsonCount(6,'events')->assertJsonPath('events.0.actor_name','STG_MANAGER');
        $this->http('PATCH',$this->url('/'.$id),$data)->assertConflict();
        self::assertSame('completed',InterpretationRequest::findOrFail($id)->status);
        $cancel=$this->http('POST',$this->url(),$this->payload())->assertCreated()->json('item.id');
        $this->http('POST',$this->url('/'.$cancel.'/status'),['revision'=>1,'status'=>'cancelled'])->assertUnprocessable();
        $this->http('POST',$this->url('/'.$cancel.'/status'),['revision'=>1,'status'=>'cancelled','cancellation_reason'=>'Synthetic schedule withdrawn'])->assertOk()->assertJsonPath('item.status','cancelled');
    }
    public function test_confidential_scope_nested_ids_and_revoke_apply_to_next_request(): void
    {
        $secret=CaseFile::where('reference_number','INT-CONFIDENTIAL')->sole()->id;
        $u=User::where('login_id','STG_MANAGER')->sole();
        $this->http('GET',$this->url('', $secret))->assertNotFound();
        DB::table('case_memberships')->insert(['case_file_id'=>$secret,'user_id'=>$u->id,'employee_id'=>$u->employee_id,
            'can_read'=>true,'can_write'=>false,'can_read_confidential'=>true,'evidence_ref'=>'SYNTHETIC TEST ONLY','created_at'=>now(),'updated_at'=>now()]);
        $this->http('GET',$this->url('', $secret))->assertOk()->assertJsonPath('capabilities.can_create',false);
        $this->http('POST',$this->url('', $secret),$this->payload())->assertForbidden();
        DB::table('case_memberships')->where('case_file_id',$secret)->update(['can_write'=>true]);
        $item=$this->http('POST',$this->url('', $secret),$this->payload())->assertCreated()->json('item.id');
        $this->http('GET',$this->url('/'.$item))->assertNotFound();
        DB::table('case_memberships')->where('case_file_id',$secret)->update(['revoked_at'=>now()]);
        $this->http('GET',$this->url('/'.$item, $secret))->assertNotFound();
        $permission=Permission::where('name','interpretation.create')->sole(); $role=$u->roles()->sole();
        DB::table('role_permissions')->where('role_id',$role->id)->where('permission_id',$permission->id)->delete();
        try { $this->http('POST',$this->url(),$this->payload())->assertForbidden(); }
        finally { DB::table('role_permissions')->insert(['role_id'=>$role->id,'permission_id'=>$permission->id]); }
        $this->http('POST',$this->url(),$this->payload())->assertCreated();
    }
    public function test_audit_failure_rolls_back_real_engine_mutation(): void
    {
        $before=DB::table('interpretation_requests')->count(); $audits=DB::table('case_activities')->count();
        $this->app->instance(CaseWorkspaceAuditService::class,new class extends CaseWorkspaceAuditService {
            public function record(CaseFile $caseFile,Request $request,string $title,?string $content=null,array $metadata=[]): void { throw new \RuntimeException('Synthetic required audit unavailable'); }
        });
        $this->http('POST',$this->url(),$this->payload())->assertStatus(500);
        self::assertSame($before,DB::table('interpretation_requests')->count());
        self::assertSame($audits,DB::table('case_activities')->count());
    }
    public function test_foreign_keys_and_idempotency_indexes_are_enforced_by_engine(): void
    {
        $payload=$this->payload(); $created=$this->http('POST',$this->url(),$payload)->assertCreated()->json('item.id');
        $this->http('POST',$this->url(),$payload)->assertCreated()->assertJsonPath('item.id',$created);
        $this->http('POST',$this->url(),array_replace($payload,['content'=>'Different request']))->assertConflict();
        $row=(array)DB::table('interpretation_requests')->where('id',$created)->first();unset($row['id']);
        foreach (['unique','foreign_key'] as $check) {
            DB::beginTransaction();$denied=false;
            try {
                if ($check==='foreign_key') { $row['request_key']=(string)Str::uuid();$row['case_file_id']=99999999; }
                DB::table('interpretation_requests')->insert($row);
            } catch (\Illuminate\Database\QueryException $e) { $denied=($e->errorInfo[0]??null)==='23000'; }
            finally { DB::rollBack(); }
            self::assertTrue($denied,$check.' must be enforced by the actual engine.');
        }
    }
}
