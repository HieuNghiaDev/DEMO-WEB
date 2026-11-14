param([Parameter(Mandatory=$true)][ValidateSet('Start','Stop')][string]$Action,[Parameter(Mandatory=$true)][string]$RunDirectory)
$ErrorActionPreference='Stop'
$root=(Resolve-Path -LiteralPath $RunDirectory).Path
$backend=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$frontend=[IO.Path]::GetFullPath((Join-Path $backend '../frontend'))
$a=Get-Content -Raw -LiteralPath (Join-Path $root 'admission.json')|ConvertFrom-Json
$demo=Get-Content -Raw -LiteralPath (Join-Path $root 'demo-service-admission.json')|ConvertFrom-Json
if($demo.purpose -ne 'THEMIS_INTERPRETATION_LOCAL_DEMO' -or $a.run_id -notmatch '^[a-f0-9]{16}$' -or $demo.run_id -ne $a.run_id -or $a.database -ne ('themis_stg_g6_'+$a.run_id) -or $a.host -ne '127.0.0.1' -or $a.port -lt 20000 -or $a.port -gt 65535 -or (Split-Path $root -Leaf) -ne ('g6-'+$a.run_id) -or [IO.Path]::GetFullPath($a.data_directory) -ne (Join-Path $root 'data')){throw 'Unapproved demo identity.'}
$configPath=Join-Path $root 'server.ini'
$config=[IO.File]::ReadAllText($configPath)
if((Get-FileHash -LiteralPath $configPath).Hash -ne $demo.configuration_sha256 -or $config -match '(?im)^\s*(init-file|!include)' -or $config -notmatch ('(?m)^datadir='+[regex]::Escape($root.Replace('\','/')+'/data')+'\r?$')){throw 'Owned restart configuration drift.'}
$php='C:\xampp\php\php.exe'
if($demo.php_binary -ne $php){throw 'Unexpected PHP runtime.'}
$oldLocation=Get-Location
$keys=@('INTERPRETATION_PRIVATE_RUN','VITE_API_URL','VITE_BACKEND_URL');$previous=@{}
foreach($key in $keys){$previous[$key]=[Environment]::GetEnvironmentVariable($key,'Process')}
function SaveJson($path,$value){[IO.File]::WriteAllText($path,($value|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))}
function Listeners($port){return @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)}
function FreePort { for($n=0;$n -lt 10;$n++){$l=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$l.Start();$p=$l.LocalEndpoint.Port;$l.Stop();if($p -ge 20000 -and $p -ne $a.port){return $p}};throw 'No safe test port.' }
function OwnedProcess($processId,$needle,$port){
 $p=Get-CimInstance Win32_Process -Filter "ProcessId=$processId"
 if(-not $p){return $false}
 $line=$p.CommandLine.Replace('\','/').ToLowerInvariant()
 if(-not $line.Contains($needle.Replace('\','/').ToLowerInvariant()) -or -not $line.Contains([string]$port)){throw 'PID reused or command mismatch; no process stopped.'}
 return $true
}
$webPath=Join-Path $root 'web-identity.json';$pidPath=Join-Path $root 'owned-web-processes.json'
$processes=if(Test-Path -LiteralPath $pidPath){Get-Content -Raw -LiteralPath $pidPath|ConvertFrom-Json -AsHashtable}else{@{}}
$before=@(Get-NetTCPConnection -LocalPort 3306,8000,5173 -State Listen -ErrorAction SilentlyContinue|Select-Object LocalAddress,LocalPort,OwningProcess)
try {
 $env:INTERPRETATION_PRIVATE_RUN=$root
 & $php (Join-Path $PSScriptRoot 'demo-inspect.php') offline
 if($LASTEXITCODE -ne 0){throw 'Offline admission failed.'}
 if($Action -eq 'Stop'){
  if($processes.Count -and -not(Test-Path -LiteralPath $webPath)){throw 'Owned web identity missing; no process stopped.'}
  if(Test-Path -LiteralPath $webPath){
   $recordedWeb=Get-Content -Raw -LiteralPath $webPath|ConvertFrom-Json
   foreach($kind in @('api','frontend')){$expectedPort=$recordedWeb.($kind+'_port');if($expectedPort -lt 20000 -or $expectedPort -gt 65535 -or $expectedPort -eq $a.port -or ($processes.ContainsKey($kind+'_port') -and $processes[$kind+'_port'] -ne $expectedPort)){throw 'Unsafe stop target; no process stopped.'}}
  }
  foreach($kind in @('api','frontend')){
   if($processes.ContainsKey($kind+'_pid')){
    $needle=if($kind -eq 'api'){Join-Path $PSScriptRoot 'router.php'}else{Join-Path $frontend 'node_modules/vite/bin/vite.js'}
    if(OwnedProcess $processes[$kind+'_pid'] $needle $processes[$kind+'_port']){Stop-Process -Id $processes[$kind+'_pid'] -ErrorAction Stop}
   }
  }
  if((Listeners $a.port).Count){& $php (Join-Path $backend 'tests/Engine/HostingG6/engine-control.php') shutdown $root;if($LASTEXITCODE -ne 0){throw 'Guarded own shutdown failed.'}}
  Write-Output 'DEMO_STOPPED_DATA_RETAINED=YES';return
 }
 if(Test-Path -LiteralPath $webPath){$web=Get-Content -Raw -LiteralPath $webPath|ConvertFrom-Json}else{$apiPort=FreePort;$frontPort=FreePort;while($frontPort -eq $apiPort){$frontPort=FreePort};$web=[pscustomobject]@{api_port=$apiPort;frontend_port=$frontPort};SaveJson $webPath $web}
 foreach($port in @($web.api_port,$web.frontend_port)){if($port -lt 20000 -or $port -gt 65535 -or $port -eq $a.port){throw 'Unsafe web port.'}}
 $mysql=Listeners $a.port
 if($mysql.Count){
  $mysqlId=[int](Get-Content -LiteralPath (Join-Path $root 'owned-mysql-pid.txt'))
  foreach($entry in $mysql){
   # mysqld command names its unique config; its port is pinned inside that config.
   $p=Get-CimInstance Win32_Process -Filter "ProcessId=$mysqlId"
   if($entry.OwningProcess -ne $mysqlId -or -not $p.CommandLine.Replace('\','/').Contains($configPath.Replace('\','/'))){throw 'DB port not owned by this demo.'}
  }
 } else {
  $mysqlProcess=Start-Process -FilePath 'C:\xampp\mysql\bin\mysqld.exe' -ArgumentList @("--defaults-file=$configPath",'--console') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $root ('mysql-'+(Get-Date -Format yyyyMMddHHmmssfff)+'.out')) -RedirectStandardError (Join-Path $root ('mysql-'+(Get-Date -Format yyyyMMddHHmmssfff)+'.err'))
  $mysqlProcess.Id|Set-Content -LiteralPath (Join-Path $root 'owned-mysql-pid.txt')
  for($n=0;$n -lt 30 -and -not(Listeners $a.port).Count;$n++){if($mysqlProcess.HasExited){throw 'Owned database exited.'};Start-Sleep -Milliseconds 200}
 }
 & $php (Join-Path $PSScriptRoot 'demo-inspect.php') live
 if($LASTEXITCODE -ne 0){throw 'Live server/fixture admission failed.'}
 foreach($kind in @('api','frontend')){
  $port=if($kind -eq 'api'){$web.api_port}else{$web.frontend_port}
  $needle=if($kind -eq 'api'){Join-Path $PSScriptRoot 'router.php'}else{Join-Path $frontend 'node_modules/vite/bin/vite.js'}
  $listeners=Listeners $port
  if($listeners.Count){
   if(-not $processes.ContainsKey($kind+'_pid') -or -not(OwnedProcess $processes[$kind+'_pid'] $needle $port) -or @($listeners|Where-Object OwningProcess -ne $processes[$kind+'_pid']).Count){throw 'Web port occupied by another process.'}
   continue
  }
  $stamp=Get-Date -Format yyyyMMddHHmmssfff
  if($kind -eq 'api'){$p=Start-Process -FilePath $php -ArgumentList @('-S',"127.0.0.1:$port",$needle) -WorkingDirectory $backend -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $root "api-$stamp.out") -RedirectStandardError (Join-Path $root "api-$stamp.err")}
  else {$env:VITE_API_URL="http://127.0.0.1:$($web.api_port)/api";$env:VITE_BACKEND_URL="http://127.0.0.1:$($web.api_port)";$p=Start-Process -FilePath (Get-Command node).Source -ArgumentList @($needle,'--host','127.0.0.1','--port',[string]$port,'--strictPort') -WorkingDirectory $frontend -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $root "vite-$stamp.out") -RedirectStandardError (Join-Path $root "vite-$stamp.err")}
  $processes[$kind+'_pid']=$p.Id;$processes[$kind+'_port']=$port;SaveJson $pidPath $processes
 }
 foreach($url in @("http://127.0.0.1:$($web.api_port)/up","http://127.0.0.1:$($web.frontend_port)/login")){
  $ready=$false;for($n=0;$n -lt 30;$n++){try{if((Invoke-WebRequest -Uri $url -TimeoutSec 3).StatusCode -eq 200){$ready=$true;break}}catch{};Start-Sleep -Milliseconds 200};if(-not $ready){throw 'Owned demo service not healthy.'}
 }
 $credentials=Get-Content -Raw -LiteralPath (Join-Path $root 'synthetic-credential-handover.json')|ConvertFrom-Json
 $handover="SYNTHETIC LOCAL DEMO ONLY — never production accounts`r`nFrontend: http://127.0.0.1:$($web.frontend_port)/login`r`nBackend: http://127.0.0.1:$($web.api_port)`r`nCase: /quests/1`r`n"
 foreach($label in @('STG_MANAGER','STG_ORDINARY_REVIEWER','STG_UNASSIGNED_STAFF')){$handover+="`r`n$label`r`nEmail: $($label.ToLowerInvariant())@example.test`r`nPassword: $($credentials.$label)`r`n"}
 [IO.File]::WriteAllText((Join-Path $root 'DEMO_ACCOUNTS_PRIVATE.txt'),$handover,[Text.UTF8Encoding]::new($false))
 Write-Output "DEMO_FRONTEND=http://127.0.0.1:$($web.frontend_port)"
 Write-Output "DEMO_BACKEND=http://127.0.0.1:$($web.api_port)"
 Write-Output "PRIVATE_CREDENTIALS_FILE=$root\DEMO_ACCOUNTS_PRIVATE.txt"
} finally {
 foreach($key in $keys){[Environment]::SetEnvironmentVariable($key,$previous[$key],'Process')};Set-Location -LiteralPath $oldLocation.Path
 $after=@(Get-NetTCPConnection -LocalPort 3306,8000,5173 -State Listen -ErrorAction SilentlyContinue|Select-Object LocalAddress,LocalPort,OwningProcess)
 SaveJson (Join-Path $root ('source-listeners-'+(Get-Date -Format yyyyMMddHHmmssfff)+'.json')) @{before=$before;after=$after}
}
