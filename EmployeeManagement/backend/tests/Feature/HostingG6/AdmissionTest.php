<?php

namespace Tests\Feature\HostingG6;

use LogicException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

require_once __DIR__.'/../../../database/staging/Target.php';
require_once __DIR__.'/../../../database/staging/Installer.php';

use Themis\Staging\{Installer, Target};

class AdmissionTest extends TestCase
{
    private function admission(): array
    {
        $id = '0123456789abcdef';
        return ['purpose' => Target::PURPOSE, 'run_id' => $id, 'database' => 'themis_stg_g6_'.$id,
            'environment_id' => 'synthetic-g6-'.$id, 'host' => '127.0.0.1', 'port' => 33267,
            'driver' => 'mysql', 'engine' => 'MariaDB', 'version' => '10.4.32',
            'provisioning_user' => 'g6_prov_'.$id, 'runtime_user' => 'g6_app_'.$id,
            'data_directory' => 'D:/SYNTHETIC/g6-'.$id.'/data'];
    }
    private function credentials(): array { return ['username' => 'g6_prov_0123456789abcdef', 'password' => str_repeat('x', 32), 'app_key' => 'base64:'.base64_encode(str_repeat('k', 32))]; }

    public function test_exact_disposable_contract_is_accepted_without_a_database_connection(): void
    {
        Target::validate($this->admission(), $this->credentials());
        $this->addToAssertionCount(1);
    }

    public static function unsafeTargets(): array
    {
        return array_map(fn ($row) => [$row[0], $row[1]], [
            ['database', 'employee_management'], ['database', 'employee_management_restore_g3_20261029_x'],
            ['database', 'employee_management_c001_engine_test_20261028_120000_12345678'],
            ['database', 'production'], ['host', 'production.internal'], ['host', 'localhost'],
            ['port', 3306], ['port', '33267'], ['port', 0], ['driver', 'pgsql'], ['driver', 'mariadb'],
            ['engine', 'MySQL'], ['version', '10.4.31'], ['environment_id', 'production'],
            ['purpose', ''], ['run_id', ''], ['provisioning_user', 'root'], ['runtime_user', 'root'],
            ['data_directory', 'C:/xampp/mysql/data'], ['url', 'mysql://synthetic'], ['unix_socket', '/tmp/mysql.sock'],
            ['read', ['host' => 'other']], ['write', ['host' => 'other']], ['prefix', 'wrong_'],
        ]);
    }
    #[DataProvider('unsafeTargets')]
    public function test_unapproved_identity_is_rejected_before_connection(string $field, mixed $value): void
    {
        $a = $this->admission(); $a[$field] = $value;
        $this->expectException(LogicException::class);
        Target::validate($a, $this->credentials());
    }
    public function test_runtime_credential_cannot_install_schema(): void
    {
        $c = $this->credentials(); $c['username'] = $this->admission()['runtime_user'];
        $this->expectException(LogicException::class); Target::validate($this->admission(), $c);
    }
    public function test_process_url_override_is_rejected(): void
    {
        $this->expectException(LogicException::class);
        Target::validate($this->admission(), $this->credentials(), ['DB_URL' => 'mysql://synthetic']);
    }
    public function test_missing_isolated_application_key_is_rejected_before_connection(): void
    {
        $c = $this->credentials(); unset($c['app_key']);
        $this->expectException(LogicException::class); Target::validate($this->admission(), $c);
    }
    public function test_pinned_schema_and_all_structural_source_hashes_match(): void
    {
        $base = dirname(__DIR__, 3);
        $m = Installer::manifest($base.'/database/staging/schema.json', Installer::SCHEMA_HASH, $base);
        $this->assertCount(71, $m['steps']); $this->assertCount(12, $m['excluded']);
        foreach ($m['steps'] as $s) {
            $this->assertStringNotContainsString('2026_08_26_', $s['path']);
            $this->assertStringNotContainsString('review_operational_c001_authority', $s['path']);
        }
        $fixture = Installer::manifest($base.'/database/staging/fixtures.json', Installer::FIXTURE_HASH, $base);
        $this->assertCount(5, $fixture['accounts']);
        foreach ($fixture['accounts'] as $grants) $this->assertNotContains('document.approve_legal', $grants);
        $this->assertSame(hash_file('sha256', $base.'/database/staging/Fixtures.php'), $fixture['writer_sha256']);
    }
    public function test_unapproved_manifest_hash_is_rejected_without_app_bootstrap(): void
    {
        $this->expectException(LogicException::class);
        Installer::manifest(dirname(__DIR__, 3).'/database/staging/schema.json', str_repeat('0', 64), dirname(__DIR__, 3));
    }
}
