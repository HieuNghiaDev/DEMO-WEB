<?php

namespace Tests\Support\B25;

use InvalidArgumentException;

/** Comparison of observed synthetic decisions, not an approval verifier, ACL or grant writer. */
final class ScopeEntitlementDiff
{
    public static function compare(array $before, array $after): array
    {
        foreach ([$before, $after] as $snapshot) {
            $keys = array_keys($snapshot);
            sort($keys);
            if ($keys !== ['actions', 'fields', 'identity_ref', 'resources', 'revision']
                || ! is_string($snapshot['identity_ref']) || preg_match('/^synthetic:[1-9][0-9]*$/D', $snapshot['identity_ref']) !== 1
                || ! is_string($snapshot['revision']) || $snapshot['revision'] === '') {
                throw new InvalidArgumentException('Only complete synthetic decision snapshots are accepted.');
            }
            foreach (['actions', 'fields', 'resources'] as $axis) {
                if (! is_array($snapshot[$axis])) {
                    throw new InvalidArgumentException('Decision axes must be maps.');
                }
                foreach ($snapshot[$axis] as $key => $decision) {
                    $validKey = match ($axis) {
                        'actions' => array_key_exists($key, \Tests\Support\B21\AdminAContract::permissions()),
                        'fields' => in_array($key, ['phone', 'date_of_birth', 'nationality_code', 'termination_date'], true),
                        'resources' => is_string($key) && preg_match('/^case:[1-9][0-9]*:view$/D', $key) === 1,
                    };
                    if (! $validKey || (! is_bool($decision) && $decision !== 'UNKNOWN_SCOPE')) {
                        throw new InvalidArgumentException('No raw PII, credentials, unknown actions or fabricated scope decisions.');
                    }
                }
            }
        }
        if ($before['identity_ref'] !== $after['identity_ref'] || $before['revision'] !== $after['revision']) {
            throw new InvalidArgumentException('Wrong or stale identity/revision.');
        }
        $delta = [];
        foreach (['actions', 'fields', 'resources'] as $axis) {
            if (array_diff_key($before[$axis], $after[$axis]) || array_diff_key($after[$axis], $before[$axis])) {
                throw new InvalidArgumentException('Both authorities must probe exactly the same action/field/resource set.');
            }
            $delta[$axis] = [];
            foreach ($before[$axis] as $key => $decision) {
                if ($decision !== $after[$axis][$key]) {
                    $delta[$axis][$key] = ['before' => $decision, 'after' => $after[$axis][$key]];
                }
            }
        }
        return ['identity_ref' => $before['identity_ref'], 'revision' => $before['revision'], 'changes' => $delta,
            'apply_available' => false, 'status' => 'BLOCKED_OWNER_APPROVAL',
            'case_acl_certified' => false, 'hr_mapping_approved' => false];
    }
}
