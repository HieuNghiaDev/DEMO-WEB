<?php

namespace Themis\Staging;

use LogicException;
use PDO;

/** Explicit admission for G6's fresh local disposable instance only, not remote staging authorization. */
final class Target
{
    public const PURPOSE = 'THEMIS_G6_SYNTHETIC_ONLY';

    public static function validate(array $a, array $credentials, array $overrides = []): void
    {
        if (($a['purpose'] ?? null) !== self::PURPOSE
            || preg_match('/^[a-f0-9]{16}$/D', $a['run_id'] ?? '') !== 1
            || ($a['database'] ?? null) !== 'themis_stg_g6_'.$a['run_id']
            || ($a['environment_id'] ?? null) !== 'synthetic-g6-'.$a['run_id']
            || ($a['host'] ?? null) !== '127.0.0.1' || ! is_int($a['port'] ?? null)
            || $a['port'] < 20000 || $a['port'] > 65535 || ($a['driver'] ?? null) !== 'mysql'
            || ($a['engine'] ?? null) !== 'MariaDB' || ($a['version'] ?? null) !== '10.4.32'
            || ($a['provisioning_user'] ?? null) !== 'g6_prov_'.$a['run_id']
            || ($a['runtime_user'] ?? null) !== 'g6_app_'.$a['run_id']
            || ($credentials['username'] ?? null) !== $a['provisioning_user']
            || ! is_string($credentials['password'] ?? null) || strlen($credentials['password']) < 32
            || ! is_string($credentials['app_key'] ?? null) || ! str_starts_with($credentials['app_key'], 'base64:')
            || strlen(base64_decode(substr($credentials['app_key'], 7), true) ?: '') !== 32
            || ! is_string($a['data_directory'] ?? null)
            || ! str_ends_with(str_replace('\\', '/', $a['data_directory']), '/g6-'.$a['run_id'].'/data')) {
            throw new LogicException('Unapproved synthetic target.');
        }
        foreach (['url', 'unix_socket', 'read', 'write', 'prefix', 'DB_URL', 'DB_SOCKET'] as $key) {
            if (! empty($a[$key]) || ! empty($credentials[$key]) || ! empty($overrides[$key])) {
                throw new LogicException('Ambiguous connection override.');
            }
        }
    }

    public static function connect(array $a, array $credentials): PDO
    {
        self::validate($a, $credentials, ['DB_URL' => getenv('DB_URL'), 'DB_SOCKET' => getenv('DB_SOCKET')]);
        $pdo = new PDO('mysql:host='.$a['host'].';port='.$a['port'].';dbname='.$a['database'].';charset=utf8mb4',
            $credentials['username'], $credentials['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_TIMEOUT => 5, PDO::ATTR_EMULATE_PREPARES => false]);
        self::assertServer($pdo, $a, $a['provisioning_user']);
        return $pdo;
    }

    public static function assertServer(PDO $pdo, array $a, string $username): void
    {
        $r = $pdo->query('SELECT DATABASE() db, VERSION() version, @@port port, @@datadir datadir, CURRENT_USER() actor')->fetch(PDO::FETCH_ASSOC);
        $normalize = static fn ($p) => strtolower(rtrim(str_replace('\\', '/', $p), '/'));
        if ($r['db'] !== $a['database'] || (int) $r['port'] !== $a['port']
            || preg_match('/^10\.4\.32-MariaDB(?:[- ].*)?$/D', $r['version']) !== 1
            || $normalize($r['datadir']) !== $normalize($a['data_directory'])
            || ! in_array($r['actor'], [$username.'@localhost', $username.'@127.0.0.1'], true)) {
            throw new LogicException('Resolved server identity mismatch.');
        }
    }

    public static function assertEmpty(PDO $pdo): void
    {
        if ((int) $pdo->query('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()')->fetchColumn() !== 0
            || (int) $pdo->query('SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE()')->fetchColumn() !== 0
            || (int) $pdo->query('SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA=DATABASE()')->fetchColumn() !== 0) {
            throw new LogicException('Nonempty target; no resume/drop/reset is supported.');
        }
    }
}
