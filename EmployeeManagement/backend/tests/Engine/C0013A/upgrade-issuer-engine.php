<?php

require dirname(__DIR__,3).'/vendor/autoload.php';
if(!defined('PHPUNIT_COMPOSER_INSTALL'))define('PHPUNIT_COMPOSER_INSTALL',dirname(__DIR__,3).'/vendor/autoload.php');
$app=require dirname(__DIR__,3).'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
require __DIR__.'/engine-bootstrap.php';

use Illuminate\Support\Facades\DB;

try{
    $run=c001EngineConfigure($app);$root=dirname(getenv('C001_ENGINE_RUN_FILE'));
    echo 'UPGRADE_DISPOSABLE_TARGET='.$run['database'].PHP_EOL;
    $snapshot=fn()=>collect(['c001_legal_decisions','c001_legal_proofs','c001_version_provenance'])
        ->mapWithKeys(fn($t)=>[$t=>['count'=>DB::table($t)->count(),'sha256'=>hash('sha256',DB::table($t)->orderBy('id')->get()->toJson())]])->all();
    $before=$snapshot();$legacy=DB::table('legal_delegations')->count();
    $file=database_path('proposals/upgrade_c001_independent_issuers.php');
    (require $file)->up();
    if($before!==$snapshot() || DB::table('legal_delegations')->count()!==$legacy
        || DB::table('legal_delegations')->whereNotNull('issuer_admission_id')->count()!==0)throw new LogicException('Evidence/backfill mismatch.');
    file_put_contents($root.'/c0013c-schema-upgrade.json',json_encode(['target'=>$run['database'],'file_sha256'=>hash_file('sha256',$file),
        'status'=>'UPGRADED_DISPOSABLE_ONLY','retained_legacy_delegations'=>$legacy,'legacy_admissions_backfilled'=>0,
        'immutable_evidence_unchanged'=>$before,'connection_id'=>DB::selectOne('SELECT CONNECTION_ID() AS id')->id],JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR));
    echo 'ISSUER_SCHEMA_UPGRADE=PASS; historical evidence retained; backfill=0'.PHP_EOL;
}catch(Throwable $e){
    file_put_contents(dirname(getenv('C001_ENGINE_RUN_FILE')).'/c0013c-upgrade-error-private.txt',(string)$e);
    echo json_encode(['status'=>'UPGRADE_BLOCKED','category'=>get_class($e),'sqlstate'=>$e instanceof \Illuminate\Database\QueryException?($e->errorInfo[0]??null):null]).PHP_EOL;
    exit(1);
}
