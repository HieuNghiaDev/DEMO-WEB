param([Parameter(Mandatory=$true)][string]$EvidenceRoot, [switch]$FaultMissingTrigger)
$ErrorActionPreference='Stop'
$backend=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$bin='C:\xampp\mysql\bin'
$php='C:\xampp\php\php.exe'
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
    $rights=if($FaultMissingTrigger){'CREATE,ALTER,DROP,SELECT,INSERT,UPDATE,DELETE,INDEX,REFERENCES'}else{'ALL PRIVILEGES'}
    $sql+="CREATE USER '$prov'@'$hostName' IDENTIFIED BY '$provPassword';`nGRANT $rights ON ``$database``.* TO '$prov'@'$hostName';`n"
    $sql+="CREATE USER '$runtime'@'$hostName' IDENTIFIED BY '$runtimePassword';`nGRANT SELECT,INSERT,UPDATE,DELETE ON ``$database``.* TO '$runtime'@'$hostName';`n"
}
[IO.File]::WriteAllText((Join-Path $root 'initialize-synthetic.sql'),$sql,[Text.UTF8Encoding]::new($false))
$unixRoot=$root.Replace('\','/')
$ini="[mysqld]`nbasedir=C:/xampp/mysql`ndatadir=$unixRoot/data`nport=$port`nbind-address=127.0.0.1`nskip-name-resolve`nskip-log-bin`ninnodb-buffer-pool-size=64M`nmax-connections=15`ninit-file=$unixRoot/initialize-synthetic.sql`nlog-error=$unixRoot/server-error.log`npid-file=$unixRoot/server.pid`ntmpdir=$unixRoot`n"
[IO.File]::WriteAllText((Join-Path $root 'server.ini'),$ini,[Text.UTF8Encoding]::new($false))
$client="[client]`nhost=127.0.0.1`nport=$port`nprotocol=tcp`nuser=root`npassword=$rootPassword`n"
[IO.File]::WriteAllText((Join-Path $root 'root-client.cnf'),$client,[Text.UTF8Encoding]::new($false))
$process=$null;$oldLocation=Get-Location;$previousRun=$env:G6_PRIVATE_RUN
try {
    $process=Start-Process -FilePath (Join-Path $bin 'mysqld.exe') -ArgumentList @("--defaults-file=$root\server.ini",'--console') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $root 'server-stdout.log') -RedirectStandardError (Join-Path $root 'server-stderr.log')
    $ready=$false
    for($n=0;$n -lt 30;$n++){
        if($process.HasExited){throw 'Owned disposable MariaDB exited; inspect private startup log.'}
        $tcp=Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if($tcp -and @($tcp|Where-Object OwningProcess -ne $process.Id).Count -eq 0){$ready=$true;break}
        Start-Sleep -Milliseconds 500
    }
    if(-not $ready){throw 'Owned listener not ready.'}
    foreach($dir in @('storage/framework/views','storage/framework/cache/data','storage/framework/sessions','storage/logs','synthetic-files')){New-Item -ItemType Directory -Path (Join-Path $root $dir) -Force|Out-Null}
    Set-Location -LiteralPath $backend
    & $php 'database/tools/provision_synthetic_staging.php' '--apply-empty-synthetic' (Join-Path $root 'admission.json') (Join-Path $root 'provisioner.json') $root 2>&1|Tee-Object (Join-Path $root 'installer.log')
    if($FaultMissingTrigger){
        if($LASTEXITCODE -eq 0){throw 'Expected incomplete-DDL privilege denial did not occur.'}
        & $php (Join-Path $PSScriptRoot 'engine-control.php') 'verify-partial-failure' $root
        CheckExit 'Partial DDL retained with exact failure journal'
        return
    }
    CheckExit 'Pinned synthetic schema/fixture apply'
    $env:G6_PRIVATE_RUN=$root
    & $php '-d' 'auto_prepend_file=vendor/autoload.php' 'vendor/phpunit/phpunit/phpunit' '--no-configuration' '--do-not-cache-result' '--colors=never' '--log-junit' (Join-Path $root 'workflow-junit.xml') (Join-Path $PSScriptRoot 'StagingWorkflowHarness.php') 2>&1|Tee-Object (Join-Path $root 'workflow.log')|Select-Object -Last 45
    CheckExit 'Synthetic runtime HTTP workflow'
    & $php (Join-Path $PSScriptRoot 'engine-control.php') 'before-backup' $root
    CheckExit 'Synthetic schema/count/content snapshot'
    $dump=Join-Path $root 'synthetic-only.sql'
    & (Join-Path $bin 'mysqldump.exe') "--defaults-file=$root\root-client.cnf" '--single-transaction' '--routines' '--triggers' '--hex-blob' '--skip-comments' '--skip-add-drop-table' "--result-file=$dump" $database 2> (Join-Path $root 'dump.stderr')
    CheckExit 'Synthetic-only export'
    $digest=(Get-FileHash -LiteralPath $dump -Algorithm SHA256).Hash
    & $php (Join-Path $PSScriptRoot 'engine-control.php') 'restore-create' $root
    CheckExit 'Fresh synthetic restore destination'
    & (Join-Path $bin 'mysql.exe') "--defaults-file=$root\root-client.cnf" "--database=themis_g6_restore_$id" "--execute=source $unixRoot/synthetic-only.sql" 2> (Join-Path $root 'restore.stderr')
    CheckExit 'Synthetic-only restore'
    if((Get-FileHash -LiteralPath $dump -Algorithm SHA256).Hash -ne $digest){throw 'Synthetic dump changed.'}
    & $php (Join-Path $PSScriptRoot 'engine-control.php') 'verify-restore' $root
    CheckExit 'Restored schema/count/content/FK verification'
    SaveJson (Join-Path $root 'result.json') @{status='PASS';schema_apply=$true;synthetic_workflows=$true;backup_restore=$true;dump_sha256=$digest;source_mysql_connected=$false;railway_changed=$false}
} finally {
    if($process -and -not $process.HasExited){
        # Control verifies the exact port/datadir/database/root identity before issuing SHUTDOWN; never kill XAMPP.
        & $php (Join-Path $PSScriptRoot 'engine-control.php') 'shutdown' $root
        if($LASTEXITCODE -ne 0){Write-Warning 'Owned disposable retained; guarded shutdown failed. No process killed.'}
    }
    $env:G6_PRIVATE_RUN=$previousRun
    Set-Location -LiteralPath $oldLocation.Path
    $after=@(Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue|Select-Object LocalAddress,LocalPort,OwningProcess)
    SaveJson (Join-Path $root 'source-listener-after.json') $after
    'PRIVATE_G6_EVIDENCE='+$root
}
