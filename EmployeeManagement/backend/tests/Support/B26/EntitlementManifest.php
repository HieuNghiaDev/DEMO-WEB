<?php

namespace Tests\Support\B26;

use App\Models\Permission;
use App\Models\User;
use App\Services\Administration\CanonicalRbacResolver;
use App\Services\Administration\RehearsalHrApprovals;
use App\Services\Administration\VerifiedMfaSessions;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use LogicException;
use Tests\Support\B21\AdminAContract;

/** V1 synthetic reconciliation artifact. No grant writer, DB apply or production approval path. */
final class EntitlementManifest
{
    private static function ref(string $ref): bool
    {
        return preg_match('/^synthetic:[1-9][0-9]*$/D', $ref) === 1;
    }

    private static function names(array $names): array
    {
        foreach ($names as $name) {
            if (! is_string($name) || preg_match('/^[a-z][a-z0-9_.-]{0,79}$/D', $name) !== 1) {
                throw new InvalidArgumentException('Only safe symbolic references, never PII, are accepted.');
            }
        }
        $names = array_values(array_unique($names));
        sort($names);
        return $names;
    }

    private static function digest(array $value): string
    {
        return hash('sha256', json_encode($value, JSON_THROW_ON_ERROR));
    }

    public static function capture(User $user, string $sourceRevision): array
    {
        RehearsalHrApprovals::assertSandbox();
        if (app()->bound(CanonicalRbacResolver::class)) {
            throw new LogicException('Capture legacy source before binding canonical rehearsal.');
        }
        if ($user->getConnection()->getName() !== config('database.default')
            || preg_match('/^synthetic-[a-z0-9-]+$/D', $sourceRevision) !== 1) {
            throw new InvalidArgumentException('A synthetic source revision and isolated identity are required.');
        }
        $fresh = $user->fresh();
        if (! $fresh) {
            throw new InvalidArgumentException('Source identity is absent.');
        }
        $employee = $fresh->employee;
        $roles = $fresh->roles()->with('permissions:id,name')->orderBy('id')->get()->map(fn ($role) => [
            'id' => $role->id, 'name' => self::names([$role->name])[0],
            'permissions' => self::names($role->permissions->pluck('name')->all()),
        ])->all();
        $source = ['schema_version' => 1, 'identity_ref' => 'synthetic:'.$fresh->id,
            'source_revision' => $sourceRevision,
            'authority_revision' => (int) DB::table('security_administration_state')->where('id', 1)->value('revision'),
            'account' => ['active' => (bool) $fresh->is_active, 'activation_required' => (bool) $fresh->activation_required,
                'must_change_password' => (bool) $fresh->must_change_password,
                'mfa_ready' => app(VerifiedMfaSessions::class)->ready($fresh)],
            'employee' => ['ref' => $employee ? 'synthetic:'.$employee->id : null,
                'active' => $employee?->status === 'active', 'deleted' => ! $employee || $employee->trashed()],
            'legacy_role' => self::names([(string) $fresh->role])[0], 'pivot_roles' => $roles,
            'catalog' => self::names(Permission::pluck('name')->all()),
            'effective_permissions' => self::names($fresh->permission_names)];
        // No credential-derived hash, names, email or field values enter this artifact.
        return $source + ['expected_before_hash' => self::digest($source)];
    }

