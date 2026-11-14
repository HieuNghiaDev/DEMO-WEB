<?php

require dirname(__DIR__, 3).'/vendor/autoload.php';
// Use PHPUnit's installed bootstrap for an explicit isolated CLI capability, not an application env flag.
if (! defined('PHPUNIT_COMPOSER_INSTALL')) define('PHPUNIT_COMPOSER_INSTALL', dirname(__DIR__, 3).'/vendor/autoload.php');
$app = require dirname(__DIR__, 3).'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
require __DIR__.'/engine-bootstrap.php';

use App\Services\C001EngineValidationScope;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

try {
    $run = json_decode(file_get_contents(getenv('C001_ENGINE_RUN_FILE')), true, flags: JSON_THROW_ON_ERROR);
    $cfg = config('database.connections.mysql');
    $normal = $run['normal_databases'];
    foreach (config('database.connections') as $connection) {
        if (is_string($connection['database'] ?? null)) $normal[] = $connection['database'];
    }
    C001EngineValidationScope::assertName($run['database'], $normal);
    if (! app()->environment('testing') || PHP_SAPI !== 'cli' || ($argv[1] ?? '') !== '--apply-new-disposable') throw new LogicException('Explicit disposable apply required.');
    echo 'INTENDED_DDL_TARGET='.$run['database'].PHP_EOL;
    $pdo = new PDO('mysql:host=127.0.0.1;port=3306;charset=utf8mb4', $cfg['username'], $cfg['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $exists = $pdo->prepare('SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?'); $exists->execute([$run['database']]);
    if ($exists->fetchColumn()) throw new LogicException('Database already exists; no reuse/drop is allowed.');
    $pdo->exec('CREATE DATABASE `'.$run['database'].'` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci');
    $pdo->exec('USE `'.$run['database'].'`');
    if ($pdo->query('SELECT DATABASE()')->fetchColumn() !== $run['database']) throw new LogicException('New DB identity mismatch.');
    $pdo->exec('CREATE TABLE c001_engine_validation_marker (id INT PRIMARY KEY, purpose VARCHAR(100) NOT NULL, run_hash CHAR(64) NOT NULL) ENGINE=InnoDB');
    $pdo->prepare('INSERT INTO c001_engine_validation_marker VALUES(1,?,?)')->execute(['C001.3A DISPOSABLE NOT PRODUCTION NOT DEFAULT', $run['run_hash']]);
    $pdo = null;
    c001EngineConfigure($app);
    $manifest = [];
    // Fresh schema only; omit credential/role conversion/backfill and unrelated seeded-release migrations.
    $skip = ['2026_08_21_090000', '2026_08_24_130000', '2026_08_26_120000', '2026_08_26_130000',
        '2026_09_02_130000', '2026_09_28_100000', '2026_10_20_010000', '2026_10_20_020000', '2026_10_22_000000', '2026_10_23_000000'];
    foreach (glob(database_path('migrations/*.php')) as $file) {
        if (in_array(substr(basename($file), 0, 17), $skip, true)) continue;
        app(C001EngineValidationScope::class)->assertAllowed();
        file_put_contents(dirname(getenv('C001_ENGINE_RUN_FILE')).'/schema-progress.json', json_encode(['next_file' => basename($file), 'completed' => $manifest], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
        (require $file)->up();
        $manifest[basename($file)] = hash_file('sha256', $file);
    }
    // Use the actual reviewed B24/C001 proposals; no source schema/data is copied.
    foreach (['review_c001_activation_prerequisites.php', 'review_c001_mfa_prerequisites.php', 'review_operational_c001_authority.php'] as $name) {
        if ($name === 'review_operational_c001_authority.php' && getenv('C001_ENGINE_SCENARIO') === 'C0014') continue;
        $file = database_path('proposals/'.$name); (require $file)->up(); $manifest[$name] = hash_file('sha256', $file);
    }
    Schema::table('case_files', fn (Blueprint $table) => $table->boolean('is_confidential')->nullable());
    Schema::create('case_memberships', function (Blueprint $table): void {
        $table->id(); $table->foreignId('case_file_id')->constrained()->restrictOnDelete();
        $table->foreignId('user_id')->constrained()->restrictOnDelete(); $table->foreignId('employee_id')->constrained()->restrictOnDelete();
        foreach (['can_read', 'can_write', 'can_read_confidential'] as $field) $table->boolean($field)->default(false);
        $table->foreignId('granted_by')->nullable()->constrained('users')->restrictOnDelete(); $table->string('evidence_ref', 80);
        $table->timestamp('expires_at')->nullable(); $table->timestamp('revoked_at')->nullable(); $table->unsignedInteger('revision')->default(1);
        $table->timestamps(); $table->unique(['case_file_id', 'user_id']); $table->index(['user_id', 'revoked_at', 'expires_at']);
    });
    $file = database_path('proposals/create_c001_legal_decisions.php'); (require $file)->up(); $manifest[basename($file)] = hash_file('sha256', $file);
    file_put_contents(dirname(getenv('C001_ENGINE_RUN_FILE')).'/schema-applied.json', json_encode(['database' => $run['database'],
        'server' => DB::selectOne('SELECT VERSION() AS version, CONNECTION_ID() AS connection_id, @@default_storage_engine AS engine'),
        'files' => $manifest, 'status' => 'SCHEMA_APPLIED_TO_NEW_DISPOSABLE_ONLY'], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
    echo 'DISPOSABLE_SCHEMA_APPLY=PASS'.PHP_EOL;
} catch (Throwable $error) {
    echo json_encode(['status' => 'PREPARE_BLOCKED', 'category' => get_class($error),
        'sqlstate' => $error instanceof Illuminate\Database\QueryException ? ($error->errorInfo[0] ?? null) : null,
        'driver_code' => $error instanceof Illuminate\Database\QueryException ? ($error->errorInfo[1] ?? null) : null,
        'reason' => $error instanceof LogicException ? $error->getMessage() : 'Private diagnostics required; no SQL/data printed.'], JSON_THROW_ON_ERROR).PHP_EOL;
    file_put_contents(dirname(getenv('C001_ENGINE_RUN_FILE')).'/prepare-error-private.txt', (string) $error);
    exit(1);
}
