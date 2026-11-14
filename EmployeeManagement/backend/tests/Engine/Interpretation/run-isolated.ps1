param([Parameter(Mandatory=$true)][string]$EvidenceRoot, [string]$PhpBinary='C:\xampp\php\php.exe', [switch]$Demo)
$ErrorActionPreference='Stop'
$backend=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$bin='C:\xampp\mysql\bin'
$php=$PhpBinary
function Hex([int]$bytes=32) { $data=[byte[]]::new($bytes);[Security.Cryptography.RandomNumberGenerator]::Fill($data);return [Convert]::ToHexString($data).ToLowerInvariant() }
function SaveJson($path,$obj) { [IO.File]::WriteAllText($path,($obj|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false)) }
function CheckExit($phase) { if($LASTEXITCODE -ne 0){throw "$phase failed; evidence retained, no reset/drop."} }
$id=Hex 8
$root=Join-Path ([IO.Path]::GetFullPath($EvidenceRoot)) ('g6-'+$id)
if(Test-Path -LiteralPath $root){throw 'Run directory already exists.'}
New-Item -ItemType Directory -Path $root|Out-Null
$acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false)
foreach($sid in @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18','S-1-5-32-544')){
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
}
Set-Acl -LiteralPath $root -AclObject $acl
$before=@(Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue|Select-Object LocalAddress,LocalPort,OwningProcess)
SaveJson (Join-Path $root 'source-listener-before.json') $before
$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$listener.Start();$port=$listener.LocalEndpoint.Port;$listener.Stop()
if($port -lt 20000 -or $port -gt 65535){throw 'Unsupported disposable port; retry with a fresh run.'}
$data=Join-Path $root 'data'
$database='themis_stg_g6_'+$id
$prov='g6_prov_'+$id;$runtime='g6_app_'+$id
$rootPassword=Hex;$provPassword=Hex;$runtimePassword=Hex
$appKey='base64:'+[Convert]::ToBase64String([Convert]::FromHexString((Hex)))
SaveJson (Join-Path $root 'instance-admin.json') @{password=$rootPassword}
SaveJson (Join-Path $root 'provisioner.json') @{username=$prov;password=$provPassword;app_key=$appKey}
SaveJson (Join-Path $root 'runtime.json') @{username=$runtime;password=$runtimePassword;app_key=$appKey}
$admission=@{purpose='THEMIS_G6_SYNTHETIC_ONLY';run_id=$id;database=$database;environment_id=('synthetic-g6-'+$id);
    host='127.0.0.1';port=[int]$port;driver='mysql';engine='MariaDB';version='10.4.32';data_directory=$data;
    provisioning_user=$prov;runtime_user=$runtime;
    schema_sha256=(Get-FileHash (Join-Path $backend 'database/staging/schema.json')).Hash.ToLowerInvariant();
    fixture_sha256=(Get-FileHash (Join-Path $backend 'database/staging/fixtures.json')).Hash.ToLowerInvariant()}
