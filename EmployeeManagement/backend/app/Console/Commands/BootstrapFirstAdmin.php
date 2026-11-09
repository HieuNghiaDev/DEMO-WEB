<?php

namespace App\Console\Commands;

use App\Services\Administration\FirstAdminBootstrap;
use App\Services\Administration\LocalAdministrationSandbox;
use Illuminate\Console\Command;

class BootstrapFirstAdmin extends Command
{
    protected $signature = 'themis:admin-bootstrap {--apply} {--prepare} {--resume} {--finish}';
    protected $description = 'Dry-run first Admin protocol; synthetic SQLite RAM apply only in B2.4';

    public function handle(FirstAdminBootstrap $bootstrap): int
    {
        if (! $this->option('apply')) {
            $this->info('DRY RUN: verify installation/operator, one-use setup, NEW Employee/User, activation, TOTP, real MFA login, scoped step-up, then grant minimal Admin. No database access.');
            return self::SUCCESS;
        }
        LocalAdministrationSandbox::requireMemoryDatabase();
        if (! $this->confirm('Apply ONLY to synthetic SQLite :memory:?', false)) {
            return self::FAILURE;
        }
        if ($this->option('prepare')) {
            $secret = $bootstrap->prepare();
            $this->warn('One-time setup challenge (15 minutes); hand over privately, never log or pass as an argument:');
            $this->line($secret->tokenForDelivery());
            return self::SUCCESS;
        }
        if ($this->option('finish')) {
            $bootstrap->finish($this->secret('Verified MFA session token (bootstrap.finish step-up required)'));
            $this->info('First Admin completed; no lawyer, PII or case-content permission granted.');
            return self::SUCCESS;
        }
        $setup = $this->secret('One-time installation setup challenge');
        $identity = $this->option('resume') ? [] : [
            'full_name' => $this->ask('New Employee full name'), 'work_email' => $this->ask('New Employee login email'),
            'office_id' => $this->ask('Existing valid office ID'), 'hire_date' => $this->ask('Hire date (YYYY-MM-DD)'),
        ];
        $result = $bootstrap->provision($setup, $identity);
        $this->warn('Pending identity reserved. One-time activation token; use only an approved private handover:');
        $this->line($result['invitation']->tokenForDelivery());
        return self::SUCCESS;
    }
}
