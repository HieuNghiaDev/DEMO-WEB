<?php

// Explicit local CLI entry point. No migration chain, seed, grant bootstrap, service restart or cache clear.
require dirname(__DIR__, 2).'/vendor/autoload.php';
$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$options = getopt('', ['manifest:', 'approved-digest:', 'apply', 'backup-receipt:']);
try {
    $runner = App\Services\CaseAccessRollout::fromFile($options['manifest'] ?? '', $options['approved-digest'] ?? '');
    if (array_key_exists('apply', $options)) {
        if (! is_file($options['backup-receipt'] ?? '')) throw new LogicException('Backup approval receipt is required.');
        $receipt = json_decode(file_get_contents($options['backup-receipt']), true, 32, JSON_THROW_ON_ERROR);
        $result = $runner->apply($receipt);
    } else {
        $result = $runner->dryRun();
    }
    echo json_encode($result, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR).PHP_EOL;
} catch (Throwable $error) {
    // Never print SQL, DSNs, exception traces or payloads. Maintenance is deliberately left unchanged.
    fwrite(STDERR, 'ROLLOUT_BLOCKED: '.($error instanceof LogicException ? $error->getMessage() : get_class($error)).PHP_EOL);
    exit(1);
}
