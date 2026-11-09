<?php

namespace App\Services\Administration;

use App\Models\User;
use LogicException;

/** Target authority, deliberately UNBOUND in the application provider.
 * B2.5 permits only an explicit PHPUnit container binding against mapped RAM identities.
 * No environment flag, HTTP switch, persistent marker, default grants or legacy union.
 */
final class CanonicalRbacResolver
{
    public function __construct(private readonly array $identityFingerprints, private readonly ?RehearsalHrApprovals $hrApprovals = null)
    {
        $this->assertSandbox();
        foreach ($identityFingerprints as $id => $fingerprint) {
            if (! is_int($id) || $id < 1 || ! is_string($fingerprint) || preg_match('/^[a-f0-9]{64}$/D', $fingerprint) !== 1) {
                throw new LogicException('Invalid synthetic identity mapping.');
            }
        }
    }

    public function assertSandbox(): void
    {
        LocalAdministrationSandbox::requireMemoryDatabase();
        if (PHP_SAPI !== 'cli' || ! defined('PHPUNIT_COMPOSER_INSTALL') || ! app()->runningUnitTests()) {
            throw new LogicException('Canonical authority rehearsal is PHPUnit RAM only; production cutover is unavailable.');
        }
    }

    public function mappingStatus(User $user): string
    {
        $this->assertSandbox();
        if ($user->getConnection()->getName() !== config('database.default')) {
            throw new LogicException('Synthetic identity must use the isolated primary connection.');
        }
        if (! isset($this->identityFingerprints[$user->id])) {
            return 'BLOCKED_UNMAPPED';
        }
        $fresh = $user->fresh();
        if (! $fresh || ! hash_equals($this->identityFingerprints[$user->id], VerifiedMfaSessions::identityHash($fresh))) {
            return 'BLOCKED_STALE_IDENTITY';
        }
        return AdminCapabilities::active($fresh) ? 'MAPPED_SYNTHETIC' : 'BLOCKED_INACTIVE';
    }

    public function roleNames(User $user): array
    {
        return $this->mappingStatus($user) === 'MAPPED_SYNTHETIC'
            ? $user->roles()->orderBy('name')->pluck('name')->unique()->values()->all() : [];
    }

    public function hasRole(User $user, string $role): bool
    {
        return in_array($role, $this->roleNames($user), true);
    }

    public function permissionNames(User $user): array
    {
        if ($this->mappingStatus($user) !== 'MAPPED_SYNTHETIC') {
            return [];
        }
        // Query pivots afresh: loaded relations/client permission snapshots cannot restore a revoke.
        return $user->roles()->with('permissions:id,name')->get()
            ->flatMap(fn ($role) => $role->permissions->pluck('name'))
            ->filter(fn ($name) => is_string($name) && AdminCapabilities::known($name))
            ->filter(fn ($name) => $name !== 'employee.view_private' || $this->hrApprovals?->allows($user) === true)
            ->unique()->sort()->values()->all();
    }

    public function hasPermission(User $user, string $permission): bool
    {
        $this->assertSandbox();
        return AdminCapabilities::known($permission) && in_array($permission, $this->permissionNames($user), true);
    }
}
