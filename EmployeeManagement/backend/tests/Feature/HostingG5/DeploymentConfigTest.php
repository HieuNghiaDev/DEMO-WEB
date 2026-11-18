<?php

namespace Tests\Feature\HostingG5;

use PHPUnit\Framework\TestCase;

class DeploymentConfigTest extends TestCase
{
    public function test_root_config_runs_retry_migrations_without_seeding_during_predeploy(): void
    {
        $config = json_decode(file_get_contents(dirname(__DIR__, 5).'/railway.json'), true, flags: JSON_THROW_ON_ERROR);
        $preDeploy = $config['deploy']['preDeployCommand'];

        // Pre-deploy runs idempotent schema migrations with DB-ready retries, never database seeders.
        $this->assertSame(
            'attempt=1; until php artisan migrate --force; do if [ "$attempt" -ge 12 ]; then exit 1; fi; attempt=$((attempt + 1)); sleep 5; done',
            $preDeploy,
        );
        $this->assertStringNotContainsString('db:seed', $preDeploy);
        $this->assertArrayNotHasKey('environments', $config, 'Environment overrides need their own safety review.');
        $this->assertSame(
            'exec env RAILPACK_SKIP_MIGRATIONS=true /start-container.sh',
            $config['deploy']['startCommand'],
            'Start the Railpack entrypoint with pre-deploy handling migrations exclusively.',
        );
    }
}
