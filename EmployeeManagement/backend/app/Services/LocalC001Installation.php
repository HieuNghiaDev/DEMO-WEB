<?php

namespace App\Services;

use Illuminate\Support\Facades\{Crypt, DB, Schema};

/** Owner-installed, local-only activation receipt. Never selected by a request or environment feature flag. */
class LocalC001Installation
{
    private ?bool $enabled = null;

    public function enabled(): bool
    {
        if ($this->enabled !== null) return $this->enabled;
        $this->enabled = false;
        $connection = DB::connection();
        if (! app()->environment('local') || (! app()->runningInConsole()
                && ! in_array(request()->server('REMOTE_ADDR'), ['127.0.0.1','::1'], true))
            || $connection->getDriverName() !== 'mysql'
            || $connection->getDatabaseName() !== 'employee_management' || $connection->getConfig('host') !== '127.0.0.1'
            || (int) $connection->getConfig('port') !== 3306 || $connection->getConfig('url')
            || $connection->getConfig('read') || $connection->getConfig('write') || $connection->getConfig('unix_socket')) return false;
        $path = storage_path('app/private/c001-local-installation.enc');
        if (! is_file($path)) return false;
        try {
            $receipt = json_decode(Crypt::decryptString(file_get_contents($path)), true, flags: JSON_THROW_ON_ERROR);
            if (($receipt['purpose'] ?? '') !== 'HOSTING-G3 OWNER APPROVED LOCAL C001'
                || ($receipt['policy'] ?? '') !== SmallOfficeC001AuthorityPolicy::APPROVAL_POLICY
                || $connection->getPdo()->query('SELECT DATABASE()')->fetchColumn() !== 'employee_management') return false;
            foreach (['security_administration_state','account_action_tokens','account_mfa','authentication_challenges',
                'mfa_recovery_codes','c001_version_provenance','c001_legal_proofs','c001_legal_decisions'] as $table) {
                if (! Schema::hasTable($table)) return false;
            }
            $installation = DB::table('security_administration_state')->where('id', 1)->value('installation_id');
            if (! is_string($installation) || ! is_string($receipt['installation_id'] ?? null)
                || ! hash_equals($installation, $receipt['installation_id'])) return false;
            $this->enabled = true;
        } catch (\Throwable) { return false; } // Missing/corrupt activation is a denial, never a fallback ALLOW.
        return $this->enabled;
    }
}