    public static function generate(array $source, ?array $proposal): array
    {
        RehearsalHrApprovals::assertSandbox();
        self::validateSource($source);
        $blocks = [];
        $changes = [];
        $roleChanges = [];
        $protected = [];
        if ($proposal === null) {
            $blocks[] = 'BLOCKED_UNMAPPED';
        } else {
            $keys = array_keys($proposal);
            sort($keys);
            if ($keys !== ['case_resources', 'case_scope', 'hr_scope', 'permissions', 'reasons', 'roles']) {
                throw new InvalidArgumentException('Complete V1 proposal allowlist required.');
            }
            $proposal['permissions'] = self::names($proposal['permissions']);
            $proposal['roles'] = self::names($proposal['roles']);
            if (! in_array($proposal['case_scope'], ['none', 'restricted', 'organization'], true)) {
                throw new InvalidArgumentException('Unknown case requirement.');
            }
            foreach ($proposal['case_resources'] as $resource) {
                if (! is_string($resource) || preg_match('/^case:[1-9][0-9]*:view$/D', $resource) !== 1) {
                    throw new InvalidArgumentException('Only synthetic resource references are accepted.');
                }
            }
            if ($proposal['hr_scope'] !== null) {
                $hrKeys = array_keys($proposal['hr_scope']);
                sort($hrKeys);
                if ($hrKeys !== ['fields', 'scope'] || ! in_array($proposal['hr_scope']['scope'], ['organization', 'office', 'subjects'], true)
                    || array_diff($proposal['hr_scope']['fields'], AdminAContract::piiFields())) {
                    throw new InvalidArgumentException('HR requirements contain no subject PII or unsupported fields.');
                }
            }
            foreach (array_unique(array_merge(array_diff($source['effective_permissions'], $proposal['permissions']),
                array_diff($proposal['permissions'], $source['effective_permissions']))) as $name) {
                $reason = $proposal['reasons'][$name] ?? null;
                if (! is_string($reason) || preg_match('/^synthetic-[a-z0-9-]+$/D', $reason) !== 1) {
                    throw new InvalidArgumentException('Every addition/removal needs a safe reason reference.');
                }
                $changes[$name] = ['change' => in_array($name, $proposal['permissions'], true) ? 'add' : 'remove', 'reason' => $reason];
            }
            $sourceRoles = array_column($source['pivot_roles'], 'name');
            foreach (array_unique(array_merge(array_diff($sourceRoles, $proposal['roles']),
                array_diff($proposal['roles'], $sourceRoles))) as $role) {
                $reason = $proposal['reasons']['role:'.$role] ?? null;
                if (! is_string($reason) || preg_match('/^synthetic-[a-z0-9-]+$/D', $reason) !== 1) {
                    throw new InvalidArgumentException('Every role addition/removal also needs a safe reason reference.');
                }
                $roleChanges[$role] = ['change' => in_array($role, $proposal['roles'], true) ? 'add' : 'remove', 'reason' => $reason];
            }
            if (array_diff(array_keys($proposal['reasons']), array_merge(array_keys($changes),
                array_map(fn ($role) => 'role:'.$role, array_keys($roleChanges))))) {
                throw new InvalidArgumentException('Do not smuggle unrelated fields into reasons.');
            }
            ksort($changes);
            ksort($roleChanges);
            if (array_diff($proposal['permissions'], $source['catalog'])
                || array_diff($proposal['permissions'], array_keys(AdminAContract::permissions()))) {
                $blocks[] = 'BLOCKED_UNKNOWN_PERMISSION';
            }
            $explicit = array_unique(array_merge(...array_column($source['pivot_roles'], 'permissions')));
            // Protected privilege retained from implicit legacy authority also needs independent review.
            $protected = array_values(array_intersect($proposal['permissions'], AdminAContract::protectedPermissions()));
            if ($proposal['case_scope'] !== 'none' || $proposal['case_resources'] !== []
                || array_filter($proposal['permissions'], fn ($p) => str_starts_with($p, 'case.') || str_starts_with($p, 'document.'))) {
                $blocks[] = 'BLOCKED_NO_CASE_ACL';
            }
            $needsHr = in_array('employee.view_private', $proposal['permissions'], true);
            if (($needsHr && $proposal['hr_scope'] !== RehearsalHrApprovals::SCOPE)
                || (! $needsHr && $proposal['hr_scope'] !== null)) {
                $blocks[] = 'BLOCKED_HR_FIELD_SCOPE';
            }
            $conflict = ($source['legacy_role'] === 'admin' && ! in_array('admin', array_column($source['pivot_roles'], 'name'), true))
                || array_diff($source['effective_permissions'], $explicit) !== [];
        }
        if (! $source['account']['active'] || $source['account']['activation_required'] || $source['account']['must_change_password']
            || ! $source['employee']['active'] || $source['employee']['deleted']) {
            $blocks[] = 'BLOCKED_ACCOUNT_NOT_READY';
        }
        if ($proposal && in_array('admin', $proposal['roles'], true) && ! $source['account']['mfa_ready']) {
            $blocks[] = 'BLOCKED_ADMIN_MFA_NOT_READY';
        }
        $body = ['schema_version' => 1, 'source' => $source, 'proposal' => $proposal,
            'permission_changes' => $changes, 'role_changes' => $roleChanges, 'protected_permissions' => $protected,
            'protected_roles' => $proposal ? array_values(array_intersect($proposal['roles'], AdminAContract::protectedRoles())) : [],
            'legacy_pivot_conflict' => $conflict ?? false, 'blockers' => $blocks];
        return $body + ['manifest_hash' => self::digest($body), 'status' => $blocks[0] ?? 'PENDING_SYNTHETIC_APPROVAL',
            'owner_approved' => false, 'apply_available' => false];
    }

    private static function validateSource(array $source): void
    {
        $copy = $source;
        $hash = $copy['expected_before_hash'] ?? '';
        unset($copy['expected_before_hash']);
        $keys = array_keys($copy);
        sort($keys);
        if ($keys !== ['account', 'authority_revision', 'catalog', 'effective_permissions', 'employee', 'identity_ref',
            'legacy_role', 'pivot_roles', 'schema_version', 'source_revision']
            || ! self::ref($source['identity_ref']) || $source['schema_version'] !== 1 || ! hash_equals(self::digest($copy), $hash)) {
            throw new InvalidArgumentException('Manifest source must be an intact V1 capture.');
        }
        $accountKeys = array_keys($source['account']);
        $employeeKeys = array_keys($source['employee']);
        sort($accountKeys);
        sort($employeeKeys);
        if ($accountKeys !== ['activation_required', 'active', 'mfa_ready', 'must_change_password']
            || count(array_filter($source['account'], 'is_bool')) !== 4
            || $employeeKeys !== ['active', 'deleted', 'ref']
            || ! is_bool($source['employee']['active']) || ! is_bool($source['employee']['deleted'])
            || ($source['employee']['ref'] !== null && ! self::ref($source['employee']['ref']))
            || ! is_int($source['authority_revision'])
            || preg_match('/^synthetic-[a-z0-9-]+$/D', $source['source_revision']) !== 1) {
            throw new InvalidArgumentException('Source contains unsupported state or sensitive fields.');
        }
        self::names([$source['legacy_role']]);
        self::names($source['catalog']);
        self::names($source['effective_permissions']);
        foreach ($source['pivot_roles'] as $role) {
            $roleKeys = array_keys($role);
            sort($roleKeys);
            if ($roleKeys !== ['id', 'name', 'permissions'] || ! is_int($role['id']) || $role['id'] < 1) {
                throw new InvalidArgumentException('Only role/grant references are accepted.');
            }
            self::names([$role['name']]);
            self::names($role['permissions']);
        }
    }

