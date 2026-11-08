<?php

namespace Tests\Feature\HostingG5;

use PHPUnit\Framework\TestCase;
use Symfony\Component\Process\Process;

class DeploymentConfigTest extends TestCase
{
    public function test_root_config_explicitly_overrides_dashboard_predeploy_with_no_database_bootstrap(): void
    {
        $config = json_decode(file_get_contents(dirname(__DIR__, 5).'/railway.json'), true, flags: JSON_THROW_ON_ERROR);
        // An explicit command retains config-as-code precedence; an absent key can expose dashboard fallback.
        $this->assertSame('php -r "exit(0);"', $config['deploy']['preDeployCommand']);
        $this->assertArrayNotHasKey('environments', $config, 'Environment overrides need their own safety review.');
        $this->assertSame(
            'exec env RAILPACK_SKIP_MIGRATIONS=true /start-container.sh',
            $config['deploy']['startCommand'],
            'Start the Railpack entrypoint with its migration opt-out set explicitly.',
        );
        $process = new Process([PHP_BINARY, '-r', 'exit(0);']);
        $this->assertSame(0, $process->run());
        $this->assertSame('', $process->getOutput());
        $this->assertSame('', $process->getErrorOutput());
    }
}
