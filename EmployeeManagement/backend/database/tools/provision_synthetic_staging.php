<?php

// Explicit local disposable CLI only; not an Artisan command, provider, hook or environment feature switch.
require dirname(__DIR__, 2).'/vendor/autoload.php';
foreach (['Target', 'Fixtures', 'Installer'] as $class) require dirname(__DIR__).'/staging/'.$class.'.php';

try {
    if (PHP_SAPI !== 'cli' || ($argv[1] ?? null) !== '--apply-empty-synthetic') throw new LogicException('Explicit synthetic apply required.');
    $admission = json_decode(file_get_contents($argv[2] ?? ''), true, flags: JSON_THROW_ON_ERROR);
    $credentials = json_decode(file_get_contents($argv[3] ?? ''), true, flags: JSON_THROW_ON_ERROR);
    $privateRoot = realpath($argv[4] ?? '');
    if (! $privateRoot || basename($privateRoot) !== 'g6-'.$admission['run_id']) throw new LogicException('Private run directory mismatch.');
    echo json_encode(\Themis\Staging\Installer::apply($admission, $credentials, $privateRoot), JSON_THROW_ON_ERROR).PHP_EOL;
} catch (Throwable $e) {
    // Never print DSNs, credentials, SQL bindings or raw provider/driver exception text.
    fwrite(STDERR, json_encode(['status' => 'BLOCKED', 'category' => get_class($e)], JSON_THROW_ON_ERROR).PHP_EOL);
    exit(1);
}
