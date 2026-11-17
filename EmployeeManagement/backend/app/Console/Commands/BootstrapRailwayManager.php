<?php

namespace App\Console\Commands;

use App\Services\Administration\AdminContinuityGuard;
use Illuminate\Console\Command;
use Illuminate\Validation\ValidationException;
use LogicException;
use Throwable;

class BootstrapRailwayManager extends Command
{
    protected $signature = 'themis:railway-bootstrap-manager
        {user_id : Approved legacy Manager user ID}
        {employee_id : Approved legacy Manager employee ID}
        {--project-id=} {--environment-id=} {--service-id=}
        {--db-host=} {--db-port=3306} {--db-name=}
        {--mysql-server-id=} {--installation-id=}
        {--apply : Enable the one-time write after interactive confirmation}';

    protected $description = 'Verify or initialize the first Admin from an existing Manager on an approved Railway MySQL target';

    public function handle(AdminContinuityGuard $guard): int
    {
        $userId = filter_var($this->argument('user_id'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        $employeeId = filter_var($this->argument('employee_id'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        $uuid = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
        $expected = [];
        foreach (['project-id' => $uuid, 'environment-id' => $uuid, 'service-id' => $uuid, 'db-host' => '[a-z0-9.-]+',
            'db-port' => '[1-9][0-9]{0,4}', 'db-name' => '[a-zA-Z0-9_]{1,64}', 'mysql-server-id' => $uuid,
            'installation-id' => '[0-9a-f]{64}'] as $name => $format) {
            $value = $this->option($name);
            if (! is_string($value) || ! preg_match('/\A'.$format.'\z/', $value)) {
                $this->error("Missing or invalid option --{$name}.");
                return self::INVALID;
            }
            $expected[$name] = $value;
        }
        if ($userId === false || $employeeId === false || (int) $expected['db-port'] > 65535) {
            $this->error('Invalid Manager user ID, employee ID or database port.');
            return self::INVALID;
        }

        try {
            $guard->bootstrapRailwayManager($userId, $employeeId, $expected, apply: false);
            $this->info("Verified Railway identity and eligible Manager {$userId}/{$employeeId}. No data written.");
            if (! $this->option('apply')) {
                return self::SUCCESS;
            }
            if (! $this->confirm('Apply the audited, one-time first Admin bootstrap to this approved target?', false)) {
                return self::FAILURE;
            }
            $guard->bootstrapRailwayManager($userId, $employeeId, $expected, apply: true);
        } catch (ValidationException|LogicException $error) {
            $this->error($error->getMessage());
            return self::FAILURE;
        } catch (Throwable) {
            $this->error('Bootstrap could not complete. Verify the audit and administration state before retrying.');
            return self::FAILURE;
        }

        $this->info('First Admin installed. Verify a fresh password and Authenticator sign-in before proceeding.');
        return self::SUCCESS;
    }
}
