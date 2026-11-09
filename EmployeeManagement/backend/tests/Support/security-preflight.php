<?php

// Run before PHPUnit, with process-only environment overrides from the safe runner.
require dirname(__DIR__, 2).'/vendor/autoload.php';
$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if ($app->environment() !== 'testing'
    || config('database.default') !== 'sqlite'
    || config('database.connections.sqlite.database') !== ':memory:'
    || ! empty(config('database.connections.sqlite.url'))
    || config('session.connection') !== 'sqlite'
    || config('session.driver') !== 'array'
    || config('session.table') !== 'sessions'
    || config('mail.default') !== 'array'
    || config('cache.default') !== 'array') {
    fwrite(STDERR, "Unsafe test configuration. Tests aborted.\n");
    exit(1);
}
echo "SAFE_TEST_PREFLIGHT=testing/sqlite/:memory:/mail-array/session-array/cache-array\n";
