<?php

// Test tooling only: never loaded by application routes, commands, or a production provider.
require_once dirname(__DIR__, 3).'/vendor/autoload.php';
foreach (['Target', 'Fixtures', 'Installer'] as $class) require_once dirname(__DIR__, 3).'/database/staging/'.$class.'.php';

function interpretationEngineContext(bool $provision = false): array
{
    if (!in_array(PHP_SAPI, ['cli', 'cli-server'], true)) throw new LogicException('CLI-owned synthetic server only.');
    $root = realpath(getenv('INTERPRETATION_PRIVATE_RUN') ?: '');
    if (!$root || !is_file($root.'/admission.json')) throw new LogicException('Missing private synthetic admission.');
    $a = json_decode(file_get_contents($root.'/admission.json'), true, flags: JSON_THROW_ON_ERROR);
    $p = json_decode(file_get_contents($root.'/provisioner.json'), true, flags: JSON_THROW_ON_ERROR);
    \Themis\Staging\Target::validate($a, $p);
    $credentials = $provision ? $p : json_decode(file_get_contents($root.'/runtime.json'), true, flags: JSON_THROW_ON_ERROR);
    $app = \Themis\Staging\Installer::application($a, $credentials, $root);
    $marker = \Illuminate\Support\Facades\DB::table('g6_synthetic_admission')->sole();
    if ($marker->purpose !== \Themis\Staging\Target::PURPOSE || !hash_equals($marker->identity_hash, hash('sha256', json_encode($a, JSON_THROW_ON_ERROR)))) throw new LogicException('Synthetic marker mismatch.');
    if (app(\App\Services\LocalC001Installation::class)->enabled()) throw new LogicException('Legal activation forbidden.');
    return [$app, $root, $a];
}
