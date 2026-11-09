<?php

namespace Tests\Support\B21;

use InvalidArgumentException;

/** Pure synthetic-input reporting helper, NOT a runtime permission resolver or migration. */
final class EntitlementDiffDryRun
{
    public static function compare(array $before, array $proposal): array
    {
        self::allowKeys($before, ['user_id', 'legacy_role', 'source_roles', 'effective_permissions', 'scope_revision']);
        self::allowKeys($proposal, ['user_id', 'permissions', 'expected_scope_revision']);
        if (! is_int($before['user_id'] ?? null) || $before['user_id'] !== ($proposal['user_id'] ?? null)) {
            throw new InvalidArgumentException('Manifest target must match the synthetic snapshot user.');
        }
        if (! is_string($before['scope_revision'] ?? null) || trim($before['scope_revision']) === ''
            || $before['scope_revision'] !== ($proposal['expected_scope_revision'] ?? null)) {
            throw new InvalidArgumentException('Stale scope revision; no automatic approval.');
        }
        $old = self::permissions($before['effective_permissions'] ?? []);
        $next = self::permissions($proposal['permissions'] ?? []);
        $added = array_values(array_diff($next, $old));
        $removed = array_values(array_diff($old, $next));
        $warnings = [];
        if (($before['legacy_role'] ?? null) === 'admin' && ! in_array('level_5', $before['source_roles'] ?? [], true)) {
            $warnings[] = 'LEGACY_PIVOT_AUTHORITY_CONFLICT';
        }
        $protected = array_values(array_intersect($added, AdminAContract::protectedPermissions()));
        if ($protected !== []) $warnings[] = 'PROTECTED_GRANT_REQUIRES_INDEPENDENT_APPROVAL';
        return ['user_id' => $before['user_id'], 'added' => $added, 'removed' => $removed,
            'unchanged' => array_values(array_intersect($old, $next)), 'protected_added' => $protected,
            'warnings' => $warnings, 'requires_owner_review' => true, 'apply_available' => false];
    }

    private static function permissions(array $names): array
    {
        foreach ($names as $name) {
            if (! is_string($name) || ! array_key_exists($name, AdminAContract::permissions())) {
                throw new InvalidArgumentException('Unknown permission in proposed manifest.');
            }
        }
        $names = array_values(array_unique($names));
        sort($names);
        return $names;
    }

    private static function allowKeys(array $data, array $allowed): void
    {
        if (array_diff(array_keys($data), $allowed) !== [] || array_diff($allowed, array_keys($data)) !== []) {
            throw new InvalidArgumentException('Only allowlisted synthetic entitlement fields are accepted; no credentials/PII.');
        }
    }
}
