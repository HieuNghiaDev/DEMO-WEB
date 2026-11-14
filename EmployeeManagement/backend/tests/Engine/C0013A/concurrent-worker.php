<?php

require dirname(__DIR__,3).'/vendor/autoload.php';
if (! defined('PHPUNIT_COMPOSER_INSTALL')) define('PHPUNIT_COMPOSER_INSTALL', dirname(__DIR__,3).'/vendor/autoload.php');
$app=require dirname(__DIR__,3).'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
require __DIR__.'/engine-bootstrap.php'; require __DIR__.'/EnginePolicy.php';

use Illuminate\Support\Facades\{DB, Crypt};
use App\Models\{User, CaseFile, CaseDocument, CaseGeneratedDocument};

$role=$argv[2]??'';
$result=['role'=>$role,'pid'=>getmypid(),'started_at'=>microtime(true)]; $trace=[]; $writes=[];
try {
    $run=c001EngineConfigure($app); $root=dirname(getenv('C001_ENGINE_RUN_FILE'));
    $file=$argv[1]??'';
    if (! in_array($role,['A','B'],true) || ! str_starts_with(realpath($file)?:'',realpath($root).DIRECTORY_SEPARATOR)) throw new LogicException('Private synthetic state required.');
    $state=json_decode(Crypt::decryptString(file_get_contents($file)),true,flags:JSON_THROW_ON_ERROR);
    \Carbon\Carbon::setTestNow($state['now']); \Carbon\CarbonImmutable::setTestNow($state['now']);
    if (($state['policy']['mode'] ?? 'enterprise') === 'small_office') {
        $policy = new \App\Services\SmallOfficeC001AuthorityPolicy;
    } else {
        $policy=new \Tests\Engine\C0013A\EnginePolicy;
        foreach(['verifications','issuerAdmissions','delegations','ledgers'] as $name) $policy->$name=$state['policy'][$name];
    }
    $app->instance(\App\Contracts\C001AuthorityPolicy::class,$policy);
    $actor=User::findOrFail($state['actor']);
    $token=\Laravel\Sanctum\PersonalAccessToken::findToken($state['token']);
    if (! $token) throw new LogicException('Synthetic session missing.');
    $actor->withAccessToken($token); request()->setUserResolver(fn()=>$actor);
    $drive=\Mockery::mock(\App\Services\GoogleDriveService::class);
    $drive->shouldReceive('downloadFileContent')->andReturnUsing(fn($id)=>$state['bytes'][$id]);
    $app->instance(\App\Services\GoogleDriveService::class,$drive);
    $result['connection_id']=(int)DB::selectOne('SELECT CONNECTION_ID() AS id')->id;
    $barrier=$state['barrier'];
    $wait=function(string $path): void { $until=microtime(true)+15; while(! is_file($path)){if(microtime(true)>$until)throw new RuntimeException('Engine barrier timeout.');usleep(10000);} };
    if($role==='B')$wait($barrier.'.A-locked');
    DB::connection()->beforeExecuting(function(string $sql)use($role,$barrier,&$result):void{
        if($role==='B' && str_contains(strtolower($sql),'for update') && str_contains($sql,'`case_files`')){
            $result['parent_lock_requested_at']=microtime(true); file_put_contents($barrier.'.B-waiting','ready');
        }
    });
    DB::listen(function($query)use($role,$barrier,$wait,&$result,&$trace,&$writes):void{
        if(preg_match('/^\s*(insert into|update)\s+`([a-z_]+)`/i',$query->sql,$write)){
            $writes[]=['operation'=>strtolower($write[1]),'table'=>$write[2],'duration_ms'=>$query->time,
                'transaction_level'=>DB::transactionLevel(),'completed_at'=>microtime(true)];
        }
        if(str_contains(strtolower($query->sql),'for update')){
            preg_match('/from\s+`([a-z_]+)`/i',$query->sql,$match);
            $trace[]=['table'=>$match[1]??'other','duration_ms'=>$query->time,'completed_at'=>microtime(true)];
            if(($match[1]??'')==='case_files' && !isset($result['parent_lock_acquired_at'])){
                $result['parent_lock_acquired_at']=microtime(true);
                if($role==='A'){file_put_contents($barrier.'.A-locked','ready');$wait($barrier.'.B-waiting');usleep(250000);}
            }
        }
    });
    // The model creation event follows the successful receipt INSERT; retain ordering without logging SQL/bindings.
    \Illuminate\Support\Facades\Event::listen('eloquent.created: '.\App\Models\C001LegalDecision::class,
        function()use(&$writes):void{$writes[]=['operation'=>'receipt_inserted','table'=>'c001_legal_decisions',
            'transaction_level'=>DB::transactionLevel(),'completed_at'=>microtime(true)];});
    $receipt=app(\App\Services\C001FinalApprovalWriter::class)->approveDecision(CaseFile::findOrFail($state['case']),
        CaseDocument::findOrFail($state['document']),$actor,CaseGeneratedDocument::findOrFail($state['generated']),$state['key'], $state['proof']);
    $result+=['category'=>'receipt','receipt_id'=>$receipt->id];
}catch(Throwable $error){
    $result['category']=$error instanceof \Symfony\Component\HttpKernel\Exception\HttpExceptionInterface?'http_'.$error->getStatusCode():get_class($error);
    if($error instanceof \Illuminate\Database\QueryException){$result['sqlstate']=$error->errorInfo[0]??null;$result['driver_code']=$error->errorInfo[1]??null;}
}finally{
    $result['finished_at']=microtime(true);$result['lock_trace']=$trace;$result['write_trace']=$writes;
    echo json_encode($result,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR);
}
