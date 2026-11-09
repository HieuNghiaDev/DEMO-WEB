<?php

namespace Tests\Support\HostingG2;

/** Deployment attestations only. Never loads .env, secret values or a database connection. */
final class ProductionBaselineContract
{
    public static function failures(array $profile): array
    {
        $failures = [];
        $require = static function (bool $ok, string $id) use (&$failures): void { if (! $ok) $failures[] = $id; };
        $require(($profile['environment'] ?? null) === 'production' && ($profile['debug'] ?? null) === false, 'CFG_ENV');
        $origin = $profile['frontend_origin'] ?? '';
        $url = is_string($origin) ? parse_url($origin) : false;
        $host = is_array($url) ? strtolower($url['host'] ?? '') : '';
        $require(is_array($url) && ($url['scheme'] ?? '') === 'https' && $host !== ''
            && ! str_contains($host, '*') && ! in_array($host, ['localhost', '127.0.0.1', '::1'], true)
            && ! isset($url['user']) && ! isset($url['pass']) && ! isset($url['query']) && ! isset($url['fragment'])
            && in_array($url['path'] ?? '', ['', '/'], true), 'CFG_ORIGIN');
        $proxies = $profile['trusted_proxy_cidrs'] ?? null;
        $validProxies = is_array($proxies) && $proxies !== [];
        foreach (is_array($proxies) ? $proxies : [] as $cidr) {
            $parts = is_string($cidr) ? explode('/', $cidr) : [];
            $ip = $parts[0] ?? ''; $bits = $parts[1] ?? '';
            $maximum = filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) ? 32
                : (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) ? 128 : 0);
            $validProxies = $validProxies && count($parts) === 2 && ctype_digit($bits)
                && (int) $bits > 0 && (int) $bits <= $maximum;
        }
        $require($validProxies, 'CFG_PROXIES');
        $require(($profile['document_root'] ?? null) === 'backend/public', 'CFG_DOCROOT');
        $require(($profile['cookie_same_site'] ?? null) === 'lax' || ($profile['cookie_same_site'] ?? null) === 'strict', 'CFG_SAMESITE');
        foreach (['https_enforced', 'cookie_secure', 'cookie_http_only', 'cors_explicit_only', 'private_storage_not_served',
            'database_private_network', 'database_least_privilege', 'database_non_root', 'app_key_present', 'app_key_unique',
            'app_key_outside_repository', 'provider_secrets_server_only', 'no_vite_secrets', 'logs_redacted', 'logs_access_restricted'] as $key) {
            $require(($profile[$key] ?? null) === true, 'CFG_'.strtoupper($key));
        }
        $days = $profile['log_retention_days'] ?? null;
        $require(is_int($days) && $days >= 1 && $days <= 90, 'CFG_LOG_RETENTION');
        return $failures;
    }
}
