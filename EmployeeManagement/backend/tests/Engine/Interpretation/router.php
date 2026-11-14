<?php

require __DIR__.'/context.php';
[$app, $root] = interpretationEngineContext();
$identity = json_decode(file_get_contents($root.'/web-identity.json'),true,flags:JSON_THROW_ON_ERROR);
$peer=$_SERVER['REMOTE_ADDR']??'';
if (!in_array($peer,['127.0.0.1','::1'],true) || ($_SERVER['SERVER_PORT']??'') != $identity['api_port']) throw new LogicException('Unexpected synthetic HTTP listener.');
config(['cors.allowed_origins'=>['http://127.0.0.1:'.$identity['frontend_port']], 'app.url'=>'http://127.0.0.1:'.$identity['api_port']]);
$kernel=$app->make(Illuminate\Contracts\Http\Kernel::class);
$request=Illuminate\Http\Request::capture();
$response=$kernel->handle($request);
// No payloads, query strings, headers, credentials or customer metadata in this journal.
file_put_contents($root.'/http-status.jsonl',json_encode(['method'=>$request->method(),'path'=>$request->path(),'status'=>$response->getStatusCode()]).PHP_EOL,FILE_APPEND|LOCK_EX);
$response->send();$kernel->terminate($request,$response);
