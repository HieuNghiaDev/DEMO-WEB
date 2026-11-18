<?php

namespace Tests\Feature\HostingG5;

use App\Console\Commands\MigrateDeploy;
use PHPUnit\Framework\TestCase;

class DeploymentConfigTest extends TestCase
{
    public function test_root_config_runs_retry_migrations_without_seeding_during_predeploy(): void
    {
        $config = json_decode(file_get_contents(dirname(__DIR__, 5).'/railway.json'), true, flags: JSON_THROW_ON_ERROR);
        $preDeploy = $config['deploy']['preDeployCommand'];

        // Pre-deploy runs idempotent deployable migrations with DB-ready retries, never database seeders.
        $this->assertSame(
            'attempt=1; until php artisan themis:migrate-deploy; do if [ "$attempt" -ge 12 ]; then exit 1; fi; attempt=$((attempt + 1)); sleep 5; done',
            $preDeploy,
        );
        $this->assertStringNotContainsString('db:seed', $preDeploy);
        $this->assertArrayNotHasKey('environments', $config, 'Environment overrides need their own safety review.');
        $this->assertSame(
            "sh -c '(while true; do php artisan queue:work database --queue=chat-translations --timeout=25 --sleep=3 --max-time=3600 --no-interaction; sleep 2; done) & exec env RAILPACK_SKIP_MIGRATIONS=true /start-container.sh'",
            $config['deploy']['startCommand'],
            'Start the chat translation queue worker alongside the Railpack entrypoint with migrations opted out.',
        );
    }

    public function test_migrate_deploy_excludes_sandbox_only_rehearsal_migrations(): void
    {
        $migrationsDir = dirname(__DIR__, 3).'/database/migrations';
        $paths = MigrateDeploy::deployableMigrationPaths($migrationsDir);

        foreach (MigrateDeploy::REHEARSAL_ONLY_MIGRATIONS as $excluded) {
            $this->assertNotContains('database/migrations/'.$excluded, $paths);
        }

        $this->assertContains('database/migrations/2026_11_11_120000_grant_employee_creation_to_staff.php', $paths);
        $this->assertContains('database/migrations/2026_11_15_120000_create_case_operational_grants.php', $paths);
    }
}
