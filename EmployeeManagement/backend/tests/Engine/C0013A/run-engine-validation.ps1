param(
    [ValidateSet('Preflight','Prepare','Test','UpgradeIssuer')][string]$Mode='Preflight',
    [string]$RunFile,
    [string]$Filter,
    [ValidateSet('C0013A','C0013B','C0013C','C0014')][string]$Scenario='C0013A',
    [string]$EvidenceRoot='C:\Users\nghia\.codex\visualizations\2026\08\26\01a03b8f-349a-7623-871d-4eba6f69cec6'
)
$ErrorActionPreference='Stop'
$engineBackend=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$enginePhp='C:\xampp\php\php.exe'
$engineIdentity=[Security.Principal.WindowsIdentity]::GetCurrent()
$engineSids=@($engineIdentity.User.Value,'S-1-5-18','S-1-5-32-544')|Select-Object -Unique
function ApprovedBackupPath([string]$path) {
    return $path -match '^G:\\THEMIS_Backup\\(?:2026-10-28_C001_3A_|2026-10-29_HOSTING_G3_)\d{6}_[a-f0-9]{6}\\employee_management\.sql$'
}
function PrivateFolder([string]$path){
    $acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false);$acl.SetOwner($engineIdentity.User)
    foreach($sid in $engineSids){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
    Set-Acl -LiteralPath $path -AclObject $acl
    $actual=Get-Acl -LiteralPath $path
    if(-not $actual.AreAccessRulesProtected){throw 'Private ACL required.'}
    foreach($rule in $actual.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){if($rule.IdentityReference.Value -notin $engineSids -or $rule.AccessControlType -ne 'Allow'){throw 'Unexpected engine evidence ACL.'}}
}
if(-not $RunFile){
    $backup=Get-Content -Raw -LiteralPath (Join-Path $EvidenceRoot 'c0013a-backup-result.json')|ConvertFrom-Json
    if($backup.status -ne 'BACKUP_HASH_VERIFIED' -or -not (ApprovedBackupPath $backup.backup_path)){throw 'Approved fresh independent backup evidence required.'}
    if((Get-FileHash -LiteralPath $backup.backup_path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $backup.sha256){throw 'Backup hash mismatch.'}
    $engineId=[guid]::NewGuid().ToString('N').Substring(0,8)
    $engineRoot=Join-Path $EvidenceRoot ('c0013a-'+$engineId)
    New-Item -ItemType Directory -Path $engineRoot|Out-Null;PrivateFolder $engineRoot
    $RunFile=Join-Path $engineRoot 'run.json'
    $nonce=[guid]::NewGuid().ToString('N')+[guid]::NewGuid().ToString('N')
    $runHash=([BitConverter]::ToString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($nonce)))).Replace('-','').ToLowerInvariant()
    $engineName='employee_management_c001_engine_test_'+(Get-Date -Format 'yyyyMMdd_HHmmss')+'_'+$engineId
    [IO.File]::WriteAllText($RunFile,([ordered]@{database=$engineName;run_hash=$runHash;normal_databases=@('employee_management');purpose='C001.3A DISPOSABLE NOT PRODUCTION NOT DEFAULT';backup_path=$backup.backup_path;backup_sha256=$backup.sha256}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $EvidenceRoot 'c0013a-current-run.txt'),$RunFile,[Text.UTF8Encoding]::new($false))
}
$engineRun=Get-Content -Raw -LiteralPath $RunFile|ConvertFrom-Json
if(-not (ApprovedBackupPath $engineRun.backup_path) -or
    (Get-FileHash -LiteralPath $engineRun.backup_path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $engineRun.backup_sha256){throw 'Fresh independent backup is unavailable or changed.'}
if($engineRun.database -notmatch '^employee_management_c001_engine_test_\d{8}_\d{6}_[a-f0-9]{8}$' -or $engineRun.database.Length -gt 64 -or $engineRun.database -eq 'employee_management'){throw 'Source/unknown validation target refused.'}
$engineRoot=Split-Path -Parent $RunFile
$engineEnv=@{APP_ENV='testing';APP_CONFIG_CACHE=(Join-Path $engineRoot 'no-config.php');LARAVEL_STORAGE_PATH=(Join-Path $engineRoot 'storage');
    APP_KEY='base64:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';DB_CONNECTION='mysql';DB_URL='';
    SESSION_DRIVER='array';CACHE_STORE='array';MAIL_MAILER='array';QUEUE_CONNECTION='sync';LOG_CHANNEL='null';BCRYPT_ROUNDS='4';C001_ENGINE_RUN_FILE=$RunFile;C001_ENGINE_SCENARIO=$Scenario;
    GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON='{}';GOOGLE_DRIVE_OAUTH_TOKEN_JSON='{}';GOOGLE_DRIVE_OAUTH_CLIENT_JSON='{}';
    GOOGLE_DRIVE_OAUTH_TOKEN_PATH=(Join-Path $engineRoot 'no-token.json');GOOGLE_DRIVE_OAUTH_CLIENT_JSON_PATH=(Join-Path $engineRoot 'no-client.json');
    OPENAI_API_KEY='SYNTHETIC';ANTHROPIC_API_KEY='SYNTHETIC';GROQ_API_KEY='SYNTHETIC';GEMINI_API_KEY='SYNTHETIC';
    HTTP_PROXY='http://127.0.0.1:9';HTTPS_PROXY='http://127.0.0.1:9';NO_PROXY=''}
$previous=@{};foreach($key in $engineEnv.Keys){$previous[$key]=[Environment]::GetEnvironmentVariable($key,'Process');[Environment]::SetEnvironmentVariable($key,$engineEnv[$key],'Process')}
$location=Get-Location
try{
    foreach($folder in @('framework/views','framework/cache/data','framework/sessions','logs')){New-Item -ItemType Directory -Path (Join-Path $engineEnv.LARAVEL_STORAGE_PATH $folder) -Force|Out-Null}
    Set-Location -LiteralPath $engineBackend
    'INTENDED_DISPOSABLE_DATABASE='+$engineRun.database
    'SOURCE_DATABASE_DENIED=employee_management; normal named connections removed in engine bootstrap'
    'RUN_FILE='+$RunFile
    if($Mode -eq 'Preflight'){'DRY_RUN_ONLY=NO_DATABASE_CREATED';exit 0}
    if($Mode -eq 'Prepare'){& $enginePhp (Join-Path $PSScriptRoot 'prepare-engine.php') '--apply-new-disposable';exit $LASTEXITCODE}
    if($Mode -eq 'UpgradeIssuer'){& $enginePhp (Join-Path $PSScriptRoot 'upgrade-issuer-engine.php');exit $LASTEXITCODE}
    if($Mode -eq 'Test'){
        if($Scenario -eq 'C0014' -and -not $Filter){$Filter='test_small_office_|test_true_independent_process_concurrency|test_any_required_write_failure'}
        $filterArgs=@();if($Filter){$filterArgs=@('--filter',$Filter)}
        $harnessFile=if($Scenario -eq 'C0014'){'C001SmallOfficeEngineHarness.php'}elseif($Scenario -eq 'C0013C'){'C001IssuerEngineHarness.php'}elseif($Scenario -eq 'C0013B'){'C001SelfEngineHarness.php'}else{'C001EngineHarness.php'}
        $testStamp=Get-Date -Format 'yyyyMMdd-HHmmssfff'
        $junitPath=Join-Path $engineRoot ('engine-'+$Scenario+'-'+$testStamp+'-junit.xml')
        $testLog=Join-Path $engineRoot ('engine-'+$Scenario+'-'+$testStamp+'-phpunit.log')
        & $enginePhp -d auto_prepend_file=vendor/autoload.php vendor/phpunit/phpunit/phpunit --no-configuration --do-not-cache-result --colors=never --log-junit $junitPath (Join-Path $PSScriptRoot $harnessFile) @filterArgs 2>&1|Tee-Object -FilePath $testLog|Select-Object -Last 80
        $testExit=$LASTEXITCODE
        [IO.File]::WriteAllText((Join-Path $engineRoot 'engine-latest-result.json'),(@{exit=$testExit;scenario=$Scenario;filter=$Filter;junit=$junitPath;log=$testLog}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
        exit $testExit
    }
}finally{
    Set-Location -LiteralPath $location.Path
    foreach($key in $previous.Keys){[Environment]::SetEnvironmentVariable($key,$previous[$key],'Process')}
}