SaveJson (Join-Path $root 'admission.json') $admission
# No --service option; initialize only NEW system tables, never copy XAMPP data/backup.
& (Join-Path $bin 'mysql_install_db.exe') "--datadir=$data" "--port=$port" "--password=$rootPassword" '--silent' 1> (Join-Path $root 'initialize.log') 2>&1
CheckExit 'Fresh standalone initialization'
$sql="CREATE DATABASE ``$database`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`n"
foreach($hostName in @('localhost','127.0.0.1')){
    $rights='ALL PRIVILEGES'
    $sql+="CREATE USER '$prov'@'$hostName' IDENTIFIED BY '$provPassword';`nGRANT $rights ON ``$database``.* TO '$prov'@'$hostName';`n"
    $sql+="CREATE USER '$runtime'@'$hostName' IDENTIFIED BY '$runtimePassword';`nGRANT SELECT,INSERT,UPDATE,DELETE ON ``$database``.* TO '$runtime'@'$hostName';`n"
}
[IO.File]::WriteAllText((Join-Path $root 'initialize-synthetic.sql'),$sql,[Text.UTF8Encoding]::new($false))
$unixRoot=$root.Replace('\','/')
$ini="[mysqld]`nbasedir=C:/xampp/mysql`ndatadir=$unixRoot/data`nport=$port`nbind-address=127.0.0.1`nskip-name-resolve`nskip-log-bin`ninnodb-buffer-pool-size=64M`nmax-connections=15`ninit-file=$unixRoot/initialize-synthetic.sql`nlog-error=$unixRoot/server-error.log`npid-file=$unixRoot/server.pid`ntmpdir=$unixRoot`n"
[IO.File]::WriteAllText((Join-Path $root 'server.ini'),$ini,[Text.UTF8Encoding]::new($false))
$client="[client]`nhost=127.0.0.1`nport=$port`nprotocol=tcp`nuser=root`npassword=$rootPassword`n"
[IO.File]::WriteAllText((Join-Path $root 'root-client.cnf'),$client,[Text.UTF8Encoding]::new($false))
$process=$null;$keepDemo=$false;$oldLocation=Get-Location;$previousRun=$env:INTERPRETATION_PRIVATE_RUN
try {
$process=Start-Process -FilePath (Join-Path $bin 'mysqld.exe') -ArgumentList @("--defaults-file=$root\server.ini",'--console') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $root 'server-stdout.log') -RedirectStandardError (Join-Path $root 'server-stderr.log')
$process.Id | Set-Content (Join-Path $root 'owned-mysql-pid.txt')
$ready=$false
for($n=0;$n -lt 30;$n++){
 if($process.HasExited){throw 'Owned disposable exited; retained, no source changes.'}
 $tcp=Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
 if($tcp -and @($tcp|Where-Object OwningProcess -ne $process.Id).Count -eq 0){$ready=$true;break}
 Start-Sleep -Milliseconds 500
}
if(-not $ready){throw 'Owned listener not ready.'}
foreach($dir in @('storage/framework/views','storage/framework/cache/data','storage/framework/sessions','storage/logs','synthetic-files')){New-Item -ItemType Directory -Path (Join-Path $root $dir) -Force|Out-Null}
Set-Location -LiteralPath $backend
& $php 'database/tools/provision_synthetic_staging.php' '--apply-empty-synthetic' (Join-Path $root 'admission.json') (Join-Path $root 'provisioner.json') $root 2>&1 | Tee-Object (Join-Path $root 'installer.log')
CheckExit 'Pinned synthetic base'
$env:INTERPRETATION_PRIVATE_RUN=$root
& $php 'tests/Engine/Interpretation/prepare.php' 2>&1 | Tee-Object (Join-Path $root 'interpretation-prepare.log')
CheckExit 'Exact new migration and synthetic-only grants'
if($Demo){
 & $php 'tests/Engine/Interpretation/demo-fixtures.php'
 CheckExit 'Synthetic permission demo fixtures'
 # Initialization is one-time. Restart must never replay CREATE DATABASE/USER or fixture writes.
 $configPath=Join-Path $root 'server.ini'
 $config=[IO.File]::ReadAllText($configPath) -replace '(?m)^init-file=.*\r?\n',''
 [IO.File]::WriteAllText($configPath,$config,[Text.UTF8Encoding]::new($false))
 SaveJson (Join-Path $root 'demo-service-admission.json') @{purpose='THEMIS_INTERPRETATION_LOCAL_DEMO';run_id=$id;configuration_sha256=(Get-FileHash -LiteralPath $configPath).Hash;php_binary=$php}
 & (Join-Path $PSScriptRoot 'demo-services.ps1') -Action Start -RunDirectory $root
 $keepDemo=$true
 $root | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'active-demo.path')
} else {
& $php '-d' 'auto_prepend_file=vendor/autoload.php' 'vendor/phpunit/phpunit/phpunit' '--no-configuration' '--do-not-cache-result' '--colors=never' '--log-junit' (Join-Path $root 'integration-junit.xml') (Join-Path $PSScriptRoot 'HttpIntegrationTest.php') (Join-Path $PSScriptRoot 'ConcurrencyTest.php') 2>&1 | Tee-Object (Join-Path $root 'integration-tests.log')
CheckExit 'Actual engine HTTP and concurrency regressions'
}
} finally {
 if(-not $keepDemo -and $process -and -not $process.HasExited){
  & $php (Join-Path $backend 'tests/Engine/HostingG6/engine-control.php') 'shutdown' $root
  if($LASTEXITCODE -ne 0){Write-Warning 'Owned instance retained; guarded shutdown failed. Source is untouched.'}
 }
 $env:INTERPRETATION_PRIVATE_RUN=$previousRun
 Set-Location -LiteralPath $oldLocation.Path
 $after=@(Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue|Select-Object LocalAddress,LocalPort,OwningProcess)
 SaveJson (Join-Path $root 'source-listener-after.json') $after
 'PRIVATE_INTERPRETATION_EVIDENCE='+$root
}
