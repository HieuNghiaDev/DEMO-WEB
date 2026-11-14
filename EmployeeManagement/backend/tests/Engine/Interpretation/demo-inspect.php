<?php

require __DIR__.'/context.php';
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Themis\Staging\Target;

$root=realpath(getenv('INTERPRETATION_PRIVATE_RUN')?:'');
$a=json_decode(file_get_contents($root.'/admission.json'),true,flags:JSON_THROW_ON_ERROR);
$p=json_decode(file_get_contents($root.'/provisioner.json'),true,flags:JSON_THROW_ON_ERROR);
Target::validate($a,$p);
if(($argv[1]??'')==='offline'){echo "SYNTHETIC_TARGET_OFFLINE_ADMISSION=PASS\n";exit;}
[$app]=interpretationEngineContext();
$fixture=json_decode(file_get_contents($root.'/demo-fixtures.json'),true,flags:JSON_THROW_ON_ERROR);
if($fixture['purpose']!=='THEMIS_INTERPRETATION_LOCAL_DEMO'||DB::table('users')->count()!==5||DB::table('c001_legal_decisions')->count()||DB::table('account_mfa')->count()) throw new LogicException('Unexpected demo identity/evidence.');
if(!\Illuminate\Support\Facades\Schema::hasTable('interpreters')||!\Illuminate\Support\Facades\Schema::hasTable('interpretation_requests')
    ||DB::table('interpretation_requests')->where('case_file_id',$fixture['case_id'])->whereIn('id',$fixture['seed_request_ids'])->count()!==3
    ||!DB::table('interpreters')->where('id',$fixture['profile_id'])->exists()) throw new LogicException('Demo schema/seed evidence missing; never reset/reseed.');
if(DB::table('role_permissions as rp')->join('permissions as p','p.id','=','rp.permission_id')->whereIn('p.name',['interpretation.view_costs','document.approve_legal'])->exists()) throw new LogicException('Unexpected protected demo grant.');
foreach(['STG_MANAGER','STG_ORDINARY_REVIEWER'] as $name){$u=User::where('login_id',$name)->sole();foreach(['view','create','update','assign','transition','cancel'] as $action) if(!$u->hasPermission('interpretation.'.$action)) throw new LogicException('Coordinator grant missing.');if($u->hasPermission('document.approve_legal')||$u->hasPermission('interpretation.view_costs')) throw new LogicException('Protected capability.');}
if(User::where('login_id','STG_UNASSIGNED_STAFF')->sole()->hasPermission('interpretation.view')) throw new LogicException('Staff unexpectedly authorized.');
if(($argv[1]??'')==='snapshot'){
    echo json_encode(['database'=>$a['database'],'requests_sha256'=>hash('sha256',DB::table('interpretation_requests')->orderBy('id')->get()->toJson()),'profiles_sha256'=>hash('sha256',DB::table('interpreters')->orderBy('id')->get()->toJson()),'request_count'=>DB::table('interpretation_requests')->count(),'interpretation_audits'=>DB::table('case_activities')->where('metadata->event','like','interpretation.%')->count(),'legal_decisions'=>0],JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR);exit;
}
echo "SYNTHETIC_DEMO_DATABASE_AND_PERMISSIONS=PASS; C001=LOCKED\n";
