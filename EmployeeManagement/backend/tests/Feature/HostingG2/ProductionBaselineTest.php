<?php

namespace Tests\Feature\HostingG2;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Tests\Support\HostingG2\ProductionBaselineContract;

class ProductionBaselineTest extends TestCase
{
    private function safeSyntheticAttestations(): array
    {
        return array_fill_keys(['https_enforced','cookie_secure','cookie_http_only','cors_explicit_only',
            'private_storage_not_served','database_private_network','database_least_privilege','database_non_root',
            'app_key_present','app_key_unique','app_key_outside_repository','provider_secrets_server_only','no_vite_secrets',
            'logs_redacted','logs_access_restricted'], true) + ['environment' => 'production', 'debug' => false,
            'frontend_origin' => 'https://themis.example.test', 'trusted_proxy_cidrs' => ['192.0.2.1/32'],
            'document_root' => 'backend/public', 'cookie_same_site' => 'lax', 'log_retention_days' => 30];
    }

    public function test_synthetic_profile_contract_is_ready_without_loading_real_configuration(): void
    {
        $this->assertSame([], ProductionBaselineContract::failures($this->safeSyntheticAttestations()));
        $this->assertNotEmpty(ProductionBaselineContract::failures([]));
    }

    public static function unsafeProfiles(): array
    {
        return [
            [['debug' => true], 'CFG_ENV'], [['frontend_origin' => '*'], 'CFG_ORIGIN'],
            [['frontend_origin' => 'http://localhost:5173'], 'CFG_ORIGIN'], [['frontend_origin' => 'https://user@themis.example.test'], 'CFG_ORIGIN'],
            [['trusted_proxy_cidrs' => ['0.0.0.0/0']], 'CFG_PROXIES'], [['trusted_proxy_cidrs' => ['*']], 'CFG_PROXIES'],
            [['document_root' => 'backend'], 'CFG_DOCROOT'], [['private_storage_not_served' => false], 'CFG_PRIVATE_STORAGE_NOT_SERVED'],
            [['database_non_root' => false], 'CFG_DATABASE_NON_ROOT'], [['no_vite_secrets' => false], 'CFG_NO_VITE_SECRETS'],
            [['cookie_secure' => false], 'CFG_COOKIE_SECURE'], [['log_retention_days' => 0], 'CFG_LOG_RETENTION'],
        ];
    }

    #[DataProvider('unsafeProfiles')]
    public function test_unsafe_or_unattested_configuration_cannot_pass(array $change, string $finding): void
    {
        $this->assertContains($finding, ProductionBaselineContract::failures(array_replace($this->safeSyntheticAttestations(), $change)));
    }
}
