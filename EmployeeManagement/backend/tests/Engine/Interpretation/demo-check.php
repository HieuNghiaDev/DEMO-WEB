<?php

require __DIR__.'/context.php';
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

[$app,$root,$admission]=interpretationEngineContext();
$f=json_decode(file_get_contents($root.'/demo-fixtures.json'),true,flags:JSON_THROW_ON_ERROR);
$web=json_decode(file_get_contents($root.'/web-identity.json'),true,flags:JSON_THROW_ON_ERROR);
if($f['purpose']!=='THEMIS_INTERPRETATION_LOCAL_DEMO'||!is_int($web['api_port'])||$web['api_port']<20000||$web['api_port']>65535||$web['api_port']===$admission['port']) throw new LogicException('Unapproved HTTP destination.');
// Only this explicitly admitted loopback transport bypasses the inherited outbound-deny proxy.
$client=new GuzzleHttp\Client(['base_uri'=>'http://127.0.0.1:'.$web['api_port'],'proxy'=>'','http_errors'=>false,'allow_redirects'=>false,'timeout'=>15]);
$rows=[];$tokens=[];$assertions=0;
$assert=function(bool $value,string $label)use(&$assertions){$assertions++;if(!$value)throw new LogicException($label);};
$call=function(string $method,string $path,int $expected,array $data=[],?string $token=null)use($client,&$rows,$assert):array {
    $options=['headers'=>['Accept'=>'application/json']];if($token)$options['headers']['Authorization']='Bearer '.$token;
    if($method!=='GET')$options['json']=$data;
    $response=$client->request($method,$path,$options);$status=$response->getStatusCode();
    $rows[]=['method'=>$method,'path'=>$path,'expected'=>$expected,'actual'=>$status];$assert($status===$expected,'Unexpected '.$method.' status: '.$status);
    return json_decode((string)$response->getBody(),true,flags:JSON_THROW_ON_ERROR);
};
try {
    $passwords=json_decode(file_get_contents($root.'/synthetic-credential-handover.json'),true,flags:JSON_THROW_ON_ERROR);
    foreach(['STG_MANAGER','STG_ORDINARY_REVIEWER','STG_UNASSIGNED_STAFF'] as $label){$login=$call('POST','/api/login',200,['email'=>strtolower($label).'@example.test','password'=>$passwords[$label]]);$tokens[$label]=$login['token'];$call('GET','/api/me',200,[],$tokens[$label]);}
    [$a,$b,$staff]=array_values($tokens);$base='/api/case-files/'.$f['case_b'].'/interpretation-requests';$main='/api/case-files/'.$f['case_id'].'/interpretation-requests';
    $call('GET',$main,401);
    $list=$call('GET',$main,200,[],$a);$assert($list['capabilities']['can_update']===true&&!$list['capabilities']['can_view_costs'],'Exact coordinator capabilities.');
    $call('GET',$main.'/'.$f['seed_request_ids'][0],200,[],$a);
    $before=DB::table('interpretation_requests')->count();$audits=DB::table('case_activities')->count();
    $payload=['language'=>'SYNTHETIC API CHECK','work_type'=>'meeting','mode'=>'online','content'=>'Synthetic network check','starts_at'=>'2026-11-06T09:00:00+09:00','ends_at'=>'2026-11-06T10:00:00+09:00','request_key'=>(string)Str::uuid()];
    $call('GET',$main,403,[],$staff);$call('POST',$main,403,$payload,$staff);
    $assert(DB::table('interpretation_requests')->count()===$before&&DB::table('case_activities')->count()===$audits,'Denied requests changed business/history.');
    $call('GET','/api/case-files/'.$f['confidential_case'].'/interpretation-requests',404,[],$a);
    $call('GET',$base.'/'.$f['seed_request_ids'][0],404,[],$a);
    $item=$call('POST',$base,201,$payload,$a)['item'];$id=$item['id'];
    $call('PATCH',$base.'/'.$id.'/assignment',200,['revision'=>1,'interpreter_id'=>$f['profile_id']],$a);
    $update=$payload;unset($update['request_key']);$update['revision']=2;$update['notes']='Coordinator B updated a request created by A';
    $call('PATCH',$base.'/'.$id,200,$update,$b);
    $stored=DB::table('interpretation_requests')->where('id',$id)->first();$assert((int)$stored->created_by_user_id===$f['coordinator_a']&&(int)$stored->updated_by_user_id===$f['coordinator_b'],'Cross-creator update provenance.');
    $conflict=$payload;$conflict['request_key']=(string)Str::uuid();$conflict['interpreter_id']=$f['profile_id'];$call('POST',$base,409,$conflict,$a);
    $call('PATCH',$base.'/'.$id,409,$update,$b);
    foreach(['arranging'=>3,'confirmed'=>4,'completed'=>5] as $status=>$revision)$call('POST',$base.'/'.$id.'/status',200,compact('status','revision'),$b);
    $saved=$call('GET',$base.'/'.$id,200,[],$a);$assert($saved['item']['status']==='completed'&&$saved['item']['revision']===6,'Persisted terminal state.');
    $history=$call('GET',$base.'/'.$id.'/history',200,[],$b);$assert(count($history['events'])===6,'History completeness.');
    $payload['request_key']=(string)Str::uuid();$cancel=$call('POST',$base,201,$payload,$a)['item']['id'];
    $call('POST',$base.'/'.$cancel.'/status',422,['revision'=>1,'status'=>'cancelled'],$b);
    $call('POST',$base.'/'.$cancel.'/status',200,['revision'=>1,'status'=>'cancelled','cancellation_reason'=>'Synthetic request withdrawn'],$b);
    $call('POST','/api/case-files/'.$f['case_id'].'/document-collection/1/creation/c001/final-decisions',403,['generated_document_id'=>1,'request_key'=>'synthetic-demo-denied','proof_id'=>1],$a);
    $assert(!app(App\Services\LocalC001Installation::class)->enabled()&&DB::table('c001_legal_decisions')->count()===0,'Legal finalization must stay locked.');
    $result=['status'=>'PASS','assertions'=>$assertions,'http_checks'=>$rows,'cross_creator_update'=>true,'c001'=>'LOCKED','source_mysql_connected'=>false];
} catch(Throwable $e) {$result=['status'=>'FAIL','category'=>get_class($e),'assertions'=>$assertions,'http_checks'=>$rows];}
finally {foreach($tokens as $token){$client->post('/api/logout',['headers'=>['Accept'=>'application/json','Authorization'=>'Bearer '.$token]]);}}
file_put_contents($root.'/demo-api-check.json',json_encode($result,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR));
echo json_encode(['status'=>$result['status'],'assertions'=>$assertions,'http_checks'=>count($rows)],JSON_THROW_ON_ERROR).PHP_EOL;
exit($result['status']==='PASS'?0:1);
