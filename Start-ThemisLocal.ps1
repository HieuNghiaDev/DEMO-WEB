#requires -Version 5.1
$ErrorActionPreference = 'Stop'

$backend = Join-Path $PSScriptRoot 'EmployeeManagement\backend'
$frontend = Join-Path $PSScriptRoot 'EmployeeManagement\frontend'
$artisan = Join-Path $backend 'artisan'
$vite = Join-Path $frontend 'node_modules\vite\bin\vite.js'
$php = (Get-Command php -CommandType Application -ErrorAction Stop).Source
$node = (Get-Command node -CommandType Application -ErrorAction Stop).Source
$logs = Join-Path $backend 'storage\logs'

function Get-ListeningIds([int]$Port) {
    $pattern = '^\s*TCP\s+\S+:' + $Port + '\s+\S+\s+LISTENING\s+(\d+)\s*$'
    netstat.exe -ano | ForEach-Object { if ($_ -match $pattern) { [int]$Matches[1] } } | Select-Object -Unique
}

function Get-LocalWebProcess([int]$Port, [string]$Directory) {
    $processIds = @(Get-ListeningIds $Port)
    foreach ($processId in $processIds) {
        $listener = Get-CimInstance Win32_Process -Filter "ProcessId=$processId"
        $command = ([string]$listener.CommandLine).Replace('/', '\')
        if ($command.IndexOf($Directory + '\', [StringComparison]::OrdinalIgnoreCase) -lt 0) {
            throw "Port $Port is in use by a process outside this THEMIS checkout (PID $processId)."
        }
    }
    $processIds | Select-Object -First 1
}

function Start-LocalProcess([string]$Name, [string]$Executable, [string[]]$Arguments, [string]$Directory) {
    $logName = "$Name-$(Get-Date -Format 'yyyyMMdd-HHmmssfff')"
    Start-Process -FilePath $Executable -ArgumentList $Arguments -WorkingDirectory $Directory -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logs "$logName.out.log") -RedirectStandardError (Join-Path $logs "$logName.err.log") -PassThru
}

function Start-LocalWebService([string]$Name, [int]$Port, [string]$Executable, [string[]]$Arguments, [string]$Directory) {
    $existing = Get-LocalWebProcess $Port $Directory
    if ($existing) {
        Write-Host "$Name already running (PID $existing)."
        return
    }

    $process = Start-LocalProcess $Name $Executable $Arguments $Directory
    for ($check = 0; $check -lt 40; $check++) {
        Start-Sleep -Milliseconds 250
        if ($process.HasExited) { break }
        if (Get-LocalWebProcess $Port $Directory) {
            Write-Host "$Name started on port $Port."
            return
        }
    }
    throw "$Name did not start on port $Port. Check its logs in $logs."
}

function Get-ChatWorkerIds {
    # Recognize the previous manual launcher as well as this launcher's absolute Artisan path.
    $absoluteArtisan = [regex]::Escape($artisan)
    $commandPattern = '(?:\sartisan|\s"?' + $absoluteArtisan + '"?)\s+queue:work\s+database\s+--queue=chat-translations(?:\s|$)'
    Get-CimInstance Win32_Process -Filter "Name='php.exe'" | Where-Object {
        $_.ExecutablePath -eq $php -and $_.CommandLine -match $commandPattern
    } | Select-Object -ExpandProperty ProcessId
}

$startupLock = [Threading.Mutex]::new($false, 'Local\THEMIS.LocalStartup')
$locked = $false
try {
    try { $locked = $startupLock.WaitOne(30000) }
    catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'Another THEMIS launcher is still running.' }

    if (-not (Test-Path -LiteralPath (Join-Path $backend 'vendor\autoload.php')) -or -not (Test-Path -LiteralPath $vite)) {
        throw 'Install the existing PHP and frontend dependencies before starting THEMIS.'
    }
    if (-not (Get-ListeningIds 3306)) { throw 'Start MySQL in XAMPP on port 3306, then run this launcher again.' }

    Push-Location -LiteralPath $backend
    try {
        $translationProvider = @'
<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$db = config('database.connections.mysql');
$queue = config('queue.connections.database');
if (!$app->environment('local') || config('database.default') !== 'mysql'
    || $db['host'] !== '127.0.0.1' || (string) $db['port'] !== '3306' || $db['database'] !== 'employee_management'
    || !empty($db['url']) || !empty($db['unix_socket']) || !empty($db['read']) || !empty($db['write'])
    || $queue['driver'] !== 'database' || ($queue['connection'] ?? 'mysql') !== 'mysql' || (int) $queue['retry_after'] <= 25) {
    exit(1);
}
echo config('chat_translation.provider') === 'gemini' && trim((string) config('chat_translation.gemini_key')) !== ''
    ? 'gemini' : 'disabled';
'@ | & $php
        if ($LASTEXITCODE -ne 0 -or $translationProvider -notin @('gemini', 'disabled')) {
            throw 'Expected APP_ENV=local, MySQL employee_management on 127.0.0.1:3306, and a compatible local database queue.'
        }
    } finally {
        Pop-Location
    }

    $null = Get-LocalWebProcess 8000 $backend
    $null = Get-LocalWebProcess 5173 $frontend
    $workerIds = @(Get-ChatWorkerIds)
    if ($workerIds.Count -gt 1) { throw 'Multiple chat-translations workers were found. Review the running workers before starting THEMIS.' }

    New-Item -ItemType Directory -Path $logs -Force | Out-Null
    $artisanArg = '"{0}"' -f $artisan
    $viteArg = '"{0}"' -f $vite
    Start-LocalWebService 'laravel' 8000 $php @($artisanArg, 'serve', '--host=127.0.0.1', '--port=8000', '--tries=1') $backend
    Start-LocalWebService 'vite' 5173 $node @($viteArg, '--host=localhost', '--port=5173', '--strictPort') $frontend

    if ($translationProvider -eq 'disabled') {
        Write-Warning 'Gemini chat translation is disabled or its key is missing.'
    } elseif ($workerIds.Count -eq 1) {
        Write-Host "Gemini translation worker already running (PID $($workerIds[0]))."
    } else {
        $worker = Start-LocalProcess 'chat-translations' $php @($artisanArg, 'queue:work', 'database', '--queue=chat-translations', '--timeout=25', '--sleep=3', '--no-interaction', '--quiet') $backend
        Start-Sleep -Seconds 1
        if ($worker.HasExited) { throw "Gemini translation worker exited. Check its logs in $logs." }
        Write-Host "Gemini translation worker started (PID $($worker.Id))."
    }

    Write-Host 'THEMIS is running at http://localhost:5173'
} finally {
    if ($locked) { $startupLock.ReleaseMutex() }
    $startupLock.Dispose()
}
