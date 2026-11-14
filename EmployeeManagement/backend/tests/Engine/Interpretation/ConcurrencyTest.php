<?php

namespace Tests\Engine\Interpretation;

require_once __DIR__.'/context.php';

use App\Models\{CaseFile, Interpreter, InterpretationRequest, User};
use App\Services\InterpretationWorkflow;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PHPUnit\Framework\TestCase;

/** Real MariaDB sessions; deliberately not the SQLite application TestCase. */
final class ConcurrencyTest extends TestCase
{
    private string $root;
    private User $user;
    private CaseFile $case;
    private Request $request;

    protected function setUp(): void
    {
        [$app,$this->root] = \interpretationEngineContext();
        $this->user=User::where('login_id','STG_MANAGER')->sole();
        $this->case=CaseFile::where('reference_number','G6-NORMAL')->sole();
        $this->request=Request::create('/synthetic-engine','POST');
        $app->instance('request',$this->request); $this->request->setUserResolver(fn()=>$this->user);
        self::assertSame('REPEATABLE-READ',DB::selectOne('SELECT @@tx_isolation value')->value);
        self::assertTrue(app(\App\Policies\InterpretationRequestPolicy::class)->create($this->user,$this->case));
    }

    protected function tearDown(): void
    {
        \Illuminate\Foundation\Bootstrap\HandleExceptions::flushState();
    }

    private function payload(?int $profile=null): array
    {
        return ['language'=>'SYNTHETIC','work_type'=>'meeting','mode'=>'online','content'=>'Synthetic engine concurrency',
            'starts_at'=>'2026-12-20T09:00:00+09:00','ends_at'=>'2026-12-20T10:00:00+09:00',
            'interpreter_id'=>$profile,'request_key'=>(string)Str::uuid()];
    }

    private function startWorker(CaseFile $case,array $payload,array $extra=[]): array
    {
        $job=bin2hex(random_bytes(12));
        file_put_contents($this->root.'/'.$job.'.json',json_encode(['case'=>$case->id,'payload'=>$payload,...$extra],JSON_THROW_ON_ERROR));
        $process=proc_open([PHP_BINARY,__DIR__.'/worker.php',$job],[0=>['pipe','r'],1=>['file',$this->root.'/'.$job.'.out','w'],2=>['file',$this->root.'/'.$job.'.err','w']],$pipes);
        self::assertIsResource($process); fclose($pipes[0]);
        $deadline=microtime(true)+15;
        while(!is_file($this->root.'/'.$job.'.ready') && microtime(true)<$deadline) usleep(20000);
        self::assertFileExists($this->root.'/'.$job.'.ready','Child connection must establish its older read view.');
        $ready=json_decode(file_get_contents($this->root.'/'.$job.'.ready'),true,flags:JSON_THROW_ON_ERROR);
        self::assertNotSame((int)DB::selectOne('SELECT CONNECTION_ID() id')->id,(int)$ready['id']);
        return [$process,$job];
    }

    private function finishWorker(array $worker): array
    {
        [$process,$job]=$worker;
        $deadline=microtime(true)+15;
        while(proc_get_status($process)['running'] && microtime(true)<$deadline) usleep(20000);
        self::assertFalse(proc_get_status($process)['running'],'Owned worker must finish after the reservation commit.');
        proc_close($process);
        self::assertFileExists($this->root.'/'.$job.'.result');
        return json_decode(file_get_contents($this->root.'/'.$job.'.result'),true,flags:JSON_THROW_ON_ERROR);
    }

    public function test_waiting_booking_rechecks_committed_schedule_under_repeatable_read(): void
    {
        $profile=Interpreter::forceCreate(['kind'=>'external','display_name'=>'SYNTHETIC concurrency '.Str::uuid(),'is_active'=>true,
            'created_by_user_id'=>$this->user->id,'registration_key'=>(string)Str::uuid(),'registration_hash'=>str_repeat('a',64)]);
        $other=CaseFile::where('reference_number','INT-RACE-B')->sole();
        DB::beginTransaction();
        try {
            Interpreter::whereKey($profile->id)->lockForUpdate()->sole();
            $worker=$this->startWorker($other,$this->payload($profile->id));
            self::assertTrue(app(\App\Policies\InterpretationRequestPolicy::class)->create($this->request->user(),$this->case));
            $item=app(InterpretationWorkflow::class)->create($this->request,$this->case,$this->payload($profile->id));
            DB::commit();
        } finally { while(DB::transactionLevel()) DB::rollBack(); }
        $result=$this->finishWorker($worker);
        self::assertSame(409,$result['status'],'Waiting transaction must see the committed booking, not its stale snapshot.');
        self::assertSame(1,InterpretationRequest::where('interpreter_id',$profile->id)->count());
        self::assertSame(1,DB::table('case_activities')->where('metadata->interpretation_request_id',$item->id)->count());
    }

    public function test_waiting_same_key_returns_committed_request_without_duplicate_audit(): void
    {
        $payload=$this->payload();
        DB::beginTransaction();
        try {
            CaseFile::whereKey($this->case->id)->lockForUpdate()->sole();
            $worker=$this->startWorker($this->case,$payload);
            $item=app(InterpretationWorkflow::class)->create($this->request,$this->case,$payload);
            DB::commit();
        } finally { while(DB::transactionLevel()) DB::rollBack(); }
        $result=$this->finishWorker($worker);
        self::assertSame(201,$result['status'],'Retry should resolve the committed idempotency key instead of a unique-key error.');
        self::assertSame($item->id,$result['id']);
        self::assertSame(1,InterpretationRequest::where('request_key',$payload['request_key'])->count());
        self::assertSame(1,DB::table('case_activities')->where('metadata->interpretation_request_id',$item->id)->count());
    }

    public function test_simultaneous_cross_case_booking_has_one_winner_and_no_server_error(): void
    {
        $profile=Interpreter::forceCreate(['kind'=>'external','display_name'=>'SYNTHETIC simultaneous','is_active'=>true,
            'created_by_user_id'=>$this->user->id,'registration_key'=>(string)Str::uuid(),'registration_hash'=>str_repeat('b',64)]);
        $other=CaseFile::where('reference_number','INT-RACE-B')->sole();
        $one=$this->startWorker($this->case,$this->payload($profile->id),['barrier'=>true]);
        $two=$this->startWorker($other,$this->payload($profile->id),['barrier'=>true]);
        foreach ([$one,$two] as $worker) touch($this->root.'/'.$worker[1].'.release');
        $statuses=[$this->finishWorker($one)['status'],$this->finishWorker($two)['status']];sort($statuses);
        self::assertSame([201,409],$statuses);
        self::assertSame(1,InterpretationRequest::where('interpreter_id',$profile->id)->count());
    }

    public function test_concurrent_update_cannot_overwrite_a_newer_revision(): void
    {
        $item=app(InterpretationWorkflow::class)->create($this->request,$this->case,$this->payload());
        $data=$this->payload();unset($data['request_key']);$data['revision']=1;$data['content']='Second stale editor';
        DB::beginTransaction();
        try {
            CaseFile::whereKey($this->case->id)->lockForUpdate()->sole();
            $worker=$this->startWorker($this->case,$data,['item'=>$item->id]);
            app(InterpretationWorkflow::class)->change($this->request,$this->case,$item,'update',array_replace($data,['content'=>'First committed editor']));
            DB::commit();
        } finally { while(DB::transactionLevel()) DB::rollBack(); }
        self::assertSame(409,$this->finishWorker($worker)['status']);
        self::assertSame('First committed editor',$item->fresh()->content);
        self::assertSame(2,$item->fresh()->revision);
    }
}
