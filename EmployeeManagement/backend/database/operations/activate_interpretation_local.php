<?php

use App\Services\InterpretationLocalActivation;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

if (PHP_SAPI !== 'cli' || ($argv[1] ?? '') !== '--apply'
    || ($argv[2] ?? '') !== '--approval=INTERPRETATION-P1-LOCAL-20261101'
    || ! str_starts_with($argv[3] ?? '', '--backup-sha256=')) {
    throw new LogicException('Exact owner-approved CLI invocation is required.');
}
if (app()->environment() !== 'local' || config('database.default') !== 'mysql') {
    throw new LogicException('Local MySQL target is required.');
}
$connection = config('database.connections.mysql');
if (($connection['host'] ?? null) !== '127.0.0.1' || (string) ($connection['port'] ?? '') !== '3306'
    || ($connection['database'] ?? null) !== 'employee_management' || ! empty($connection['unix_socket'])
    || env('DATABASE_URL') || env('DB_URL')) {
    throw new LogicException('Unexpected database target or connection override.');
}
if (DB::selectOne('select database() as name, @@port as port')->name !== 'employee_management'
    || (int) DB::selectOne('select @@port as port')->port !== 3306) {
    throw new LogicException('Resolved database identity mismatch.');
}
if (! app()->isDownForMaintenance() || ! Schema::hasTable('interpreters') || ! Schema::hasTable('interpretation_requests')) {
    throw new LogicException('Owned maintenance and exact interpretation schema are required.');
}

$backup = strtolower(substr($argv[3], strlen('--backup-sha256=')));
$result = app(InterpretationLocalActivation::class)->apply(
    'INTERPRETATION-P1-LOCAL-20261101',
    $backup,
    hash_file('sha256', database_path('migrations/2026_11_01_100000_create_interpretation_management.php'))
);
echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR).PHP_EOL;
