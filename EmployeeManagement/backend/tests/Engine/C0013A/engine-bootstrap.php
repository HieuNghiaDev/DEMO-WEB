<?php

use App\Services\C001EngineValidationScope;
use Illuminate\Support\Facades\DB;

/** Loaded only by the dedicated C001.3A process, never by normal tests or the web app. */
function c001EngineConfigure(\Illuminate\Foundation\Application $app): array
{
    $file = getenv('C001_ENGINE_RUN_FILE');
    if (! is_string($file) || ! preg_match('~[/\\\\]c0013a-[a-f0-9]{8}[/\\\\]run\.json$~D', $file)) throw new LogicException('Missing private engine run file.');
    $run = json_decode(file_get_contents($file), true, flags: JSON_THROW_ON_ERROR);
    $normal = [];
    foreach (config('database.connections') as $config) if (is_string($config['database'] ?? null)) $normal[] = $config['database'];
    $normal = array_unique(['employee_management', ...$normal, ...$run['normal_databases']]);
    C001EngineValidationScope::assertName($run['database'], $normal);
    if ($app->environment() !== 'testing' || PHP_SAPI !== 'cli') throw new LogicException('Wrong engine environment.');
    $connection = config('database.connections.mysql');
    $connection['database'] = $run['database']; $connection['host'] = '127.0.0.1'; $connection['port'] = 3306;
    $connection['url'] = null; $connection['prefix'] = ''; $connection['unix_socket'] = ''; $connection['timezone'] = '+00:00';
    unset($connection['read'], $connection['write']);
    // Remove all ordinary named connections from this isolated process; no accidental fallback can resolve.
    DB::purge();
    config(['database.default' => 'c001_engine', 'database.connections' => ['c001_engine' => $connection],
        'cache.default' => 'array', 'session.driver' => 'array', 'session.connection' => 'c001_engine', 'mail.default' => 'array']);
    $db = DB::connection();
    if ($db->getPdo()->query('SELECT DATABASE()')->fetchColumn() !== $run['database']) throw new LogicException('Engine connection target mismatch.');
    // Observe only: MariaDB 10.4 may expose this as read-only. Reviewed DDL uses explicit DATETIME expiry instead.
    $timestampProfile = $db->selectOne('SELECT @@global.explicit_defaults_for_timestamp AS global_value');
    file_put_contents(dirname($file).'/timestamp-profile-'.getmypid().'.json', json_encode([
        'global_value_unchanged' => (int) $timestampProfile->global_value,
        'session_variable' => 'UNSUPPORTED_GLOBAL_ONLY', 'server_settings_changed' => false], JSON_THROW_ON_ERROR));
    $db->beforeExecuting(function (string $sql, array $bindings, $connection) use ($run, $normal): void {
        if ($connection->getDatabaseName() !== $run['database']
            || $connection->getPdo()->query('SELECT DATABASE()')->fetchColumn() !== $run['database']) throw new LogicException('Wrong DDL/DML target.');
        if (preg_match('/^\s*(?:USE\b|GRANT\b|REVOKE\b|(?:CREATE|ALTER|DROP)\s+(?:DATABASE|USER)\b|SET\s+(?:@@)?GLOBAL\b)/i', $sql)) {
            throw new LogicException('Forbidden server-level statement.');
        }
        foreach ($normal as $name) {
            if (preg_match('/(?:`'.preg_quote($name, '/').'`|\b'.preg_quote($name, '/').'\b)\s*\./i', $sql)) throw new LogicException('Source-qualified statement denied.');
        }
    });
    $scope = C001EngineValidationScope::admit($run['database'], $run['run_hash'], $normal);
    $app->instance(C001EngineValidationScope::class, $scope);
    \Illuminate\Support\Facades\Http::preventStrayRequests();
    return $run;
}

