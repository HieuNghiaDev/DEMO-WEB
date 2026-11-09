<?php

namespace App\Console\Commands;

use App\Services\Administration\LocalAdministrationSandbox;
use Illuminate\Console\Command;

/** No approved independent owner-verification source/secret custody exists yet. Never infer it from OS access or a password. */
class OfflineAdminRecovery extends Command
{
    protected $signature = 'themis:admin-recovery {--apply}';
    protected $description = 'Offline recovery readiness only; unverified apply is blocked';

    public function handle(): int
    {
        if (! $this->option('apply')) {
            $this->info('DRY RUN: use password + one-use recovery code for lost device. Total loss/compromise requires approved independent owner verification, operator/custody, one-use challenge and audited replacement/containment. No database access.');
            return self::SUCCESS;
        }
        LocalAdministrationSandbox::requireMemoryDatabase();
        $this->error('BLOCKED: independent owner-verification authority and recovery evidence/custody are not approved. No state changed.');
        return self::FAILURE;
    }
}
