<?php

require __DIR__.'/context.php';
use App\Models\{CaseFile, Interpreter, InterpretationRequest, Permission, User};
use App\Services\{CaseWorkspaceAuditService, InterpretationWorkflow};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

[$app,$root,$admission]=interpretationEngineContext(true);
if (file_exists($root.'/demo-fixtures.json') || InterpretationRequest::count() || Interpreter::count()) throw new LogicException('Fresh synthetic demo extension only; no reset/reseed.');
$result=DB::transaction(function() use ($app): array {
    $other=User::where('login_id','STG_ORDINARY_REVIEWER')->sole();$role=$other->roles()->sole();
    foreach(['view','create','update','assign','transition','cancel'] as $action) DB::table('role_permissions')->insert(['role_id'=>$role->id,'permission_id'=>Permission::where('name','interpretation.'.$action)->sole()->id]);
    DB::table('role_permissions')->insert(['role_id'=>$role->id,'permission_id'=>Permission::where('name','employee.view')->sole()->id]);
    $actor=User::where('login_id','STG_MANAGER')->sole();
    $staff=User::where('login_id','STG_UNASSIGNED_STAFF')->sole();
    if($staff->permission_names && array_filter($staff->permission_names,fn($p)=>str_starts_with($p,'interpretation.'))) throw new LogicException('No-permission staff unexpectedly authorized.');
    if(DB::table('role_permissions as rp')->join('permissions as p','p.id','=','rp.permission_id')->where('p.name','interpretation.view_costs')->exists() || Permission::where('name','document.approve_legal')->exists()) throw new LogicException('Protected demo privilege.');
    $case=CaseFile::where('reference_number','G6-NORMAL')->sole();
    $request=Request::create('/synthetic-demo-seed','POST');$app->instance('request',$request);$request->setUserResolver(fn()=>$actor);
    $profile=Interpreter::forceCreate(['kind'=>'external','display_name'=>'SYNTHETIC DEMO 通訳者','is_active'=>true,'created_by_user_id'=>$actor->id,'registration_key'=>(string)Str::uuid(),'registration_hash'=>hash('sha256','SYNTHETIC DEMO ONLY')]);
    app(CaseWorkspaceAuditService::class)->record($case,$request,'通訳者を登録',null,['event'=>'interpretation.interpreter_registered','interpreter_id'=>$profile->id]);
    $ids=[];
    foreach([['ベトナム語','2026-11-02T09:00:00+09:00','2026-11-02T10:00:00+09:00'],['英語','2026-11-03T14:00:00+09:00','2026-11-03T15:00:00+09:00'],['中国語','2026-11-04T14:00:00+09:00','2026-11-04T15:00:00+09:00']] as [$language,$start,$end]) {
        $item=app(InterpretationWorkflow::class)->create($request,$case,['language'=>$language,'work_type'=>'meeting','mode'=>'online','content'=>'SYNTHETIC DEMO — 架空案件の打合せ','starts_at'=>$start,'ends_at'=>$end,'request_key'=>(string)Str::uuid(),'interpreter_id'=>$profile->id]);$ids[]=$item->id;
    }
    return ['purpose'=>'THEMIS_INTERPRETATION_LOCAL_DEMO','case_id'=>$case->id,'case_b'=>CaseFile::where('reference_number','INT-RACE-B')->sole()->id,'confidential_case'=>CaseFile::where('reference_number','INT-CONFIDENTIAL')->sole()->id,'profile_id'=>$profile->id,'seed_request_ids'=>$ids,'coordinator_a'=>$actor->id,'coordinator_b'=>$other->id,'staff'=>$staff->id,'legal_finalization'=>'LOCKED','cost_grants'=>0];
});
file_put_contents($root.'/demo-fixtures.json',json_encode($result,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR));
echo "SYNTHETIC_DEMO_FIXTURES=PASS; REAL_ACCOUNTS_USED=NO; COST_GRANTS=0; C001=LOCKED\n";