    public static function review(array $manifest, array $freshSource, ?array $approval): array
    {
        RehearsalHrApprovals::assertSandbox();
        self::validateSource($freshSource);
        // Rebuild derived fields; edited blocker lists/status cannot approve themselves.
        $rebuilt = self::generate($manifest['source'], $manifest['proposal']);
        $blocks = $rebuilt['blockers'];
        if (! hash_equals($rebuilt['manifest_hash'], $manifest['manifest_hash'])
            || $manifest['source']['identity_ref'] !== $freshSource['identity_ref']
            || ! hash_equals($manifest['source']['expected_before_hash'], $freshSource['expected_before_hash'])) {
            $blocks[] = 'BLOCKED_STALE';
        }
        $valid = $approval && ($approval['manifest_hash'] ?? null) === $rebuilt['manifest_hash']
            && self::ref($approval['approver_ref'] ?? '') && $approval['approver_ref'] !== $freshSource['identity_ref']
            && preg_match('/^synthetic-evidence:[a-z0-9-]+$/D', $approval['evidence_ref'] ?? '') === 1
            && is_int($approval['expires_at'] ?? null) && $approval['expires_at'] > now()->timestamp;
        if (! $valid) {
            $blocks[] = 'BLOCKED_APPROVAL';
        } else {
            if ($rebuilt['legacy_pivot_conflict'] && ($approval['conflict_approved'] ?? null) !== true) {
                $blocks[] = 'BLOCKED_CONFLICT';
            }
            if ($rebuilt['protected_permissions'] || $rebuilt['protected_roles']) {
                $independent = $approval['independent_approver_ref'] ?? '';
                if (! is_string($independent) || ! self::ref($independent)
                    || in_array($independent, [$freshSource['identity_ref'], $approval['approver_ref']], true)
                    || preg_match('/^synthetic-evidence:[a-z0-9-]+$/D', $approval['independent_evidence_ref'] ?? '') !== 1
                    || array_diff($rebuilt['protected_permissions'], $approval['protected_permissions'] ?? [])
                    || array_diff($rebuilt['protected_roles'], $approval['protected_roles'] ?? [])) {
                    $blocks[] = 'BLOCKED_INDEPENDENT_PROTECTED_APPROVAL';
                }
            }
            if (in_array('employee.view_private', $rebuilt['proposal']['permissions'] ?? [], true)
                && ($approval['hr_scope'] ?? null) !== RehearsalHrApprovals::SCOPE) {
                $blocks[] = 'BLOCKED_HR_APPROVAL';
            }
        }
        return ['identity_ref' => $freshSource['identity_ref'], 'manifest_hash' => $rebuilt['manifest_hash'],
            'status' => $blocks ? 'BLOCKED' : 'READY_SYNTHETIC_REHEARSAL_ONLY', 'blockers' => array_values(array_unique($blocks)),
            'approver_ref' => $valid ? $approval['approver_ref'] : null,
            'evidence_ref' => $valid ? $approval['evidence_ref'] : null,
            'owner_approved' => false, 'apply_available' => false];
    }

    /** Bind only an already-arranged, exactly reviewed target fixture. Never writes grants.
     * This does not upgrade the B2.5 low-level fixture seam into a production approval verifier.
     */
    public static function resolverFor(User $user, array $manifest, array $approval, ?RehearsalHrApprovals $hr = null): CanonicalRbacResolver
    {
        $fresh = self::capture($user, $manifest['source']['source_revision']);
        $review = self::review($manifest, $fresh, $approval);
        $roles = self::names(array_column($fresh['pivot_roles'], 'name'));
        $permissions = self::names(array_merge(...array_column($fresh['pivot_roles'], 'permissions')));
        if ($review['status'] !== 'READY_SYNTHETIC_REHEARSAL_ONLY'
            || $roles !== $manifest['proposal']['roles'] || $permissions !== $manifest['proposal']['permissions']) {
            throw new LogicException('BLOCKED: exact approved target fixture, fresh source and supported scopes required.');
        }
        return new CanonicalRbacResolver([$user->id => VerifiedMfaSessions::identityHash($user->fresh())], $hr);
    }
}
