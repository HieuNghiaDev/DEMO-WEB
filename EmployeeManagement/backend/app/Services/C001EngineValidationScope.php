<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use LogicException;

/** Explicit CLI capability for C001.3A only. Never registered by the application provider. */
final class C001EngineValidationScope
{
    private function __construct(private string $database, private string $runHash, private array $normalDatabases) {}

    public static function assertName(string $database, array $normalDatabases = []): void
    {
        if (in_array(strtolower($database), array_map('strtolower', ['employee_management', ...$normalDatabases]), true)
            || preg_match('/^employee_management_c001_engine_test_[0-9]{8}_[0-9]{6}_[a-f0-9]{8}$/D', $database) !== 1
            || strlen($database) > 64) throw new LogicException('Target is not a new C001.3A disposable database.');
    }

    public static function admit(string $database, string $runHash, array $normalDatabases): self
    {
        self::assertName($database, $normalDatabases);
        $scope = new self($database, $runHash, $normalDatabases);
        $scope->assertAllowed();
        return $scope;
    }

    public function assertAllowed(): void
    {
        self::assertName($this->database, $this->normalDatabases);
        if (PHP_SAPI !== 'cli' || ! app()->environment('testing') || ! defined('PHPUNIT_COMPOSER_INSTALL')) {
            throw new LogicException('C001 engine capability is CLI PHPUnit testing only.');
        }
        $db = DB::connection();
        if ($db->getName() !== 'c001_engine' || $db->getDriverName() !== 'mysql'
            || $db->getDatabaseName() !== $this->database || $db->getConfig('host') !== '127.0.0.1'
            || (int) $db->getConfig('port') !== 3306 || $db->getConfig('url') || $db->getConfig('read')
            || $db->getConfig('write') || $db->getConfig('unix_socket') || $db->getTablePrefix() !== '') {
            throw new LogicException('Unexpected engine connection; no source fallback.');
        }
        $actual = $db->getPdo()->query('SELECT DATABASE()')->fetchColumn();
        if ($actual !== $this->database) throw new LogicException('Resolved engine database mismatch.');
        $marker = $db->table('c001_engine_validation_marker')->where('id', 1)->first();
        if (! $marker || $marker->purpose !== 'C001.3A DISPOSABLE NOT PRODUCTION NOT DEFAULT'
            || ! hash_equals($this->runHash, $marker->run_hash)) throw new LogicException('Disposable ownership marker mismatch.');
    }
}
