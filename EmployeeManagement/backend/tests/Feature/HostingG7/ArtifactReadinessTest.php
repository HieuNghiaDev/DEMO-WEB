<?php

namespace Tests\Feature\HostingG7;

use LogicException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Themis\Staging\G7\Artifact;

require_once dirname(__DIR__, 3).'/database/staging/g7/Artifact.php';

class ArtifactReadinessTest extends TestCase
{
    public static function forbiddenFiles(): array
    {
        return array_map(fn ($p) => [$p], ['.env', '.git/config', '.codex-deploy/railway.json',
            'EmployeeManagement/backend/.env.production', 'EmployeeManagement/backend/storage/app/private/c001-local-installation.enc',
            'EmployeeManagement/backend/public/storage/customer.pdf', 'EmployeeManagement/backend/public/uploads/client.php',
            'EmployeeManagement/backend/database/migrations/credential.php', 'EmployeeManagement/backend/database/backups/db.sql',
            'EmployeeManagement/backend/tests/fixture.php', 'EmployeeManagement/backend/bootstrap/cache/config.php',
            'EmployeeManagement/backend/package.json', 'EmployeeManagement/backend/auth.json',
            'EmployeeManagement/backend/app/../secret.php', 'EmployeeManagement/backend/app/secret.pem',
            'EmployeeManagement/backend/vendor/foo.php', 'EmployeeManagement/frontend/.env', '/railway.json',
            'EmployeeManagement/backend/public/hot', 'EmployeeManagement/backend/public/build/manifest.json']);
    }
    #[DataProvider('forbiddenFiles')]
    public function test_forbidden_payload_is_not_admitted(string $p): void { $this->assertFalse(Artifact::allowed($p)); }

    public function test_runtime_composer_removes_all_unreviewed_mutation_hooks_without_changing_dependencies(): void
    {
        $original = file_get_contents(dirname(__DIR__, 3).'/composer.json');
        $c = json_decode($original, true); $out = json_decode(Artifact::composer($original), true);
        $this->assertSame($c['require'], $out['require']); $this->assertSame($c['autoload'], $out['autoload']);
        $this->assertSame(['post-autoload-dump'], array_keys($out['scripts']));
        $this->assertStringNotContainsString('migrate', json_encode($out['scripts']));
        $this->assertStringNotContainsString('db:seed', json_encode($out['scripts']));
        $this->assertStringNotContainsString('key:generate', json_encode($out['scripts']));
    }
    public function test_new_install_hook_requires_review_instead_of_automatic_execution(): void
    {
        $c = json_decode(file_get_contents(dirname(__DIR__, 3).'/composer.json'), true);
        $c['scripts']['post-install-cmd'] = '@php artisan db:seed --force';
        $this->expectException(LogicException::class); Artifact::composer(json_encode($c));
    }
    public function test_changed_package_discovery_hook_is_rejected(): void
    {
        $c = json_decode(file_get_contents(dirname(__DIR__, 3).'/composer.json'), true);
        $c['scripts']['post-autoload-dump'][] = '@php artisan migrate --force';
        $this->expectException(LogicException::class); Artifact::composer(json_encode($c));
    }
    public function test_secret_scan_fails_without_exposing_the_matched_value(): void
    {
        $this->expectException(LogicException::class);
        Artifact::inspectBytes('-----BEGIN PRIVATE KEY-----'.str_repeat('SYNTHETIC', 10).'-----END PRIVATE KEY-----');
    }

    private function fixture(): array
    {
        $parent = sys_get_temp_dir().'/g7-artifact-'.bin2hex(random_bytes(8)); mkdir($parent, 0700);
        $repo = $parent.'/source'; mkdir($repo);
        $backend = $repo.'/EmployeeManagement/backend';
        foreach (['app', 'config', 'routes', 'resources/views', 'bootstrap', 'public', 'storage/app/private'] as $d) mkdir($backend.'/'.$d, 0700, true);
        file_put_contents($repo.'/railway.json', json_encode(['deploy' => ['preDeployCommand' => 'php -r "exit(0);"']]));
        foreach (['artisan', 'bootstrap/app.php', 'bootstrap/providers.php', 'public/index.php', 'public/.htaccess',
            'public/robots.txt', 'public/favicon.ico', 'app/Safe.php'] as $p) file_put_contents($backend.'/'.$p, 'SYNTHETIC SOURCE');
        copy(dirname(__DIR__, 3).'/composer.json', $backend.'/composer.json'); file_put_contents($backend.'/composer.lock', '{}');
        file_put_contents($backend.'/.env', 'SYNTHETIC_NOT_TO_SHIP');
        file_put_contents($backend.'/storage/app/private/client.txt', 'SYNTHETIC_NOT_TO_SHIP');
        return [$repo, $parent.'/candidate'];
    }
    public function test_clean_candidate_excludes_private_files_and_rejects_added_unmanifested_files(): void
    {
        [$repo, $out] = $this->fixture(); $m = Artifact::prepare($repo, $out);
        $this->assertFileDoesNotExist($out.'/EmployeeManagement/backend/.env');
        $this->assertFileDoesNotExist($out.'/EmployeeManagement/backend/storage/app/private/client.txt');
        Artifact::verify($out, $m);
        file_put_contents($out.'/EmployeeManagement/backend/.env', 'SYNTHETIC_UNEXPECTED');
        $this->expectException(LogicException::class); Artifact::verify($out, $m);
    }
    public function test_candidate_content_drift_is_denied(): void
    {
        [$repo, $out] = $this->fixture(); $m = Artifact::prepare($repo, $out);
        file_put_contents($out.'/railway.json', 'SYNTHETIC ALTERED');
        $this->expectException(LogicException::class); Artifact::verify($out, $m);
    }
    public function test_existing_output_is_not_overwritten(): void
    {
        [$repo, $out] = $this->fixture(); mkdir($out); file_put_contents($out.'/preserved', 'SYNTHETIC PRESERVE');
        try { Artifact::prepare($repo, $out); $this->fail('Existing output must be rejected.'); }
        catch (LogicException) { $this->assertSame('SYNTHETIC PRESERVE', file_get_contents($out.'/preserved')); }
    }
}
