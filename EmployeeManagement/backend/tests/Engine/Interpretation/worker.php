<?php

require __DIR__.'/context.php';
use App\Models\{CaseFile, User};
use App\Services\InterpretationWorkflow;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

[$app,$root] = interpretationEngineContext();
$job = $argv[1] ?? '';
if (!preg_match('/^[a-f0-9]{24}$/D',$job)) throw new LogicException('Invalid owned job.');
$input=json_decode(file_get_contents($root.'/'.$job.'.json'),true,flags:JSON_THROW_ON_ERROR);
$case=CaseFile::findOrFail($input['case']);
$user=User::where('login_id','STG_MANAGER')->sole();
$request=Request::create('/synthetic-engine','POST'); $app->instance('request',$request); $request->setUserResolver(fn()=>$user);
$connection=DB::selectOne('SELECT CONNECTION_ID() id,@@tx_isolation level');
// Establish the old read view INSIDE the workflow's real outermost transaction. Wrapping the
// service in a test transaction would disable Laravel's deadlock retry and misrepresent HTTP.
$ready=false;
DB::connection()->beforeExecuting(function(string $sql,array $bindings,$db) use (&$ready,$root,$job,$connection,$input): void {
    if ($ready || $db->transactionLevel()!==1 || !str_contains($sql,'case_files') || !str_contains(strtolower($sql),'for update')) return;
    $ready=true;
    DB::table('interpretation_requests')->count();
    file_put_contents($root.'/'.$job.'.ready',json_encode($connection,JSON_THROW_ON_ERROR));
    if ($input['barrier'] ?? false) {
        $deadline=microtime(true)+15;
        while(!is_file($root.'/'.$job.'.release') && microtime(true)<$deadline) usleep(10000);
        if (!is_file($root.'/'.$job.'.release')) throw new LogicException('Owned start barrier expired.');
    }
});
try {
    $workflow=app(InterpretationWorkflow::class);
    $item=isset($input['item'])
        ? $workflow->change($request,$case,\App\Models\InterpretationRequest::findOrFail($input['item']),'update',$input['payload'])
        : $workflow->create($request,$case,$input['payload']);
    $result=['status'=>201,'id'=>$item->id];
} catch (Throwable $e) {
    while(DB::transactionLevel()) DB::rollBack();
    $result=['status'=>method_exists($e,'getStatusCode')?$e->getStatusCode():500,'category'=>get_class($e)];
}
file_put_contents($root.'/'.$job.'.result',json_encode($result,JSON_THROW_ON_ERROR));
