<?php

require dirname(__DIR__).'/staging/g7/Artifact.php';
try {
    if (PHP_SAPI !== 'cli' || ($argv[1] ?? null) !== '--local-review-candidate') throw new LogicException('Explicit local review only.');
    $m = \Themis\Staging\G7\Artifact::prepare(dirname(__DIR__, 4), $argv[2] ?? '');
    echo json_encode(['status' => 'LOCAL_CANDIDATE_VERIFIED_NOT_DEPLOYED', 'files' => count($m['files']),
        'manifest_sha256' => hash_file('sha256', $argv[2].'/artifact-manifest.json')], JSON_THROW_ON_ERROR).PHP_EOL;
} catch (Throwable $e) {
    fwrite(STDERR, json_encode(['status' => 'BLOCKED', 'category' => get_class($e)], JSON_THROW_ON_ERROR).PHP_EOL);
    exit(1);
}
